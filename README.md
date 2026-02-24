# Fintrack

Personal investment tracking application. Monitor your portfolio, transactions, dividends, interests and taxes from a single interface.

## Features

### Dashboard
- Summary cards: total net worth (investments + cash), unrealized P&L %, current year income (dividends, interests, realized sales)
- Asset allocation pie chart by market value
- Year-by-year income bar chart (dividends, interests, realized sales)
- Asset type allocation: Renta Variable / Renta Fija / Cash
- Monthly patrimony evolution area chart (cash + investments)

### Portfolio (Cartera)
- Current positions table: asset name/ticker, type, quantity, total cost, current price, market value, P&L €, P&L %  and portfolio weight
- One-click price update via Yahoo Finance
- Position detail modal with historical evolution chart (market value, cost basis, unrealized P&L over time)

### Assets (Activos)
- Asset catalog: name, ticker, ISIN, type (Stock, ETF, Fund, Crypto), currency, issuer/domicile/withholding countries
- Automatic price mode (Yahoo Finance) or manual price override
- Price status tracking per asset (OK / Error / No ticker)
- Delete protection when an asset has associated transactions

### Accounts (Cuentas)
- Cash account management: operating, savings, investment, deposits, alternatives
- Balance snapshot history with notes
- Bulk snapshot creation for multiple accounts on the same date
- Automatic balance denormalization for fast reads

### Transactions (Operaciones)
- Buy, sell and gift operations with date, quantity, price, commission and tax
- FIFO cost basis engine: single-pass algorithm calculates realized P&L on every sale, including commission and tax in the cost basis
- Configurable gift cost mode: zero or market price at gift date
- Pagination, filters and CSV export

### Dividends (Dividendos)
- Gross amount, withholding tax, net income, withholding rate and shares at payment date
- Filters by asset and date range
- CSV export

### Interests (Intereses)
- Gross amount, net income, balance, annual rate and account
- Filters by account and date range
- CSV export

### Tax Report (Fiscal)
- Year-by-year summary table: dividend income (gross/net), interest income (gross/net), realized sales P&L, total net
- Detailed breakdown per year: dividends, realized sales and interests
- Year selector for the last 6 fiscal years

### Backup & Restore
- Full JSON export: settings, assets, accounts, snapshots, transactions, dividends, interests
- Atomic import with foreign-key handling and duplicate skipping

### Settings (Configuracion)
- Cost basis method (FIFO)
- Gift cost mode (Zero / Market)
- Money and quantity rounding decimals
- Price update interval and default price source
- Portfolio snapshot frequency (minutes)
- Data retention policy (auto-purge old snapshots)
- Database storage usage breakdown by table
- Last snapshot time and next eligible snapshot countdown

### Dark mode

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Backend | Django 5.1, Django REST Framework, PostgreSQL 16, yfinance, openpyxl |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix), React Query, Zustand, Recharts |
| Infra | Docker Compose |

---

## Deployment

### Option A — Production (pre-built images, no source code needed)

Uses the images published on GitHub Container Registry. This is the recommended approach for self-hosting.

**1. Create a working directory and download the compose file:**

```bash
mkdir fintrack && cd fintrack
curl -O https://raw.githubusercontent.com/Gonzalez8/Fintrack/main/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/Gonzalez8/Fintrack/main/.env.production.example
cp .env.production.example .env
```

**2. Edit `.env` with your values:**

```env
# Database
DB_NAME=fintrack
DB_USER=fintrack
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# Django
DJANGO_SECRET_KEY=CHANGE_ME_RANDOM_STRING_50_CHARS
ALLOWED_HOSTS=fintrack.yourdomain.com,localhost
CORS_ALLOWED_ORIGINS=https://fintrack.yourdomain.com
CSRF_TRUSTED_ORIGINS=https://fintrack.yourdomain.com

# Port exposed by the container (e.g. 80 or 8000)
APP_PORT=80

# Initial superuser — created automatically on first start
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_PASSWORD=CHANGE_ME_STRONG_PASSWORD
```

**3. Start:**

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

The superuser is created automatically on first start. No manual scripts needed.

| Service | URL |
|---|---|
| App + API | http://localhost (or your domain) |
| Django Admin | http://localhost/admin/ |

---

### Option B — Portainer (Stack)

1. In Portainer, go to **Stacks → Add stack**.
2. Paste the contents of [`docker-compose.prod.yml`](docker-compose.prod.yml) into the web editor.
3. Scroll down to **Environment variables** and add:

| Variable | Value |
|---|---|
| `DB_PASSWORD` | your database password |
| `DJANGO_SECRET_KEY` | a long random string |
| `ALLOWED_HOSTS` | your domain or `*` |
| `CSRF_TRUSTED_ORIGINS` | `https://yourdomain.com` |
| `CORS_ALLOWED_ORIGINS` | `https://yourdomain.com` |
| `DJANGO_SUPERUSER_USERNAME` | `admin` (or your preferred username) |
| `DJANGO_SUPERUSER_PASSWORD` | your admin password |
| `APP_PORT` | `80` |

4. Click **Deploy the stack**.

The backend entrypoint runs migrations and creates the superuser automatically on every start (idempotent — skips if the user already exists).

---

### Option C — Local development (from source)

```bash
git clone https://github.com/Gonzalez8/Fintrack.git && cd Fintrack
cp .env.example .env          # defaults work out of the box
docker compose up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| API | http://localhost:8000/api/ |
| Django Admin | http://localhost:8000/admin/ |

Default user: `admin` / `admin`

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_NAME` | | `fintrack` | PostgreSQL database name |
| `DB_USER` | | `fintrack` | PostgreSQL user |
| `DB_PASSWORD` | **yes** | — | PostgreSQL password |
| `DJANGO_SECRET_KEY` | **yes** | — | Django secret key (long random string) |
| `ALLOWED_HOSTS` | | `*` | Comma-separated allowed hostnames |
| `CORS_ALLOWED_ORIGINS` | | — | Comma-separated allowed origins |
| `CSRF_TRUSTED_ORIGINS` | | — | Comma-separated trusted origins for CSRF |
| `APP_PORT` | | `8000` | Host port mapped to the backend container |
| `DJANGO_SUPERUSER_USERNAME` | | `admin` | Initial admin username |
| `DJANGO_SUPERUSER_PASSWORD` | | `admin` | Initial admin password |

> **Security note:** Always set strong, unique values for `DB_PASSWORD`, `DJANGO_SECRET_KEY` and `DJANGO_SUPERUSER_PASSWORD` before deploying to a public server.

---

## Project Structure

```
backend/                Django 5.1 + DRF
  apps/
    core/               Auth (session + CSRF cookies)
    assets/             Asset, Account, Settings + Yahoo Finance
    transactions/       Transaction (BUY/SELL/GIFT), Dividend, Interest
    portfolio/          FIFO engine (positions, realized P&L)
    importer/           Excel import + JSON backup/restore
    reports/            Yearly tax summaries + patrimony evolution
  config/
    settings/           base.py, development.py
    urls.py

frontend/               Vite + React 18 + TypeScript
  src/
    api/                Axios clients (CSRF interceptor)
    pages/              Dashboard, Cartera, Activos, Cuentas,
                        Operaciones, Dividendos, Intereses,
                        Fiscal, Configuracion
    components/
      ui/               shadcn/ui (Radix + Tailwind)
      app/              Sidebar, PageHeader, DataTable, MoneyCell
    stores/             Zustand (authStore)
    types/              TypeScript interfaces
    lib/                Shared utilities and constants
```

## Common Commands

```bash
# Migrations
docker compose exec backend python manage.py makemigrations <app>
docker compose exec backend python manage.py migrate

# Django shell
docker compose exec backend python manage.py shell

# Tests
docker compose exec backend pytest

# TypeScript check
docker compose exec frontend npx tsc --noEmit
```

## API

```
POST    /api/auth/login/                  Login (session)
POST    /api/auth/logout/                 Logout
GET     /api/auth/me/                     Current user

CRUD    /api/assets/                      Assets
POST    /api/assets/{id}/set-price/       Manual price override
GET     /api/assets/{id}/position-history/ Position snapshot history
POST    /api/assets/update-prices/        Fetch prices (Yahoo Finance)
CRUD    /api/accounts/                    Accounts
CRUD    /api/account-snapshots/           Account balance snapshots
POST    /api/accounts/bulk-snapshot/      Bulk snapshot creation
GET/PUT /api/settings/                    Settings (singleton)
GET     /api/storage-info/                DB size by table

CRUD    /api/transactions/                Transactions
CRUD    /api/dividends/                   Dividends
CRUD    /api/interests/                   Interests

GET     /api/portfolio/                   Positions + realized sales (FIFO)

GET     /api/reports/year-summary/        Year-by-year income summary
GET     /api/reports/patrimonio-evolution/ Monthly patrimony evolution
GET     /api/reports/rv-evolution/        Portfolio value time series
GET     /api/reports/snapshot-status/     Last/next snapshot info

GET     /api/export/transactions.csv      CSV export
GET     /api/export/dividends.csv         CSV export
GET     /api/export/interests.csv         CSV export

GET     /api/backup/export/               Full JSON backup
POST    /api/backup/import/               Restore from JSON backup
```

## License

Personal project. All rights reserved.
