import { PortfolioSummary as Summary } from "@/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtPct(n: number) {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

export default function PortfolioSummary({ data }: { data: Summary }) {
  const isPositive = data.total_pnl >= 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      <div className="card p-4">
        <p className="muted text-xs uppercase tracking-wide mb-1">Portfolio Value</p>
        <p className="text-2xl font-bold">{fmt(data.total_value)}</p>
      </div>
      <div className="card p-4">
        <p className="muted text-xs uppercase tracking-wide mb-1">Cash Available</p>
        <p className="text-2xl font-bold">{fmt(data.cash_balance)}</p>
      </div>
      <div className="card p-4">
        <p className="muted text-xs uppercase tracking-wide mb-1">Equity</p>
        <p className="text-2xl font-bold">{fmt(data.total_equity)}</p>
      </div>
      <div className="card p-4">
        <p className="muted text-xs uppercase tracking-wide mb-1">Total P&amp;L</p>
        <p className={`text-2xl font-bold ${isPositive ? "positive" : "negative"}`}>
          {fmt(data.total_pnl)}
        </p>
        <p className={`text-sm ${isPositive ? "positive" : "negative"}`}>
          {fmtPct(data.total_pnl_pct)}
        </p>
      </div>
    </div>
  );
}
