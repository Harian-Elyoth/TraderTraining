-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────
CREATE TYPE order_type   AS ENUM ('market', 'limit');
CREATE TYPE order_side   AS ENUM ('buy', 'sell');
CREATE TYPE order_status AS ENUM ('pending', 'filled', 'cancelled', 'rejected');

-- ─────────────────────────────────────────
-- PORTFOLIOS
-- One per user, auto-created by trigger on signup
-- ─────────────────────────────────────────
CREATE TABLE portfolios (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cash_balance  DECIMAL(15,2) NOT NULL DEFAULT 10000.00,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- POSITIONS
-- Current holdings per ticker per portfolio
-- ─────────────────────────────────────────
CREATE TABLE positions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  avg_cost     DECIMAL(15,4) NOT NULL CHECK (avg_cost > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(portfolio_id, ticker)
);

-- ─────────────────────────────────────────
-- ORDERS
-- All orders placed (market + limit)
-- ─────────────────────────────────────────
CREATE TABLE orders (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker       TEXT NOT NULL,
  order_type   order_type NOT NULL,
  side         order_side NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  limit_price  DECIMAL(15,4),
  status       order_status NOT NULL DEFAULT 'pending',
  filled_price DECIMAL(15,4),
  filled_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT limit_price_required CHECK (
    (order_type = 'limit' AND limit_price IS NOT NULL) OR
    (order_type = 'market')
  )
);

CREATE INDEX idx_orders_pending ON orders(ticker, status) WHERE status = 'pending';
CREATE INDEX idx_orders_portfolio ON orders(portfolio_id, created_at DESC);

-- ─────────────────────────────────────────
-- TRANSACTIONS
-- Immutable audit log of every fill
-- ─────────────────────────────────────────
CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  order_id     UUID NOT NULL REFERENCES orders(id),
  ticker       TEXT NOT NULL,
  side         order_side NOT NULL,
  quantity     INTEGER NOT NULL,
  price        DECIMAL(15,4) NOT NULL,
  total_value  DECIMAL(15,2) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_portfolio ON transactions(portfolio_id, created_at DESC);

-- ─────────────────────────────────────────
-- TRIGGER: updated_at stamps
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER portfolios_updated_at BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER positions_updated_at BEFORE UPDATE ON positions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────
-- TRIGGER: auto-create portfolio on user signup
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO portfolios (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─────────────────────────────────────────
-- RPC: execute_market_buy
-- Atomically: deduct cash, upsert position, insert order+transaction
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION execute_market_buy(
  p_user_id     UUID,
  p_portfolio_id UUID,
  p_ticker      TEXT,
  p_quantity    INTEGER,
  p_fill_price  DECIMAL,
  p_order_id    UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total       DECIMAL;
  v_order_id    UUID;
BEGIN
  v_total := p_quantity * p_fill_price;

  -- Deduct cash (will fail with no rows if insufficient)
  UPDATE portfolios
  SET cash_balance = cash_balance - v_total
  WHERE id = p_portfolio_id
    AND cash_balance >= v_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient funds';
  END IF;

  -- Upsert position with weighted average cost
  INSERT INTO positions (portfolio_id, ticker, quantity, avg_cost)
  VALUES (p_portfolio_id, p_ticker, p_quantity, p_fill_price)
  ON CONFLICT (portfolio_id, ticker) DO UPDATE SET
    avg_cost = (positions.quantity * positions.avg_cost + p_quantity * p_fill_price)
               / (positions.quantity + p_quantity),
    quantity = positions.quantity + p_quantity,
    updated_at = NOW();

  -- Create order record if not provided
  IF p_order_id IS NULL THEN
    INSERT INTO orders (portfolio_id, ticker, order_type, side, quantity, status, filled_price, filled_at)
    VALUES (p_portfolio_id, p_ticker, 'market', 'buy', p_quantity, 'filled', p_fill_price, NOW())
    RETURNING id INTO v_order_id;
  ELSE
    v_order_id := p_order_id;
    UPDATE orders SET status = 'filled', filled_price = p_fill_price, filled_at = NOW()
    WHERE id = p_order_id;
  END IF;

  -- Append transaction record
  INSERT INTO transactions (portfolio_id, order_id, ticker, side, quantity, price, total_value)
  VALUES (p_portfolio_id, v_order_id, p_ticker, 'buy', p_quantity, p_fill_price, v_total);

  RETURN v_order_id;
END;
$$;

-- ─────────────────────────────────────────
-- RPC: execute_market_sell
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION execute_market_sell(
  p_user_id     UUID,
  p_portfolio_id UUID,
  p_ticker      TEXT,
  p_quantity    INTEGER,
  p_fill_price  DECIMAL,
  p_order_id    UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total    DECIMAL;
  v_order_id UUID;
BEGIN
  v_total := p_quantity * p_fill_price;

  -- Reduce position
  UPDATE positions
  SET quantity = quantity - p_quantity,
      updated_at = NOW()
  WHERE portfolio_id = p_portfolio_id
    AND ticker = p_ticker
    AND quantity >= p_quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient shares';
  END IF;

  -- Remove zero-quantity positions
  DELETE FROM positions
  WHERE portfolio_id = p_portfolio_id
    AND ticker = p_ticker
    AND quantity = 0;

  -- Credit cash
  UPDATE portfolios
  SET cash_balance = cash_balance + v_total
  WHERE id = p_portfolio_id;

  -- Create or update order record
  IF p_order_id IS NULL THEN
    INSERT INTO orders (portfolio_id, ticker, order_type, side, quantity, status, filled_price, filled_at)
    VALUES (p_portfolio_id, p_ticker, 'market', 'sell', p_quantity, 'filled', p_fill_price, NOW())
    RETURNING id INTO v_order_id;
  ELSE
    v_order_id := p_order_id;
    UPDATE orders SET status = 'filled', filled_price = p_fill_price, filled_at = NOW()
    WHERE id = p_order_id;
  END IF;

  -- Append transaction record
  INSERT INTO transactions (portfolio_id, order_id, ticker, side, quantity, price, total_value)
  VALUES (p_portfolio_id, v_order_id, p_ticker, 'sell', p_quantity, p_fill_price, v_total);

  RETURN v_order_id;
END;
$$;

-- ─────────────────────────────────────────
-- RPC: fill_limit_buy
-- Called by cron when a buy limit order triggers.
-- Cash was already reserved, so we only update the position and mark filled.
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION fill_limit_buy(
  p_order_id      UUID,
  p_portfolio_id  UUID,
  p_user_id       UUID,
  p_ticker        TEXT,
  p_quantity      INTEGER,
  p_reserved_price DECIMAL,
  p_fill_price    DECIMAL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_reserved_total DECIMAL;
  v_fill_total     DECIMAL;
  v_refund         DECIMAL;
BEGIN
  v_reserved_total := p_quantity * p_reserved_price;
  v_fill_total     := p_quantity * p_fill_price;
  v_refund         := v_reserved_total - v_fill_total;  -- > 0 if filled cheaper than reserved

  -- Upsert position
  INSERT INTO positions (portfolio_id, ticker, quantity, avg_cost)
  VALUES (p_portfolio_id, p_ticker, p_quantity, p_fill_price)
  ON CONFLICT (portfolio_id, ticker) DO UPDATE SET
    avg_cost = (positions.quantity * positions.avg_cost + p_quantity * p_fill_price)
               / (positions.quantity + p_quantity),
    quantity = positions.quantity + p_quantity,
    updated_at = NOW();

  -- Refund any excess cash (if filled at a better price than reserved)
  IF v_refund > 0 THEN
    UPDATE portfolios
    SET cash_balance = cash_balance + v_refund
    WHERE id = p_portfolio_id;
  END IF;

  -- Mark order filled
  UPDATE orders
  SET status = 'filled', filled_price = p_fill_price, filled_at = NOW()
  WHERE id = p_order_id;

  -- Append transaction
  INSERT INTO transactions (portfolio_id, order_id, ticker, side, quantity, price, total_value)
  VALUES (p_portfolio_id, p_order_id, p_ticker, 'buy', p_quantity, p_fill_price, v_fill_total);
END;
$$;

-- ─────────────────────────────────────────
-- RPC: increment_cash
-- Used by cancel order to refund reserved cash
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_cash(
  p_portfolio_id UUID,
  p_amount       DECIMAL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE portfolios
  SET cash_balance = cash_balance + p_amount
  WHERE id = p_portfolio_id;
END;
$$;
