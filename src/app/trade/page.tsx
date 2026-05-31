"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import StockSearch from "@/components/trade/StockSearch";
import QuoteDisplay from "@/components/trade/QuoteDisplay";
import OrderForm from "@/components/trade/OrderForm";
import { Quote } from "@/types";

function TradeContent() {
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState<string | null>(searchParams.get("symbol"));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orderKey, setOrderKey] = useState(0);

  const handleQuoteLoaded = useCallback((q: Quote) => setQuote(q), []);

  function handleOrderPlaced() {
    // Refresh quote after order to reflect any changes
    setOrderKey((k) => k + 1);
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Trade</h1>
        <p className="text-gray-500 text-sm mt-0.5">Search a stock, view the price, and place your order.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="card p-4">
            <StockSearch onSelect={setSymbol} initialSymbol={symbol ?? ""} />
          </div>

          {symbol && (
            <QuoteDisplay
              key={`${symbol}-${orderKey}`}
              symbol={symbol}
              onQuoteLoaded={handleQuoteLoaded}
            />
          )}

          {!symbol && (
            <div className="card p-8 text-center text-gray-500">
              <p className="text-4xl mb-3">📈</p>
              <p>Search for a stock symbol to start trading</p>
            </div>
          )}
        </div>

        <div>
          {symbol ? (
            <OrderForm
              key={symbol}
              symbol={symbol}
              quote={quote}
              onOrderPlaced={handleOrderPlaced}
            />
          ) : (
            <div className="card p-8 text-center text-gray-500 h-full flex items-center justify-center">
              <p>Select a stock to place an order</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function TradePage() {
  return (
    <Suspense>
      <TradeContent />
    </Suspense>
  );
}
