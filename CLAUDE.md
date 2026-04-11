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
    transactions/ Transaction (BUY/SELL/GIFT), Dividend, Interest
    portfolio/    FIFO/LIFO/WAC engine
    reports/      Tax, net worth, savings, evolution, savings goals
    realestate/   Property, Amortization, mortgage simulation
    importer/     JSON backup/restore
  config/
    settings/     base.py, development.py, production.py
    celery.py     Celery app
    urls.py       Root URL conf

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
- **Assets:** Stock, ETF, Fund, Crypto with Yahoo Finance price sync
- **Accounts:** Checking, savings, investment, deposits, alternatives with balance snapshots
- **Transactions:** Buy/Sell/Gift with commission and tax tracking
- **Dividends:** Per-asset tracking with withholding tax by country
- **Interests:** Account interest income with date ranges

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
- **Tax report:** Year-by-year fiscal summary, realized gains, dividends by country, interests by account. Mobile-first cards + desktop tables
- **Net worth evolution:** Stacked area chart (cash + investments) with range filters
- **Savings:** Monthly/annual savings analysis with goals and projections
- **CSV export:** Transactions, dividends, interests

### Privacy Mode
- **Toggle:** Eye icon in sidebar (desktop) and mobile nav "More" sheet
- **Masks monetary amounts:** `formatMoney()` returns `•••••` when active. Covers the entire app via global flag synced with React context
- **Smart masking:** Only personal amounts are hidden. Public data stays visible:
  - Asset prices (market data) — NOT hidden
  - Percentages (P&L %, withholding rates) — NOT hidden
  - Share quantities — NOT hidden
- **Persistence:** Stored in `fintrack_privacy` cookie, survives page reload
- **Implementation:** `isPublic` flag on `formatMoney(value, currency, isPublic)` and `MoneyCell` component. `PrivacyProvider` in component tree forces re-render via key change

### UX
- **i18n:** 5 languages (es, en, de, fr, it). All keys in all locale files
- **Demo mode:** MSW-based mock data, fake JWT tokens, works without backend
- **Mobile-first:** SwipeCard for list items, FAB for new items, stacked card layouts, responsive charts
- **Dark/Light theme:** System-aware with manual toggle

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

## Real Estate Architecture

- **Property model:** `name`, `current_value`, `purchase_price`, `purchase_date`, `currency`, `notes` + optional mortgage fields (`original_loan_amount`, `outstanding_balance`, `annual_interest_rate`, `total_term_months`, `months_paid`, `monthly_payment`)
- **Amortization model:** FK to Property, `month` (unique per property), `amount`, `strategy` (REDUCE_PAYMENT / REDUCE_TERM)
- **Client-side math:** `mortgage-math.ts` — `generateSchedule()` builds full month-by-month schedule, `applyMultipleAmortizations()` cascades events in a single forward pass. All computation is O(n), sub-millisecond
- **Auto-calculation on form:** User inputs loan amount + term (years) + rate type (fixed/variable) + rate. Monthly payment, months paid, outstanding balance computed automatically from purchase date
- **Debt calculation:** `computeCurrentBalance()` for properties without loaded events, schedule-based calculation for selected property with amortizations applied

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

## Common Commands

```bash
docker compose exec backend python manage.py makemigrations <app>
docker compose exec backend python manage.py migrate
docker compose exec backend pytest
```
