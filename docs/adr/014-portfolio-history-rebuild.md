# ADR-014: Rebuilding the Portfolio History

## Status

Accepted

## Date

2026-11-23

## Context

`PortfolioSnapshot` rows only exist from the day Fintrack started taking them. Operations entered afterwards go back years, so the equity chart, the net worth evolution (which falls back to cost for months without a snapshot) and the index comparison chart (ADR-013) all start late: a user who was briefly at a loss before that day cannot see it.

## Decision

- **Rebuild, never rewrite**: `apps/portfolio/history.py` adds one snapshot per past trading day that has none (local date), from the first operation to yesterday (today belongs to the regular task). Existing snapshots are never changed or deleted, so running it twice adds nothing. One `batch_id` per run.
- **Shares and cost** from `holdings_timeline(user, method)` in the portfolio engine, with the user's `cost_basis_method` (the one regular snapshots use) and applied splits. `investment_cost_timeline` is now a sum over it, so both share one lot replay.
- **Prices**: Yahoo daily closes (`fetch_daily_closes`, the same cached download as the benchmark) for Yahoo-priced assets. Yahoo divides old closes by later splits; they are multiplied back by the applied splits after that day so they match the shares held then. Assets without Yahoo history use the price of their last operation on or before the day (scaled by splits in between), or their average cost. Trading days are the union of the Yahoo dates; weekdays when no asset has Yahoo prices.
- **Preview first**: `GET /api/portfolio/rebuild-history/` returns what would be added (days, range, lowest unrealized %, assets without Yahoo prices, whether the retention purge would delete them) and writes nothing; `POST` adds it. Read tokens can preview; write tokens can rebuild (it never deletes). Settings has a card for it and the MCP has `fintrack_preview_history_rebuild` / `fintrack_rebuild_history`.
- No automatic run: it downloads years of prices and changes what several charts show, so the user decides.

## Consequences

- Positive: charts and the index comparison cover the whole investing history; the AI assistant can do it after showing the preview.
- Negative: rebuilt values use daily closes, not the moment of a real snapshot (≈1 % apart in practice); no currency conversion, like the rest of the app. A backdated operation added later leaves the snapshots after it unchanged; recomputing existing snapshots from a date is left for when it is needed.
