-- Enable RLS on all public tables
ALTER TABLE portfolios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────
-- PORTFOLIOS
-- ─────────────────────────────────────────
CREATE POLICY "portfolios_select_own"
  ON portfolios FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "portfolios_update_own"
  ON portfolios FOR UPDATE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- POSITIONS
-- ─────────────────────────────────────────
CREATE POLICY "positions_select_own"
  ON positions FOR SELECT
  USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );

CREATE POLICY "positions_all_own"
  ON positions FOR ALL
  USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────
CREATE POLICY "orders_select_own"
  ON orders FOR SELECT
  USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );

CREATE POLICY "orders_insert_own"
  ON orders FOR INSERT
  WITH CHECK (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );

CREATE POLICY "orders_update_own"
  ON orders FOR UPDATE
  USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );

-- ─────────────────────────────────────────
-- TRANSACTIONS
-- Read-only for users (writes come via security definer RPCs)
-- ─────────────────────────────────────────
CREATE POLICY "transactions_select_own"
  ON transactions FOR SELECT
  USING (
    portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid())
  );
