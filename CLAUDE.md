# Fintrack 2.0

Personal investment tracking application - Pro architecture.

## Quick Start

```bash
docker compose up          # starts db, redis, backend, frontend, celery_worker, celery_beat
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000/api/
# Django admin: http://localhost:8000/admin/
```

## Project Structure

```
backend/          Django 5.1 + DRF (API pura)
  apps/
    core/         JWT auth (cookies httpOnly), base models, health, tasks
    assets/       Asset, Account, Settings, Snapshots + Yahoo Finance
    transactions/ Transaction (BUY/SELL/GIFT), Dividend, Interest
    portfolio/    FIFO/LIFO/WAC engine
    reports/      Fiscal, patrimonio, ahorro, evolution
    importer/     JSON backup/restore
  config/
    settings/     base.py, development.py, production.py
    celery.py     Celery app
    urls.py       Root URL conf

frontend/         Next.js 15+ App Router
  src/
    app/
      (marketing)/  Landing page (SSG)
      (auth)/       Login, Register (Client Components)
      (dashboard)/  Private pages (SSR + Streaming)
      api/          Route Handlers (BFF proxy)
    lib/            api-server.ts, api-client.ts, utils
    components/
      ui/           shadcn/ui (Radix + Tailwind v4)
      app/          Domain components
    types/          TypeScript interfaces
    demo/           Static data + MSW handlers
    i18n/           next-intl (es, en, de, fr, it)
```

## Tech Stack

- **Backend:** Django 5.1, DRF 3.15, PostgreSQL 16, Celery 5.3, Redis
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Radix UI, React Query, Recharts
- **Infra:** Docker Compose (db, redis, backend, frontend, celery_worker, celery_beat)

## Key Conventions

- **Language:** UI labels in Spanish. Code (variables, comments) in English.
- **Money:** Always `Decimal`, never float.
- **IDs:** UUID (TimeStampedModel base).
- **Multi-tenancy:** Every model has `owner` FK. ViewSets use `OwnedByUserMixin`.
- **Auth:** JWT in httpOnly cookies (both access + refresh). Next.js middleware validates before rendering.
- **BFF Pattern:** Browser -> Next.js Route Handlers -> Django API. Browser never calls Django directly.
- **Rendering:** SSG for marketing, SSR + Streaming for dashboard, Client Components for forms/charts.
- **Data fetching:** Server Components use `djangoFetch()`. Client mutations use React Query + `/api/proxy/*`.

## Common Commands

```bash
docker compose exec backend python manage.py makemigrations <app>
docker compose exec backend python manage.py migrate
docker compose exec backend pytest
```
