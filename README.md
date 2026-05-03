<div align="center">

# Fintrack

**Self-hosted investment portfolio tracker — built for privacy and clarity.**

Track your portfolio, transactions, dividends, interests and taxes from a single interface. No subscriptions, no data sharing, fully open source.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Gonzalez8/fintrack/ci.yml?label=CI&logo=github)](https://github.com/Gonzalez8/fintrack/actions/workflows/ci.yml)
[![Django](https://img.shields.io/badge/Django-5.1-092E20?logo=django)](https://www.djangoproject.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://www.docker.com/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](docs/CONTRIBUTING.md)

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

### Portfolio Management
- **Multi-asset support** — Stocks, ETFs, Funds, Crypto
- **Real-time pricing** — Automatic updates via Yahoo Finance
- **Cost basis engines** — FIFO, LIFO, and Weighted Average Cost (WAC)
- **Position tracking** — Unrealized P&L, cost basis, market value per position

### Transaction Tracking
- **Buy / Sell / Gift** transactions with commission and tax support
- **Dividend tracking** — Gross, withholding tax, administration / custody fees, net and withholding rate per asset
- **Interest income** — Date-range based tracking per account, with optional explicit withholding tax (NULL = inferred from gross/net, 0 = confirmed no withholding) and fees
- **Import deduplication** — Hash-based duplicate detection

### Accounts & Snapshots
- **Multiple account types** — Operativa, Ahorro, Inversion, Depositos, Alternativos
- **Balance snapshots** — Historical balance tracking with auto-sync
- **Portfolio snapshots** — Periodic automated snapshots via Celery Beat
- **Bulk snapshot** — Update all account balances in one action

### Reports & Analytics
- **Year summary** — Dividends, interests, realized P&L, total income by year
- **Patrimonio evolution** — Total net worth over time (cash + investments)
- **Portfolio evolution** — Market value, cost basis, unrealized P&L charts
- **Monthly savings** — Cashflow and savings rate analysis
- **Annual savings** — Yearly savings aggregates and breakdown
- **Savings goals** — Target-based goals with 3-scenario projections (conservative, average, optimistic)
- **CSV exports** — Transactions, dividends, and interests

### Tax Reporting

Fintrack ships **two layers** of tax reporting:

#### Country-agnostic (always available)
- **Year summary** — Dividends, interests and realized P&L by year
- **Withholdings by country** — Foreign vs. local breakdown for any residency
- **CSV export** — Per-year transactions, dividends and interests

#### Country-specific tax-declaration assistant
- **Fiscal residence in Settings** — Pick your country (`Settings.tax_country`, ISO 3166-1 alpha-2). Default `ES`. The declaration tab only appears when an adapter exists for your country.
- **Spain (Modo Renta)** — Maps your data directly to the AEAT Renta Web boxes (Modelo 100):
  - Interests, dividends (Spanish vs. foreign split), foreign double-taxation deduction (per-country, with the bilateral treaty cap — default 15%, configurable via `Settings.tax_treaty_limits`), capital gains
  - Row-by-row declarable share sales with one-click "Copy row" (Entity / Transmission / Acquisition tab-separated)
  - Final summary card with "Copy all" payload for the whole return
  - Validation warnings — sales without cost basis, dividends without tax country, `gross ≠ net + withholding + fees` mismatches
- **Other countries** — Pluggable. Adding a country only touches its own adapter module. See [ADR-007: Per-Country Tax Adapter Pattern](docs/adr/007-tax-adapter-pattern.md) for the recipe and design rationale.

### Data Management
- **Snapshot scheduling** — Configurable auto-snapshot frequency (15min to 24h)
- **Data retention** — Automated purge of old snapshots (configurable: 1y, 5y, 10y, never)
- **Storage monitoring** — Per-user database space tracking
- **Bulk snapshots** — Update all account balances at once
- **JSON backup/restore** — Full data export and import

### Security & Auth
- **JWT in httpOnly cookies** — Access + refresh tokens, SameSite=Lax
- **Google OAuth 2.0** — One-click login with automatic account creation
- **Rate limiting** — Per-endpoint throttling (login, register, password change)
- **Multi-tenancy** — Strict owner-based data isolation

### Real Estate & Mortgage
- **Property tracking** — Current value, purchase price, net equity per property
- **Smart mortgage setup** — Enter loan amount, term (years), rate type (fixed/variable) and rate. Monthly payment, months paid, and outstanding balance auto-calculated from purchase date
- **Interactive amortization table** — Click any row (past or future) to add an early amortization. Choose reduce payment or reduce term per event. Schedule recalculates instantly
- **Multiple amortizations** — Add several events at different months, each cascading into the next
- **Timeline chart** — Balance curve (original vs modified), event markers, current position
- **Payment breakdown** — Principal vs interest stacked bars per month
- **Mortgage summary** — Side-by-side comparison: original vs modified for payment, installments, term, end date, total to pay, total interest, with savings highlighted
- **Amortization persistence** — Events stored in database, optimistic UI updates

### Privacy Mode
- **One-click toggle** — Eye icon in sidebar / mobile nav masks all personal monetary amounts
- **Smart masking** — Only personal amounts hidden (balances, gains, dividends). Public data stays visible: asset prices, percentages, share quantities
- **Persistent** — Stored in cookie, survives page reload

### Internationalization
- **5 languages** — Spanish, English, German, French, Italian

---

## Quick Start

### Option 1: Docker Compose (development)

```bash
git clone https://github.com/Gonzalez8/Fintrack.git && cd Fintrack
cp .env.example .env
docker compose up
```

| Service | URL |
|---|---|
| App | `http://localhost:3000` |
| API | `http://localhost:8000/api/` |
| Swagger UI | `http://localhost:8000/api/schema/swagger-ui/` |
| Django Admin | `http://localhost:8000/admin/` |

Create a superuser (optional):

```bash
docker compose exec backend python manage.py createsuperuser
```

### Option 2: Production (Pre-built Images)

No source code needed — uses images from GitHub Container Registry.

```bash
mkdir fintrack && cd fintrack
curl -O https://raw.githubusercontent.com/Gonzalez8/Fintrack/main/docker-compose.prod.yml
curl -O https://raw.githubusercontent.com/Gonzalez8/Fintrack/main/.env.production.example
cp .env.production.example .env
# Edit .env with your values (DB_PASSWORD, DJANGO_SECRET_KEY, etc.)
docker compose -f docker-compose.prod.yml up -d
```

The superuser is created automatically on first start (`admin` / `admin` by default — change in `.env`).

> Always set strong, unique values for `DB_PASSWORD`, `DJANGO_SECRET_KEY` and `DJANGO_SUPERUSER_PASSWORD` before deploying.

### Option 3: Portainer

1. In Portainer, go to **Stacks > Add stack**
2. Paste the contents of [`docker-compose.prod.yml`](docker-compose.prod.yml)
3. Add the required [environment variables](#environment-variables)
4. Click **Deploy the stack**

### Option 4: Live Demo (Vercel, with or without backend)

Enabling the demo flag adds a "Try Demo" button on the login page. Clicking it starts a [MSW (Mock Service Worker)](https://mswjs.io/) session with static data — no database needed. Real login and registration still work normally if a backend is configured.

| Vercel Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Environment Variable | `NEXT_PUBLIC_DEMO_MODE=true` |

**Test demo locally:**

```bash
cd frontend && NEXT_PUBLIC_DEMO_MODE=true npm run dev
```

> `NEXT_PUBLIC_DEMO_MODE=true` enables the demo button — it does **not** replace real auth. Demo sessions are identified by a `demo: true` flag in the JWT token, so they coexist with real users on the same deployment.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │      Nginx (port 80)    │  Reverse proxy
              └──┬──────────────────┬───┘
                 │                  │
          /api/* │ /admin/* /static/*  │ /*
          ┌──────▼──────┐    ┌──────▼──────┐
          │  Django 5.1 │    │  Next.js 16 │
          │  Gunicorn   │    │  SSR + BFF  │
          │  Port 8000  │    │  Port 3000  │
          └──┬─────┬───┘    └─────────────┘
             │     │
    ┌────────▼┐  ┌─▼────────┐
    │ Postgres │  │  Redis   │
    │   :5432  │  │  :6379   │
    └──────────┘  └─┬────┬───┘
                    │    │
          ┌─────────▼┐ ┌─▼──────────┐
          │  Celery  │ │ Celery Beat │
          │  Worker  │ │  Scheduler  │
          └──────────┘ └─────────────┘
```

### BFF Pattern

The browser **never** calls the Django API directly. All requests flow through Next.js Route Handlers (`/api/proxy/*`), which:
1. Read JWT from httpOnly cookies
2. Forward the request to Django with the Authorization header
3. Handle token refresh transparently
4. Return the response to the browser

### Rendering Strategy

| Route Group    | Strategy           | Description                        |
| -------------- | ------------------ | ---------------------------------- |
| `(marketing)/` | SSG                | Landing page, static generation    |
| `(auth)/`      | Client Components  | Login, Register forms              |
| `(dashboard)/` | SSR + Streaming    | Server Components + React Suspense |

---

## Security & Authentication

### JWT token flow

```
Browser
  ├── Cookie ──► access token  (httpOnly, SameSite=Lax)
  └── Cookie ──► refresh token (httpOnly, SameSite=Lax)
        │
        └─► POST /api/auth/token/refresh/  ──►  new access token
```

- Refresh token rotates on every use and is blacklisted after rotation (replay-safe).
- All requests attach Bearer token automatically; 401 triggers a single transparent retry.

### Google OAuth2

```
1. Load Google GIS script on login page
2. User clicks "Continue with Google"
3. Google returns an ID token (credential)
4. POST /api/auth/google/ { credential }
5. Backend verifies token with Google's public keys
6. Get or create user by email
7. Issue JWT pair → login complete
```

**Setup:**
1. [Create an OAuth 2.0 Client ID](https://console.cloud.google.com/apis/credentials) (Web application)
2. Add your domain to **Authorized JavaScript origins**
3. Set `GOOGLE_CLIENT_ID=<your-id>` in `.env`

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Django 5.1 · Django REST Framework 3.15 · PostgreSQL 16 · Celery 5.3 · Redis 7 |
| **Auth** | djangorestframework-simplejwt · google-auth |
| **Frontend** | Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS v4 · shadcn/ui (Base UI) |
| **State** | TanStack Query 5 (server state) |
| **Charts** | Recharts 3 · Lightweight Charts 5 |
| **i18n** | Custom i18n (es, en, de, fr, it) |
| **Infra** | Docker Compose · GitHub Actions CI · GHCR |
| **API Docs** | drf-spectacular (OpenAPI 3 / Swagger UI) |

---

## Project Structure

```
fintrack/
├── backend/                       Django 5.1 + DRF
│   ├── apps/
│   │   ├── core/                  JWT auth, base models, health check
│   │   ├── assets/                Assets, accounts, snapshots, settings
│   │   ├── transactions/          Transaction, Dividend, Interest
│   │   ├── portfolio/             Cost basis engine (FIFO/LIFO/WAC)
│   │   ├── reports/               Tax summaries, evolution, savings, goals
│   │   ├── realestate/            Property, Amortization, mortgage simulation
│   │   └── importer/              JSON backup / restore
│   └── config/
│       ├── settings/              base.py · development.py · production.py
│       ├── urls.py
│       └── celery.py
│
├── frontend/                      Next.js 16 App Router
│   └── src/
│       ├── app/
│       │   ├── (marketing)/       Landing page (SSG)
│       │   ├── (auth)/            Login, Register (Client Components)
│       │   ├── (dashboard)/       Protected pages (SSR + Streaming)
│       │   └── api/               BFF Route Handlers (proxy to Django)
│       ├── components/
│       │   ├── ui/                shadcn/ui (Base UI + Tailwind v4)
│       │   └── app/               Domain-specific components
│       ├── lib/                   api-client, utils, mortgage-math, privacy
│       ├── types/                 TypeScript interfaces
│       ├── demo/                  MSW handlers (demo mode)
│       └── i18n/                  Translations (es, en, de, fr, it)
│
├── .github/workflows/
│   ├── ci.yml                     Backend tests + frontend typecheck
│   └── docker-publish.yml         Build & push to GHCR
├── docker-compose.yml             Development (6 services)
├── docker-compose.prod.yml        Production (pre-built images from GHCR)
└── .env.example                   Environment variable template
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
GET     /api/auth/profile/                User profile
PUT     /api/auth/profile/                Update username / email
POST    /api/auth/change-password/        Change password + rotate JWT

# Data (all owner-scoped, require Bearer token)
CRUD    /api/assets/
POST    /api/assets/update-prices/        Enqueue → 202 { task_id }
GET     /api/tasks/{task_id}/             Celery task status
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
GET     /api/reports/annual-savings/
GET     /api/reports/snapshot-status/
GET     /api/reports/tax-declaration/?year=YYYY   Renta Web payload (Modo Renta)

CRUD    /api/savings-goals/
GET     /api/savings-goals/{id}/projection/   Goal progress projection

CRUD    /api/properties/                      Real estate properties
POST    /api/properties/simulate/             Mortgage amortization simulation
CRUD    /api/amortizations/                   Early amortization events (?property=uuid)

GET     /api/storage-info/                    Database space usage

GET     /api/export/transactions.csv
GET     /api/export/dividends.csv
GET     /api/export/interests.csv
GET     /api/backup/export/
POST    /api/backup/import/

GET     /api/health/                      Liveness probe
```

---

## Environment Variables

### Backend (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_PASSWORD` | **yes** | — | PostgreSQL password |
| `DJANGO_SECRET_KEY` | **yes** | — | Django secret key |
| `DB_NAME` | | `fintrack` | Database name |
| `DB_USER` | | `fintrack` | Database user |
| `ALLOWED_HOSTS` | | `*` | Comma-separated allowed hostnames. `backend` is added automatically for internal Docker communication. |
| `CORS_ALLOWED_ORIGINS` | | — | Comma-separated allowed origins (e.g., `https://fintrack.example.com`) |
| `CSRF_TRUSTED_ORIGINS` | | same as CORS | Comma-separated CSRF trusted origins (e.g., `https://fintrack.example.com`) |
| `REDIS_URL` | | `redis://redis:6379/0` | Celery broker + result backend |
| `GOOGLE_CLIENT_ID` | | _(empty)_ | Google OAuth2 client ID |
| `ALLOW_REGISTRATION` | | `true` | `false` = admin creates users via Django admin |
| `DJANGO_SUPERUSER_USERNAME` | | `admin` | Initial superuser username |
| `DJANGO_SUPERUSER_PASSWORD` | | `admin` | Initial superuser password |
| `DJANGO_SUPERUSER_EMAIL` | | `admin@fintrack.local` | Initial superuser email |
| `APP_PORT` | | `8080` | Host port for frontend (prod) |

### Frontend

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Public API URL |
| `NEXT_PUBLIC_DEMO_MODE` | `false` | `true` shows "Try Demo" button (coexists with real auth) |
| `DJANGO_INTERNAL_URL` | `http://backend:8000` | Internal Django URL (SSR) |

---

## Development

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

### Celery tasks

| Task | Schedule | Description |
|---|---|---|
| `snapshot_all_users_task` | Every 60s | Create portfolio snapshots when due |
| `purge_old_snapshots_task` | Daily | Delete snapshots past retention period |
| `update_prices_task` | On-demand | Fetch prices from Yahoo Finance |

---

## Production Deployment

### Reverse proxy setup (Nginx Proxy Manager)

Point your domain to the frontend container:

| Setting | Value |
|---|---|
| **Domain** | `fintrack.example.com` |
| **Scheme** | `http` |
| **Forward Hostname/IP** | server local IP (e.g., `192.168.1.171`) |
| **Forward Port** | `8080` (or your `APP_PORT`) |
| **Websockets Support** | enabled |
| **SSL** | Let's Encrypt |

The Django admin panel is available at `http://<server-ip>:8001/admin/` (add the IP to `ALLOWED_HOSTS`).

### Startup sequence

The backend container runs automatically on each start:
1. `migrate` — apply database migrations
2. `collectstatic` — collect static files
3. `createsuperuser` — create admin user (skips if already exists)
4. `gunicorn` — start the application server

### Updating

After pushing to `main`, GitHub Actions rebuilds and publishes Docker images to GHCR.

- **Portainer**: Stack → Editor → "Update the stack" with "Re-pull image" enabled
- **CLI**: `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`

### Security settings (automatic when `DEBUG=False`)

- `JWT_AUTH_COOKIE_SECURE = True`
- `SECURE_HSTS_SECONDS = 31536000` (1 year)
- `SECURE_SSL_REDIRECT = True`
- `SESSION_COOKIE_SECURE = True`
- `CSRF_COOKIE_SECURE = True`

### Checklist

- [ ] Set a strong `DJANGO_SECRET_KEY` (50+ random chars)
- [ ] Set `DB_PASSWORD` to a secure value
- [ ] Configure `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`
- [ ] Set `CSRF_TRUSTED_ORIGINS` for your domain (e.g., `https://fintrack.example.com`)
- [ ] Configure `GOOGLE_CLIENT_ID` if using Google login
- [ ] Set `ALLOW_REGISTRATION=false` if single-user
- [ ] Set up SSL termination (NPM, Caddy, Traefik, or cloud LB)
- [ ] Configure backup strategy for PostgreSQL
- [ ] Change `DJANGO_SUPERUSER_PASSWORD`

### Database Backups

```bash
# Manual backup (compressed)
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U fintrack fintrack | gzip > backups/fintrack_$(date +%Y%m%d).sql.gz

# Restore from backup
gunzip -c backups/fintrack_20260315.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U fintrack fintrack
```

**Automated daily backup with 30-day retention** — add to your server's crontab (`crontab -e`):

```
0 3 * * * cd /path/to/fintrack && mkdir -p backups && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U fintrack fintrack | gzip > backups/fintrack_$(date +\%Y\%m\%d).sql.gz && find backups/ -name "fintrack_*.sql.gz" -mtime +30 -delete
```

This runs at 3:00 AM daily, creates a compressed dump (~10-50 MB), and deletes backups older than 30 days.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Bad Request (400)` | Domain/IP not in `ALLOWED_HOSTS` | Add it to `ALLOWED_HOSTS` env var |
| `400` on login (POST) | `CSRF_TRUSTED_ORIGINS` not set | Set to `https://your-domain.com` |
| `ECONNREFUSED` on login | Backend not ready | Wait — healthcheck has 30s start period |
| `502 Bad Gateway` | Backend crashed | Check logs: `docker logs fintrack-backend-1` |
| Admin login fails | Superuser not created | Verify `DJANGO_SUPERUSER_*` env vars are set |

---

## Documentation

- [Development Guide](docs/DEVELOPMENT.md) — Setup, testing, linting, common tasks
- [Architecture](docs/architecture.md) — C4 diagrams, system design, ADRs
- [Security Policy](docs/SECURITY.md) — Vulnerability reporting, security measures, backups
- [Contributing Guide](docs/CONTRIBUTING.md) — Branch naming, commit conventions, PR requirements
- [Changelog](CHANGELOG.md) — Version history and notable changes

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for the full guide. Quick summary:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Write tests for your changes
4. Ensure all CI checks pass (`lint`, `typecheck`, `tests`)
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/)
6. Push and open a Pull Request

### Conventions

- **UI labels** use i18n (es, en, de, fr, it), **code** (variables, comments) in English
- **Money**: Always `Decimal`, never `float`
- **IDs**: UUID via `TimeStampedModel`
- **Multi-tenancy**: Every model has `owner` FK, ViewSets use `OwnedByUserMixin`
- **BFF Pattern**: Browser → Next.js → Django (browser never calls Django directly)

---

## License

[MIT](LICENSE) — free to use, modify and self-host.
