"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/layout/AppShell";
import OrdersTable from "@/components/orders/OrdersTable";
import { Order } from "@/types";
import { createClient } from "@/lib/supabase/client";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: portfolio } = await supabase
      .from("portfolios")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!portfolio) return;

    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("portfolio_id", portfolio.id)
      .order("created_at", { ascending: false });

    setOrders((data ?? []) as Order[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const historicOrders = orders.filter((o) => o.status !== "pending");

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage your pending limit orders and view trade history.</p>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-500 animate-pulse">Loading orders…</div>
      ) : (
        <div className="space-y-6">
          {pendingOrders.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-yellow-400 mb-3">
                Pending Limit Orders ({pendingOrders.length})
              </h2>
              <OrdersTable
                orders={pendingOrders}
                showCancel
                onCancelled={fetchOrders}
              />
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Order History
            </h2>
            <OrdersTable orders={historicOrders} />
          </div>
        </div>
      )}
    </AppShell>
  );
}
