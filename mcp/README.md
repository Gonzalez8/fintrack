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
  -- uvx --from "git+https://github.com/Gonzalez8/fintrack#subdirectory=mcp" fintrack-mcp
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fintrack": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/Gonzalez8/fintrack#subdirectory=mcp", "fintrack-mcp"],
      "env": {
        "FINTRACK_URL": "http://192.168.1.10:8001",
        "FINTRACK_TOKEN": "ft_your_token"
      }
    }
  }
}
```

The Settings page shows both snippets with your token filled in.

## Tools

| Tool | Kind | Description |
|---|---|---|
| `fintrack_get_portfolio` | read | Totals, open positions, cash accounts; optionally realized sales |
| `fintrack_list_assets` | read | Assets with ticker, type, currency and price |
| `fintrack_list_accounts` | read | Accounts with type and balance |
| `fintrack_get_position_history` | read | Operations and splits of an asset with the shares held after each step |
| `fintrack_list_transactions` | read | Buy/sell/gift operations (filters: search, type, dates, account) |
| `fintrack_list_dividends` | read | Recorded dividends (filters: year, search) |
| `fintrack_list_interests` | read | Interest income (filters: year, account) |
| `fintrack_get_year_summary` | read | Year-by-year fiscal summary |
| `fintrack_get_net_worth_evolution` | read | Monthly net worth (cash + investments) |
| `fintrack_get_tax_declaration` | read | Tax-declaration helper for your fiscal country |
| `fintrack_list_pending_reviews` | read | Dividend drafts and detected splits waiting for you |
| `fintrack_check_dividend_shares` | read | Dividends whose share count doesn't match your operations (missing operations) |
| `fintrack_create_transaction` | write | Record a buy, sell or gift |
| `fintrack_create_dividend` | write | Record a dividend |
| `fintrack_create_interest` | write | Record interest income |
| `fintrack_detect_dividend_drafts` | write | Look up dividends on Yahoo and create drafts |
| `fintrack_accept_dividend_draft` | write | Turn a draft into a dividend with your broker's figures |
| `fintrack_dismiss_dividend_draft` | write | Dismiss a draft |
| `fintrack_apply_split` | write | Apply a detected stock split |

Assets can be referenced by ticker, name or id; accounts by name or id. Write tools are marked as such so your client asks for confirmation before running them.

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
