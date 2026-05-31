"use client";

import { useState } from "react";
import { Quote, OrderSide, OrderType } from "@/types";

interface Props {
  symbol: string;
  quote: Quote | null;
  onOrderPlaced: () => void;
}

export default function OrderForm({ symbol, quote, onOrderPlaced }: Props) {
  const [side, setSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const qty = parseInt(quantity) || 0;
  const price = orderType === "market" ? quote?.price ?? 0 : parseFloat(limitPrice) || 0;
  const estimatedCost = qty * price;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!qty || qty < 1) {
      setError("Please enter a valid quantity.");
      return;
    }
    if (orderType === "limit" && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      setError("Please enter a valid limit price.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: symbol,
        side,
        order_type: orderType,
        quantity: qty,
        ...(orderType === "limit" && { limit_price: parseFloat(limitPrice) }),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Order failed.");
      return;
    }

    if (data.status === "filled") {
      setSuccess(`${side === "buy" ? "Bought" : "Sold"} ${qty} ${symbol} at $${data.filled_price?.toFixed(2)}`);
    } else {
      setSuccess(`Limit order placed for ${qty} ${symbol} at $${limitPrice}`);
    }

    setQuantity("");
    setLimitPrice("");
    onOrderPlaced();
  }

  return (
    <div className="card p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Side toggle */}
        <div>
          <label className="label">Action</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSide("buy")}
              className={`flex-1 py-2 rounded font-semibold text-sm transition-colors ${
                side === "buy"
                  ? "bg-green-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setSide("sell")}
              className={`flex-1 py-2 rounded font-semibold text-sm transition-colors ${
                side === "sell"
                  ? "bg-red-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              SELL
            </button>
          </div>
        </div>

        {/* Order type toggle */}
        <div>
          <label className="label">Order Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOrderType("market")}
              className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
                orderType === "market"
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/40"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              Market
            </button>
            <button
              type="button"
              onClick={() => setOrderType("limit")}
              className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
                orderType === "limit"
                  ? "bg-blue-600/20 text-blue-400 border border-blue-500/40"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              Limit
            </button>
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="label">Quantity (shares)</label>
          <input
            type="number"
            className="input"
            placeholder="0"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        {/* Limit price */}
        {orderType === "limit" && (
          <div>
            <label className="label">Limit Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                className="input pl-7"
                placeholder="0.00"
                step="0.01"
                min="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </div>
            {orderType === "limit" && side === "buy" && (
              <p className="text-gray-500 text-xs mt-1">
                Cash will be reserved immediately for buy limit orders.
              </p>
            )}
          </div>
        )}

        {/* Order preview */}
        {qty > 0 && price > 0 && (
          <div className="bg-gray-800/50 rounded p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Est. {side === "buy" ? "Cost" : "Proceeds"}</span>
              <span className="font-mono font-semibold">
                ${estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {orderType === "market" && (
              <p className="text-gray-600 text-xs">
                Market orders fill immediately at current price
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            {error}
          </p>
        )}
        {success && (
          <p className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded px-3 py-2">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !quote}
          className={side === "buy" ? "btn-buy w-full" : "btn-sell w-full"}
        >
          {loading
            ? "Placing order…"
            : `${side === "buy" ? "Buy" : "Sell"} ${qty || ""} ${symbol}${orderType === "limit" ? " (Limit)" : ""}`}
        </button>
      </form>
    </div>
  );
}
