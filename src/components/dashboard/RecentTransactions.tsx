import { Transaction } from "@/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function RecentTransactions({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) return null;

  return (
    <div className="card overflow-hidden mt-4">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="font-semibold text-sm uppercase tracking-wide text-gray-400">Recent Trades</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="text-left px-4 py-3">Symbol</th>
              <th className="text-left px-4 py-3">Side</th>
              <th className="text-right px-4 py-3">Qty</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-right px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3 font-bold">{tx.ticker}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${tx.side === "buy" ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
                    {tx.side.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono">{tx.quantity}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(tx.price)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmt(tx.total_value)}</td>
                <td className="px-4 py-3 text-right text-gray-500 text-xs">
                  {new Date(tx.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
