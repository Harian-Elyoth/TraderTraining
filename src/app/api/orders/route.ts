import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchQuote } from "@/lib/finnhub";
import { z } from "zod";

const orderSchema = z.object({
  ticker: z.string().min(1).max(10).transform((v) => v.toUpperCase().trim()),
  side: z.enum(["buy", "sell"]),
  order_type: z.enum(["market", "limit"]),
  quantity: z.number().int().positive().max(100000),
  limit_price: z.number().positive().optional(),
}).refine(
  (data) => data.order_type === "market" || data.limit_price !== undefined,
  { message: "limit_price is required for limit orders" }
);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { ticker, side, order_type, quantity, limit_price } = parsed.data;
  const serviceClient = await createServiceClient();

  // Fetch the user's portfolio
  const { data: portfolio, error: portfolioError } = await serviceClient
    .from("portfolios")
    .select("id, cash_balance")
    .eq("user_id", user.id)
    .single();

  if (portfolioError || !portfolio) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  }

  if (order_type === "market") {
    // Fetch live quote
    let quote;
    try {
      quote = await fetchQuote(ticker);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch price";
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    const fillPrice = quote.price;
    const totalCost = fillPrice * quantity;

    if (side === "buy") {
      if (portfolio.cash_balance < totalCost) {
        return NextResponse.json(
          { error: `Insufficient funds. Need $${totalCost.toFixed(2)}, have $${portfolio.cash_balance.toFixed(2)}` },
          { status: 422 }
        );
      }

      // Execute buy via RPC
      const { error: rpcError } = await serviceClient.rpc("execute_market_buy", {
        p_user_id: user.id,
        p_portfolio_id: portfolio.id,
        p_ticker: ticker,
        p_quantity: quantity,
        p_fill_price: fillPrice,
      });

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
      }

      return NextResponse.json({ status: "filled", filled_price: fillPrice });
    } else {
      // Sell — verify position exists
      const { data: position } = await serviceClient
        .from("positions")
        .select("quantity")
        .eq("portfolio_id", portfolio.id)
        .eq("ticker", ticker)
        .single();

      if (!position || position.quantity < quantity) {
        return NextResponse.json(
          { error: `Insufficient shares. Have ${position?.quantity ?? 0}, selling ${quantity}` },
          { status: 422 }
        );
      }

      const { error: rpcError } = await serviceClient.rpc("execute_market_sell", {
        p_user_id: user.id,
        p_portfolio_id: portfolio.id,
        p_ticker: ticker,
        p_quantity: quantity,
        p_fill_price: fillPrice,
      });

      if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 500 });
      }

      return NextResponse.json({ status: "filled", filled_price: fillPrice });
    }
  } else {
    // Limit order
    const price = limit_price!;
    const reservedAmount = side === "buy" ? price * quantity : 0;

    if (side === "buy" && portfolio.cash_balance < reservedAmount) {
      return NextResponse.json(
        { error: `Insufficient funds to reserve. Need $${reservedAmount.toFixed(2)}, have $${portfolio.cash_balance.toFixed(2)}` },
        { status: 422 }
      );
    }

    if (side === "sell") {
      const { data: position } = await serviceClient
        .from("positions")
        .select("quantity")
        .eq("portfolio_id", portfolio.id)
        .eq("ticker", ticker)
        .single();

      if (!position || position.quantity < quantity) {
        return NextResponse.json(
          { error: `Insufficient shares. Have ${position?.quantity ?? 0}, selling ${quantity}` },
          { status: 422 }
        );
      }
    }

    // Insert limit order and reserve cash for buys
    const { data: order, error: orderError } = await serviceClient
      .from("orders")
      .insert({
        portfolio_id: portfolio.id,
        ticker,
        side,
        order_type: "limit",
        quantity,
        limit_price: price,
        status: "pending",
      })
      .select()
      .single();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    // Reserve cash immediately for buy limit orders
    if (side === "buy") {
      await serviceClient
        .from("portfolios")
        .update({ cash_balance: portfolio.cash_balance - reservedAmount })
        .eq("id", portfolio.id);
    }

    return NextResponse.json({ status: "pending", order_id: order.id });
  }
}
