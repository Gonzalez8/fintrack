# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.8.0] - 2026-05-17

### Added

- **Payroll totals in the year-history table (`/tax`).** The "Histórico por año" table now aggregates `Payroll` rows alongside dividends, interests and realized gains. Two new columns (`Nóm. bruto`, `Nóm. neto`) plus two distinct totals: **Inversiones** (the previous total — dividends_net + interests_net + realized_pnl) and **Total** (Inversiones + payroll_net). Gross-subject figure uses `COALESCE(base_irpf, gross)` — same convention as the Spanish Modo Renta tab. The existing `Total neto {year}` KPI keeps its investments-only meaning so backwards compatibility is preserved. Mobile cards updated to show payroll net + investments subtotal alongside the existing fields. i18n keys added in all 5 locales. (#78)
- **"Ahorrado {year}" KPI in the annual savings tab.** The information already existed in the year-by-year table but was buried in the first row. A new highlighted KPI card now sits as the first of the row so the current calendar year's savings are visible at a glance. Falls back to the latest year on record when the current year hasn't started reporting yet (e.g. browsing on 01-Jan before the first snapshot). Grid pasa de 3 a 4 columnas en desktop, 2 en móvil. (#79)

## [2.7.0] - 2026-05-16

### Added

- **Payroll evolution tab in `/nominas`.** New "Evolución" tab next to the existing list (same `Tabs` pattern used in `/tax`) with three visual blocks: a Recharts stacked-bar of annual gross split by `payroll_type` (Monthly / Bonus / Atrasos / Other), a line chart of "bonus as a percentage of the monthly base" by year, and a year-by-year table with monthly / bonus / atrasos / total gross / net / effective IRPF % / take-home / bonus-of-monthly. The colour palette matches the list-view badges and the financial-analysis composition strip, so the type taxonomy stays consistent across the app. Pure client-side aggregation from a single `/payrolls/?page_size=1000` fetch — no backend changes. (#77)
- **Bonus as % of monthly base on the financial-analysis composition strip.** The BONUS row now suffixes its share with "(N % sobre el mensual)", which is the figure most comp packages quote as the bonus target ("X % bonus on base salary"). Renders only when both `MONTHLY` and `BONUS` buckets have data. (#75)

### Fixed

- **Nóminas entry missing from the mobile bottom-nav.** Payroll shipped in v2.5.0 / v2.6.0 with a sidebar entry on desktop but no equivalent on mobile, so phone users couldn't reach `/nominas` from any nav surface. Adds the entry to the mobile "Más" sheet right after Intereses, keeping income-related sections grouped. (#76)

### Dependencies

- None.

## [2.6.0] - 2026-05-16

### Added

- **Payroll tracking** — new app `apps/payroll/` with `Employer` and `Payroll` models. Track gross, SS, IRPF withholding, net, base IRPF, base CC and employer cost per payslip. The serializer never rejects a payslip for the classic `gross − ss − irpf ≠ net` descuadre (anticipos, embargos, dietas exentas, especie or regularizations legitimately break it); the discrepancy is surfaced as an informational `net_mismatch` field instead. (#63, #74)
- **PDF parser for Spanish payslips** — experimental and suggestion-only. `POST /api/payrolls/parse-pdf/` returns a set of suggested fields the user reviews in the form before clicking "Crear"; the endpoint never writes. Refactored into a Strategy + registry (`apps/payroll/services/parsers/`) so a future AI / OCR parser plugs in without touching the view or the regex parser. Robust extraction across line breaks and Unicode dashes; `employer_cost` summed from APORTACIÓN EMPRESA lines; `base_cc` guarded against single-number heuristics on atrasos templates. See [ADR-008](docs/adr/008-payroll-and-pdf-parser.md). (#63, #74)
- **`payroll_type` classification** — machine-readable enum `MONTHLY` / `BONUS` / `ATRASOS` / `OTHER` decoupled from the free-text `concept`. Inferred at save time from keyword patterns, overridable manually in the form. Pagas extra and bonus share the `BONUS` bucket by design — the legal distinction doesn't add analytics signal. (#74)
- **Bulk operations** — `POST /api/payrolls/bulk-create/` and `bulk-delete/`, transactional and capped at 100 items per request. Frontend supports multi-file upload (parallel parse, stacked review with per-row error mapping) and multi-select on the list with a bulk-delete action bar. (#74)
- **Spanish Modo Renta — "Rendimientos del trabajo" block.** Aggregates `gross_subject` (from `Payroll.base_irpf`, falling back to `gross`), SS contributions, IRPF withholdings, and a per-employer breakdown. Matches AEAT casilla "Retribuciones dinerarias" exactly when the user fills `base_irpf` (excludes cheque comida and other exempt items). (#63, #74)
- **Financial-analysis tab — payroll KPIs.** New "Rendimientos del trabajo" section with four KPIs (bruto sujeto IRPF, tipo IRPF efectivo, take-home rate, neto cobrado) and a year-over-year comparison via a reusable `DeltaPill`. Composition strip shows % of gross by `payroll_type`. (#74)

### Changed

- **Modo Renta employment field renamed** — `employment_income.gross` → `gross_subject` and now computed from `Payroll.base_irpf` when present (mirrors AEAT casilla 0003 "Retribuciones dinerarias"). Falls back to `gross` for legacy rows so nothing breaks. Documented caveat: for atrasos with reducción de irregularidad (>2 years / indemnizaciones, rare), the value would under-report and the user must adjust manually. (#74)
- **Clearer net-mismatch warnings** — `payroll_net_mismatch` notices now include the payslip concept («Enero 2025», «Extra Febrero 2025»…), individual amounts (bruto / SS / IRPF / net) and the delta, so the user can locate the offending payslip and spot the cause at a glance. (#74)
- **Parse-pdf response enrichment** — the view post-processes any parser's output with the inferred `payroll_type`, so new parsers benefit automatically without modifying their code. (#74)

### Fixed

- **Duplicate-payroll conflicts surface cleanly** — the `(owner, employer, period_start, period_end, concept)` unique constraint now returns a 400 with the conflicting period and concept named, instead of a 500 IntegrityError. (#74)
- **Employer `Select` stays controlled across renders** — fixes a Base UI warning that appeared when editing a saved payroll. (#74)
- **DRF validation errors render as readable text** — the toast now extracts the human message from the DRF error envelope instead of dumping raw JSON. (#74)
- **Same period, different concept now coexists** — a monthly salary and a bonus for the same window can be saved separately by changing the concept (e.g. "Extra Febrero 2025"). The uniqueness key includes `concept` since migration `payroll.0003`. (#74)

### Migrations

- `payroll.0001_initial` — creates `Employer` and `Payroll`. (#63)
- `payroll.0002_payroll_concept` — adds the free-text `concept` field. (#74)
- `payroll.0003_loosen_unique_to_include_concept` — relaxes the uniqueness key to include `concept`. (#74)
- `payroll.0004_payroll_payroll_type` — adds the `payroll_type` column with default `MONTHLY`. (#74)
- `payroll.0005_backfill_payroll_type` — classifies existing rows by running keyword inference over their `concept`. Idempotent forward, no-op reverse. (#74)
- `payroll.0006_alter_payroll_payroll_type` — merges any pre-existing `EXTRA` rows into `BONUS` (data step) **before** the `AlterField` removes `EXTRA` from the choices set. No orphan values. (#74)

All migrations are additive and safe to roll back individually.

### Dependencies

- Bump `yfinance` to latest (#72)
- Bump `django` to latest (#68)
- Bump `djangorestframework` to latest (#66)
- Bump `google-auth` (#69)
- Bump `psycopg` (#70)
- Bump `@base-ui/react` from 1.2.0 to 1.4.1 (#65)
- Bump `lucide-react` from 0.577.0 to 1.16.0 — major bump, icon names compatible with current usage; CI green (#67)
- Dev-only: bump `typescript` from 5.9.3 to 6.0.3 (#64), `vitest` from 4.1.2 to 4.1.5 (#71), `@vitest/coverage-v8` (#73)

## [2.5.0] - 2026-05-03

### Added

- **Fiscal residence setting.** New "Residencia fiscal" selector in Settings that maps to `Settings.tax_country` (ISO 3166-1 alpha-2, default `ES`). The list shows ~25 common countries with localized names via `Intl.DisplayNames`; entries marked with ✓ have a tax-declaration adapter implemented. (#61)
- **Per-country gating of the Modo Renta tab.** The "Modo Renta" tab is now only rendered when an adapter exists for the user's fiscal residence. For other countries the tab disappears and a small note explains where to change residence. The endpoint `/api/reports/tax-declaration/?year=YYYY` returns 404 in those cases — defense in depth, not just frontend gating. (#61)
- New API fields on `GET /api/settings/`: `tax_country`. Backwards-compatible (additive). (#61)

### Changed

- **Per-country tax-adapter pattern.** Spanish IRPF logic was extracted from `apps/reports/services.py` into a new `apps/reports/tax_adapters/` package (`base.py` Protocol, `common.py` country-agnostic helpers, `es.py` SpanishTaxAdapter). The frontend Renta component moves under `app/(dashboard)/tax/adapters/es-renta-tab.tsx` and dispatches via a `TAX_ADAPTERS` map. Output of the Spanish adapter is byte-identical to v2.4.x — no user-facing behaviour change. New countries can now be added without touching the existing one. See [ADR-007](docs/adr/007-tax-adapter-pattern.md) for the full design and the add-a-country recipe. (#62)

### Migrations

- `assets.0007_settings_tax_country`: adds `tax_country` to `Settings` with default `"ES"`. Additive, no data loss; existing users keep the Modo Renta tab unchanged. (#61)

## [2.4.2] - 2026-05-02

### Fixed

- Show inferred withholding in the interests list. Legacy/imported rows store `tax = NULL` ("not informed") and the Modo Renta tab already inferred the value from `gross − net − fees`, but the interests table showed `—` instead. The list now renders the inferred amount in italic with a tooltip, while explicit values keep their normal styling. `—` is reserved for rows where the inferred amount is 0 (#60)

### Added

- Two new read-only fields on the interest API response: `tax_effective` (literal `tax` when set, else inferred and clamped to 0) and `tax_is_inferred` (boolean flag for clients to style differently). Existing fields are unchanged — backwards compatible (#60)

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
