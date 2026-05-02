# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.1] - 2026-05-02

### Fixed

- Exclude `/api/health/` from DRF rate limiting. The liveness endpoint inherited the global `AnonRateThrottle` (200/hour) and started returning 429 after ~33 minutes of polling, marking the container as unhealthy and blocking Portainer stack updates (#59)

### Dependencies

- Bump `shadcn` from 4.2.0 to 4.3.1 (#49)
- Bump `react-dom` from 19.2.4 to 19.2.5 (#48)
- Bump `msw` from 2.13.0 to 2.14.2 (dev) (#50)
- Bump `jsdom` from 29.0.1 to 29.0.2 (dev) (#46)
- Tighten lower bounds for `psycopg`, `django-cors-headers`, `gunicorn`, `drf-spectacular`, `ruff` (#51, #52, #53, #54, #55)

## [2.4.0] - 2026-05-02

### Added

- **Modo Renta** tab inside the Fiscal section that maps Fintrack data directly to the Spanish Renta Web / Modelo 100 boxes: interests, dividends, foreign double-taxation deduction (computed country by country) and capital gains (row by row) (#56)
- Per-row "Copy row" button on declarable share sales with tab-separated payload (Entity / Transmission / Acquisition) ready to paste field-by-field into Renta Web (#56)
- Final summary card with "Copy all" producing a structured multi-line payload for the whole tax return (#56)
- Validation warnings: sales without cost basis, dividends without tax country, and `gross ≠ net + withholding + fees` mismatches (#56)
- New endpoint `GET /api/reports/tax-declaration/?year=YYYY` returning the structured Renta Web payload (#56)
- Explicit `withholding tax` (nullable: NULL = inferred / 0 = confirmed no withholding) and `commission/fees` fields on `Interest` rows, exposed through a collapsible "Advanced" section in the form with auto-recalc of net and a mismatch warning (#56)
- Explicit `commission` (administration / custody fees) field on `Dividend` rows, with the same UX in the dividend form; gross now computed as `net + withholding + commission` (#56)
- New "Withholding" column in the interests list and detail drawer (#56)
- `Settings.tax_treaty_limits` JSONField mapping ISO country codes to the bilateral treaty cap rate, configurable per user. Defaults to 15% when a country is not configured (#56)

### Changed

- `/tax` page is now tabbed: existing financial analysis view extracted to a "Financial analysis" tab; new "Modo Renta" tab is the second one. Year selector is shared between tabs (#56)
- Capital-gains UX reoriented as row-by-row declarable: aggregated totals collapsed as informative ("not copied to Renta Web") and the table is now the main element with per-row copy buttons. The Quantity column was removed from this block since it is not required by Hacienda (#56)

### Dependencies

- Bump `next` from 16.1.6 to 16.2.3 (#45)
- Bump `@tanstack/react-query` to latest (#43)
- Bump `shadcn` from 4.1.2 to 4.2.0 (#41)

## [2.3.2] - 2026-04-11

### Security

- Validate property FK ownership in AmortizationSerializer to prevent cross-tenant amortization creation (#40)
- Return 404 instead of 500 for missing SavingsGoal, preventing information disclosure and enforcing ownership (#40)

### Fixed

- Use separate Set-Cookie headers for demo tokens instead of comma-joined string (#40)
- Fix render side-effect in PrivacyProvider for React concurrent mode safety (#40)
- Fix diff_years/diff_months calculation in mortgage simulation service (#40)
- Fix stale closure in amortization edit mutation by passing month as argument (#40)
- Add refresh mutex to BFF proxy to prevent concurrent token refresh race condition (#40)
- Fix infinite loop risk in mortgage math when monthsLeft <= 0 (#40)
- Replace hardcoded Spanish month names with Intl.DateTimeFormat in projection card (#40)
- Add i18n key `savings.perMonth` to all 5 locales (#40)
- Add pagination guard (MAX_PAGES=50) and staleTime to interests projection tab (#40)
- Add error handling to pollTask for network failures (#40)
- Add retry logic (max_retries=3) to snapshot_single_user_task Celery task (#40)
- Call _invalidate() in AccountSnapshotViewSet.perform_create (#40)
- Remove duplicate PatrimonioPoint interface (#40)

### Performance

- Fix deriveAnnualRate O(n²) → O(n) with indexed loop (#40)

### Changed

- Remove dead batch_rv/batch_rf code in patrimonio evolution service (#40)

## [2.3.1] - 2026-04-10

### Fixed

- Disable Docker buildx attestations (provenance/sbom) to prevent untagged package versions
- Add versioning and release guidelines to CLAUDE.md for agent autonomy

## [2.3.0] - 2026-04-10

### Added

- Comprehensive SEO improvements with multilingual support
- Remove PositionSnapshot in favor of asset price chart in portfolio
- Interest projection tab with historical chart and future balance simulation

### Changed

- Docker publish workflow: only triggers on `v*` tags (no longer on every push to main)
- Docker images now tagged with semantic versions (`X.Y.Z`, `X.Y`, `latest`)
- Removed cleanup-packages workflow (no longer needed)

### Fixed

- All ruff linting issues across backend (import sorting, SIM401, B904, B007, B018)
- TypeScript and SSG build errors
- Production safety: `DEBUG=False` default, `ALLOWED_HOSTS` from env
- Backup/restore docs alignment

### Dependencies

- Bump react and react-dom to 19.2.4
- Bump @tanstack/react-query, recharts, msw, shadcn, @types/node, tailwindcss
- Bump Django, djangorestframework-simplejwt, django-filter, django-stubs
- Bump pytest, pytest-cov, gunicorn, yfinance, jsdom
- Bump actions/checkout to v6, actions/setup-node to v6, docker/metadata-action to v6

## [2.2.0] - 2026-03-28

### Added

- **Real estate tracking**: Property model with current value, purchase price, equity calculation
- **Mortgage management**: Auto-calculated from minimal inputs (loan amount, term, rate type, interest rate)
- **Interactive amortization table**: Click any row to add early amortization, choose reduce payment or reduce term
- **Multiple amortizations**: Add several events at different months, each cascading into the next
- **Amortization persistence**: Events stored via API CRUD with optimistic updates
- **Timeline chart**: Balance curve (original vs modified), event markers, "Today" position
- **Payment breakdown chart**: Principal vs interest stacked bars with highlighted event months
- **Mortgage summary header**: Comparison table (original vs modified vs saved)
- **Privacy mode**: Eye icon toggle that masks all personal monetary amounts across the app
- **Smart masking**: Public data (asset prices, percentages, quantities) stays visible

## [2.1.1] - 2026-03-25

### Fixed

- Auto-update asset prices before creating portfolio snapshots (ensures snapshots use fresh market data)

### Added

- Architecture documentation with C4 diagrams and ER diagrams
- Architecture Decision Records (ADR-001 through ADR-006)

## [2.1.0] - 2026-03-15

### Added

- **Savings goals**: Target-based projections with conservative/average/optimistic scenarios
- **Annual savings view**: Year-by-year savings analysis with patrimony growth tracking
- **SwipeCard component**: Mobile gesture-based edit/delete actions for list items
- **SEO**: Open Graph and Twitter card images for social sharing
- **Docker production**: Full docker-compose.prod.yml with auto-migration, superuser creation, health checks
- **Docker image publishing**: GitHub Container Registry with matrix builds (backend + frontend)
- **Database backup procedures**: Documented backup/restore for PostgreSQL

### Changed

- Enhanced authentication flow with locale detection and improved translations
- Demo mode improvements: better token handling, updated mock data
- Mobile responsive fixes and settings page redesign
- Optimized Dockerfile for improved build performance

### Fixed

- CSRF_TRUSTED_ORIGINS support for production deployment
- SECURE_SSL_REDIRECT disabled by default when behind reverse proxy
- ALLOWED_HOSTS handling for empty values in production
- Settings cache invalidation on save
- Network error handling with login redirect

## [2.0.0] - 2026-03-14

### Added

- **Next.js 16 frontend**: Complete rewrite from Vite + React 18 to Next.js App Router + React 19
- **BFF pattern**: Browser → Next.js Route Handlers → Django API (browser never calls Django directly)
- **SSR + Streaming**: Server-side rendering with React Suspense for dashboard pages
- **JWT in httpOnly cookies**: Both access and refresh tokens stored securely
- **Demo mode**: MSW-based mock data with fake JWT tokens, works without backend
- **CI/CD pipeline**: GitHub Actions for lint, typecheck, tests, and Docker image publishing
- **Admin panels**: Django admin for all models
- **Interest date ranges**: Start/end dates for interest income tracking
- **Comments drawer**: Account snapshot notes with drawer UI

### Changed

- Frontend framework: Vite + React 18 → Next.js 16 + React 19
- UI components: Custom → shadcn/ui (Base UI + Tailwind CSS v4)
- State management: Zustand → React Query (TanStack Query v5)
- Auth: Access token in memory → JWT in httpOnly cookies
- CSS: CSS Modules → Tailwind CSS v4

## [1.2.0] - 2026-03-07

### Changed

- Redesigned login page as premium landing page with SSG support

## [1.1.1] - 2026-03-06

### Fixed

- Sidebar no longer scrolls away on long pages

### Changed

- Updated documentation to reflect cost basis engine enhancements

## [1.1.0] - 2026-03-06

### Added

- **WAC cost basis method**: Weighted Average Cost calculation
- **LIFO cost basis method**: Last In, First Out calculation
- **Separate fiscal setting**: Independent cost basis method for tax reporting

## [1.0.0] - 2026-03-06

### Added

- **Portfolio engine**: FIFO cost basis calculation with realized P&L tracking
- **Asset management**: Stock, ETF, Fund, Crypto with Yahoo Finance price sync
- **Account tracking**: Checking, savings, investment, deposit accounts with balance snapshots
- **Transactions**: Buy/Sell/Gift with commission and tax tracking
- **Dividends**: Per-asset dividend tracking with withholding tax by country
- **Interests**: Account interest income tracking
- **Reports**: Tax summary, net worth evolution, monthly savings, CSV exports
- **i18n**: Full support for 5 languages (es, en, de, fr, it)
- **Auth**: JWT authentication with Google OAuth2 support
- **Docker**: Development Docker Compose setup with PostgreSQL, Redis, Celery
