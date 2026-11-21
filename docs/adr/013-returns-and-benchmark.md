# ADR-013: Annualized Return (XIRR) and Index Benchmark

## Status

Accepted

## Date

2026-11-21

## Context

Fintrack showed the gain over cost (+20 %), which says nothing about time: money invested last month counts as much as money invested five years ago. Users who contribute monthly want the figure they can compare with a deposit, inflation or a fund — the annualized return of *their* money — and to know whether picking assets beat simply buying an index fund with the same money.

## Decision

- **Money-weighted return (XIRR)**, not time-weighted: it answers "what did my money earn", including the timing of the user's own contributions. Computed in `apps/portfolio/returns.py` from investor-side cash flows: BUY −(qty×price+commission+tax), GIFT −(qty×price) (shares came in with that value), SELL +(qty×price−commission−tax), dividends +net, today +market value. Solved by bisection; rates are floats (ratios), amounts Decimal.
- **Per asset** with the same flows, including sold assets (market value 0).
- **Less than a year** is flagged (`reliable: false`) instead of hidden: annualizing a few weeks exaggerates.
- **Benchmark as a ghost portfolio**: each buy/gift buys units of an accumulating EUR ETF (MSCI World EUNL.DE, S&P 500 SXR8.DE, FTSE All-World VWCE.DE) for the same amount on that day, each sale sells units for the same proceeds (never more than held). Dividends are not replayed: an accumulating ETF already reinvests its own, so the user's flows (dividends included) vs the ETF's is like for like. Fund fees are in the ETF price.
- **Prices from Yahoo**, fetched on request and cached globally for 6 hours (public data, not per user). If unavailable the response has `benchmark: null` and the UI says so; nothing else fails. Operations older than the ETF are priced at its first close and flagged (`starts_late`).
- No stored setting for the benchmark: the user switches it in the comparison dialog; the API takes `?benchmark=`.
- **UI kept light**: the % gained stays the main figure. The Portfolio summary card shows the portfolio's % a year small under it; a position's own annual return appears when it is opened (`PositionDetailDialog`), and the index comparison lives in its own dialog (`ReturnsDetails`). The API still returns sold assets, used by the AI assistant.

## Consequences

- Positive: a comparable annual figure and a fair answer to "would an index fund have done better?", also for the AI assistant (`fintrack_get_returns`).
- Negative: no year-by-year return yet (needs values at each year start, only available since snapshots exist) and no chart over time (the user's past portfolio values before snapshots are unknown).
- Multi-currency is not handled (see CLAUDE.md): flows are summed in the asset's currency, like the rest of the app.
