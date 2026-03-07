<div align="center">

# Fintrack

**Self-hosted investment portfolio tracker — built for privacy and clarity.**

Track your portfolio, transactions, dividends, interests and taxes from a single interface. No subscriptions, no data sharing, fully open source.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-active-brightgreen.svg)]()
[![Django](https://img.shields.io/badge/Django-5.1-green?logo=django)](https://www.djangoproject.com/)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://www.docker.com/)

[Live Demo](https://fintrack-quintela.vercel.app) · [Report a Bug](https://github.com/Gonzalez8/Fintrack/issues) · [Request a Feature](https://github.com/Gonzalez8/Fintrack/issues)

</div>

---

## Screenshots

<p align="center">
  <img src=".github/screenshots/01-dashboard.png" alt="Dashboard" width="49%" />
  <img src=".github/screenshots/02-cartera.png" alt="Portfolio" width="49%" />
</p>
<p align="center">
  <img src=".github/screenshots/03-activos.png" alt="Assets" width="49%" />
  <img src=".github/screenshots/04-cuentas.png" alt="Accounts" width="49%" />
</p>
<p align="center">
  <img src=".github/screenshots/05-operaciones.png" alt="Transactions" width="49%" />
  <img src=".github/screenshots/06-dividendos.png" alt="Dividends" width="49%" />
</p>
<p align="center">
  <img src=".github/screenshots/08-ahorro.png" alt="Monthly Savings" width="49%" />
  <img src=".github/screenshots/09-fiscal.png" alt="Tax Report" width="49%" />
</p>
<p align="center">
  <img src=".github/screenshots/10-cartera-detalle.png" alt="Position detail chart" width="49%" />
  <img src=".github/screenshots/11-activo-detalle.png" alt="Asset price history chart" width="49%" />
</p>

---

## Features

### 📊 Dashboard
- Net worth cards: total patrimony, unrealized P&L, current-year income (dividends + interests + realized sales)
- Asset allocation pie chart (Equities / Fixed Income / Cash)
- **Patrimony evolution chart** — stacked area with range selectors (3M, 6M, 1Y, 2Y, MAX)
- **Portfolio value chart** — snapshot-based time series with LIVE badge when prices differ from last snapshot
- Persistent top bar on desktop: patrimony, unrealized P&L, market value and cash always visible

### 💼 Portfolio
- Positions table: quantity, total cost, current price, market value, P&L € and P&L %
- One-click price update via Yahoo Finance (async via Celery, no UI freeze)
- Position detail drawer with historical market value, cost basis and unrealized P&L chart

### 📈 Assets
- Catalog: name, ticker, ISIN, type (Stock / ETF / Fund / Crypto), currency, withholding countries
- Automatic prices via Yahoo Finance or manual override
- Interactive OHLC price history chart with period selector (1M → MAX)

### 🏦 Accounts
- Cash account types: operating, savings, investment, deposits, alternatives
- Balance snapshot history with notes
- Bulk snapshot creation for multiple accounts on the same date

### 🔄 Transactions
- BUY / SELL / GIFT operations with date, quantity, price, commission and tax
- **Cost basis engine** — FIFO, LIFO and WAC (Weighted Average Cost), single-pass algorithms with commission and tax included in cost basis
- Configurable gift cost mode: zero or market price at gift date
- Pagination, filters, CSV export

### 💰 Dividends & Interests
- Dividends: gross amount, withholding tax, net income, withholding rate, shares at payment date
- Interests: gross amount, net income, balance, annual rate and account
- Both: filters by asset/account and date range, CSV export

### 🐷 Monthly Savings
- **Real savings calculation**: ΔCash + ΔInvestment cost — capital deployed is not counted as a loss
- KPI cards: current cash, last month savings, period average, best/worst month
- "No outliers" toggle: trimmed mean when ≥ 6 months in range
- Mobile-first: card-per-month layout on small screens

### 📋 Tax Report
- Year-by-year summary: gross/net dividends, gross/net interest, realized sales P&L
- **Separate fiscal cost method** — independent from portfolio method, supports FIFO / LIFO / WAC per country requirements
- Detailed breakdown per year
- Year selector for the last 6 fiscal years

### 🔐 Authentication & Security
- **Registration** with username + optional email + password (can be disabled server-side)
- **Google OAuth2** one-click login — no password required; account created automatically
- **JWT** — access token in memory only (XSS-safe), refresh token as `httpOnly SameSite=Lax` cookie
- **Profile page** — edit username/email, change password with token rotation
- Rate limiting on all auth endpoints (brute-force protection)
- Django password validators (minimum length, common passwords, similarity check)

### ⚙️ Settings
- **Cost basis method** — FIFO / LIFO / WAC for portfolio and snapshots
- **Fiscal cost method** — independent method for tax reports (configurable per country)
- Warning dialog when changing methods explaining impact on snapshots and fiscal reports
- Gift cost mode (Zero / Market price)
- Money and quantity rounding decimals
- Portfolio snapshot frequency and data retention policy
- Database storage usage breakdown by table

---

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/Gonzalez8/Fintrack.git && cd Fintrack
cp .env.example .env
docker compose up
```

That's it! 🎉

| Service | URL |
|---|---|
| App | `http://localhost:5173` |
| API | `http://localhost:8000/api/` |
| Swagger UI | `http://localhost:8000/api/schema/swagger-ui/` |
| Django Admin | `http://localhost:8000/admin/` |

- Username: `admin`
- Password: `admin`

### Option 2: Production (Pre-built Images) 🏭

No source code needed — uses images from GitHub Container Registry.

```bash
mkdir fintrack && cd fintrack
curl -O https://raw.githubusercontent.com/Gonzalez8/Fintrack/main/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/Gonzalez8/Fintrack/main/.env.production.example
cp .env.production.example .env
# Edit .env with your values (DB_PASSWORD, DJANGO_SECRET_KEY, etc.)
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

The superuser is created automatically on first start. No manual scripts needed.

> ⚠️ Always set strong, unique values for `DB_PASSWORD`, `DJANGO_SECRET_KEY` and `DJANGO_SUPERUSER_PASSWORD` before deploying.

### Option 3: Portainer 🖥️

1. In Portainer, go to **Stacks → Add stack**
2. Paste the contents of [`docker-compose.prod.yml`](docker-compose.prod.yml)
3. Add the required [environment variables](#environment-variables)
4. Click **Deploy the stack**

### Option 4 — Live Demo (Vercel, no backend)

A static frontend-only demo using [MSW (Mock Service Worker)](https://mswjs.io/) — no database or backend needed.

| Vercel Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Environment Variable | `VITE_DEMO_MODE=true` |

The `frontend/vercel.json` is already configured for SPA routing and MSW service worker headers.

**Test demo locally:**
```bash
cd frontend && VITE_DEMO_MODE=true npm run dev
```

[Full deployment documentation →](docker-compose.prod.yml)

---

## Security & Authentication

### JWT token flow

```
Browser
  ├── Zustand store ──► access token (memory only — never persisted)
  └── httpOnly cookie ──► refresh token (SameSite=Lax, no JS access)
        │
        └─► POST /api/auth/token/refresh/  ──►  new access token
```

- Access token disappears on page reload — fetched silently via refresh cookie on next load.
- Refresh token rotates on every use and is blacklisted after rotation (replay-safe).
- All requests attach Bearer token automatically; 401 triggers a single transparent retry.

### Google OAuth2

The integration uses the **Google Identity Services ID Token flow** — no redirects, no OAuth callback URLs needed.

```
1. Load Google GIS script on login page
2. User clicks "Continue with Google"
3. Google returns an ID token (credential)
4. POST /api/auth/google/ { credential }
5. Backend verifies token with Google's public keys
6. Get or create user by email
7. Issue JWT pair → login complete
```

**Setup in 2 minutes:**
1. [Create an OAuth 2.0 Client ID](https://console.cloud.google.com/apis/credentials) (Web application)
2. Add `http://localhost:5173` (and your production domain) to **Authorized JavaScript origins**
3. Set `GOOGLE_CLIENT_ID=<your-id>` in `.env` and `VITE_GOOGLE_CLIENT_ID=<your-id>` in `frontend/.env.local`
4. Restart backend — the Google button appears automatically

> No Authorized redirect URIs needed.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Django 5.1 · Django REST Framework · PostgreSQL 16 · Celery 5 · Redis |
| **Auth** | djangorestframework-simplejwt · google-auth |
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui (Radix) |
| **State** | Zustand (auth) · TanStack Query (server state) |
| **Charts** | Recharts · lightweight-charts |
| **Infra** | Docker Compose · GitHub Actions CI |
| **API Docs** | drf-spectacular (OpenAPI 3 / Swagger UI / ReDoc) |

---

## Project Structure

```
fintrack/
├── backend/                    Django 5.1 + DRF
│   ├── apps/
│   │   ├── core/               Auth (JWT, register, Google OAuth2, profile)
│   │   │                       Base models (TimeStampedModel, UserOwnedModel)
│   │   │                       Multi-tenancy mixin (OwnedByUserMixin)
│   │   ├── assets/             Asset, Account, Settings + Yahoo Finance prices
│   │   │                       Celery tasks (price updates, snapshots)
│   │   ├── transactions/       Transaction (BUY/SELL/GIFT), Dividend, Interest
│   │   ├── portfolio/          Cost basis engine (FIFO/LIFO/WAC) — pure service functions
│   │   ├── reports/            Tax summaries, patrimony & savings evolution
│   │   └── importer/           JSON backup / restore
│   └── config/
│       ├── settings/           base.py · development.py
│       ├── urls.py
│       └── celery.py
│
├── frontend/                   Vite + React 18 + TypeScript
│   └── src/
│       ├── api/                client.ts (interceptor) · auth.ts · tasks.ts
│       ├── pages/              Dashboard, Portfolio, Assets, Accounts,
│       │                       Transactions, Dividends, Interest,
│       │                       MonthlySavings, Fiscal, Settings, Profile
│       ├── components/
│       │   ├── ui/             shadcn/ui (Radix + Tailwind)
│       │   └── app/            Sidebar, TopBar, MobileNav, charts, tables
│       ├── stores/             Zustand (authStore)
│       ├── demo/               MSW handlers (Vercel demo mode)
│       └── types/              TypeScript interfaces
│
├── docker-compose.yml          Development (6 services)
├── docker-compose.prod.yml     Production
└── .github/workflows/ci.yml    Backend tests + TypeScript check
```

---

## API

Interactive docs available at [`/api/schema/swagger-ui/`](http://localhost:8000/api/schema/swagger-ui/) when running locally.

```
# Auth
POST    /api/auth/token/                  Login → { access, user } + httpOnly cookie
POST    /api/auth/token/refresh/          Rotate refresh token → { access }
POST    /api/auth/logout/                 Blacklist token + clear cookie
GET     /api/auth/me/                     Current user
POST    /api/auth/register/               Create account (403 if disabled)
POST    /api/auth/google/                 Google ID-token login / register
GET     /api/auth/profile/               User profile
PUT     /api/auth/profile/               Update username / email
POST    /api/auth/change-password/        Change password + rotate JWT

# Data (all owner-scoped, require Bearer token)
CRUD    /api/assets/
POST    /api/assets/{id}/set-price/
GET     /api/assets/{id}/price-history/   ?period=1mo|3mo|6mo|1y|2y|5y|max
POST    /api/assets/update-prices/        Enqueue → 202 { task_id }
GET     /api/tasks/{task_id}/            Celery task status
CRUD    /api/accounts/
CRUD    /api/account-snapshots/
POST    /api/accounts/bulk-snapshot/
GET/PUT /api/settings/

CRUD    /api/transactions/
CRUD    /api/dividends/
CRUD    /api/interests/
GET     /api/portfolio/

GET     /api/reports/year-summary/
GET     /api/reports/patrimonio-evolution/
GET     /api/reports/rv-evolution/
GET     /api/reports/monthly-savings/

GET     /api/export/transactions.csv
GET     /api/export/dividends.csv
GET     /api/export/interests.csv
GET     /api/backup/export/
POST    /api/backup/import/

GET     /api/health/                      Liveness probe
```

---

## Database Schema

All domain tables use UUID primary keys and `created_at` / `updated_at` timestamps. Every table has an `owner` foreign key enforcing row-level multi-tenancy — users can only see their own data.

### Assets & Accounts

| Table | Description |
|---|---|
| `assets_asset` | Securities catalog: stocks, ETFs, funds, crypto. Stores ticker, ISIN, type, currency, current price and price source (Yahoo / manual). One row per security per user. |
| `assets_account` | Cash accounts: operating, savings, investment, deposits, alternatives. Balance is auto-synced from the latest `AccountSnapshot`. |
| `assets_accountsnapshot` | Point-in-time balance recording for an account (date + balance + optional note). Used to build the patrimony evolution chart. Unique per `(account, date)`. |
| `assets_settings` | Per-user configuration (1:1 with User): cost basis method, fiscal method, gift cost mode, rounding, snapshot frequency, data retention, base currency. |

### Transactions & Income

| Table | Description |
|---|---|
| `transactions_transaction` | Buy / Sell / Gift operations linking an asset and an account. Fields: date, quantity, unit price, commission, tax. Feeds the cost basis engine (FIFO/LIFO/WAC) to calculate positions and realized P&L. |
| `transactions_dividend` | Dividend payments: gross amount, withholding tax, net income, withholding rate, shares held at payment date. Linked to an asset. |
| `transactions_interest` | Interest income on accounts: gross, net, balance at date, annual rate. Linked to an account. |

### Portfolio Snapshots

Created automatically by Celery Beat every N minutes (configurable via `snapshot_frequency` in Settings). Used for time-series charts on the Dashboard.

| Table | Description |
|---|---|
| `assets_portfoliosnapshot` | **Aggregate** snapshot at a point in time: total market value, total cost, total unrealized P&L. Each snapshot gets a unique `batch_id`. |
| `assets_positionsnapshot` | **Per-asset detail** linked to a portfolio snapshot via `batch_id`: quantity, cost basis, market value, unrealized P&L (€ and %). One row per open position per snapshot. This is typically the largest table. |

**How they work together:**

```
Celery Beat (every 60s)
  └─► snapshot_all_users_task
        └─► For each user (if due):
              1. Calculate current positions (cost basis engine)
              2. INSERT PortfolioSnapshot  { batch_id, totals }
              3. INSERT PositionSnapshot[] { batch_id, per-asset details }
```

The Dashboard's "Portfolio value" chart reads `PortfolioSnapshot` records over time. The position detail drawer reads `PositionSnapshot` records filtered by asset.

---

## Development

### Prerequisites

- [Docker](https://www.docker.com/) + Docker Compose
- (Optional) Node 20 + Python 3.12 for local development without Docker

### Common commands

```bash
# Start all services
docker compose up

# Run backend tests
docker compose exec backend pytest

# TypeScript check
docker compose exec frontend npx tsc --noEmit

# Create migrations
docker compose exec backend python manage.py makemigrations <app>

# Django shell
docker compose exec backend python manage.py shell

# View Celery logs
docker compose logs -f celery_worker
```

### Optional: enable Google login locally

```bash
# frontend/.env.local  (gitignored — never commit)
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_ALLOW_REGISTRATION=true

# Then restart frontend
docker compose restart frontend
```

---

## Environment Variables

### Backend (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_PASSWORD` | **yes** | — | PostgreSQL password |
| `DJANGO_SECRET_KEY` | **yes** | — | Django secret key (≥ 50 random chars) |
| `DB_NAME` | | `fintrack` | Database name |
| `DB_USER` | | `fintrack` | Database user |
| `ALLOWED_HOSTS` | | `*` | Comma-separated allowed hostnames |
| `CORS_ALLOWED_ORIGINS` | | — | Comma-separated allowed origins |
| `CSRF_TRUSTED_ORIGINS` | | — | Comma-separated CSRF trusted origins |
| `REDIS_URL` | | `redis://redis:6379/0` | Celery broker + result backend |
| `GOOGLE_CLIENT_ID` | | _(empty)_ | Google OAuth2 client ID — leave empty to disable |
| `ALLOW_REGISTRATION` | | `true` | `false` = admin creates users via Django admin |
| `DJANGO_SUPERUSER_USERNAME` | | `admin` | Initial superuser username |
| `DJANGO_SUPERUSER_PASSWORD` | | `admin` | Initial superuser password |
| `APP_PORT` | | `8000` | Host port for the backend container |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | _(empty)_ | Same value as backend `GOOGLE_CLIENT_ID` |
| `VITE_ALLOW_REGISTRATION` | `true` | `false` hides the registration tab |
| `VITE_DEMO_MODE` | — | `true` enables MSW demo layer (Vercel only) |

> ⚠️ Always set strong, unique values for `DB_PASSWORD`, `DJANGO_SECRET_KEY` and `DJANGO_SUPERUSER_PASSWORD` in production. Never commit `frontend/.env.local`.

---

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests where applicable
4. Run the test suite: `docker compose exec backend pytest`
5. Check TypeScript: `docker compose exec frontend npx tsc --noEmit`
6. Open a pull request

Please keep PRs focused — one feature or fix per PR. Open an issue first for larger changes.

### Roadmap

- [ ] Password reset via email
- [ ] Two-factor authentication (TOTP)
- [ ] Multi-currency support (FX rates)
- [ ] Price alerts / notifications
- [ ] Benchmark comparison (S&P 500, IBEX)
- [ ] Excel / broker statement import (DEGIRO, ING, Interactive Brokers)
- [ ] Audit log
- [ ] Mobile app (React Native)

---

## License

[MIT](LICENSE) — free to use, modify and self-host.

---

<div align="center">

Made with ❤️ for investors who value privacy

</div>
