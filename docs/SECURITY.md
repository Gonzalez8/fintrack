# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer at the address listed in the repository profile
3. Include a description of the vulnerability, steps to reproduce, and potential impact
4. Allow up to 72 hours for an initial response

## Security Measures

### Authentication & Authorization

- **JWT tokens** stored in `httpOnly` cookies — not accessible to JavaScript (XSS-safe)
- **SameSite=Lax** cookie attribute prevents CSRF attacks
- **Token rotation**: refresh tokens are rotated on each use and old tokens are blacklisted
- **Offline copy on the device**: the service worker (`public/sw.js`) keeps the last pages and `GET /api/proxy/*` responses in the browser cache so the installed app works without connection. Sign-in (`/api/auth/*`) and backups are never cached, the copy is deleted on logout (`clearOfflineData()`), and the device's own lock protects it otherwise. A session that simply expires without logging out leaves the copy until the next logout
- **Session endpoints ignore the access cookie**: login, register, Google sign-in, refresh and logout run without authentication (`authentication_classes = []`), so a stale or invalid access cookie never blocks signing in, and logout always clears the cookies. Every other endpoint still rejects an invalid token with 401
- **Rate limiting**: Authentication endpoints have per-scope throttling (login, register, password change)
- **Multi-tenancy isolation**: Every database query is filtered by the authenticated user's `owner` FK
- **Personal API tokens** (MCP server, scripts): `Authorization: Bearer ft_…`, stored as SHA-256 hashes, scoped `READ` or `WRITE`, revocable in Settings. Tokens can never reach `/api/auth/` (profile, password, token management) or restore backups, can never `DELETE`, and `READ` tokens only use safe methods. See [ADR-010](adr/010-mcp-server-and-api-tokens.md)

### Transport Security (Production)

- **HSTS** enabled with 1-year max-age (`SECURE_HSTS_SECONDS = 31536000`)
- **SSL redirect** enforced via `SECURE_SSL_REDIRECT`
- **Secure cookies**: `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `JWT_AUTH_COOKIE_SECURE` all set to `True`

### Data Protection

- **Decimal precision**: All monetary values use Python's `Decimal` type — never floating point
- **Input validation**: Django REST Framework serializers validate all input with type coercion and constraints
- **SQL injection prevention**: Django ORM parameterizes all queries; no raw SQL used
- **CORS**: Configurable allowed origins with credentials support

### Production Hardening Checklist

- [ ] Set a strong, unique `DJANGO_SECRET_KEY`
- [ ] Set `ALLOWED_HOSTS` to your domain(s) only
- [ ] Set `CSRF_TRUSTED_ORIGINS` to your domain(s) only
- [ ] Enable SSL/TLS via reverse proxy (Nginx, Caddy, etc.)
- [ ] Disable `DEBUG` mode (`DJANGO_SETTINGS_MODULE=config.settings.production`)
- [ ] Use strong PostgreSQL credentials
- [ ] Restrict Redis access to internal network only
- [ ] Set `ALLOW_REGISTRATION=false` if single-user deployment
- [ ] Review `CORS_ALLOWED_ORIGINS` settings
- [ ] Keep dependencies up to date (Dependabot is configured)

### Dependency Scanning

- **Dependabot** is configured to scan Python (pip), JavaScript (npm), and GitHub Actions dependencies weekly
- Pull requests are automatically created for security updates

### Secrets Management

The following should **never** be committed to the repository:
- `.env` files (use `.env.example` as a template)
- Database credentials
- JWT secret keys
- Google OAuth client secrets
- API keys of any kind

The `.gitignore` is configured to exclude `.env` files. The CI uses `DJANGO_SECRET_KEY=ci-secret-key-not-for-production` which is safe for testing only.

## Database Backups

### Manual Backup

```bash
docker compose exec db pg_dump -U fintrack fintrack > backup_$(date +%Y%m%d).sql
```

### Manual Restore

```bash
docker compose exec -T db psql -U fintrack fintrack < backup_YYYYMMDD.sql
```

### JSON Backup (Application-level)

The importer app provides JSON backup/restore via the API:
- **Export**: `GET /api/backup/` — downloads all user data as JSON
- **Import**: `POST /api/restore/` — restores from JSON backup

### Recommended Backup Strategy

1. Schedule daily PostgreSQL dumps via cron
2. Store backups in an encrypted off-site location
3. Test restoration quarterly
4. Keep at least 30 days of daily backups
