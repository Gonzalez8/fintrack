# Fintrack Architecture Documentation

> Self-hosted investment portfolio tracker — Django 5.1 + Next.js 16

---

## Table of Contents

1. [System Context](#1-system-context)
2. [Container Architecture](#2-container-architecture)
3. [Component Architecture](#3-component-architecture)
4. [Data Architecture](#4-data-architecture)
5. [Security Architecture](#5-security-architecture)
6. [Data Flow](#6-data-flow)
7. [Deployment Architecture](#7-deployment-architecture)
8. [Quality Attributes](#8-quality-attributes)
9. [ADR Index](#9-adr-index)

---

## 1. System Context

Fintrack is a self-hosted, multi-tenant investment portfolio tracker. Users interact through a browser; the system integrates with Yahoo Finance for price data and Google OAuth for authentication.

```mermaid
C4Context
    title System Context Diagram

    Person(user, "Investor", "Tracks portfolio, transactions, dividends, taxes")

    System(fintrack, "Fintrack", "Self-hosted investment portfolio tracker")

    System_Ext(yahoo, "Yahoo Finance", "Real-time asset pricing")
    System_Ext(google, "Google OAuth 2.0", "Identity provider")

    Rel(user, fintrack, "Uses", "HTTPS")
    Rel(fintrack, yahoo, "Fetches prices", "yfinance Python SDK")
    Rel(fintrack, google, "Verifies ID tokens", "google-auth library")
```

### External Dependencies

| System | Purpose | Protocol | Frequency |
|--------|---------|----------|-----------|
| Yahoo Finance | Asset price updates | yfinance SDK (HTTP) | On-demand (user-triggered) |
| Google OAuth 2.0 | Social login | ID token verification | Per login |

---

## 2. Container Architecture

Six Docker containers orchestrated with Docker Compose.

```mermaid
C4Container
    title Container Diagram

    Person(user, "Investor")

    System_Boundary(fintrack, "Fintrack") {
        Container(nginx, "Nginx", "Reverse Proxy", "Routes /api/* to backend, /* to frontend")
        Container(frontend, "Next.js 16", "Node 20, SSR + BFF", "App Router, React 19, Tailwind v4")
        Container(backend, "Django 5.1", "Python 3.12, Gunicorn", "REST API, JWT auth, business logic")
        Container(worker, "Celery Worker", "Python 3.12", "Async tasks: price updates, snapshots")
        Container(beat, "Celery Beat", "Python 3.12", "Scheduled tasks: snapshot every 60s, purge daily")
        ContainerDb(db, "PostgreSQL 16", "Alpine", "All application data")
        ContainerDb(redis, "Redis 7", "Alpine", "Cache, Celery broker, task results")
    }

    Rel(user, nginx, "HTTPS")
    Rel(nginx, frontend, "/*", "HTTP :3000")
    Rel(nginx, backend, "/api/*, /admin/*", "HTTP :8000")
    Rel(frontend, backend, "SSR + BFF proxy", "HTTP :8000")
    Rel(backend, db, "ORM", "TCP :5432")
    Rel(backend, redis, "Cache + results", "TCP :6379")
    Rel(worker, db, "ORM", "TCP :5432")
    Rel(worker, redis, "Broker + results", "TCP :6379")
    Rel(beat, redis, "Schedule dispatch", "TCP :6379")
```

### Service Details

| Container | Image | Port | Replicas | Healthcheck |
|-----------|-------|------|----------|-------------|
| **frontend** | `ghcr.io/gonzalez8/fintrack-frontend` | 3000 | 1 | — |
| **backend** | `ghcr.io/gonzalez8/fintrack-backend` | 8000 | 1 (3 Gunicorn workers) | `GET /api/health/` |
| **celery_worker** | Same as backend | — | 1 (concurrency 2) | — |
| **celery_beat** | Same as backend | — | 1 | — |
| **db** | `postgres:16-alpine` | 5432 | 1 | `pg_isready` |
| **redis** | `redis:7-alpine` | 6379 | 1 | `redis-cli ping` |

---

## 3. Component Architecture

### 3.1 Backend (Django 5.1 + DRF)

```mermaid
graph TB
    subgraph "Django Backend"
        subgraph "config/"
            urls[urls.py]
            settings[settings/]
            celery_app[celery.py]
        end

        subgraph "apps/core/"
            auth_views[Auth Views<br/>Login, Register, Google OAuth]
            cookie_auth[CookieJWTAuthentication]
            mixins[OwnedByUserMixin]
            base_models[TimeStampedModel<br/>UserOwnedModel]
            cache_mod[Cache Module<br/>Per-user Redis namespaces]
        end

        subgraph "apps/assets/"
            asset_models[Asset, Account<br/>AccountSnapshot<br/>PortfolioSnapshot<br/>Settings]
            asset_views[AssetViewSet<br/>AccountViewSet<br/>SettingsView]
            price_service[Price Service<br/>Yahoo Finance integration]
            snapshot_tasks[Snapshot Tasks<br/>Auto-snapshot, purge]
        end

        subgraph "apps/transactions/"
            tx_models[Transaction<br/>Dividend<br/>Interest]
            tx_views[TransactionViewSet<br/>DividendViewSet<br/>InterestViewSet]
        end

        subgraph "apps/portfolio/"
            portfolio_engine[Cost Basis Engine<br/>FIFO / LIFO / WAC]
            portfolio_view[PortfolioView]
        end

        subgraph "apps/reports/"
            report_views[YearSummary<br/>PatrimonioEvolution<br/>RVEvolution<br/>MonthlySavings<br/>AnnualSavings]
            goals[SavingsGoalViewSet<br/>Projection]
            csv_exports[CSV Exports<br/>Transactions, Dividends, Interests]
            tax_view[TaxDeclarationView<br/>dispatches by tax_country]
            subgraph "tax_adapters/"
                tax_registry[Registry<br/>register · get_adapter · supported_tax_countries]
                tax_base[TaxAdapter Protocol]
                tax_common[common.py<br/>q · interest_withholding · asset_country]
                tax_es[es.py<br/>SpanishTaxAdapter — Modo Renta]
            end
        end

        subgraph "apps/importer/"
            backup[BackupExportView<br/>BackupImportView<br/>JSON v1.0 format]
        end

        subgraph "apps/payroll/"
            payroll_views[EmployerViewSet<br/>PayrollViewSet]
            payroll_parser[PDF parser<br/>parse_payslip_text · pdfplumber]
            payroll_pdf_view[PayrollParsePdfView<br/>experimental, suggestion-only]
        end
    end

    auth_views --> cookie_auth
    asset_views --> mixins
    tx_views --> mixins
    portfolio_view --> portfolio_engine
    portfolio_engine --> tx_models
    portfolio_engine --> asset_models
    report_views --> portfolio_engine
    tax_view --> tax_registry
    tax_registry --> tax_es
    tax_es --> tax_common
    tax_es --> tax_base
    tax_es --> payroll_views
    payroll_pdf_view --> payroll_parser
    snapshot_tasks --> portfolio_engine
    price_service --> asset_models
```

### 3.2 Frontend (Next.js 16 App Router)

```mermaid
graph TB
    subgraph "Next.js Frontend"
        subgraph "Middleware"
            mw[middleware.ts<br/>JWT validation<br/>Locale detection<br/>Auto token refresh]
        end

        subgraph "Route Groups"
            marketing["(marketing)/<br/>Landing page - SSG"]
            auth_pages["(auth)/<br/>Login/Register - Client Components"]
            dashboard["(dashboard)/<br/>12 protected pages - SSR + Streaming"]
        end

        subgraph "BFF Proxy (Route Handlers)"
            proxy["api/proxy/[...path]<br/>Forwards to Django<br/>Auto token refresh on 401"]
            auth_proxy["api/auth/[...path]<br/>Auth endpoints<br/>Demo mode interception"]
        end

        subgraph "Libraries"
            api_server["api-server.ts<br/>djangoFetch() for SSR"]
            api_client["api-client.ts<br/>api.get/post/put/delete for CSR"]
        end

        subgraph "Components"
            ui["ui/ (shadcn/ui)<br/>Button, Card, Dialog<br/>Table, Sheet, Select"]
            app_comp["app/<br/>Sidebar, MobileNav<br/>SwipeCard, DetailDrawer<br/>DataTable, Charts"]
        end

        subgraph "State & Context"
            providers["Providers<br/>React Query + Theme<br/>UserContext + i18n"]
        end

        subgraph "Demo Mode"
            demo["demo/<br/>MSW handlers<br/>Static data<br/>Fake JWT tokens"]
        end
    end

    mw --> auth_pages
    mw --> dashboard
    dashboard --> api_server
    dashboard --> providers
    providers --> app_comp
    app_comp --> api_client
    api_client --> proxy
    proxy --> backend_ext["Django Backend :8000"]
    auth_proxy --> backend_ext
    api_server --> backend_ext
```

### 3.3 Dashboard Pages

| Page | Route | Data Source | Key Components |
|------|-------|------------|----------------|
| Dashboard | `/` | Portfolio, Reports | Summary cards, charts |
| Portfolio | `/portfolio` | `/api/portfolio/` | Position table, P&L |
| Assets | `/assets` | `/api/assets/` | CRUD, price sync |
| Asset Detail | `/assets/[id]` | `/api/assets/{id}/price-history` | Candlestick chart |
| Accounts | `/accounts` | `/api/accounts/` | CRUD, balance snapshots |
| Transactions | `/transactions` | `/api/transactions/` | BUY/SELL/GIFT CRUD |
| Dividends | `/dividends` | `/api/dividends/` | Dividend tracking |
| Interests | `/interests` | `/api/interests/` | Interest income |
| Savings | `/savings` | `/api/reports/monthly-savings/` | Charts, goals, projections |
| Tax Report | `/tax` | `/api/reports/year-summary/` | Yearly breakdown |
| Settings | `/settings` | `/api/settings/` | Cost method, retention |
| Profile | `/profile` | `/api/auth/profile/` | Username, password |

---

## 4. Data Architecture

### 4.1 Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o| Settings : "has one"
    User ||--o{ Asset : "owns"
    User ||--o{ Account : "owns"
    User ||--o{ Transaction : "owns"
    User ||--o{ Dividend : "owns"
    User ||--o{ Interest : "owns"
    User ||--o{ AccountSnapshot : "owns"
    User ||--o{ PortfolioSnapshot : "owns"
    User ||--o{ SavingsGoal : "owns"

    Asset ||--o{ Transaction : "referenced by"
    Asset ||--o{ Dividend : "referenced by"

    Account ||--o{ Transaction : "referenced by"
    Account ||--o{ Interest : "referenced by"
    Account ||--o{ AccountSnapshot : "has"

    User {
        int id PK
        string username
        string email
        string password
    }

    Settings {
        uuid id PK
        string cost_basis_method "FIFO|LIFO|WAC"
        string fiscal_cost_method
        string gift_cost_mode "ZERO|MARKET"
        int rounding_money
        int rounding_qty
        int snapshot_frequency "minutes"
        int data_retention_days "null=forever"
        string tax_country "ISO 3166-1 alpha-2, default ES"
        json tax_treaty_limits "country -> bilateral cap"
    }

    Asset {
        uuid id PK
        string name
        string ticker "unique per owner"
        string isin
        string type "STOCK|ETF|FUND|CRYPTO"
        string price_mode "MANUAL|AUTO"
        decimal current_price
        string currency
    }

    Account {
        uuid id PK
        string name "unique per owner"
        string type "OPERATIVA|AHORRO|INVERSION|DEPOSITOS|ALTERNATIVOS"
        string currency
        decimal balance
    }

    Transaction {
        uuid id PK
        date date
        string type "BUY|SELL|GIFT"
        uuid asset_id FK
        uuid account_id FK
        decimal quantity
        decimal price
        decimal commission
        decimal tax
        string import_hash "unique per owner"
    }

    Dividend {
        uuid id PK
        date date
        uuid asset_id FK
        decimal shares
        decimal gross
        decimal tax
        decimal net
    }

    Interest {
        uuid id PK
        date date_start
        date date_end
        uuid account_id FK
        decimal gross
        decimal net
    }

    AccountSnapshot {
        uuid id PK
        uuid account_id FK
        date date "unique per account"
        decimal balance
    }

    PortfolioSnapshot {
        uuid id PK
        uuid batch_id
        datetime captured_at
        decimal total_market_value
        decimal total_cost
        decimal total_unrealized_pnl
    }

    SavingsGoal {
        uuid id PK
        string name
        decimal target_amount
        string base_type "PATRIMONY|CASH"
        date deadline
    }

    Employer {
        uuid id PK
        string name
        string cif "Spanish NIF/CIF, optional"
        string ss_account
        string address
        text notes
    }

    Payroll {
        uuid id PK
        uuid employer FK
        date period_start
        date period_end
        decimal gross "retribución dineraria total"
        decimal ss_employee
        decimal irpf_withholding
        decimal net "as printed on the payslip"
        decimal base_irpf "optional"
        decimal base_cc "optional"
        decimal employer_cost "optional"
    }

    Employer ||--o{ Payroll : "has"
```

### 4.2 Multi-Tenancy Model

Every user-owned model inherits from `UserOwnedModel`:

```
UserOwnedModel (abstract)
├── id: UUID (primary key)
├── owner: ForeignKey(User, CASCADE)
├── created_at: DateTimeField
└── updated_at: DateTimeField
```

`OwnedByUserMixin` on ViewSets enforces:
- **Read**: `queryset.filter(owner=request.user)`
- **Create**: auto-injects `owner=request.user`
- **Update/Delete**: only own records, + cache invalidation

### 4.3 Caching Strategy

Per-user Redis namespaces with key format `ft:{user_id}:{namespace}`:

| Namespace | TTL | Invalidated On |
|-----------|-----|----------------|
| `portfolio` | 60s | Transaction/Asset/Account mutation |
| `reports_patrimonio` | 120s | Financial mutation |
| `reports_rv` | 120s | Financial mutation |
| `reports_savings` | 120s | Financial mutation |
| `reports_year` | 120s | Financial mutation |
| `reports_annual_savings` | 120s | Financial mutation |
| `settings` | 3600s | Settings update |

---

## 5. Security Architecture

### 5.1 Authentication Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Next.js (BFF)
    participant D as Django API
    participant G as Google

    Note over B,D: Standard Login
    B->>N: POST /api/auth/token/ {username, password}
    N->>D: Forward request
    D->>D: authenticate(username, password)
    D-->>N: {access, user} + Set-Cookie (access_token, refresh_token)
    N-->>B: Forward response + cookies

    Note over B,D: Subsequent Request
    B->>N: GET /api/proxy/assets (cookies auto-attached)
    N->>N: Read access_token from cookie
    N->>D: GET /api/assets/ + Authorization: Bearer {access}
    D-->>N: 200 {data}
    N-->>B: Forward response

    Note over B,D: Token Refresh (on 401)
    B->>N: GET /api/proxy/portfolio (expired access)
    N->>D: GET /api/portfolio/ + Bearer {expired}
    D-->>N: 401 Unauthorized
    N->>D: POST /api/auth/token/refresh/ + Cookie: refresh_token
    D->>D: Rotate refresh, blacklist old
    D-->>N: {access} + new cookies
    N->>D: Retry original request + Bearer {new_access}
    D-->>N: 200 {data}
    N-->>B: Forward response + updated cookies

    Note over B,D: Google OAuth
    B->>G: Google Sign-In (GIS)
    G-->>B: ID token (credential)
    B->>N: POST /api/auth/google/ {credential}
    N->>D: Forward
    D->>G: Verify ID token
    G-->>D: User info (email, name)
    D->>D: Get or create user
    D-->>N: {access, user} + cookies
    N-->>B: Forward + cookies
```

### 5.2 JWT Configuration

| Parameter | Value |
|-----------|-------|
| Access token lifetime | 15 minutes |
| Refresh token lifetime | 7 days |
| Token rotation | Enabled (rotate on refresh) |
| Blacklist after rotation | Enabled |
| Cookie: httpOnly | Yes |
| Cookie: SameSite | Lax |
| Cookie: Secure | True in production |

### 5.3 Security Controls

| Control | Implementation |
|---------|---------------|
| **Rate limiting** | `auth_login`: 10/min, `auth_register`: 10/hour, `auth_password`: 10/hour |
| **CORS** | Explicit origin whitelist via `CORS_ALLOWED_ORIGINS` |
| **CSRF** | Trusted origins required in production |
| **HSTS** | 1 year, include subdomains, preload (production) |
| **SSL redirect** | Configurable via env (production) |
| **Data isolation** | Every query scoped to `owner=request.user` |
| **FK protection** | Assets/Accounts use `PROTECT` — cannot delete if referenced |
| **Import dedup** | `import_hash` unique per owner prevents duplicate imports |
| **Backup limit** | 50 MB max import file size |

### 5.4 Trust Boundaries

```
┌─────────────────────────────────────────────┐
│  UNTRUSTED: Browser                          │
│  - JavaScript, user input                    │
│  - httpOnly cookies (cannot read tokens)     │
└──────────────────┬──────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────┐
│  SEMI-TRUSTED: Next.js BFF                   │
│  - Reads cookies, forwards to Django         │
│  - Token refresh logic                       │
│  - Demo mode interception                    │
└──────────────────┬──────────────────────────┘
                   │ HTTP (internal Docker network)
┌──────────────────▼──────────────────────────┐
│  TRUSTED: Django Backend                     │
│  - JWT validation, owner scoping             │
│  - Business logic, database access           │
│  - Rate limiting, CORS enforcement           │
└──────────────────┬──────────────────────────┘
                   │ TCP
┌──────────────────▼──────────────────────────┐
│  TRUSTED: PostgreSQL + Redis                 │
│  - Data persistence, cache, task queue       │
└─────────────────────────────────────────────┘
```

---

## 6. Data Flow

### 6.1 BFF Pattern (Browser-for-Backend)

The browser **never** calls Django directly. All requests flow through Next.js Route Handlers:

```
Browser → /api/proxy/{path} → Next.js Route Handler → Django /api/{path}
```

**Why:**
- JWT tokens stored in httpOnly cookies (browser JS cannot access)
- Next.js reads cookies and attaches `Authorization: Bearer` header
- Transparent token refresh on 401 (user never sees auth failures)
- Demo mode can intercept and return static data without a backend

### 6.2 Rendering Strategy

| Route Group | Strategy | Data Fetching |
|-------------|----------|---------------|
| `(marketing)/` | SSG | None (static) |
| `(auth)/` | Client Components | `authApi.*` (client-side) |
| `(dashboard)/` | SSR + Streaming | `djangoFetch()` for initial load, React Query for mutations |

### 6.3 Price Update Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant BE as Django API
    participant C as Celery Worker
    participant Y as Yahoo Finance
    participant R as Redis

    U->>FE: Click "Update Prices"
    FE->>BE: POST /api/assets/update-prices/
    BE->>R: Queue update_prices_task(user_id)
    BE-->>FE: 202 {task_id}

    C->>R: Pick up task
    C->>Y: yfinance batch fetch (5-day history)
    Y-->>C: Price data
    C->>C: Update Asset.current_price for each AUTO asset
    C->>R: Invalidate financial caches
    C->>R: Store task result: SUCCESS

    FE->>BE: GET /api/tasks/{task_id}/ (polling every 2s)
    BE->>R: Read task result
    BE-->>FE: {status: "SUCCESS", result: {updated: N, errors: []}}
    FE->>FE: Invalidate React Query caches, refresh UI
```

### 6.4 Portfolio Snapshot Flow

```mermaid
sequenceDiagram
    participant Beat as Celery Beat
    participant Worker as Celery Worker
    participant DB as PostgreSQL

    Note over Beat: Every 60 seconds
    Beat->>Worker: snapshot_all_users_task()
    Worker->>DB: Get all users with snapshot_frequency > 0
    loop Each user (if interval elapsed)
        Worker->>Worker: calculate_portfolio(user)
        Worker->>DB: Create PortfolioSnapshot
    end

    Note over Beat: Daily
    Beat->>Worker: purge_old_snapshots_task()
    Worker->>DB: Get users with data_retention_days set
    loop Each user
        Worker->>DB: Delete snapshots older than retention period
    end
```

---

## 7. Deployment Architecture

### 7.1 Development

```bash
docker compose up  # 6 services, hot reload, ports exposed
```

- Backend: `python manage.py runserver` with volume mount
- Frontend: `npm run dev` with volume mount (excludes node_modules, .next)
- DB + Redis: Ports exposed for local tools

### 7.2 Production

```bash
docker compose -f docker-compose.prod.yml up -d
```

- Pre-built images from GitHub Container Registry (GHCR)
- Backend startup: `migrate → collectstatic → createsuperuser → gunicorn`
- Frontend: `node server.js` (Next.js standalone mode)
- All services: `restart: unless-stopped`
- Nginx (external or built-in): Routes `/api/*` → backend, `/*` → frontend

### 7.3 CI/CD Pipeline

```mermaid
graph LR
    subgraph "CI (every push/PR)"
        A[Checkout] --> B[Backend Tests<br/>pytest + PostgreSQL + Redis]
        A --> C[Frontend Checks<br/>tsc --noEmit + vitest + build]
    end

    subgraph "CD (push to main)"
        D[Checkout] --> E[Build backend image<br/>Docker Buildx]
        D --> F[Build frontend image<br/>Docker Buildx]
        E --> G[Push to GHCR<br/>:latest + :sha-xxx]
        F --> G
    end
```

### 7.4 Production Checklist

- [ ] `DJANGO_SECRET_KEY` — 50+ random characters
- [ ] `DB_PASSWORD` — strong, unique
- [ ] `ALLOWED_HOSTS` — your domain only
- [ ] `CORS_ALLOWED_ORIGINS` — `https://your-domain.com`
- [ ] `CSRF_TRUSTED_ORIGINS` — `https://your-domain.com`
- [ ] `DJANGO_SUPERUSER_PASSWORD` — changed from default
- [ ] SSL termination configured (Nginx Proxy Manager, Caddy, etc.)
- [ ] PostgreSQL backup strategy in place

---

## 8. Quality Attributes

### 8.1 Performance

| Aspect | Implementation |
|--------|---------------|
| **API caching** | Per-user Redis namespaces (60-3600s TTL) |
| **Query optimization** | Django ORM select_related/prefetch_related, DB indexes |
| **Frontend caching** | React Query (2min stale, 10min GC) |
| **SSR streaming** | React Suspense for progressive rendering |
| **Static generation** | Marketing pages are SSG (zero runtime cost) |
| **Image optimization** | Next.js standalone with optimized Docker layers |

### 8.2 Scalability

| Dimension | Current | Scaling Path |
|-----------|---------|-------------|
| **API workers** | 3 Gunicorn workers | Increase workers or add replicas behind LB |
| **Async tasks** | Celery concurrency 2 | Add worker containers |
| **Database** | Single PostgreSQL | Read replicas, connection pooling (PgBouncer) |
| **Cache** | Single Redis | Redis Sentinel or Cluster |

### 8.3 Reliability

| Feature | Implementation |
|---------|---------------|
| **Health checks** | All services have Docker healthchecks |
| **Auto-restart** | `restart: unless-stopped` in production |
| **Task retry** | `update_prices_task` retries 3x with 30s backoff |
| **Atomic imports** | Backup import wrapped in DB transaction |
| **Token rotation** | Refresh tokens blacklisted after use (replay-safe) |
| **Graceful degradation** | Demo mode works without backend |

### 8.4 Maintainability

| Practice | Implementation |
|----------|---------------|
| **Multi-tenancy** | Single mixin (`OwnedByUserMixin`) enforces data isolation |
| **Code generation** | shadcn/ui components, OpenAPI schema (drf-spectacular) |
| **Type safety** | TypeScript strict mode, Django type hints |
| **i18n** | 5 languages, key-based translation files |
| **API docs** | Auto-generated Swagger UI at `/api/schema/swagger-ui/` |

---

## 9. ADR Index

Architecture Decision Records documenting key design choices:

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](adr/001-bff-pattern.md) | Adopt BFF Pattern (Browser → Next.js → Django) | Accepted |
| [ADR-002](adr/002-jwt-httponly-cookies.md) | Store JWT in httpOnly Cookies | Accepted |
| [ADR-003](adr/003-cost-basis-engine.md) | Build In-House Cost Basis Engine (FIFO/LIFO/WAC) | Accepted |
| [ADR-004](adr/004-multi-tenancy-owner-fk.md) | Multi-Tenancy via Owner Foreign Key | Accepted |
| [ADR-005](adr/005-demo-mode-msw.md) | Demo Mode with MSW and Static Data | Accepted |
| [ADR-006](adr/006-per-user-redis-cache.md) | Per-User Redis Cache Namespaces | Accepted |
| [ADR-007](adr/007-tax-adapter-pattern.md) | Per-Country Tax Adapter Pattern | Accepted |
| [ADR-008](adr/008-payroll-and-pdf-parser.md) | Payroll Tracking and Best-Effort PDF Parser | Accepted |

---

## Appendix: Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| **Backend** | Django 5.1, DRF 3.15, PostgreSQL 16, Celery 5.3, Redis 7 |
| **Auth** | djangorestframework-simplejwt, google-auth |
| **Frontend** | Next.js 16, React 19, TypeScript 5, Tailwind CSS v4, shadcn/ui (Base UI) |
| **State** | TanStack Query 5 (server state) |
| **Charts** | Recharts 3, Lightweight Charts 5 |
| **i18n** | Manual key-based (es, en, de, fr, it) |
| **Infra** | Docker Compose, GitHub Actions CI/CD, GHCR |
| **API Docs** | drf-spectacular (OpenAPI 3 / Swagger UI) |
