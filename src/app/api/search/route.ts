import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/finnhub";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.trim().length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await searchSymbols(q.trim());
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
