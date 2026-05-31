"use client";

import { useState } from "react";
import { Order } from "@/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const statusColors: Record<string, string> = {
  pending: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  filled: "text-green-400 bg-green-500/10 border-green-500/20",
  cancelled: "text-gray-500 bg-gray-500/10 border-gray-500/20",
  rejected: "text-red-400 bg-red-500/10 border-red-500/20",
};

interface Props {
  orders: Order[];
  showCancel?: boolean;
  onCancelled?: () => void;
}

export default function OrdersTable({ orders, showCancel, onCancelled }: Props) {
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setCancelling(id);
    try {
      const res = await fetch(`/api/orders/${id}/cancel`, { method: "POST" });
      if (res.ok) onCancelled?.();
    } finally {
      setCancelling(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="card p-8 text-center text-gray-500">
        <p>No orders yet.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase">
              <th className="text-left px-4 py-3">Symbol</th>
              <th className="text-left px-4 py-3">Side</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-right px-4 py-3">Qty</th>
              <th className="text-right px-4 py-3">Limit</th>
              <th className="text-right px-4 py-3">Fill Price</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Date</th>
              {showCancel && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3 font-bold">{order.ticker}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${order.side === "buy" ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"}`}>
                    {order.side.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 capitalize text-gray-400 text-xs">{order.order_type}</td>
                <td className="px-4 py-3 text-right font-mono">{order.quantity}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-400">
                  {order.limit_price ? fmt(order.limit_price) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {order.filled_price ? fmt(order.filled_price) : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded border ${statusColors[order.status] ?? ""}`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-500 text-xs">
                  {new Date(order.created_at).toLocaleDateString()}
                </td>
                {showCancel && (
                  <td className="px-4 py-3 text-right">
                    {order.status === "pending" && (
                      <button
                        onClick={() => handleCancel(order.id)}
                        disabled={cancelling === order.id}
                        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded transition-colors disabled:opacity-50"
                      >
                        {cancelling === order.id ? "…" : "Cancel"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
