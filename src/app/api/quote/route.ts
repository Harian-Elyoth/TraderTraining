import { NextRequest, NextResponse } from "next/server";
import { fetchQuote } from "@/lib/finnhub";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  try {
    const quote = await fetchQuote(symbol.toUpperCase().trim());
    return NextResponse.json(quote);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch quote";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
