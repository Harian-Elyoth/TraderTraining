export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "pending" | "filled" | "cancelled" | "rejected";

export interface Portfolio {
  id: string;
  user_id: string;
  cash_balance: number;
  created_at: string;
}

export interface Position {
  id: string;
  portfolio_id: string;
  ticker: string;
  quantity: number;
  avg_cost: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  portfolio_id: string;
  ticker: string;
  order_type: OrderType;
  side: OrderSide;
  quantity: number;
  limit_price: number | null;
  status: OrderStatus;
  filled_price: number | null;
  filled_at: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  portfolio_id: string;
  order_id: string;
  ticker: string;
  side: OrderSide;
  quantity: number;
  price: number;
  total_value: number;
  created_at: string;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  prevClose: number;
  high: number;
  low: number;
}

export interface PositionWithPnl extends Position {
  current_price: number;
  current_value: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}

export interface PortfolioSummary {
  cash_balance: number;
  total_equity: number;
  total_value: number;
  total_pnl: number;
  total_pnl_pct: number;
  positions: PositionWithPnl[];
}

export const STARTING_BALANCE = 10000;
