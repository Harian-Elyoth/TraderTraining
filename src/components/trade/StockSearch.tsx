"use client";

import { useState, useEffect, useRef } from "react";

interface SearchResult {
  symbol: string;
  displaySymbol: string;
  description: string;
}

interface Props {
  onSelect: (symbol: string) => void;
  initialSymbol?: string;
}

export default function StockSearch({ onSelect, initialSymbol }: Props) {
  const [query, setQuery] = useState(initialSymbol ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(symbol: string) {
    setQuery(symbol);
    setOpen(false);
    onSelect(symbol);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && query.trim()) {
      setOpen(false);
      onSelect(query.trim().toUpperCase());
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="label">Stock Symbol</label>
      <input
        type="text"
        className="input uppercase"
        placeholder="e.g. AAPL, TSLA, MSFT"
        value={query}
        onChange={(e) => setQuery(e.target.value.toUpperCase())}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {loading && (
        <span className="absolute right-3 top-9 text-gray-500 text-xs">Searching…</span>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full card py-1 shadow-xl max-h-60 overflow-auto">
          {results.map((r) => (
            <li key={r.symbol}>
              <button
                type="button"
                className="w-full text-left px-4 py-2 hover:bg-gray-800 transition-colors flex gap-3 items-baseline"
                onClick={() => handleSelect(r.symbol)}
              >
                <span className="font-bold text-blue-400 w-20 shrink-0">{r.displaySymbol}</span>
                <span className="text-gray-400 text-sm truncate">{r.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
