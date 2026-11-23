# Fintrack

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
    transactions/ Transaction (BUY/SELL/GIFT), Dividend, Interest, StockSplit
    portfolio/    FIFO/LIFO/WAC engine
    reports/      Net worth, savings, evolution, savings goals
      tax_adapters/  Per-country tax-declaration adapters (registry + base + es.py)
    payroll/      Employer + Payroll models, CRUD + experimental PDF parser
    realestate/   Property, Amortization, mortgage simulation
    importer/     JSON backup/restore
  config/
    settings/     base.py, development.py, production.py
    celery.py     Celery app
    urls.py       Root URL conf

mcp/              MCP server (Python, stdio) — AI assistants read/add records via the API with a personal token

frontend/         Next.js 16 App Router
  src/
    app/
      (marketing)/  Landing page (SSG)
      (auth)/       Login, Register (Client Components)
      (dashboard)/  Private pages (SSR + Streaming)
      api/          Route Handlers (BFF proxy)
    lib/
      api-server.ts     Server-side Django fetch
      api-client.ts     Client-side BFF proxy
      utils.ts          formatMoney, formatPct, formatQty (privacy-aware)
      mortgage-math.ts  Client-side amortization schedule engine
      privacy.tsx       Privacy mode context + global flag
      chart-theme.ts    Recharts dark/light theme tokens
    app/(dashboard)/tax/
      tax-content.tsx           Year picker + per-country adapter dispatch
      financial-analysis-tab.tsx  Country-agnostic financial summary
      adapters/
        index.ts                TAX_ADAPTERS map + getTaxAdapter()
        es-renta-tab.tsx        Spanish Renta Web adapter
    components/
      ui/           shadcn/ui (Base UI + Tailwind v4)
      app/          Domain components
    types/          TypeScript interfaces
    demo/           Static data + MSW handlers
    i18n/           Custom i18n (es, en, de, fr, it)
```

## Tech Stack

- **Backend:** Django 5.1, DRF 3.15, PostgreSQL 16, Celery 5.3, Redis
- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Base UI, React Query, Recharts
- **Infra:** Docker Compose (db, redis, backend, frontend, celery_worker, celery_beat)

## Features

### Investment Tracking
- **Portfolio:** FIFO/LIFO/WAC cost basis engine, positions with P&L, realized sales
- **Sale simulator:** `apps/portfolio/sale_simulation.py` (`GET /api/portfolio/simulate-sale/`, read-only): lots from `_process_transactions` with `fiscal_cost_method` (lot dicts carry `date`; WAC gives one dateless lot), commission shared by shares, gain = proceeds − cost. The tax part goes through the fiscal adapter's optional `estimate_sale_tax(user, asset, gain, today)` — Spain in `tax_adapters/es_sale.py` (savings scale 19–30 %, this year's fiscal realized gains + gross dividends/interests, losses offset up to 25 % of capital income, two-month rule on losses; `loss_offset` says where a loss goes: gains, up to 25 % of capital income minus what earlier losses used, carried forward); `tax: null` for countries without it. `loss_harvest()` (`GET /api/portfolio/loss-harvesting/?selected=`) lists positions at a loss today (whole position, current price, fiscal method) and the adapter's optional `loss_harvest(user, candidates, selected, today)` adds each one's saving, `max_saving` and the selection's combined saving (`LossHarvestCard` in Fiscal, current year, collapsed; MCP `fintrack_get_loss_harvesting`). UI: `SaleSimulatorDialog` from `PositionDetailDialog` and `PositionHistoryCard`; MCP `fintrack_simulate_sale`
- **Returns (XIRR) and benchmark:** `apps/portfolio/returns.py` (`GET /api/portfolio/returns/?benchmark=`). Investor-side flows: BUY −(qty×price+commission+tax), GIFT −(qty×price), SELL +(qty×price−commission−tax), dividends +net, today +market value; `xirr()` by bisection (rates are floats, amounts Decimal); `reliable` false under 365 days. The benchmark replays buys/gifts/sales (not dividends: accumulating ETFs reinvest their own) in `BENCHMARKS` (EUNL.DE, SXR8.DE, VWCE.DE) with Yahoo closes cached globally 6 h; unavailable → `benchmark: null`. `benchmark.series` draws both over time (weekly up to two years, then month ends, last point today): `contributed` (money in − sale proceeds), `portfolio` (the day's last snapshot within a month + net dividends so far, null before the first snapshot) and `benchmark` (index units × close) — `BenchmarkChart` in `ReturnsDetails`, header follows the hover. UI: Portfolio has a single `PortfolioSummaryCard` (market value with a sparkline preview of the RV chart as it opens — 1 year, unrealized % — from the same `rv-evolution` query, unrealized P&L, % gained, % a year; body → RV chart, footer → invested capital and `ReturnsDetails` in a dialog with the benchmark selector); the % gained stays the main figure (the card shows % a year small under it); `PositionDetailDialog` shows % gained and % a year (explained in an ⓘ tooltip) plus quantity, average cost, cost, value, P&L, weight and held-since (from the same `useReturns()`) and a link to the asset page, whose long lists (dividends, position history) show the 5 newest with `useCollapsedList`/`ShowAllButton` (`components/app/collapsed-list.tsx`), and whose `AssetDividendsCard` lists that asset's recorded dividends (`/dividends/?asset_id=`) with the net total, plus the Yahoo backfill button for AUTO assets, and the price chart labels its % as the price change over the chosen range (the API also returns sold assets, used by the MCP); MCP `fintrack_get_returns`
- **Portfolio history rebuild:** `apps/portfolio/history.py` (`GET /api/portfolio/rebuild-history/` preview, `POST` applies; Settings `RebuildHistoryCard`; MCP `fintrack_preview_history_rebuild`/`fintrack_rebuild_history`) adds one `PortfolioSnapshot` per past trading day without one (local date, 18:00), from `holdings_timeline(user, cost_basis_method)` and Yahoo daily closes scaled back by later applied splits (no Yahoo history → last operation price, else average cost). Never changes or deletes existing snapshots; one `batch_id` per run. Design in [ADR-014](docs/adr/014-portfolio-history-rebuild.md)
- **Assets:** Stock, ETF, Fund, Crypto with Yahoo Finance price sync. Prices are checked every `snapshot_frequency` minutes, counted from the last snapshot **or** the last price check (with the market closed snapshots are skipped because nothing moved). No currency conversion: amounts are summed as entered, so AUTO tickers must quote in the asset's currency. `snapshot-status` returns `prices_updated_at`/`prices_stale` (no successful update for a day or two cycles) and the dashboard shows `StalePricesBanner`. Charts bucket snapshots by the viewer's local day (`localDay()` in `lib/realized.ts`), not the UTC one
- **Accounts:** Checking, savings, investment, deposits, alternatives with balance snapshots
- **Transactions:** Buy/Sell/Gift with commission and tax tracking
- **Stock splits:** `StockSplit` per asset (date + `ratio_to:ratio_from`, e.g. 4:1 or reverse 1:10). The FIFO/LIFO/WAC engine applies APPLIED splits chronologically (before same-day trades): open lots get `qty × factor` and `unit cost ÷ factor`, total cost unchanged, nothing realized. Auto-detection reads Yahoo Finance splits for AUTO-priced assets (daily Celery task + `POST /api/splits/detect/`) and creates PENDING suggestions only when the split is after the first purchase and shares were held; the user applies or dismisses them from the dashboard/portfolio banner or the asset detail card. Dismissed splits are never suggested again. Included in JSON backup/restore. Design in [ADR-009](docs/adr/009-stock-splits-and-dividend-drafts.md).
- **Split visibility:** `GET /api/assets/{id}/position-history/` replays trades + splits with the shares held after each step ("Historial de la posición" card, anchor `#position-history`). Transactions expose `split_factor` (product of later APPLIED splits) so the operations list shows "28 → 112 hoy" and interleaves applied splits as rows (`interleaveSplits()` in `lib/splits.ts`). Portfolio positions carry `splits` and show a "Split" badge.
- **Dividends:** Per-asset tracking with withholding tax by country
- **Dividend drafts:** `DividendSuggestion` (kept apart from `Dividend`, so drafts never reach reports/tax). Yahoo dividends (ex-date + split-adjusted amount) become PENDING drafts with shares held on the ex-date, estimated gross and withholding (from the asset's last 4 dividends). Rules: only ex-dates after the latest recorded dividend of the asset (assets without any look back 1 year; `backfill` per asset goes to the first purchase), skip events already covered by a recorded dividend (window `[ex − 7d, next ex)`, one-to-one) or suggested before, only if shares were held. Review opens the dividend dialog pre-filled; saving calls `POST /api/dividend-suggestions/{id}/accept/`, which creates the real `Dividend`. Daily Celery task + `POST …/detect/`; `dismiss`, `dismiss-all`, `restore` (dismissed → pending, the only way back since detection skips dismissed events). The asset page `AssetDividendsCard` lists the asset's pending drafts (review in Dividends, dismiss) and dismissed ones (restore) above its recorded dividends.
- **Interests:** Account interest income with date ranges
- **Other income:** `OtherIncome` (in `apps/transactions`; `/api/other-incomes/`, page `/other-income`) — rent, self-employment, side jobs, gifts, other: one row per payment, optional account (`SET_NULL`); never reaches the tax views on its own — rent linked to a `Lease` feeds the rental tax (see Rental below). `monthly_savings`/`annual_savings` add `income_payroll` (net, paid at `period_end`; each month collects the income received between the previous and its own last snapshot, and `investment_cost_delta` is measured at that same snapshot date), `income_other`, `income_investment` (net dividends + interests), `income_total` and `estimated_spending = income − real_savings`. Design in [ADR-011](docs/adr/011-other-income-and-estimated-spending.md).

### Rental (Spain)
- **Models** (`apps/realestate`): `Lease` (property, tenant, dates, `monthly_rent`, `deposit`, `reduction` PRE_2023/GENERAL/RENT_DROP/YOUNG/REHAB/NONE, `rented_share_pct`) and `RentalExpense` (property, date, category, amount). `Property` gained tax data (`acquisition_costs`, `cadastral_value`, `cadastral_construction_value`, `cadastral_revised`, `furniture_value`, `ownership_pct`). Rent payments are `OtherIncome` rows with `lease` (SET_NULL), so they count for savings.
- **Tax** (`reports/tax_adapters/es_rental.py`): pure `compute_rental(RentalInputs)` + `rental_overview(user, year)` (to-date and projected scenarios; costs prorated over `period_days`, depreciation over the year; mortgage interest from `realestate.mortgage.interest_in_year`; payslip base for the IRPF estimate). Exposed through the ES adapter (`rental_overview`, `rental_simulate`) at `/api/rental/overview/` and `/api/rental/simulate/` (404 for other fiscal countries) and as the `rental_income` block of the Modo Renta. UI: Properties → Rental tab. Design in [ADR-012](docs/adr/012-rental-management-and-tax.md).

### Real Estate & Mortgage
- **Properties:** Track real estate with current value, purchase price, equity
- **Mortgage management:** Auto-calculated from minimal inputs (loan amount, term in years, rate type fixed/variable, interest rate). Monthly payment, months paid, outstanding balance all computed automatically from purchase date
- **Interactive amortization table:** Click any row (past or future) to add an early amortization. Choose reduce payment or reduce term per event. Schedule recalculates instantly (client-side)
- **Multiple amortizations:** Add several amortization events at different months. Each cascades into the next — the schedule recomputes from each event forward
- **Amortization persistence:** Events stored in database (`Amortization` model) via API CRUD with optimistic updates
- **Timeline chart:** Balance curve (original vs modified), event markers, "Today" position
- **Payment breakdown chart:** Principal vs interest stacked bars, event months highlighted in purple
- **Summary header:** Mortgage identity + comparison table (original vs modified vs saved) for: payment, installments, term, remaining time, end date, total to pay, total interest
- **Mortgage finished state:** Banner when mortgage is paid off, debt goes to 0

### Reports & Analysis
- **Tax report (financial analysis):** Year-by-year fiscal summary, realized gains, dividends by country, interests by account. Mobile-first cards + desktop tables. Country-agnostic, always visible.
- **Tax declaration (per-country):** A country-specific assistant that maps Fintrack data to the local tax-declaration form. Currently Spain only (Modo Renta → Renta Web / Modelo 100). The user picks their fiscal residence in Settings (`tax_country`); the tab is only shown when an adapter exists for that country. The Spanish adapter covers five blocks: rendimientos del trabajo (from Payroll), interests, dividends, double-taxation deduction, and capital gains. New countries plug in via the adapter pattern documented in [ADR-007](docs/adr/007-tax-adapter-pattern.md).
- **Payroll tracking:** Digitised payslips (`Employer` + `Payroll` models). Manual entry plus an **experimental** best-effort PDF parser for Spanish payslips (`pdfplumber` + regex). The parser is suggestion-only — it never creates records, only pre-fills the form for the user to review. Feeds the Spanish Modo Renta as "Rendimientos del trabajo" and is the source for future income/savings reports. Architecture in [ADR-008](docs/adr/008-payroll-and-pdf-parser.md).
- **Net worth evolution:** Stacked area chart (cash + investments) with range filters. Investments are valued at month end (portfolio snapshot, or today for the current month) while cash is a photo usually taken on the 1st, so `patrimonio_evolution` subtracts from cash the money moved into investments (buys − sales) after the photo; `cash_snapshot` keeps the raw photo
- **Savings:** Monthly/annual savings analysis with goals and projections
- **CSV export:** Transactions, dividends, interests

### Privacy Mode
- **Toggle:** Eye icon next to the avatar (desktop top bar, mobile header)
- **Masks monetary amounts:** `formatMoney()` returns `•••••` when active. Covers the entire app via global flag synced with React context
- **Smart masking:** Only personal amounts are hidden. Public data stays visible:
  - Asset prices (market data) — NOT hidden
  - Percentages (P&L %, withholding rates) — NOT hidden
  - Share quantities — NOT hidden
- **Persistence:** Stored in `fintrack_privacy` cookie, survives page reload. The dashboard layout reads the cookie on the server and passes it to `PrivacyProvider` (`initialPrivacy`), which also sets the formatMoney flag during the server render, so server and browser render the same first frame (no hydration mismatch)
- **Implementation:** `isPublic` flag on `formatMoney(value, currency, isPublic)` and `MoneyCell` component. `PrivacyProvider` in component tree forces re-render via key change

### UX
- **Navigation:** five areas defined once in `lib/navigation.ts` (`NAV_AREAS`: home, investments, income, wealth, fiscal → existing pages as sections). Sidebar (desktop, current area unfolded, others remember their state in localStorage), bottom bar (mobile) and `SectionNav` (sticky underline tabs of the area's pages; on mobile also the area title, privacy eye and avatar). Account menu: `AccountMenu` (desktop, sticky top bar) / `AccountSheet` (mobile), both with `UserAvatar` (photo or initial). A new page = one entry in `NAV_AREAS`
- **i18n:** 5 languages (es, en, de, fr, it). All keys in all locale files
- **Demo mode:** MSW-based mock data, fake JWT tokens, works without backend
- **Mobile-first:** SwipeCard for list items, FAB for new items, stacked card layouts, responsive charts
- **Dark/Light theme:** System-aware with manual toggle
- **Backup restore:** `POST /api/backup/import/` replaces, not merges: inside one `atomic()` it first deletes everything in `_RESTORED_MODELS` (plus the avatar; Settings and API tokens stay), then restores, then clears the user's cache. A new model holding user data goes into the export, the import **and** `_RESTORED_MODELS` (a test fails otherwise). Transactions keep `created_at` (the RV chart uses it to place same-day sales)
- **Profile photo:** `core.UserAvatar` (one per user, bytes in the DB — no media volume; JPEG/PNG/WebP ≤ 300 KB, declared type must match the magic bytes, never SVG). `GET/PUT/DELETE /api/auth/avatar/` (PUT takes a data URL; `AvatarCropper` lets the user drag/zoom/pinch the photo inside a circle and exports 256 px JPEG, dropping EXIF). `/me` and `/profile` return `avatar_version` (upload timestamp) and the web loads `/api/proxy/auth/avatar?v=<version>` with a long private cache. In backups as base64 (`avatar`). The dashboard layout fetches `/me` with `no-store` so a new photo or username shows after `router.refresh()`
- **Installable (PWA):** `app/manifest.ts` (standalone, served at `/manifest.webmanifest`), icons from `app/pwa-icons/[name]/route.tsx` (192, 512, maskable 512), `viewport.themeColor` in the root layout, `appleWebApp` in `lib/seo.ts`. The middleware lets the manifest and icons through without auth. Service worker `public/sw.js` (hand-written, no deps; registered by `OfflineSupport` in the dashboard layout, not in demo mode where MSW owns the scope; `?dev=1` in development): network-first for pages, RSC payloads and `GET /api/proxy/*` with the last good response kept and served offline (banner with the data time); never caches `/api/auth/*`, `/api/proxy/auth/*` or backups; `clearOfflineData()` on login and logout; registered as `/sw.js?v=<NEXT_PUBLIC_APP_VERSION>` so each release gets fresh caches and deletes the old ones. Share target (manifest `share_target`): Android shares PDFs as `POST /share-target`, the worker keeps them in the `fintrack-share` cache and redirects to `/nominas?shared=1`, which opens the bulk payroll import (`takeSharedFiles()` in `lib/offline.ts`); `app/share-target/route.ts` is the fallback when the worker is not installed. The offline copy only works fully with a production build (dev chunks change without changing name). Requires HTTPS (or localhost)

## AI Access (MCP)

Design in [ADR-010](docs/adr/010-mcp-server-and-api-tokens.md).

- **Personal access tokens** (`core.ApiToken`): created/revoked in Settings → AI access (`/api/auth/api-tokens/`, session only). Only the SHA-256 of the key is stored; the key (`ft_…`) is shown once. Scopes `READ` / `WRITE`.
- **`ApiTokenAuthentication`** (first in `DEFAULT_AUTHENTICATION_CLASSES`, before the cookie JWT) enforces every rule itself because several views override `permission_classes`: tokens can never reach `/api/auth/` or `/api/backup/import/`, never `DELETE`, and READ tokens only use safe methods.
- **`mcp/`** (`fintrack_mcp`, MCP Python SDK 2.x `MCPServer`, stdio): thin client of the REST API — 28 read tools + 15 write tools prefixed `fintrack_` (write: operations, dividends, interests, other income, rent payments, rental expenses, dividend drafts, splits, create/update assets, portfolio history rebuild, account balance snapshots via `accounts/bulk-snapshot/`; no delete, no payslips) (read incl. payroll summary, monthly/annual savings, investment flows, invested capital evolution, account snapshots, savings goals, properties; pure aggregations in `fintrack_mcp/insights.py`), 3 MCP prompts (monthly review, payroll review, portfolio analysis), assets/accounts referenced by ticker or name. Runs on the user's computer (`uvx --from "git+…@vX.Y.Z#subdirectory=mcp" fintrack-mcp`, pinned to the release tag — Settings fills it from `NEXT_PUBLIC_APP_VERSION`, read from `frontend/package.json` in `next.config.ts`) with `FINTRACK_URL` (backend, port 8001 in prod or its reverse-proxy host; must be in `ALLOWED_HOSTS`) and `FINTRACK_TOKEN`. The backend URL is stored per user in `Settings.mcp_backend_url` (Settings card: save + browser reachability test) and used by the generated snippets; empty = web host on 8001. Tests use the in-process MCP `Client` against a `respx`-mocked API; CI job `mcp`.
- **`mcp/skills/fintrack-advisor/`**: Claude skill with the question→tool map, Fintrack definitions and a portfolio-review checklist; before recommending it reads `PERFIL.md` (who the user is) and `PLAN-FINANCIERO.md` (goals, strategy, rules, decision log) — portable Markdown files in the folder where the assistant runs, created from `templates/` if missing, never figures Fintrack has, never stored in Fintrack, git-ignored —, asks only for what is missing and keeps both updated. Attached to each GitHub release as `fintrack-advisor.zip` (see `fintrack-release`). When MCP tools change, update the skill's tool table too.

## Change Propagation Checklist

A change is not done until everything that depends on it is updated **in the same PR**. Nothing is left "for later":

| If you change… | Also update |
|---|---|
| An API endpoint (new, renamed, new params or fields, response shape) | **MCP**: tools in `mcp/fintrack_mcp/server.py`, tests in `mcp/tests/`, tool table in `mcp/README.md` and in the advisor skill (`mcp/skills/fintrack-advisor/SKILL.md`). Frontend `types/index.ts`. README → *API* section |
| A filter / query parameter | Frontend callers and MCP tools must use the **exact** `FilterSet` names — django-filter silently ignores unknown parameters (that is how the date/account filters of Operations broke) |
| A list endpoint or its consumers | Send `page_size` equal to the paginator's size; pickers and summaries that need every row use `page_size=1000` (max). `StandardPagination` honours it |
| A model holding user data | `owner` FK + `OwnedByUserMixin`, admin, backup export/import in `apps/importer` + round-trip test |
| A frontend API call or route | Demo mode: MSW handler (`demo/handlers.ts`) **and** server demo route (`demo/server-data.ts`); generic matchers such as `/api/assets/{id}` answer deeper paths unless a specific route comes first |
| UI text | All 5 locale files |
| Mortgage maths | `apps/realestate/mortgage.py` **and** `frontend/src/lib/mortgage-math.ts` together; keep the parity tests on both sides passing |
| Quantities, lots or cost basis | Portfolio engine (lot, WAC and `compute_investment_cost_by_month`), `position_history`, dividend-draft share counts, MCP `fintrack_check_dividend_shares` |
| Authentication or tokens | `ApiTokenAuthentication` rules + tests, `docs/SECURITY.md`, MCP error messages |
| A user-visible feature | README → *Features* (and *AI Access* if the assistant can use it), feature notes in this file, an ADR in `docs/adr/` for design decisions |
| A migration | Prefer additive changes; list it under "Migration notes" in the release CHANGELOG |

## Key Conventions

- **Language:** UI labels use i18n (es, en, de, fr, it). Code (variables, comments) in English. **Every new or modified i18n key MUST be added to ALL 5 locale files** (`frontend/src/i18n/messages/{es,en,de,fr,it}.json`). Never add a key to just es/en — incomplete translations break the UI for other languages.
- **Money:** Always `Decimal`, never float.
- **IDs:** UUID (TimeStampedModel base).
- **Multi-tenancy:** Every model has `owner` FK. ViewSets use `OwnedByUserMixin`.
- **Auth:** JWT in httpOnly cookies (both access + refresh). Next.js middleware validates before rendering.
- **BFF Pattern:** Browser -> Next.js Route Handlers -> Django API. Browser never calls Django directly.
- **Rendering:** SSG for marketing, SSR + Streaming for dashboard, Client Components for forms/charts.
- **Data fetching:** Server Components use `djangoFetch()`. Client mutations use React Query + `/api/proxy/*`.
- **Privacy:** Use `formatMoney(value, currency, isPublic)` with `isPublic=true` for public data (asset prices). Use `MoneyCell isPublic` prop for component usage. Never hide percentages or quantities.

## Mobile UX Patterns

- **Edit/Delete on list items:** Use `SwipeCard` component (`components/app/swipe-card.tsx`). The user swipes left to reveal edit (blue) and delete (red) action buttons. No inline edit/delete buttons on mobile — the swipe gesture is the only way to access these actions. On desktop, use inline icon buttons (Pencil/Trash2) visible on hover.
- **Layout split:** Mobile list uses `<div className="sm:hidden space-y-2">` with `SwipeCard`. Desktop uses `<div className="hidden sm:block">` with DataTable or Card grid with inline actions.
- **Delete confirmation:** Always use `confirm(t("..."))` before calling the delete mutation.
- **Accent colors:** Each SwipeCard gets an `accentColor` for the left border (e.g., `border-l-blue-500`, `border-l-amber-500`). Choose a color that represents the entity type.
- **Tap on mobile card:** Opens a `DetailDrawer` (bottom sheet, read-only) showing all fields. Never opens the edit form — editing is only via swipe action. Component: `components/app/detail-drawer.tsx`.
- **New item button:** Desktop: `Button` with `Plus` icon in the page header (`hidden sm:flex`). Mobile: FAB (floating action button) fixed at `bottom-24 right-5` (`sm:hidden`).
- **Summary cards:** Use `grid-cols-1 sm:grid-cols-3` — stack vertically on mobile with label left / value right, grid on desktop.
- **Tables:** Mobile uses card-style rows (`sm:hidden`), desktop uses `<table>` or `DataTable` (`hidden sm:block`). Never force horizontal scroll on mobile.

## Tax Adapter Architecture

Per-country tax-declaration logic lives behind a registry. Adding a new country touches only its own files; the dispatcher and the rest of the app are untouched. Full design rationale in [ADR-007](docs/adr/007-tax-adapter-pattern.md).

- **`Settings.tax_country`** (`CharField(2)`, ISO 3166-1 alpha-2, default `"ES"`): the user's fiscal residence. Drives which adapter is used.
- **Backend registry** ([backend/apps/reports/tax_adapters/__init__.py](backend/apps/reports/tax_adapters/__init__.py)): `register(code, adapter)`, `get_adapter(code)`, `supported_tax_countries()`. Adapter modules self-register at import time.
- **Backend contract** ([base.py](backend/apps/reports/tax_adapters/base.py)): `TaxAdapter` Protocol — `country_code: str` + `declare(user, year) -> dict`.
- **Backend shared helpers** ([common.py](backend/apps/reports/tax_adapters/common.py)): `q()`, `interest_withholding()`, `asset_country()`, `MONEY_Q`, `NET_MISMATCH_TOLERANCE`. Country-agnostic.
- **Frontend registry** ([frontend/src/app/(dashboard)/tax/adapters/index.ts](frontend/src/app/(dashboard)/tax/adapters/index.ts)): `TAX_ADAPTERS` map of `code → ComponentType`. `SUPPORTED_TAX_COUNTRIES` is derived from `Object.keys(TAX_ADAPTERS)`.
- **Endpoint gating**: `TaxDeclarationView` returns `404` if `get_adapter(user.settings.tax_country)` is `None`. Defense in depth, independent of the frontend.
- **Localization rule**: country-specific tax-form labels (casillas, deduction names) stay **inside the adapter** in the source language of that country's form. Only UI chrome is translated through `i18n/messages/*.json`.

### Adding a new country (e.g. Germany)

1. Backend: create [backend/apps/reports/tax_adapters/de.py](backend/apps/reports/tax_adapters/de.py) implementing `TaxAdapter`. End the module with `register("DE", GermanTaxAdapter())`.
2. Backend: add `from . import de` to [backend/apps/reports/tax_adapters/__init__.py](backend/apps/reports/tax_adapters/__init__.py).
3. Backend: tests in [backend/apps/reports/tests/tax_adapters/test_de.py](backend/apps/reports/tests/tax_adapters/test_de.py).
4. Frontend: create [frontend/src/app/(dashboard)/tax/adapters/de-steuer-tab.tsx](frontend/src/app/(dashboard)/tax/adapters/de-steuer-tab.tsx).
5. Frontend: add `DE: DeSteuerTab` to `TAX_ADAPTERS` in [frontend/src/app/(dashboard)/tax/adapters/index.ts](frontend/src/app/(dashboard)/tax/adapters/index.ts).

No edits to `services.py`, `views.py`, `tax-content.tsx`, `settings-content.tsx` or any existing country adapter.

## Payroll Architecture

Spanish-payslip ingestion lives in `apps/payroll/` and feeds two consumers: the Spanish Modo Renta adapter (`employment_income` block) and future income/savings reports. Full design in [ADR-008](docs/adr/008-payroll-and-pdf-parser.md).

- **`Employer` model** ([backend/apps/payroll/models.py](backend/apps/payroll/models.py)): `name`, `cif`, `ss_account`, `address`, `notes`. Owned by user, unique by `(owner, name)`.
- **`Payroll` model**: FK `employer` (PROTECT), `period_start`/`period_end`, `gross`, `ss_employee`, `irpf_withholding`, `net`, optional `base_irpf`/`base_cc`/`employer_cost`. `gross` = retribución dineraria total (MVP only). Unique by `(owner, employer, period_start, period_end)`.
- **Soft validation rule**: `gross − ss_employee − irpf_withholding == net` is *never* enforced as an error. Real payslips legitimately break it (anticipos, embargos, dietas exentas, retribución en especie, regularizations). The serializer exposes a `net_mismatch` field for the frontend to surface as an informational notice; the Modo Renta block emits a non-blocking warning.
- **Schema headroom for future extensions** (not in MVP): `gross_in_kind` (retribución en especie), `gross_exempt` (rendimientos exentos), `non_salary_adjustments`. Adding them later is an additive migration.
- **PDF parser** ([backend/apps/payroll/services/pdf_parser.py](backend/apps/payroll/services/pdf_parser.py)) — **experimental and suggestion-only**:
  - `parse_payslip_text(text)` is a pure regex-based function returning `{suggested, confidence, warnings}`. Splitting it from the pdfplumber wrapper lets unit tests run with hand-written text fixtures (no real PDFs in CI).
  - The view `POST /api/payrolls/parse-pdf/` is read-only. It never creates records. The frontend pre-fills the form with the suggestion and the user must click "Crear" to save (parse-then-review).
  - Confidence < 0.3 → `422`. The user falls back to manual entry. No OCR (out of scope for the MVP).
- **Frontend** ([frontend/src/app/(dashboard)/nominas/](frontend/src/app/(dashboard)/nominas/)): mirrors the `/interests` CRUD pattern. The PDF upload section sits at the top of the create dialog with an "experimental" banner; on success it pre-fills the form and matches the employer FK by CIF first, then by name.

## Real Estate Architecture

- **Property model:** `name`, `current_value`, `purchase_price`, `purchase_date`, `currency`, `notes` + optional mortgage fields (`original_loan_amount`, `outstanding_balance`, `annual_interest_rate`, `total_term_months`, `months_paid`, `monthly_payment`)
- **Amortization model:** FK to Property, `month` (unique per property), `amount`, `strategy` (REDUCE_PAYMENT / REDUCE_TERM)
- **Client-side math:** `mortgage-math.ts` — `generateSchedule()` builds full month-by-month schedule, `applyMultipleAmortizations()` cascades events in a single forward pass. All computation is O(n), sub-millisecond
- **Auto-calculation on form:** User inputs loan amount + term (years) + rate type (fixed/variable) + rate. Monthly payment, months paid, outstanding balance computed automatically from purchase date
- **Debt calculation:** the backend (`apps/realestate/mortgage.py`) is the source of truth: the API replaces the stored `months_paid`/`outstanding_balance` snapshot with today's values (months elapsed since `purchase_date`, early amortizations applied) and adds `mortgage_status` (NONE/ACTIVE/FINISHED), `has_active_mortgage`, `months_elapsed`, `current_monthly_payment`, `mortgage_end_date`, `extra_amortizations`. `months_paid` = payments made (stops at the end); the web positions "today" in the schedule with `months_elapsed`; `has_mortgage` only means mortgage data exists — debt checks use `has_active_mortgage`. The client engine (`mortgage-math.ts`) must give the same figures — `applyMultipleAmortizations` gets the exact `annualRate`; parity is pinned by matching tests on both sides

## Development Workflow

**Every change** follows this mandatory pipeline. No exceptions, no direct commits to `main`.

```
Task received
  → /fintrack-dev (classify, branch, implement, open PR)
    → /commit (conventional commits on the branch)
      → /pr-review (automated code review)
        → Merge to main (squash merge, delete branch)
          → /fintrack-release (evaluate release)
```

### Branch Naming Convention

Format: `{type}/{short-kebab-description}` — max 50 chars, lowercase.

| Type | When to use |
|------|-------------|
| `feat/` | New user-facing functionality |
| `fix/` | Bug fix |
| `chore/` | Tooling, deps, CI, config |
| `refactor/` | Code restructure, no behavior change |
| `docs/` | Documentation only |
| `test/` | Tests |
| `perf/` | Performance improvement |

**Never use:** `feature/`, `claude/`, `hotfix/`, `bugfix/`

### Skills Pipeline

| Skill | Purpose | When to use |
|-------|---------|-------------|
| `/fintrack-dev` | Create branch, guide implementation, open PR | Starting any task |
| `/commit` | Conventional commit with emoji format | Each logical unit of work |
| `/pr-review` | Automated code review with Fintrack rules | After opening a PR |
| `/fintrack-release` | Version bump, CHANGELOG, tag, GitHub Release | After merging to main |

### Versioning & Releases

This project uses **Semantic Versioning** and **Conventional Commits**.

- **Commit messages:** `type(scope): description` — types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`
- **Release governance:** Use `/fintrack-release` for all release decisions. The skill contains the full policy, anti-spam rules, checklists, and step-by-step execution guide.
- **Key rule:** Never create tags without user confirmation. Tags trigger Docker image builds on GHCR.

### Critical Rules

1. **Never commit directly to `main`.** Always use a feature branch + PR.
2. **Never create tags without user confirmation.** Tags trigger Docker builds.
3. **i18n keys in ALL 5 locales.** Missing translations break the UI.
4. **PR review before merge.** Use `/pr-review` or manual review.
5. **API and MCP stay in sync.** Any API change updates the MCP tools, their tests and `mcp/README.md` in the same PR (see the Change Propagation Checklist).

## Common Commands

```bash
docker compose exec backend python manage.py makemigrations <app>
docker compose exec backend python manage.py migrate
docker compose exec backend pytest

# MCP server (outside Docker; Python ≥ 3.10)
cd mcp && python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest && .venv/bin/ruff check . && .venv/bin/ruff format --check .
```
