# ADR-012: Rental Management and Spanish Rental Tax

## Status

Accepted

## Date

2026-11-17

## Context

Users who rent out a flat want to manage it (contract, payments, expenses) and know, during the year, how much it yields and how much it adds to their income tax. Until now rent could only be stored as other income (ADR-011), with no link to the property, its costs or the tax form. Spanish rental income (*rendimientos del capital inmobiliario*) needs much more than the rent: deductible expenses with a cap, depreciation from the acquisition and cadastral values, a reduction that depends on the contract, imputation of empty days and the user's other income to estimate the tax.

## Decision

### Data (generic, in `apps/realestate`)

- `Property` gains the tax facts of the building: `acquisition_costs`, `cadastral_value`, `cadastral_construction_value`, `cadastral_revised`, `furniture_value` and `ownership_pct` (all optional, additive).
- `Lease`: property, tenant, `start_date`/`end_date`, `monthly_rent`, `deposit`, `reduction` regime and `rented_share_pct` (a room vs the whole home).
- `RentalExpense`: property, date, category (`TAXES`, `COMMUNITY`, `INSURANCE`, `REPAIRS`, `FINANCING`, `UTILITIES`, `SERVICES`, `IMPROVEMENT`, `OTHER`), amount.
- **Rent payments are `OtherIncome` rows with a `lease` FK** (`SET_NULL`). One record serves both purposes: savings/spending (ADR-011) and the rental tax. The "repeat last"/"record payment" flows prefill the lease's rent.
- Everything is in backup/restore; other incomes are linked to their lease after leases are restored.

### Calculation (Spanish, in the ES tax adapter)

`reports/tax_adapters/es_rental.py` keeps the country rules out of the generic models (ADR-007):

- `compute_rental(RentalInputs)` is pure. Interest + repairs are deductible up to the income (excess carried forward 4 years; earlier excess is an input, not tracked). Year-round costs of the whole property (IBI, community, insurance, interest) are prorated by the days rented within the period the figures cover (`period_days`) and by `rented_share_pct`; other costs count as entered. Depreciation: 3 % of max(acquisition price + costs, cadastral value) × construction share of the cadastral value + improvements; furniture 10 %; both accrue per day rented over the year. Reduction (0/50/60/70/90 %) only on a positive net. Empty days impute 1.1 % (2 % if not revised) of the cadastral value. Everything is scaled by `ownership_pct`.
- The extra income tax is an **estimate**: an approximate combined state + regional general scale applied to the rent on top of a payslip-based general base (subject pay − social security − 2,000 €, extrapolated to 12 months for the current year). Regional scales, personal allowances and other income are not modelled; the UI says so.
- `rental_overview(user, year)` builds two scenarios per property with a lease that year: **to date** (records up to today) and **projected** (remaining rent of the lease, recurring costs not yet paid taken from last year, full-year mortgage interest). Mortgage interest of a calendar year comes from the property's mortgage schedule (`interest_in_year`), unless `FINANCING` expenses were recorded (e.g. from the bank certificate). Months of the lease without a recorded payment are listed.
- Exposed by the ES adapter (`rental_overview`, `rental_simulate`) at `GET /api/rental/overview/` and `POST /api/rental/simulate/` (404 for fiscal countries without it), and as the `rental_income` block of the Modo Renta (to-date figures).

### UI and assistant

- Properties → **Rental** tab: property tax data, leases, payments and expenses of the year, the tax result (to date vs projected), a simulator where every input is editable (server recomputes; nothing is saved) and the difference against the projection.
- MCP: `fintrack_get_rental_summary`, `fintrack_record_rent_payment` (lease in force on the date), `fintrack_create_rental_expense`.

## Consequences

- One place to manage a rental and see its after-tax result during the year, consistent with the Modo Renta block.
- The figures are as good as the inputs: missing cadastral data disables depreciation (warned), unrecorded payments show as missing months, and the tax is approximate by design.
- Other countries can add their own rental rules behind the adapter without touching the models or the screen's data entry.
