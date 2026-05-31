import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { fetchQuote } from "@/lib/finnhub";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  // Fetch all pending limit orders
  const { data: pendingOrders, error } = await supabase
    .from("orders")
    .select("id, portfolio_id, ticker, side, quantity, limit_price, portfolios!inner(user_id)")
    .eq("status", "pending")
    .eq("order_type", "limit");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pendingOrders || pendingOrders.length === 0) {
    return NextResponse.json({ filled: 0, checked: 0 });
  }

  // Get unique tickers
  const tickers = Array.from(new Set(pendingOrders.map((o) => o.ticker)));

  // Fetch current prices for all unique tickers
  const prices: Record<string, number> = {};
  await Promise.allSettled(
    tickers.map(async (ticker) => {
      try {
        const quote = await fetchQuote(ticker);
        prices[ticker] = quote.price;
      } catch {
        // Skip tickers that fail
      }
    })
  );

  let filledCount = 0;

  for (const order of pendingOrders) {
    const currentPrice = prices[order.ticker];
    if (!currentPrice || !order.limit_price) continue;

    const portfolioData = order.portfolios as unknown as { user_id: string };

    const shouldFill =
      (order.side === "buy" && currentPrice <= order.limit_price) ||
      (order.side === "sell" && currentPrice >= order.limit_price);

    if (!shouldFill) continue;

    // Execute the fill
    let rpcError;

    if (order.side === "buy") {
      // Cash was already reserved; just update position and mark filled
      const { error: err } = await supabase.rpc("fill_limit_buy", {
        p_order_id: order.id,
        p_portfolio_id: order.portfolio_id,
        p_user_id: portfolioData.user_id,
        p_ticker: order.ticker,
        p_quantity: order.quantity,
        p_reserved_price: order.limit_price,
        p_fill_price: currentPrice,
      });
      rpcError = err;
    } else {
      // Sell: deduct shares, credit cash
      const { error: err } = await supabase.rpc("execute_market_sell", {
        p_user_id: portfolioData.user_id,
        p_portfolio_id: order.portfolio_id,
        p_ticker: order.ticker,
        p_quantity: order.quantity,
        p_fill_price: currentPrice,
        p_order_id: order.id,
      });
      rpcError = err;
    }

    if (!rpcError) {
      // Mark the order as filled
      await supabase
        .from("orders")
        .update({ status: "filled", filled_price: currentPrice, filled_at: new Date().toISOString() })
        .eq("id", order.id);

      filledCount++;
    }
  }

  return NextResponse.json({ filled: filledCount, checked: pendingOrders.length });
}
