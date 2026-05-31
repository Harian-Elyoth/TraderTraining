import { PositionWithPnl } from "@/types";
import Link from "next/link";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtPct(n: number) {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

export default function PositionsTable({ positions }: { positions: PositionWithPnl[] }) {
  if (positions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-gray-500 mb-3">No open positions</p>
        <Link href="/trade" className="text-blue-400 hover:text-blue-300 text-sm">
          Start trading →
        </Link>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-400">Open Positions</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="text-left px-4 py-3">Symbol</th>
              <th className="text-right px-4 py-3">Qty</th>
              <th className="text-right px-4 py-3">Avg Cost</th>
              <th className="text-right px-4 py-3">Current</th>
              <th className="text-right px-4 py-3">Value</th>
              <th className="text-right px-4 py-3">Unrealized P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => (
              <tr key={pos.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/trade?symbol=${pos.ticker}`} className="font-bold text-blue-400 hover:text-blue-300">
                    {pos.ticker}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-mono">{pos.quantity}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(pos.avg_cost)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(pos.current_price)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(pos.current_value)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={pos.unrealized_pnl >= 0 ? "positive" : "negative"}>
                    {fmt(pos.unrealized_pnl)}
                  </span>
                  <br />
                  <span className={`text-xs ${pos.unrealized_pnl >= 0 ? "positive" : "negative"}`}>
                    {fmtPct(pos.unrealized_pnl_pct)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
