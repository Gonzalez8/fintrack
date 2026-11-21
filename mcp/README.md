# Fintrack MCP server

Lets an AI assistant (Claude Desktop, Claude Code or any MCP client) read your Fintrack data, analyse it and — if you allow it — add records. It runs **locally** on your computer over stdio and talks to your Fintrack backend through your own network; Fintrack does not need to be exposed to the internet.

## How it works

```
Claude Desktop / Claude Code ──stdio──▶ fintrack-mcp (your computer) ──HTTP + token──▶ Fintrack backend (:8001)
```

The server is a thin client of the Fintrack REST API. Positions, costs, splits and tax figures come from Fintrack's own engine, so the assistant sees exactly what the app shows.

## Setup

### 1. Create a token in Fintrack

Fintrack → **Settings → AI access (MCP)** → *New token*.

| Scope | What the assistant can do |
|---|---|
| **Read only** (recommended to start) | Read portfolio, operations, dividends, interests, reports and pending reviews. |
| **Read and write** | Also create operations, dividends and interests, accept or dismiss dividend drafts and apply splits. |

No token can delete data, change your password or account, manage tokens, or restore backups. The key is shown once; you can revoke it at any time from the same page.

### 2. Let the MCP reach the backend

The MCP calls the backend directly (port `8001` in `docker-compose.prod.yml`). Add the address you will use to `ALLOWED_HOSTS` in your `.env` and restart:

```bash
ALLOWED_HOSTS=your-domain.com,192.168.1.10
docker compose -f docker-compose.prod.yml up -d
```

Save that address in Settings → *AI access (MCP)* → *Connection to your Fintrack* (with *Test connection*); the generated commands use it. Behind a reverse proxy (Nginx Proxy Manager, Traefik, Caddy…), give the backend its own host (e.g. `fintrack-api.example.com` → port `8001`), add it to `ALLOWED_HOSTS` and save it as the backend URL. With a wildcard certificate use a one-level subdomain: `*.example.com` does not cover `api.fintrack.example.com`.

### 3. Install `uv`

```bash
brew install uv        # macOS — or see https://docs.astral.sh/uv/
```

### 4. Connect your assistant

**Claude Code**

```bash
claude mcp add fintrack \
  --env FINTRACK_URL=http://192.168.1.10:8001 \
  --env FINTRACK_TOKEN=ft_your_token \
  -- uvx --from "git+https://github.com/Gonzalez8/fintrack@vX.Y.Z#subdirectory=mcp" fintrack-mcp
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fintrack": {
      "command": "/opt/homebrew/bin/uvx",
      "args": ["--from", "git+https://github.com/Gonzalez8/fintrack@vX.Y.Z#subdirectory=mcp", "fintrack-mcp"],
      "env": {
        "FINTRACK_URL": "http://192.168.1.10:8001",
        "FINTRACK_TOKEN": "ft_your_token"
      }
    }
  }
}
```

Claude Desktop doesn't inherit your terminal's `PATH`, hence the full path to `uvx` (Homebrew on Apple Silicon; use the output of `which uvx` otherwise). Claude Code runs from your terminal and can use plain `uvx`.

Replace `vX.Y.Z` with your Fintrack version (e.g. `v2.14.0`) so the MCP matches your backend's API. The Settings page shows both snippets with your version and token filled in. To update the MCP after upgrading Fintrack (only needed when the release notes mention MCP changes), use the new tag: in Claude Code `claude mcp remove fintrack` and add it again; in Claude Desktop edit the version and restart.

## Tools

| Tool | Kind | Description |
|---|---|---|
| `fintrack_get_portfolio` | read | Totals, open positions, cash accounts; optionally realized sales |
| `fintrack_get_returns` | read | Annualized money-weighted return (XIRR) of the portfolio and each asset, vs the same money in an index ETF (MSCI World, S&P 500, All-World) |
| `fintrack_list_assets` | read | Assets with ticker, type, currency and price |
| `fintrack_list_accounts` | read | Accounts with type and balance |
| `fintrack_get_position_history` | read | Operations and splits of an asset with the shares held after each step |
| `fintrack_list_transactions` | read | Buy/sell/gift operations (filters: search, type, dates, account) |
| `fintrack_list_dividends` | read | Recorded dividends (filters: year, search) |
| `fintrack_list_interests` | read | Interest income (filters: year, account) |
| `fintrack_list_other_income` | read | Rent, freelance, side jobs, gifts… with totals per type and month |
| `fintrack_get_year_summary` | read | Year-by-year fiscal summary |
| `fintrack_get_net_worth_evolution` | read | Monthly net worth (cash + investments) |
| `fintrack_get_invested_capital_evolution` | read | Money invested at each month end and what was put in or taken out that month |
| `fintrack_get_tax_declaration` | read | Tax-declaration helper for your fiscal country |
| `fintrack_list_pending_reviews` | read | Dividend drafts and detected splits waiting for you |
| `fintrack_check_dividend_shares` | read | Dividends whose share count doesn't match your operations (missing operations); payments on pre-split shares are listed apart |
| `fintrack_get_settings` | read | Base currency, cost methods, fiscal country |
| `fintrack_list_payrolls` | read | Payslips (filters: year, month, type MONTHLY/BONUS/ATRASOS/OTHER) |
| `fintrack_get_payroll_summary` | read | Income per year: gross, net, social security, effective IRPF, bonus and bonus % of fixed salary |
| `fintrack_get_monthly_savings` | read | Savings per month: cash change + money invested = real savings, plus income and estimated spending |
| `fintrack_get_annual_savings` | read | Savings, income and estimated spending per year |
| `fintrack_get_investment_flows` | read | Money invested per month, asset or asset type (e.g. "how much in the S&P 500") |
| `fintrack_list_account_snapshots` | read | Balance history of an account |
| `fintrack_list_savings_goals` | read | Savings goals with projections |
| `fintrack_get_rental_summary` | read | Rented properties (Spain): rent, expenses, taxable net rent and income-tax estimate, to date and projected |
| `fintrack_list_properties` | read | Real estate and mortgages as of today (`mortgage_status` ACTIVE/FINISHED, balance after early amortizations) |
| `fintrack_create_transaction` | write | Record a buy, sell or gift |
| `fintrack_create_dividend` | write | Record a dividend |
| `fintrack_create_interest` | write | Record interest income |
| `fintrack_create_other_income` | write | Record other income (e.g. a gift or freelance invoice) |
| `fintrack_record_rent_payment` | write | Record a rent payment of a property (linked to the lease in force) |
| `fintrack_create_rental_expense` | write | Record an expense of a rented property (IBI, community, repairs…) |
| `fintrack_detect_dividend_drafts` | write | Look up dividends on Yahoo and create drafts |
| `fintrack_accept_dividend_draft` | write | Turn a draft into a dividend with your broker's figures |
| `fintrack_dismiss_dividend_draft` | write | Dismiss a draft |
| `fintrack_restore_dividend_draft` | write | Undo a dismissal (the draft is pending again) |
| `fintrack_apply_split` | write | Apply a detected stock split |
| `fintrack_create_asset` | write | Add a stock, ETF, fund or crypto (ticker, ISIN, currency, AUTO/MANUAL price, countries) |
| `fintrack_update_asset` | write (overwrites) | Change an asset's details or set the price of a MANUAL asset |
| `fintrack_record_account_balances` | write (overwrites) | Save today's (or a date's) balance of one or more accounts as snapshots |

### Prompts

Ready-made analyses (slash commands in Claude Code, e.g. `/mcp__fintrack__fintrack_monthly_review`; prompt menu in Claude Desktop):

| Prompt | What it does |
|---|---|
| `fintrack_monthly_review` | Savings, investments, income and pending items of a month |
| `fintrack_payroll_review` | Salary, bonus, IRPF and year-over-year change |
| `fintrack_portfolio_analysis` | Portfolio and per-investment review for your profile and financial plan (`PERFIL.md` / `PLAN-FINANCIERO.md` if available; asks only what is missing) |

Assets can be referenced by ticker, name or id; accounts by name or id. Write tools are marked as such so your client asks for confirmation before running them; the ones that overwrite existing values (editing an asset, a snapshot of the same account and date) are also flagged as destructive. No tool deletes anything.

## Advisor skill (optional)

`skills/fintrack-advisor/` is a [skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview) that teaches the assistant how to answer financial questions with these tools: which tool fits each question, how to identify index funds, the definitions Fintrack uses, and a portfolio-review method (concentration, overlap, costs, currency, emergency fund, savings rate, bonus dependence, Spanish tax, mortgage vs investing). **Before giving opinions or recommendations it reads your profile and financial plan** — `PERFIL.md` (who you are: age, housing, horizon, risk tolerance, emergency fund, preferences, recording rules, topics to avoid) and `PLAN-FINANCIERO.md` (goals, strategy, rules for falls, roadmap, pending items and a dated decision log), two portable Markdown files in the folder where the assistant runs. It creates them from `templates/` if missing, asks only for what is missing and keeps both updated; figures Fintrack has are always read with the tools, and the files are never stored in Fintrack or external services (add them to `.gitignore`).

Each GitHub release attaches it as `fintrack-advisor.zip`.

- **Claude Code** (personal skills):
  ```bash
  curl -L -o /tmp/fintrack-advisor.zip https://github.com/Gonzalez8/fintrack/releases/download/vX.Y.Z/fintrack-advisor.zip
  mkdir -p ~/.claude/skills && unzip -o /tmp/fintrack-advisor.zip -d ~/.claude/skills/
  ```
- **Claude Desktop / claude.ai**: upload `fintrack-advisor.zip` in the *Skills* section of Settings.

Without the skill everything still works; the `fintrack_portfolio_analysis` prompt covers the basics.

## Privacy

Whatever the assistant reads is sent to the AI provider to produce its answer. Use a read-only token unless you want it to add records, and revoke tokens you no longer use.

## Development

```bash
cd mcp
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/pytest
.venv/bin/ruff check . && .venv/bin/ruff format --check .
```

Tests drive the server through a real in-process MCP client against a mocked Fintrack API.
