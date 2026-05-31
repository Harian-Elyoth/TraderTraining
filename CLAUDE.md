# TraderTraining — Project Documentation

## What this is

A paper trading platform where any user can practice stock trading with a virtual $10,000 starting balance. Stock prices follow the real market via the Finnhub API. Users can buy and sell shares, place limit orders, and track their portfolio performance through a dashboard.

The platform is designed to eventually become a full trading education product — with chart analysis tools, learning modules, challenges, leaderboards, and competitions. The MVP covers the core loop: register → trade → track P&L.

---

## Tech stack

| Concern | Tool |
|---------|------|
| Frontend + routing | Next.js 14 (App Router, TypeScript) |
| Styling | TailwindCSS — dark terminal theme |
| Auth | Supabase Auth (email/password) |
| Database | Supabase Postgres |
| Real-time (future) | Supabase Realtime |
| Market data | Finnhub REST API (free tier, ~15-min delayed) |
| Limit order cron | Vercel Cron Jobs → `/api/cron/fill-limits` |
| Deployment target | Vercel |

---

## Repository structure

```
TraderTraining/
├── .env.example              # Template — copy to .env.local and fill in
├── .env.local                # Local secrets — never committed
├── vercel.json               # Vercel Cron config (1-minute schedule)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── supabase/
│   └── migrations/
│       ├── 001_schema.sql    # All tables, enums, triggers, RPCs
│       └── 002_rls.sql       # Row-level security policies
└── src/
    ├── middleware.ts          # Auth guard: redirects unauthenticated users
    ├── app/
    │   ├── layout.tsx         # Root layout (dark bg, metadata)
    │   ├── page.tsx           # Redirects to /dashboard or /auth/login
    │   ├── auth/
    │   │   ├── login/page.tsx
    │   │   ├── register/page.tsx
    │   │   └── callback/route.ts   # Supabase OAuth/email confirm handler
    │   ├── dashboard/page.tsx      # Server component: portfolio + P&L
    │   ├── trade/page.tsx          # Client component: search + quote + order form
    │   ├── orders/page.tsx         # Client component: pending + history
    │   └── api/
    │       ├── quote/route.ts              # GET /api/quote?symbol=AAPL
    │       ├── search/route.ts             # GET /api/search?q=Apple
    │       ├── orders/route.ts             # POST /api/orders
    │       ├── orders/[id]/cancel/route.ts # POST /api/orders/:id/cancel
    │       └── cron/fill-limits/route.ts   # GET — called by Vercel Cron
    ├── components/
    │   ├── layout/
    │   │   ├── Navbar.tsx         # Top nav with sign-out
    │   │   └── AppShell.tsx       # Wraps protected pages with Navbar + max-width
    │   ├── dashboard/
    │   │   ├── PortfolioSummary.tsx    # 4-stat card row (value, cash, equity, P&L)
    │   │   ├── PositionsTable.tsx      # Per-ticker: qty, avg cost, current, unrealized P&L
    │   │   └── RecentTransactions.tsx  # Last 10 fills
    │   ├── trade/
    │   │   ├── StockSearch.tsx    # Debounced Finnhub symbol search with dropdown
    │   │   ├── QuoteDisplay.tsx   # Live price card (fetches /api/quote on mount)
    │   │   └── OrderForm.tsx      # Buy/sell × market/limit, qty, limit price, submit
    │   └── orders/
    │       └── OrdersTable.tsx    # Reusable table with optional cancel button
    ├── lib/
    │   ├── supabase/
    │   │   ├── client.ts   # createBrowserClient (for Client Components)
    │   │   └── server.ts   # createServerClient + createServiceClient (for API routes)
    │   └── finnhub.ts      # fetchQuote() and searchSymbols() — server-side only
    └── types/index.ts       # Shared TypeScript types (Portfolio, Position, Order, Quote…)
```

---

## Database schema

All migrations are in `supabase/migrations/` and have been applied to the Supabase project (`uhlbospqolwjswhjfoba`).

### Tables

**`portfolios`** — one row per user, auto-created by a Postgres trigger on `auth.users` INSERT.
- `cash_balance DECIMAL(15,2)` — starts at 10000.00; decremented on buy, incremented on sell.

**`positions`** — current holdings, one row per (portfolio, ticker) pair.
- `quantity INTEGER` — always > 0; row is deleted when quantity reaches 0.
- `avg_cost DECIMAL(15,4)` — volume-weighted average cost basis, recalculated on every buy fill.

**`orders`** — every order placed, market and limit.
- `order_type ENUM('market','limit')`
- `side ENUM('buy','sell')`
- `status ENUM('pending','filled','cancelled','rejected')`
- `limit_price` — NULL for market orders; required for limit orders (enforced by CHECK constraint).
- `filled_price` / `filled_at` — populated when status transitions to 'filled'.

**`transactions`** — immutable audit log of every fill.
- Written only by `SECURITY DEFINER` RPCs; never by client code.
- Used for the "Recent Trades" table on the dashboard.

### Postgres RPCs (called from API routes)

All RPCs are `SECURITY DEFINER`, meaning they run as the database owner and bypass RLS. This keeps fill logic atomic and prevents race conditions.

| RPC | Called by | Purpose |
|-----|-----------|---------|
| `execute_market_buy(p_portfolio_id, p_ticker, p_quantity, p_fill_price)` | `POST /api/orders` | Deducts cash, upserts position with weighted avg cost, inserts order+transaction |
| `execute_market_sell(p_portfolio_id, p_ticker, p_quantity, p_fill_price)` | `POST /api/orders` | Reduces position (deletes if zero), credits cash, inserts order+transaction |
| `fill_limit_buy(p_order_id, p_portfolio_id, p_ticker, p_quantity, p_reserved_price, p_fill_price)` | `GET /api/cron/fill-limits` | Upserts position, refunds excess reserved cash if filled cheaper than limit price, marks order filled |
| `increment_cash(p_portfolio_id, p_amount)` | `POST /api/orders/:id/cancel` | Refunds reserved cash when a pending buy limit order is cancelled |

### Triggers

- `on_auth_user_created` — fires AFTER INSERT on `auth.users`. Creates a `portfolios` row with `cash_balance = 10000.00`. This means every new signup automatically gets their starting balance with no application code required.
- `portfolios_updated_at` / `positions_updated_at` — stamp `updated_at = NOW()` on every UPDATE.

### Row-level security

RLS is enabled on all four tables. Users can only read and write rows belonging to their own portfolio. The service role key (used in server-side API routes) bypasses RLS.

---

## Key flows

### Registration
1. User submits email + password on `/auth/register`.
2. Supabase Auth creates a row in `auth.users`.
3. The `on_auth_user_created` trigger fires → inserts a `portfolios` row with $10,000 cash.
4. Client redirects to `/dashboard`.

### Market order (buy or sell)
1. Client POSTs to `/api/orders` with `{ ticker, side, order_type: "market", quantity }`.
2. Route authenticates the user via `supabase.auth.getUser()`.
3. Fetches live price from Finnhub via `fetchQuote()` (server-side, key never exposed).
4. Validates funds (buy) or position size (sell).
5. Calls `execute_market_buy` or `execute_market_sell` RPC using the service role client.
6. Returns `{ status: "filled", filled_price }`.

### Limit order placement
1. Client POSTs to `/api/orders` with `{ ..., order_type: "limit", limit_price }`.
2. Validates funds/shares.
3. For **buy** limits: cash is deducted immediately (`cash_balance -= quantity * limit_price`). This reserves the funds and prevents over-spending across multiple pending orders.
4. Inserts an `orders` row with `status = "pending"`.
5. Returns `{ status: "pending", order_id }`.

### Limit order fill (cron)
1. Vercel Cron hits `GET /api/cron/fill-limits` every minute with `Authorization: Bearer <CRON_SECRET>`.
2. Route fetches all `pending` limit orders from Supabase.
3. Groups by ticker; fetches one Finnhub quote per unique ticker (batched to respect rate limits).
4. For each order: checks fill condition (buy: `current_price <= limit_price`; sell: `current_price >= limit_price`).
5. Fills matched orders via RPCs (`fill_limit_buy` or `execute_market_sell` with the order ID).
6. Returns `{ filled: N, checked: M }`.

### Limit order cancel
1. Client POSTs to `/api/orders/:id/cancel`.
2. Route verifies the order belongs to the requesting user and is still `pending`.
3. Sets `status = "cancelled"`.
4. For **buy** limits: calls `increment_cash` RPC to refund the reserved amount.

---

## Finnhub API

The Finnhub free-tier API key is stored only in `FINNHUB_API_KEY` (server-side env var, never `NEXT_PUBLIC_`). All client-facing components call `/api/quote?symbol=X`, which proxies to Finnhub server-side.

- Free tier: 60 API calls/minute.
- Next.js fetch caching: `{ next: { revalidate: 15 } }` on quote calls (15-second cache), `{ next: { revalidate: 3600 } }` on search calls (1-hour cache). This keeps upstream calls well within rate limits even under load.
- Quote fields used: `c` (current), `d` (change), `dp` (change%), `o` (open), `pc` (prev close), `h` (high), `l` (low).
- If `c === 0`, the symbol is invalid or not supported — the route returns a 422 error.

---

## Environment variables

```bash
# .env.local — fill these in before running

# Supabase (get from: supabase.com/dashboard/project/uhlbospqolwjswhjfoba/settings/api)
NEXT_PUBLIC_SUPABASE_URL=https://uhlbospqolwjswhjfoba.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...       # safe to expose (anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # SECRET — never NEXT_PUBLIC_

# Finnhub (get free key at: finnhub.io/register)
FINNHUB_API_KEY=your_key_here              # SECRET — never NEXT_PUBLIC_

# Cron security (already generated — keep as-is or regenerate with: openssl rand -base64 32)
CRON_SECRET=...
SUPABASE_FUNCTION_SECRET=...
```

---

## Running locally

```bash
# 1. Fill in .env.local (SUPABASE_SERVICE_ROLE_KEY and FINNHUB_API_KEY are required)
# 2. Install dependencies (already done if node_modules exists)
npm install

# 3. Start dev server
npm run dev
# → http://localhost:3000

# 4. Type check
npm run type-check

# 5. Lint
npm run lint
```

---

## Deployment (Vercel)

1. Push to any branch and connect the repo to Vercel.
2. Set all env vars from `.env.local` in the Vercel project settings.
3. `vercel.json` configures a 1-minute cron job that hits `/api/cron/fill-limits`. Vercel adds `Authorization: Bearer <CRON_SECRET>` automatically on Pro plans; on Hobby plans the cron fires but without the header — you'll need to either disable the auth check or use Vercel Pro.
4. The cron route also works for manual testing: `curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/cron/fill-limits`

---

## Supabase project

- **Project ID**: `uhlbospqolwjswhjfoba`
- **Region**: ap-northeast-2 (Seoul)
- **Dashboard**: `https://supabase.com/dashboard/project/uhlbospqolwjswhjfoba`
- **Auth settings**: email/password enabled; email confirmation can be toggled in Auth > Settings.

This is a dedicated project — no unrelated tables or legacy data.

---

## UI design system

Dark trading terminal aesthetic throughout. Core palette:

| Token | Value | Usage |
|-------|-------|-------|
| `bg-[#0a0f14]` | Near-black | Page background |
| `bg-gray-900` + `border-gray-800` | Dark panel | Cards (`.card` class) |
| `text-green-400` / `bg-green-500/10` | Green | Buy, profit, positive change |
| `text-red-400` / `bg-red-500/10` | Red | Sell, loss, negative change |
| `text-blue-400` | Blue | Logo, active nav, links, accent |
| `text-gray-500` | Muted grey | Labels, secondary info |

Global CSS utility classes defined in `src/app/globals.css`:
- `.card` — dark panel with border
- `.btn-primary` / `.btn-buy` / `.btn-sell` / `.btn-ghost` — button variants
- `.input` — dark form input
- `.label` — form label
- `.positive` / `.negative` / `.muted` — text color helpers

---

## Future roadmap (not yet built)

The following are planned for future versions — do not add them until explicitly requested:

- **Charts**: Candlestick / line price charts per symbol (Recharts or TradingView Lightweight Charts)
- **Portfolio chart**: Equity curve over time (requires a `portfolio_snapshots` table populated by cron)
- **Learning platform**: Guided lessons with real trade examples
- **Challenges**: Specific trading scenarios with scoring
- **Leaderboard**: Ranked by portfolio return % across all users
- **Competitions**: Time-boxed tournaments with separate starting balances
- **Real-time prices**: Finnhub WebSocket for live price streaming (paid tier)
- **Fractional shares**: Change `quantity` columns from INTEGER to DECIMAL
- **Order book depth**: Bid/ask spread simulation
- **Stop-loss / take-profit**: Additional order types

---

## Known limitations (MVP)

- Prices are ~15 minutes delayed on Finnhub's free tier. Market orders fill at the delayed price, not true real-time.
- Limit orders check every 60 seconds (Vercel Cron minimum). A fast price spike could be missed if it reverses within 60 seconds.
- No fractional shares — quantity must be a whole integer.
- No short selling — you cannot sell shares you do not own.
- The dashboard P&L is computed at page load time (no live updates). Refresh to see latest prices.
- Finnhub free tier supports US-listed stocks and some international tickers. Crypto and forex tickers may return `c === 0`.
