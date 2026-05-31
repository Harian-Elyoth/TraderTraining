"use client";

import { useEffect, useState } from "react";
import { Quote } from "@/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

interface Props {
  symbol: string | null;
  onQuoteLoaded?: (quote: Quote) => void;
}

export default function QuoteDisplay({ symbol, onQuoteLoaded }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) {
      setQuote(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setQuote(null);
        } else {
          setQuote(data);
          onQuoteLoaded?.(data);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError("Failed to fetch quote");
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [symbol, onQuoteLoaded]);

  if (!symbol) return null;

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-6 w-32 bg-gray-800 rounded mb-2" />
        <div className="h-4 w-24 bg-gray-800 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4 border-red-500/30">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!quote) return null;

  const isPositive = quote.change >= 0;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">{quote.symbol}</p>
          <p className="text-3xl font-bold font-mono">{fmt(quote.price)}</p>
          <p className={`text-sm mt-1 ${isPositive ? "positive" : "negative"}`}>
            {isPositive ? "+" : ""}{fmt(quote.change)} ({isPositive ? "+" : ""}{quote.changePercent.toFixed(2)}%)
          </p>
        </div>
        <div className="text-right text-xs text-gray-500 space-y-1">
          <p>Open: <span className="text-gray-300">{fmt(quote.open)}</span></p>
          <p>Prev: <span className="text-gray-300">{fmt(quote.prevClose)}</span></p>
          <p>High: <span className="positive">{fmt(quote.high)}</span></p>
          <p>Low: <span className="negative">{fmt(quote.low)}</span></p>
        </div>
      </div>
    </div>
  );
}
