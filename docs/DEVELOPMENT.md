# Development Guide

## Prerequisites

- **Docker** & **Docker Compose** (recommended)
- Or for local development:
  - Python 3.12+
  - Node.js 20+
  - PostgreSQL 16
  - Redis 7

## Quick Start (Docker)

```bash
# Clone and start
git clone https://github.com/Gonzalez8/fintrack.git
cd fintrack
cp .env.example .env
docker compose up
```

Services will be available at:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000/api/
- **Django Admin:** http://localhost:8000/admin/
- **API Docs:** http://localhost:8000/api/schema/swagger-ui/

## Project Structure

```
backend/          Django 5.1 + DRF REST API
  apps/
    core/         JWT auth, base models, health endpoint, Celery tasks
    assets/       Asset, Account, Settings, Snapshots + Yahoo Finance
    transactions/ Transaction (BUY/SELL/GIFT), Dividend, Interest
    portfolio/    FIFO/LIFO/WAC cost basis engine
    reports/      Net worth, savings, evolution, savings goals
      tax_adapters/  Per-country tax-declaration adapters (registry + base + es.py) — see ADR-007
    payroll/      Employer + Payroll models, CRUD + experimental PDF parser — see ADR-008
    realestate/   Property, Amortization, mortgage simulation
    importer/     JSON backup/restore
  config/
    settings/     base.py, development.py, production.py

frontend/         Next.js 16 App Router
  src/
    app/          Pages (marketing, auth, dashboard, API routes)
    lib/          Utilities, API clients, mortgage math
    components/   UI (shadcn) + domain components
    types/        TypeScript interfaces
    i18n/         Translations (es, en, de, fr, it)
```

## Running Tests

### Backend

```bash
# Via Docker
docker compose exec backend pytest

# With coverage
docker compose exec backend pytest --cov=apps --cov-report=term-missing

# Specific app
docker compose exec backend pytest apps/portfolio/

# Local (requires PostgreSQL + Redis running)
cd backend
pytest
```

### Frontend

```bash
# Via Docker
docker compose exec frontend npm test

# With coverage
cd frontend
npx vitest run --coverage

# Watch mode
cd frontend
npm run test:watch
```

## Linting & Formatting

### Backend (Python)

```bash
# Lint check
ruff check backend/

# Auto-fix
ruff check backend/ --fix

# Format check
ruff format --check backend/

# Auto-format
ruff format backend/

# Type check
mypy backend/apps/ --ignore-missing-imports
```

### Frontend (TypeScript)

```bash
cd frontend

# ESLint
npx eslint src/

# TypeScript check
npx tsc --noEmit

# Prettier check
npx prettier --check "src/**/*.{ts,tsx}"

# Prettier auto-format
npx prettier --write "src/**/*.{ts,tsx}"
```

## Pre-commit Hooks

```bash
# Install
pip install pre-commit
pre-commit install

# Run manually on all files
pre-commit run --all-files
```

## Database

```bash
# Create migrations
docker compose exec backend python manage.py makemigrations <app_name>

# Apply migrations
docker compose exec backend python manage.py migrate

# Create superuser
docker compose exec backend python manage.py createsuperuser

# Django shell
docker compose exec backend python manage.py shell
```

## Environment Variables

Copy `.env.example` to `.env` for development. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DJANGO_SECRET_KEY` | Django secret key | (generated) |
| `DB_NAME` | PostgreSQL database name | `fintrack` |
| `DB_USER` | PostgreSQL user | `fintrack` |
| `DB_PASSWORD` | PostgreSQL password | `fintrack` |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379/0` |
| `ALLOW_REGISTRATION` | Enable user registration | `true` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | (optional) |

## Architecture

See [docs/architecture.md](./architecture.md) for the full C4 architecture documentation.

Key patterns:
- **BFF (Backend for Frontend):** Browser → Next.js Route Handlers → Django API
- **Multi-tenancy:** Every model has an `owner` FK; ViewSets filter by authenticated user
- **JWT Auth:** Tokens stored in httpOnly cookies for security
- **Rendering:** SSG (marketing), SSR + Streaming (dashboard), Client Components (forms/charts)

## Common Tasks

### Add a new i18n key

Every new key **must** be added to all 5 locale files:
- `frontend/src/i18n/messages/es.json`
- `frontend/src/i18n/messages/en.json`
- `frontend/src/i18n/messages/de.json`
- `frontend/src/i18n/messages/fr.json`
- `frontend/src/i18n/messages/it.json`

### Add a new Django app

```bash
docker compose exec backend python manage.py startapp <name> apps/<name>
```

Then add `"apps.<name>"` to `INSTALLED_APPS` in `config/settings/base.py`.

### Celery Tasks

Tasks are defined in each app's `tasks.py`. The beat schedule is in `config/settings/base.py`.

```bash
# Check worker status
docker compose exec celery_worker celery -A config inspect active

# Purge queued tasks
docker compose exec celery_worker celery -A config purge
```

## Troubleshooting

- **Database connection errors:** Ensure PostgreSQL is running and `.env` credentials match
- **Redis connection errors:** Check Redis is accessible at `REDIS_URL`
- **Import errors:** Run `docker compose build` to rebuild images after dependency changes
- **Migration conflicts:** Run `python manage.py makemigrations --merge`
