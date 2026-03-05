# Fintrack

Personal investment tracking application (monorepo).

## Quick Start

```bash
docker compose up          # starts db, redis, backend, frontend, celery_worker, celery_beat
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000/api/
# Django admin: http://localhost:8000/admin/
# Default superuser: admin / admin
```

## Project Structure

```
backend/          Django 5.1 + DRF
  apps/
    core/         JWT auth (JWTLoginView, JWTRefreshView, JWTLogoutView, MeView)
                  UserOwnedModel abstract base + OwnedByUserMixin (mixins.py)
                  TaskStatusView — polls Celery task result
    assets/       Asset, Account, Settings models + Yahoo Finance price updates
                  Celery tasks (tasks.py): update_prices_task, snapshot_all_users_task
    transactions/ Transaction (BUY/SELL/GIFT), Dividend, Interest
    portfolio/    FIFO engine (services.py) — positions, realized P&L
    importer/     JSON backup/restore
    reports/      Fiscal year summaries + patrimony/savings evolution
  config/
    celery.py     Celery app (autodiscover, CELERY_BEAT_SCHEDULE)
    settings/     base.py, development.py
    urls.py       Root URL conf

frontend/         Vite + React 18 + TypeScript
  src/
    api/          client.ts — Bearer interceptor + 401 refresh retry (no CSRF)
                  auth.ts — tokenLogin, tokenRefresh, logout, me
                  tasks.ts — tasksApi.getStatus(), pollTask() utility
    pages/        Dashboard, Cartera, Activos, Cuentas, Operaciones,
                  Dividendos, Intereses, AhorroMensual, Fiscal, Configuracion
    components/
      ui/         shadcn/ui (Radix + Tailwind)
      app/        Sidebar, TopBar, MobileNav, DataTable, MoneyCell, etc.
    stores/       Zustand (authStore — access token in memory only)
    demo/         MSW handlers for Vercel demo mode
    types/        TypeScript interfaces
    lib/          chartTheme.ts, savingsUtils.ts, utils, constants
```

## Tech Stack

- **Backend:** Django 5.1, DRF 3.15, PostgreSQL 16, yfinance, djangorestframework-simplejwt 5.3, Celery 5.3, Redis
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Radix UI, React Query, Zustand, Recharts
- **Infra:** Docker Compose (db, redis, backend, frontend, celery_worker, celery_beat)

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

# Celery logs
docker compose logs celery_worker -f
docker compose logs celery_beat -f
```

## Key Conventions

- **Language:** UI and labels in Spanish. Code (variables, comments) in English.
- **Money:** Always `Decimal`, never float. Rounding configured in Settings.
- **IDs:** UUID (TimeStampedModel base class in `apps/core/models.py`).
- **Multi-tenancy:** Every domain model carries an `owner` FK (non-nullable). All ViewSets inherit `OwnedByUserMixin` which filters querysets to `request.user` and injects owner on create. Cross-user access returns 404, not 403.
- **Auth:** JWT — access token in Zustand memory (never localStorage), refresh token as httpOnly cookie (SameSite=Lax). `POST /api/auth/token/` → access + cookie. `POST /api/auth/token/refresh/` → rotates cookie. `SessionAuthentication` is NOT in DRF's DEFAULT_AUTHENTICATION_CLASSES (Django /admin/ uses its own auth independently).
- **Portfolio engine:** Single FIFO pass in `portfolio/services.py` (`_process_fifo(user)`) shared by portfolio positions and realized P&L. All service functions receive `user` as first argument.
- **Price updates:** Async via Celery. `POST /api/assets/update-prices/` enqueues `update_prices_task` and returns `{task_id, status: "queued"}` (HTTP 202). Frontend polls `GET /api/tasks/{id}/` every 2s until SUCCESS/FAILURE, then invalidates React Query cache.
- **Snapshot scheduler:** Celery Beat runs `snapshot_all_users_task` every 60s. The task iterates all users with `snapshot_frequency > 0`, creates a `PortfolioSnapshot` per user when due. Uses `select_for_update` per-user to prevent concurrent duplicates.
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
REDIS_URL=redis://redis:6379/0
```

## API Endpoints

```
/api/auth/token/          POST   JWT login → { access, user } + refresh_token cookie
/api/auth/token/refresh/  POST   Rotate refresh (httpOnly cookie) → { access }
/api/auth/logout/         POST   Blacklist refresh token + clear cookie
/api/auth/me/             GET    Current user
/api/auth/login/          POST   Legacy session login (kept for Django admin only)

/api/tasks/{task_id}/     GET    Celery task status → { task_id, status, result?, error? }

/api/assets/              CRUD   Assets (owner-scoped)
/api/assets/{id}/set-price/            POST   Manual price override
/api/assets/{id}/position-history/     GET    Position snapshot history
/api/assets/{id}/price-history/        GET    OHLC from Yahoo Finance (?period=)
/api/assets/update-prices/             POST   Enqueue price update → 202 { task_id, status }
/api/accounts/            CRUD   Accounts (owner-scoped)
/api/account-snapshots/   CRUD   Account balance snapshots (owner-scoped)
/api/accounts/bulk-snapshot/  POST   Bulk snapshot for multiple accounts
/api/settings/            GET/PUT Settings (per-user, not singleton)
/api/storage-info/        GET    DB size by table

/api/transactions/        CRUD   Transactions (owner-scoped)
/api/dividends/           CRUD   Dividends (owner-scoped)
/api/interests/           CRUD   Interests (owner-scoped)

/api/portfolio/           GET    Positions + realized sales (single FIFO pass)

/api/reports/year-summary/         GET  Year-by-year income summary
/api/reports/patrimonio-evolution/ GET  Monthly patrimony evolution
/api/reports/rv-evolution/         GET  Portfolio value time series
/api/reports/monthly-savings/      GET  Real monthly savings
/api/reports/snapshot-status/      GET  Last/next snapshot info

/api/export/transactions.csv  GET  CSV export (owner-scoped)
/api/export/dividends.csv     GET  CSV export (owner-scoped)
/api/export/interests.csv     GET  CSV export (owner-scoped)

/api/backup/export/       GET    Full JSON backup (owner-scoped)
/api/backup/import/       POST   Restore from JSON (owner-scoped)
```

## Test Coverage

```
backend/apps/core/tests/test_jwt.py              — JWT login, refresh, logout, protected endpoints
backend/apps/portfolio/tests/test_fifo.py        — FIFO engine (single buy, two buys, sell, gift)
backend/apps/portfolio/tests/test_multitenancy.py — Row-level security isolation (assets, portfolio, accounts)
backend/apps/portfolio/tests/test_portfolio_endpoint.py — Portfolio API smoke test
```
