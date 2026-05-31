import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = await createServiceClient();

  // Fetch the order, verify it belongs to this user and is pending
  const { data: order, error: fetchError } = await serviceClient
    .from("orders")
    .select("id, portfolio_id, side, quantity, limit_price, status, portfolios!inner(user_id)")
    .eq("id", id)
    .single();

  if (fetchError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const portfolioData = order.portfolios as unknown as { user_id: string };
  if (portfolioData.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (order.status !== "pending") {
    return NextResponse.json({ error: "Only pending orders can be cancelled" }, { status: 422 });
  }

  // Cancel the order
  await serviceClient
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", id);

  // Refund reserved cash for buy limit orders
  if (order.side === "buy" && order.limit_price) {
    const refundAmount = order.limit_price * order.quantity;
    await serviceClient.rpc("increment_cash", {
      p_portfolio_id: order.portfolio_id,
      p_amount: refundAmount,
    });
  }

  return NextResponse.json({ status: "cancelled" });
}
