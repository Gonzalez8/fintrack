# ADR-011: Other Income and Estimated Spending

## Status

Accepted

## Date

2026-11-17

## Context

Savings in Fintrack are measured from balances: real savings = change in cash (account snapshots) + money newly invested. Income only existed as payslips, dividends and interests. Users with money coming from elsewhere — renting out a flat, freelance work, side jobs, family help — saw savings larger than their salary, and the AI assistant (which compares both) kept reporting that the figures "don't add up". Some of that income is not declared for tax, and declaring it (e.g. rent) needs much more than the amount received, so it cannot be modelled as a tax item.

Users also do not record expenses, so there was no view of how much they spend.

## Decision

### A generic `OtherIncome` record

- `OtherIncome` (in `apps/transactions`, next to `Dividend` and `Interest`): `date`, `category` (`RENTAL`, `SELF_EMPLOYMENT`, `SIDE_JOB`, `GIFT`, `OTHER`), `description`, `amount` (what was actually received, > 0), optional `account` (`SET_NULL`: deleting an account keeps the income) and `notes`.
- One record per payment. Amounts vary month to month (a rent of 360–400 €), so there are no recurring templates; the UI offers "repeat last" (same type, description, account and flag; new date and amount) and the MCP can record it from a sentence.
- **Other income never reaches the tax views** (year summary, Modo Renta). v2.19.0 shipped an informational `declared` flag; it was dropped in v2.19.1 (`transactions/0011`) because it suggested a tax effect it never had. Declaring a kind of income — e.g. rent as *rendimientos del capital inmobiliario* in Spain, with deductible expenses, depreciation, the housing reduction and a year-end projection — will be its own feature with the data the form needs, not a flag here.
- CRUD at `/api/other-incomes/` (filters `year`, `from_date`, `to_date`, `category`, `account_id`, `search`), included in backup/restore. Creating, editing or deleting invalidates the financial caches like any `OwnedByUserMixin` view.

### Income and estimated spending in the savings reports

- Each month of `monthly_savings` adds `income_payroll` (net payslips, month of `period_end`), `income_other`, `income_investment` (net dividends by date + net interests by `date_end`) and `income_total`.
- `estimated_spending = income_total − real_savings`, `null` when there is no income that month or no previous month to compute savings from. `annual_savings` sums the same fields per year (`total_income`, `total_estimated_spending`).
- It is an estimate, labelled as such in the UI: realised gains from sales, loans, transfers between people or accounts without snapshots distort it, and mortgage principal paid from cash counts as spending.

### AI assistant

- MCP `fintrack_list_other_income` (rows + totals per type and month) and `fintrack_create_other_income`. The savings tools document the new fields, and the server instructions and advisor skill tell the assistant to add other income before claiming savings and salary do not match.

## Consequences

- Savings, income and spending can be explained without tracking every expense.
- Other income is stored in the user's own self-hosted instance like any other figure; nothing leaves it unless the user shares it (e.g. through the AI assistant).
- The estimate is only as good as the data: missing snapshots or payslips show up as odd spending figures, which is also a useful data-quality signal.
