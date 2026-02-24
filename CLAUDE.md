# Fintrack

Personal investment tracking application (monorepo).

## Quick Start

```bash
docker compose up          # starts db, backend, frontend
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000/api/
# Django admin: http://localhost:8000/admin/
# Default superuser: admin / admin
```

## Project Structure

```
backend/          Django 5.1 + DRF
  apps/
    core/         Auth (session + CSRF cookies)
    assets/       Asset, Account, Settings models + Yahoo Finance price updates
    transactions/ Transaction (BUY/SELL/GIFT), Dividend, Interest
    portfolio/    FIFO engine (services.py) — positions, realized P&L
    importer/     JSON backup/restore
    reports/      Fiscal year summaries
  config/
    settings/     base.py, development.py
    urls.py       Root URL conf

frontend/         Vite + React 18 + TypeScript
  src/
    api/          Axios clients (client.ts has CSRF interceptor)
    pages/        Dashboard, Cartera, Operaciones, Dividendos, Intereses, Fiscal, Configuracion
    components/
      ui/         shadcn/ui (Radix + Tailwind)
      app/        Sidebar, DataTable, MoneyCell, NewAssetForm
    stores/       Zustand (authStore)
    types/        TypeScript interfaces
```

## Tech Stack

- **Backend:** Django 5.1, DRF 3.15, PostgreSQL 16, yfinance
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Radix UI, React Query, Zustand, Recharts
- **Infra:** Docker Compose (db, backend, frontend)

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

## Key Conventions

- **Language:** UI and labels in Spanish. Code (variables, comments) in English.
- **Money:** Always `Decimal`, never float. Rounding configured in Settings.
- **IDs:** UUID (TimeStampedModel base class in `apps/core/models.py`).
- **Auth:** Django session-based. Frontend reads `csrftoken` cookie, sends `X-CSRFToken` header.
- **Portfolio engine:** Single FIFO pass in `portfolio/services.py` (`_process_fifo`) shared by portfolio positions and realized P&L. Cost basis derived from remaining FIFO lots, not historical WAC.
- **Price updates:** Via Yahoo Finance (`assets/services.py`). `current_price` is read-only in the API — only updated by the update-prices endpoint.
- **Frontend state:** React Query for server state, Zustand only for auth. Invalidate queries after mutations.
- **Components:** shadcn/ui pattern — Radix primitives + Tailwind. Prefer editing existing components over creating new ones.

## Environment Variables (.env.example)

```
DB_NAME=fintrack
DB_USER=fintrack
DB_PASSWORD=changeme
DB_HOST=db
DB_PORT=5432
DJANGO_SECRET_KEY=change-me-to-a-random-string
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,backend
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

## API Endpoints

```
/api/auth/login/          POST   Login (session)
/api/auth/logout/         POST   Logout
/api/auth/me/             GET    Current user

/api/assets/              CRUD   Assets
/api/assets/update-prices/ POST  Fetch prices from Yahoo Finance
/api/accounts/            CRUD   Accounts
/api/settings/            GET/PUT Settings singleton

/api/transactions/        CRUD   Transactions
/api/dividends/           CRUD   Dividends
/api/interests/           CRUD   Interests

/api/portfolio/           GET    Positions + realized sales (single FIFO pass)
/api/reports/yearly/      GET    Year-by-year income summary
/api/export/transactions.csv GET CSV export
```
