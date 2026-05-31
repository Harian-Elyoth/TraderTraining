import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchQuote } from "@/lib/finnhub";
import AppShell from "@/components/layout/AppShell";
import PortfolioSummaryCard from "@/components/dashboard/PortfolioSummary";
import PositionsTable from "@/components/dashboard/PositionsTable";
import RecentTransactions from "@/components/dashboard/RecentTransactions";
import { PortfolioSummary, PositionWithPnl, Transaction } from "@/types";

const STARTING_BALANCE = 10000;

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const serviceClient = await createServiceClient();

  // Fetch portfolio
  const { data: portfolio } = await serviceClient
    .from("portfolios")
    .select("id, cash_balance")
    .eq("user_id", user.id)
    .single();

  if (!portfolio) redirect("/auth/login");

  // Fetch positions
  const { data: rawPositions } = await serviceClient
    .from("positions")
    .select("*")
    .eq("portfolio_id", portfolio.id);

  const positions = rawPositions ?? [];

  // Enrich positions with live prices (best effort)
  const positionsWithPnl: PositionWithPnl[] = await Promise.all(
    positions.map(async (pos) => {
      let currentPrice = pos.avg_cost;
      try {
        const quote = await fetchQuote(pos.ticker);
        currentPrice = quote.price;
      } catch {
        // Fall back to cost basis if quote fails
      }
      const currentValue = currentPrice * pos.quantity;
      const unrealizedPnl = currentValue - pos.avg_cost * pos.quantity;
      const unrealizedPnlPct = ((currentPrice - pos.avg_cost) / pos.avg_cost) * 100;
      return { ...pos, current_price: currentPrice, current_value: currentValue, unrealized_pnl: unrealizedPnl, unrealized_pnl_pct: unrealizedPnlPct };
    })
  );

  const totalEquity = positionsWithPnl.reduce((sum, p) => sum + p.current_value, 0);
  const totalValue = portfolio.cash_balance + totalEquity;
  const totalPnl = totalValue - STARTING_BALANCE;
  const totalPnlPct = (totalPnl / STARTING_BALANCE) * 100;

  const summary: PortfolioSummary = {
    cash_balance: portfolio.cash_balance,
    total_equity: totalEquity,
    total_value: totalValue,
    total_pnl: totalPnl,
    total_pnl_pct: totalPnlPct,
    positions: positionsWithPnl,
  };

  // Fetch recent transactions
  const { data: transactions } = await serviceClient
    .from("transactions")
    .select("*")
    .eq("portfolio_id", portfolio.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <p className="text-gray-500 text-sm mt-0.5">Live market data · Updated on page load</p>
      </div>

      <PortfolioSummaryCard data={summary} />
      <PositionsTable positions={positionsWithPnl} />
      <RecentTransactions transactions={(transactions ?? []) as Transaction[]} />
    </AppShell>
  );
}
