# Fintrack 2.0

Personal investment tracking application — Pro architecture.

## Tech Stack

- **Backend:** Django 5.1, Django REST Framework, PostgreSQL 16, Celery 5.3, Redis
- **Frontend:** Next.js 15+, React 19, TypeScript, Tailwind CSS v4, Radix UI, React Query, Recharts
- **Infra:** Docker Compose

## Quick Start

```bash
docker compose up
```

| Service         | URL                           |
|-----------------|-------------------------------|
| Frontend        | http://localhost:3000          |
| Backend API     | http://localhost:8000/api/     |
| Django Admin    | http://localhost:8000/admin/   |

## Project Structure

```
backend/            Django 5.1 + DRF (API pura)
  apps/
    core/           JWT auth (cookies httpOnly), base models, health
    assets/         Asset, Account, Settings, Snapshots + Yahoo Finance
    transactions/   Transaction (BUY/SELL/GIFT), Dividend, Interest
    portfolio/      FIFO/LIFO/WAC engine
    reports/        Fiscal, patrimonio, ahorro, evolution
    importer/       JSON backup/restore
  config/
    settings/       base.py, development.py, production.py

frontend/           Next.js 15+ App Router
  src/
    app/
      (marketing)/  Landing page (SSG)
      (auth)/       Login, Register
      (dashboard)/  Private pages (SSR + Streaming)
      api/          Route Handlers (BFF proxy)
    components/
      ui/           shadcn/ui (Radix + Tailwind v4)
      app/          Domain components
    types/          TypeScript interfaces
    i18n/           next-intl (es, en, de, fr, it)
```

## Key Design Decisions

- **Money:** Always `Decimal`, never float.
- **IDs:** UUID via `TimeStampedModel`.
- **Multi-tenancy:** Every model has `owner` FK.
- **Auth:** JWT in httpOnly cookies.
- **BFF Pattern:** Browser → Next.js Route Handlers → Django API.

## License

MIT
