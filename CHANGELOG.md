# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.23.0] - 2026-11-20

### Added

- **Install Fintrack as an app.** Over HTTPS, Chrome on Android offers *Install app* (⋮ menu): Fintrack gets its own icon and opens full screen without the address bar, with the status bar in the app's colour. On iPhone: Safari → Share → *Add to Home Screen*. It is the same web, so every release reaches the installed app on its own. (#135)
- **The AI advisor keeps your profile and financial plan in two portable files.** The `fintrack-advisor` skill no longer keeps your profile in Claude Code's memory: `PERFIL.md` (who you are — how you want to be advised, housing, horizon, risk tolerance, emergency fund, preferences, recording rules) and `PLAN-FINANCIERO.md` (goals, strategy, rules for falls, exit plan, roadmap, pending items and a dated decision log) live next to your `CLAUDE.md`, readable by any assistant. It creates them from the new `templates/` if missing and updates them in the same session. It also gives one concrete recommendation (amounts, ISIN, dates) with at most one alternative, separates money by when it will be needed, explains which period each monthly savings row really covers, treats public market data and the currency you buy in with care, and never takes a screenshot as confirmation for a write. Keep both files out of git. (#136)

### MCP update

- The *Portfolio analysis* prompt now reads `PERFIL.md` and `PLAN-FINANCIERO.md`; update the MCP command (Settings shows it pinned to v2.23.0). The updated `fintrack-advisor.zip`, now with `templates/`, is attached to this release — upload it again in Claude Desktop (Settings → Skills). If you had a `perfil-financiero` memory from v2.21.0, move it into `PERFIL.md` and delete it.

## [2.22.0] - 2026-11-20

### Added

- **Navigation in five areas.** Home, Investments, Income, Net worth and Tax replace the long menu. On desktop each area unfolds its pages in the sidebar (the current one always open, the rest remember your choice); on mobile the five areas are the bottom bar. The pages of the current area are tabs at the top that stay visible while scrolling. Pages, their URLs and inner tabs are unchanged. (#134)
- **Account menu behind your avatar** at the top right (desktop top bar, now fixed while scrolling; mobile header): profile, settings, language, theme and logout, with the hide-amounts eye next to it. Language can now be changed on mobile. (#134)
- **Cash by account on the dashboard.** A fixed card shows where your cash is: each account with its type, balance and share of the total. The cash card leaves Portfolio, which keeps market value, P&L and total cost. (#134)
- **Invested capital chart.** Tap *Total cost* in Portfolio to see the money invested at each month end since your first operation, with what you put in (green) or took out selling (red) each month. It ends at the portfolio's total cost. (#134)
- **Sales on the equity evolution chart.** Each sale is marked; hovering its day shows the gain it realized. A new *Unrealized | Total* selector: Total (in €) adds the gains already taken, so selling a winner no longer looks like a drop. Tap *Market value* or *Unrealized P&L* in Portfolio to open this chart. (#134)

### Fixed

- **False overnight spikes in the equity evolution.** Around midnight Yahoo briefly omits the day that just closed, and the price update took the close of one or two days earlier until the market opened (e.g. 30 Oct: real value 32,541 €, night snapshot 34,093 €). Prices now never step back to an older day. Snapshots already stored are not changed. (#133)
- **Equity chart started with a false 0 %** from snapshots taken before any operation existed; they are now ignored. (#134)
- **Asset names instead of tickers** in the pending dividend and split notices, the split detail and the sale markers. (#134)
- **Euro axes respect hide-amounts** in the new charts. (#134)

### MCP update

- New read tool `fintrack_get_invested_capital_evolution` (money invested at each month end and the monthly change), backed by the new `GET /api/reports/investment-cost-evolution/`. The updated `fintrack-advisor.zip` is attached to this release — upload it again in Claude Desktop (Settings → Skills).

## [2.21.0] - 2026-11-17

### Added

- **The AI advisor remembers your investor profile.** The `fintrack-advisor` skill keeps the personal context Fintrack doesn't have — age, housing and who collects your rents, real horizon and goals, risk tolerance, emergency fund and its purpose, preferences and limits, recording rules, topics to avoid — in Claude Code's local persistent memory (`perfil-financiero`). It asks only for what is missing, confirms what may have changed and updates the profile as you mention changes. Figures Fintrack has (salary, savings, spending, balances, portfolio) are never stored or asked, and the profile is never saved in Fintrack or external services. In clients without that memory it uses the client's own memory if enabled, or asks in the conversation. (#132)

### Fixed

- **Monthly savings measured cash and investments on different days.** Cash comes from the month's snapshot (usually the 1st) but purchases were counted over the whole calendar month, so a buy after the snapshot looked like savings that month and spending the next (e.g. March −542 € / April 1,070 € instead of 460 € / 68 €). Money invested is now measured up to the same snapshot date. Yearly totals shift slightly at the year boundary. (#130)
- **Net worth evolution counted a purchase twice in its month.** Investments are valued at month end while cash is the photo taken earlier, so money invested after the photo appeared as cash and as investment. Cash is now the photo minus what moved into investments after it (the raw photo is kept as `cash_snapshot`). Affects the net worth chart, the yearly net worth in Savings, savings-goal progress and the MCP net worth tool. (#131)

### MCP update

- Updated descriptions of the savings and net worth tools, and the server instructions and portfolio-analysis prompt use the saved profile. The updated `fintrack-advisor.zip` is attached to this release — upload it again in Claude Desktop (Settings → Skills).

## [2.20.0] - 2026-11-17

### Added

- **Rental management with the Spanish tax result.** Properties has a new **Rental** tab: the property's tax data (purchase price and costs, total and building cadastral value, furniture, your ownership share), leases (tenant, dates, rent, deposit and the main-home reduction regime — 60 % before 26/05/2023, 50 % general, 70/90 % in stressed areas), rent payments (saved as other income linked to the lease, so they still count for savings; months without a payment are flagged) and expenses (IBI, community, insurance, repairs, interest, utilities, agency, improvements). (#127)
- **Rental tax result to date and projected, and a simulator.** Net rent for the tax return with the Spanish rules — interest and repairs capped at the income (excess carried forward 4 years), year-round costs prorated by days rented, 3 % depreciation of the building plus improvements, 10 % furniture, the reduction and the imputation of empty days — the extra income tax on top of your payslips (approximate scale) and what is left in cash. Every figure can be changed in the simulator to try scenarios. Mortgage interest of each calendar year comes from the property's mortgage. (#127)
- **Modo Renta: "Rendimientos del capital inmobiliario"** block with copyable figures per property. (#127)

### Changed

- **Other income has no "declared" flag any more**: it had no tax effect and suggested otherwise. Rent is declared through the new rental feature. (#126)

### Fixed

- **Backups now include employers and payslips**; restoring a backup lost every payslip. (#125)
- **Estimated spending followed calendar months instead of the snapshot periods**: with snapshots taken on the 1st, the payslip landed one month off and some months showed negative spending. Each month now counts the income received between the previous snapshot and its own. (#129)
- **Demo:** the Rental tab no longer crashes in demo mode. (#128)

### Migration notes

- `transactions/0011_remove_otherincome_declared` (drops the informational flag added in v2.19.0), `realestate/0003_rental` (property tax fields, leases, rental expenses — additive) and `transactions/0012_otherincome_lease` (additive). Applied automatically on start. Coming from v2.18.0, `transactions/0010_other_income` runs first.
- Download a new backup after updating: older backups do not contain your payslips.

### MCP update

- New tools `fintrack_get_rental_summary`, `fintrack_record_rent_payment` and `fintrack_create_rental_expense`; other income tools no longer take `declared`. Update your MCP command to `v2.20.0` (Settings → *AI access (MCP)*); the updated `fintrack-advisor.zip` is attached to this release.

## [2.19.0] - 2026-11-17

### Added

- **Other income.** A new *Other income* section records money you receive outside payslips, dividends and interests — rent, self-employment, side jobs, gifts or anything else — one entry per payment, with the account it goes into and a "declared in the tax return" flag. "Repeat last" creates next month's entry with just the date and amount. Undeclared income counts for your savings and spending but never appears in the tax views. (#124)
- **Income and estimated spending in Savings.** Each month and year now shows what came in (net payslips, other income, dividends and interests) and the **estimated spending** it implies: income − real savings. It is approximate (sales at a gain, loans or accounts without snapshots skew it), but it finally answers "how much do I spend?" without tracking expenses. (#124)

### Fixed

- **Backups lost the withholding and fees of interests**; they now keep them. (#124)

### Migration notes

- `transactions/0010_other_income`: creates the `OtherIncome` table — additive, applied automatically on start.

### MCP update

- New tools `fintrack_list_other_income` and `fintrack_create_other_income`; the savings tools return income and `estimated_spending`, and the assistant is told to include other income before saying savings and salary don't match. The updated `fintrack-advisor.zip` is attached to this release.

## [2.18.0] - 2026-11-17

### Added

- **The AI assistant can add and edit assets.** With a read-and-write token, the MCP can now create a stock, ETF, fund or crypto (name, Yahoo Finance ticker, ISIN, currency, automatic or manual price, issuer/domicile/withholding country) and change any of those details later, including the price of a manual asset. Recorded operations and dividends are never touched. (#123)
- **The AI assistant can record your account balances.** Tell it "these are my balances today" or "on the 1st: Trade Republic 1,250 €, MyInvestor 8,400 €" and it saves one snapshot per account on that date, showing the previous balance next to the new one. A snapshot already recorded for the same account and date is replaced. Payslips stay out of the assistant's reach, and it still cannot delete anything. (#123)

### Fixed

- **Net worth and savings reports were stale after saving several account balances at once** ("update balances" in Accounts): the bulk snapshot did not refresh the report cache. (#123)
- **Creating or editing an asset with a ticker or ISIN you already use** returned a server error; it now explains which field is repeated. (#123)

### MCP update

- New tools `fintrack_create_asset`, `fintrack_update_asset` and `fintrack_record_account_balances`. Update your MCP command to `v2.18.0` (Settings → *AI access (MCP)*); the updated `fintrack-advisor.zip` is attached to this release. The fix for the stale reports needs the backend update too.

## [2.17.0] - 2026-11-17

### Added

- **Withholding at source and domestic withholding are now separate.** Foreign dividends paid through a Spanish broker carry two withholdings: the one of the issuer's country (e.g. 15 % US) and the Spanish 19 % retention the broker applies on top. The dividend dialog now has **"Retención en origen"** and **"Retención en destino"**; the list, the detail sheet, CSV export and backups show both. Dividend drafts from Yahoo also estimate the domestic withholding from your previous dividends of the asset. (#122)

### Fixed

- **Modo Renta: Spanish retentions on foreign dividends were missing.** With both withholdings lumped together, the Spanish 19 % was treated as foreign tax: "Retenciones españolas" left it out (so it would be paid twice) and it inflated the double-taxation input. The Spanish retention now adds to "Retenciones españolas" and only the withholding at source feeds the double-taxation deduction; the dividends table shows both columns per entity. The yearly summary reports the total withheld and the domestic part apart. (#122)
- **Backups lost the dividend commission**; they now keep it. (#122)

### Migration notes

- `transactions/0009_dividend_domestic_tax`: adds `domestic_tax` (default 0) to dividends and dividend drafts — additive, applied automatically on start.
- **Action needed if your broker applies the Spanish 19 %:** existing dividends keep everything in "Retención". Edit those dividends and move the Spanish part to "Retención en destino" so the Modo Renta declares it.

### MCP update

- `fintrack_create_dividend` and `fintrack_accept_dividend_draft` accept `domestic_tax`. Update your MCP command to `v2.17.0` (Settings → *AI access (MCP)*); the updated `fintrack-advisor.zip` is attached to this release.

## [2.16.0] - 2026-11-17

### Added

- **Save and test the backend URL for the AI assistant.** Settings → *AI access (MCP)* now has a "Connection to your Fintrack" block: enter the address the MCP should use (e.g. your reverse-proxy host `https://fintrack-api.example.com`), **Save** it and **Test connection** from the browser. The Claude Code and Claude Desktop snippets use the saved URL instead of guessing "web host + :8001", which was wrong behind a reverse proxy. (#120)

### Fixed

- **Mortgages paid off early kept counting payments.** `months_paid` now stops at the last payment actually made (it kept growing with the calendar after an early pay-off). The new `months_elapsed` carries "calendar months since the start", and the new `has_active_mortgage` is what debt figures should check — `has_mortgage` also covers finished mortgages. (#119)
- **Backups now keep your fiscal country and tax-treaty limits** (and the MCP backend URL); they were not exported before. (#120)
- **AI assistant (MCP):** yearly summary, net worth evolution and annual savings now return structured data (one object instead of one text block per row); the dividend share check no longer flags dividends paid on the shares held before a split whose ex-date came first (listed apart as `explained_by_split`); tool descriptions clarify that `payroll_gross` in the yearly summary is the IRPF taxable base, not the gross salary. (#121)

### Migration notes

- `assets/0008_settings_mcp_backend_url`: adds the optional `Settings.mcp_backend_url` (additive, applied automatically on start).

### MCP update

- **Update your MCP command to `v2.16.0`**: copy it again from Settings → *AI access (MCP)* (Claude Code: `claude mcp remove fintrack` and add it again; Claude Desktop: change the version in the config and restart). The updated `fintrack-advisor.zip` is attached to this release.

## [2.15.1] - 2026-11-17

### Fixed

- **Mortgages paid off early showed outstanding debt in the API and the AI assistant.** The API returned the balance stored when the property was last saved: early amortizations were ignored (the web applied them, so the screen said "finished" while the MCP reported the theoretical balance) and the months paid never advanced, which also froze the debt shown on the web until the property was edited again. The backend now computes the mortgage as of today — months elapsed since the purchase date and early amortizations applied — and the API returns the current balance plus `mortgage_status` (NONE / ACTIVE / FINISHED), the current monthly payment, the end date and the total amortized early. Net equity and amortized capital use the current balance. (#118)
- **Property cards** show "Mortgage finished" instead of a payment no longer due, and the current payment for active mortgages. (#118)
- **Balance with early amortizations was a few cents off on the web** (the interest rate was derived from a rounded figure); web and API now give identical figures, checked by matching tests on both sides. (#118)

### Documentation

- MCP setup note for installations behind a reverse proxy (own host for the backend, `ALLOWED_HOSTS`, one-level subdomain with wildcard certificates). (#117)

## [2.15.0] - 2026-11-16

### Added

- **The AI assistant now covers your whole financial picture.** Nine new MCP tools: payslips and a yearly income summary (gross, net, social security, effective IRPF, bonus and its share of the fixed salary), monthly and yearly savings, money invested per month, per fund or per asset type (e.g. "how much have I put into the S&P 500"), account balance history, savings goals with projections, real estate and mortgages, and your settings. (#116)
- **Ready-made analyses** as MCP prompts: monthly review, payroll and bonus review, and portfolio analysis. (#116)
- **`fintrack-advisor` skill** (attached to this release as `fintrack-advisor.zip`): teaches the assistant how to answer financial questions with Fintrack and how to review each investment — concentration, overlapping funds, costs, currency, emergency fund, savings rate, bonus dependence, Spanish tax, mortgage vs investing — with Keep / Review / Watch verdicts. It **asks for your investor profile before giving opinions** and doesn't store it. (#116)
- Payslips can be filtered by type (monthly, bonus, back pay, other) in the API. (#116)

### MCP update

- **Update your MCP command to `v2.15.0`** to get the new tools and prompts: copy it again from Settings → *AI access (MCP)* (Claude Code: `claude mcp remove fintrack` and add it again; Claude Desktop: change the version in the config and restart). Install the skill from `fintrack-advisor.zip` — see README → *AI Access (MCP)* → *Advisor skill*.

## [2.14.0] - 2026-11-16

### Added

- **AI access through MCP.** A local [MCP](https://modelcontextprotocol.io) server (`mcp/`) lets Claude Desktop or Claude Code work with your Fintrack: review your portfolio and position history, explain figures, check dividends against your operations, prepare tax data and — with a write-enabled token — record operations, dividends and interests or review dividend drafts and splits. It runs on your computer and talks to your Fintrack over your own network; nothing is exposed to the internet. 12 read tools and 7 write tools; no tool can delete anything. (#115)
- **Personal access tokens.** Settings → *AI access (MCP)* creates read-only or read-and-write tokens, shows their last use and revokes them. The key is shown once (only a hash is stored) together with ready-to-copy configuration for Claude Code and Claude Desktop, pinned to this release. Tokens can never delete data, reach your profile, password or token settings, or restore backups. (#115)

### Documentation

- README: step-by-step guide to set up and use the MCP (with example questions, permissions and troubleshooting), new features from the last releases and the complete API list. New ADR-009 (splits and dividend drafts) and ADR-010 (MCP and tokens); development protocol updated so API changes keep the MCP in sync. (#115)

### Migration notes

- New `core.ApiToken` table (migration `core/0001_apitoken`, additive only), applied automatically on container start.
- **To use the MCP:** add the address your computer uses to reach the server to `ALLOWED_HOSTS` in `.env` (the MCP calls the backend directly, port `8001`), install [uv](https://docs.astral.sh/uv/) on your computer (`brew install uv`) and copy the configuration from Settings → *AI access (MCP)*. Full guide: README → *AI Access (MCP)*.

## [2.13.0] - 2026-11-16

### Added

- **Dividend drafts from Yahoo Finance.** Fintrack now detects your dividends on Yahoo and prepares drafts with the shares you held on the ex-dividend date (splits included), the estimated gross amount and an estimated withholding based on your previous dividends of that asset. A "Dividends awaiting review" banner on the dashboard and on Dividends lets you **Review** each one — the dividend dialog opens pre-filled so you only check it against your broker, set the payment date and save — or **Dismiss** it (one or all; dismissed drafts are never suggested again). Drafts don't count in reports or tax until accepted. (#114)
  - To avoid duplicating dividends you already track, drafts only cover ex-dates after the latest dividend recorded for each asset (one year back for assets with none), and events already matched by a recorded dividend — usually dated on payment — are skipped.
  - Detection runs daily and on demand (button on Dividends). "Search earlier dividends" on each asset's page looks back to your first purchase.
  - Yahoo amounts are in the quote currency and Yahoo gives the ex-dividend date, not the payment date: both are flagged in the review dialog.

### Migration notes

- New `transactions.DividendSuggestion` table (migration `0008_dividendsuggestion`, additive only), applied automatically on container start. Existing dividends are untouched.

## [2.12.1] - 2026-11-16

### Fixed

- **Lists showed phantom empty pages.** The API ignored the requested page size and always returned 50 rows while Operations, Dividends, Interests and Assets paginated in 25s, so half of the pages offered were empty. Lists now get exactly the 25 rows they paginate. (#113)
- **Totals and pickers stopped at 50 rows.** For the same reason, the tax financial analysis (dividends and interests per year), the payroll analytics and the asset pickers only received the first 50 records. They now receive every row (up to 1,000), so **tax figures for years with more than 50 dividends or interests may change** after updating — they are now complete. (#113)
- **Dividends and Interests search did nothing.** The API had no search filter for them; dividends now search by asset name or ticker and interests by account name. (#112)
- **Searches applied one keystroke late** in Dividends, Interests and Assets (same issue fixed for Operations in 2.12.0). (#112)

### Changed

- The dividend dialog uses the type-to-search asset picker, like Buy / Sell / Gift. (#112)

## [2.12.0] - 2026-11-16

### Added

- **Type-to-search asset picker when adding a trade.** The asset field of the Buy / Sell / Gift dialog used to be a long list of every asset. You can now type part of the name or ticker and the list narrows to the matching assets (case- and accent-insensitive, keyboard friendly). Sells still list only assets you hold, with the shares next to each one, and editing a trade shows its asset already selected. (#111)

### Fixed

- **Operations search filters on the first try.** Typing a search such as "BID" often kept showing every operation until another key was pressed, because the list was fetched with the previous search text and cached as the result of the new one. (#110)

## [2.11.0] - 2026-11-16

### Added

- **Splits are now visible wherever quantities appear.** After v2.10.0 quantities were right but unexplained: the operations list showed buys of 28 and 7 while the portfolio showed 119 shares. (#108)
  - **Position history** on the asset detail page: trades and splits in chronological order with the shares held after each step (e.g. +28 → 28, split 4:1 → 112, +7 → 119), so the current quantity can be reconciled with the broker. Pending splits are listed as "not applied".
  - **Operations list**: applied splits appear as rows on their date, linking to the position history, and trades before a split show what they represent today ("28 → 112 hoy"). Your recorded trades are never modified.
  - **Portfolio**: positions affected by a split carry a "Split" badge; the position dialog shows which split it includes and links to the history.

### Fixed

- **Date and account filters in the operations list had no effect.** The page sent `date_after` / `date_before` / `account` while the API expects `from_date` / `to_date` / `account_id`, so every transaction was always listed. (#109)

## [2.10.0] - 2026-11-16

### Added

- **Stock split support with automatic detection.** Splits used to be invisible to Fintrack: after a split, Yahoo returned the post-split price while the app kept the pre-split quantity, so the position showed a large fake loss (e.g. CrowdStrike 4:1 on 2026-07-02 valued as 1 × $226 instead of 4 × $226). Splits (and reverse splits such as 1:10) are now first-class events per asset: the FIFO/LIFO/WAC engine applies them in chronological order, so the shares held at the split date are multiplied and their unit cost divided — total cost unchanged, no gain realized — while trades before the split keep their original figures and trades after it are taken as already post-split. Sales after a split compute their gain against the adjusted cost. (#107)
- **Auto-detection from Yahoo Finance.** A daily task (plus a "Search Yahoo" button) looks up the splits of your Yahoo-priced assets and suggests only those that happened after your first purchase and while you held shares, including assets with several splits in a row. Suggestions show up in a banner on the dashboard and portfolio to **Apply** or **Dismiss**; dismissed ones are never suggested again. The asset detail page has a new "Splits" section with the split history, manual add/edit/delete and on-demand detection. Splits are included in JSON backup/restore. Translated into all 5 languages. (#107)

### Migration notes

- New `transactions.StockSplit` table (migration `0007_stocksplit`, additive only). It is applied automatically on container start. Existing data is untouched: no split affects your portfolio until you apply it.
- If you previously corrected a split by hand (multiplying the quantity of a buy and dividing its price), dismiss that suggestion — or undo the manual edit and apply the split — so it is not counted twice.

## [2.9.1] - 2026-10-11

### Fixed

- **Hover date on the evolution charts is now localized and correctly capitalized.** The month shown under the net worth evolution header was hardcoded to Spanish ("agosto") in every UI language, and the CSS `capitalize` class uppercased every word ("Agosto De 2026"). It now follows the UI language (`<html lang>`) and only the first letter is capitalized — e.g. "Agosto de 2026", "August 2026", "Août 2026". The equity (RV) evolution chart's hover date gets the same locale fix. (#97)

### Dependencies

- Batch of pending Dependabot updates: `gunicorn` 26 (only drops the unused `eventlet` worker), `psycopg` >=3.3.4, `google-auth` >=2.53.0, `@tanstack/react-query` 5.104.2, `date-fns` 4.4.0, `tailwindcss` / `@tailwindcss/postcss` 4.3.3; dev/CI: `pytest-django`, `factory-boy`, `@types/node`, and GitHub Actions `checkout` / `setup-node` / `setup-python` v7. (#96)

## [2.9.0] - 2026-10-11

### Security

- **Next.js 16.2.3 → 16.3.8.** Fixes a critical middleware/proxy bypass in App Router applications via segment-prefetch routes, cache poisoning of middleware/proxy redirects, and a Server Components denial-of-service. Fintrack's auth gate runs in the Next.js middleware, so the bypass was directly relevant. `npm audit fix` also resolves transitive issues in `sharp` (libvips/libheif/librsvg), `postcss` and `proxy-addr`. Runtime audit goes from 2 critical + 19 high to 0 critical; the 8 remaining highs come from the `shadcn` CLI (glob/ts-morph tooling), which has no upstream fix and is never executed by the app (only its CSS is imported at build time). (#95)

### Added

- **Live header on the net worth evolution chart.** Hovering the dashboard's "Evolución del patrimonio" chart now updates the header with the hovered month — total, investments, cash and period changes (from the first month in range to the hovered one) — plus the month label, matching the equity evolution chart. The floating tooltip is replaced by this header readout; leaving the chart or changing range resets to the latest month. (#93)

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
