# ADR-010: MCP Server and Personal API Tokens

## Status

Accepted

## Date

2026-11-16

## Context

The user wants an AI assistant (Claude Desktop / Claude Code) to review their data, give advice and add records. Fintrack is self-hosted on a home network and **not exposed to the internet**. The API only accepted the browser session (JWT in httpOnly cookies, see ADR-002), which a desktop tool cannot use.

## Decision

### A local MCP server over stdio

- New package `mcp/` (`fintrack_mcp`, MCP Python SDK 2.x `MCPServer`), launched by the assistant on the user's computer through `uvx` and talking to the backend over the local network.
- A remote (streamable HTTP) MCP was rejected: claude.ai would need Fintrack reachable from the internet over HTTPS plus OAuth.
- The server is a **thin client of the REST API**: positions, splits, costs and tax figures come from the backend engine; no business logic is duplicated. 12 read tools and 7 write tools, prefixed `fintrack_`, with MCP annotations (`readOnlyHint`, `destructiveHint=false`). **No delete tools.**
- The install command is pinned to the release tag (`…/fintrack@vX.Y.Z#subdirectory=mcp`), so the tools always match the deployed API. The frontend reads its version from `package.json` to fill it in.

### Personal access tokens

- `ApiToken` per user with scope `READ` or `WRITE`; only the SHA-256 of the key is stored and the key (`ft_…`) is shown once. Created and revoked from Settings (`/api/auth/api-tokens/`).
- `ApiTokenAuthentication` runs **before** the cookie JWT (which would reject any non-JWT bearer) and enforces all rules itself, because several views override `permission_classes`:
  - tokens never reach `/api/auth/` (profile, password, token management) or `/api/backup/import/`;
  - tokens can never `DELETE`;
  - `READ` tokens only use safe methods.

## Consequences

- The assistant sees exactly what the app shows, with the user's own multi-tenancy rules.
- **Every API change must update the MCP** in the same PR (CLAUDE.md → Change Propagation Checklist; enforced by `/pr-review`).
- Data the assistant reads is sent to the AI provider; the UI and README say so and recommend read-only tokens.
- The backend port (8001 in production) must be reachable from the user's computer and listed in `ALLOWED_HOSTS`.
