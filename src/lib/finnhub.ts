import { Quote } from "@/types";

interface FinnhubQuote {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
}

interface FinnhubSearchResult {
  result: { description: string; displaySymbol: string; symbol: string; type: string }[];
  count: number;
}

export async function fetchQuote(symbol: string): Promise<Quote> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${process.env.FINNHUB_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 15 } });
  if (!res.ok) throw new Error(`Finnhub error: ${res.status}`);
  const data: FinnhubQuote = await res.json();
  if (data.c === 0) throw new Error(`Invalid or unsupported symbol: ${symbol}`);
  return {
    symbol: symbol.toUpperCase(),
    price: data.c,
    change: data.d,
    changePercent: data.dp,
    open: data.o,
    prevClose: data.pc,
    high: data.h,
    low: data.l,
  };
}

export async function searchSymbols(query: string) {
  const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${process.env.FINNHUB_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Finnhub search error: ${res.status}`);
  const data: FinnhubSearchResult = await res.json();
  return data.result.filter((r) => r.type === "Common Stock").slice(0, 10);
}
