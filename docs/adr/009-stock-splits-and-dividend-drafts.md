# ADR-009: Stock Splits and Dividend Drafts from Yahoo Finance

## Status

Accepted

## Date

2026-11-16

## Context

Two kinds of corporate events reach the user through the broker but not through Fintrack:

- **Stock splits.** Yahoo returns post-split prices while Fintrack kept the pre-split quantity, so a 4:1 split (CrowdStrike, 2026-07-02) showed a 75 % fake loss.
- **Dividends.** Every payment had to be typed by hand; it is easy to forget some, and the shares and gross amount are tedious to work out.

Yahoo Finance exposes both histories (`Ticker.splits`, `Ticker.dividends`), but its data is not authoritative for the user's account: the ex-dividend date is not the payment date, amounts are in the quote currency, withholding is unknown and dividend amounts are **adjusted for later splits**. Silently writing Yahoo data into the user's books would corrupt them.

## Decision

**Detect, suggest, let the user decide.** Neither events nor drafts change the books until the user accepts them.

### Stock splits

- `StockSplit` (per asset, `date`, `ratio_to:ratio_from`, status `PENDING`/`APPLIED`/`DISMISSED`, source `MANUAL`/`AUTO`). Recorded transactions are **never rewritten**.
- The cost-basis engine interleaves `APPLIED` splits with transactions chronologically. A split is applied **before** trades on its own date (those already happen at post-split prices) and scales the lots held at that moment: `qty × factor`, `unit cost ÷ factor`, total cost unchanged, nothing realized. The same logic runs in lot-based, WAC (incl. per-account quantities) and `compute_investment_cost_by_month`.
- Detection (daily task + on demand) creates `PENDING` splits only after the first purchase and when shares were held; held quantity replays earlier splits so two consecutive splits are both found.
- Visibility: `position_history` (operations + splits with shares after each step), `split_factor` on each transaction, applied splits on portfolio positions.

### Dividend drafts

- `DividendSuggestion` is a **separate model** from `Dividend`, so drafts can never leak into reports or tax figures. Accepting one creates the real `Dividend` from the user's reviewed figures (`POST /api/dividend-suggestions/{id}/accept/`) and links it.
- Rules to avoid duplicating existing data:
  1. Only ex-dates after the latest recorded dividend of the asset; assets with none look back one year. `backfill` (one asset, on demand) goes back to the first purchase.
  2. Skip Yahoo events covered by a recorded dividend: window `[ex − 7 days, next ex-date)` because users record on the payment date; matched one-to-one so monthly payers do not cross-match. Never re-suggest a reviewed draft; pending drafts later covered by a manual record are dismissed.
  3. Only when shares were held on the ex-date.
- Shares are those held on the ex-date (splits applied); Yahoo's split-adjusted amount is scaled back by the splits on or after the ex-date (BYD 2025: 1.4453 → 4.3359 HKD). Withholding is estimated from the asset's last four dividends, or left empty.

## Consequences

- The user's records stay authoritative; Yahoo only accelerates entry and catches omissions.
- Reports, tax and the MCP see splits through the engine — no consumer recomputes quantities.
- Yahoo coverage varies by listing; assets in `MANUAL` price mode are never queried.
- Amounts in foreign quote currencies still need the user's broker figures (the review dialog says so).
