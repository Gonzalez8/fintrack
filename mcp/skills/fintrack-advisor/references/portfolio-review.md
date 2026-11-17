# Portfolio review checklist

Use with the investor profile. For each point: what the data says → why it matters for *this* user → what to do (if anything). Skip points that don't apply.

## 1. Allocation and concentration

- Weight of each position (`fintrack_get_portfolio` → `weight`). Flag single stocks above ~10 % and the top-5 share of the portfolio.
- Equities vs bonds/fixed income vs cash vs crypto vs real estate (`fintrack_list_properties`, cash accounts). Compare with the horizon and risk answer: short horizon or low tolerance → large equity/crypto share is a mismatch.
- Crypto and single stocks are the high-volatility bucket; size it against the "would you sell after −30 %" answer.

## 2. Diversification and overlap

- Region, sector and currency exposure inferred from the asset names, tickers and ISIN prefix (US…, IE…, ES…). Ask when unclear.
- Overlap: S&P 500 + MSCI World (or All-World) duplicates US large caps (~60–70 % of World is US); several world trackers add little. Individual US tech stocks on top of those funds increase the same exposure.
- Home bias or lack of it (e.g. heavy Spanish stocks).

## 3. Costs and behaviour

- Commissions relative to trade size from operations: fees above ~1 % of the amount invested suggest batching contributions or a cheaper product. Fund running costs (TER) are not in Fintrack — mention checking them.
- Regularity: monthly flows (`fintrack_get_investment_flows`, group_by month). Steady periodic investing is positive; long gaps or bursts after rallies are worth noting without judging.
- Selling patterns from realized sales (`include_realized_sales`): selling winners early, holding losers.

## 4. Performance in context

- Unrealized P&L % per position and total, with the holding period from the position history. Don't extrapolate past returns.
- Compare a position's result with its role (core index fund vs speculative bet), not with the best performer.

## 5. Cash, emergency fund and savings capacity

- Cash in accounts vs the emergency target (months × monthly spending from the profile). Too little → build it before adding risk; far too much idle cash → opportunity cost vs goals.
- Savings rate: real savings (`fintrack_get_annual_savings`) ÷ net income (payroll net + dividends + interests). Trend over the years.

## 6. Income

- Dependence on bonus (`bonus_vs_monthly_pct`): a large variable share argues for investing the bonus deliberately and not relying on it for fixed costs.
- Effective IRPF and its evolution; pay-rise trend year over year.

## 7. Tax (when the fiscal country is Spain — check `fintrack_get_settings`)

- Realized gains and losses of the year (`fintrack_get_year_summary`) — offsetting gains with losses before year end; the two-month rule (losses are not deductible if the same securities are repurchased within two months).
- Foreign dividend withholding above the treaty rate is not recovered through the double-taxation deduction (e.g. Switzerland, Germany); note where withholding is high.
- Dividends keep two withholdings apart: `tax` (at source, abroad) feeds the double-taxation deduction; `domestic_tax` (the Spanish 19 % a Spanish broker adds) is a Spanish retention credited in full. If a foreign dividend's net doesn't add up, the Spanish 19 % may be missing or lumped into `tax`.
- Spanish investment funds can be switched (traspaso) without taxing gains; ETFs cannot.

## 8. Mortgage and debt

- Mortgage rate vs expected long-term return of the portfolio: present the trade-off of early amortization vs investing (certainty and peace of mind vs expected return), tied to the risk answer. Don't decide for the user.

## Verdict per investment

- **Keep** — fits the role and the profile; no action.
- **Review** — mismatch with profile or goals, excessive weight, duplicate exposure, high costs: say what to review and the options.
- **Watch** — fine for now but with a specific risk to monitor (concentration growing, single-company risk, currency).

Recommendations are directional ("reduce the weight of…", "direct new contributions to…"), never price targets or timing.
