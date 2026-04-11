# Release Readiness Checklist

Use this checklist before every Fintrack release. All items must PASS before
tagging. Items marked WARN require user acknowledgment but do not block.

## Repository State

- [ ] On `main` branch
- [ ] Working tree is clean (`git status --short` returns empty)
- [ ] Local main is up to date with remote (`git fetch origin main --dry-run`)
- [ ] All intended commits are pushed to remote
- [ ] No open PRs that should be included in this release

## Code Quality — Backend

- [ ] Tests pass: `docker compose exec backend pytest --tb=short -q`
- [ ] Lint passes: `docker compose exec backend ruff check .`
- [ ] Format check passes: `docker compose exec backend ruff format --check .`

## Code Quality — Frontend

- [ ] Build succeeds: `docker compose exec frontend npm run build`
- [ ] Lint passes: `docker compose exec frontend npm run lint`

## Security Audit

- [ ] Frontend: `docker compose exec frontend npm audit --audit-level=high`
  - PASS: no critical/high in runtime deps
  - WARN: moderate or dev-only vulnerabilities (informational, does not block)
  - FAIL: critical/high in runtime dependencies (blocks release)
- [ ] Backend: `docker compose exec backend pip-audit` (if available)
  - Same severity rules as frontend
  - If pip-audit is not installed, note as SKIP (does not block)

## Migration Safety

- [ ] No unapplied migrations: `docker compose exec backend python manage.py showmigrations --list | grep "\[ \]"`
- [ ] No missing migration files: `docker compose exec backend python manage.py makemigrations --check --dry-run`
- [ ] New migrations reviewed for destructive operations:
  - `RemoveField` — data loss risk, verify data was migrated first
  - `DeleteModel` — permanent table drop, verify no references remain
  - `RenameField` — may break queries if accessed by string name
  - `AlterField` (type change) — may fail on existing data
  - `RunSQL` without `reverse_sql` — irreversible migration
  - `RunPython` without `reverse_code` — irreversible migration

## Version Files

- [ ] `CHANGELOG.md` updated with new version section at the top
- [ ] CHANGELOG follows Keep a Changelog format
- [ ] CHANGELOG date is today's date (YYYY-MM-DD)
- [ ] CHANGELOG entries are specific and user-focused (not git log verbatim)
- [ ] Breaking Changes section is first (when applicable)
- [ ] `frontend/package.json` version matches new version (no `v` prefix)
- [ ] Release commit created: `chore(release): vX.Y.Z — description`

## Release Execution

- [ ] Tag created: `git tag vX.Y.Z`
- [ ] Main pushed: `git push origin main`
- [ ] Tag pushed: `git push origin vX.Y.Z`
- [ ] GitHub Release created with `gh release create`
- [ ] Release notes match CHANGELOG content
- [ ] Correct flag used: `--latest` for stable, `--prerelease` for pre-release

## Post-Release Verification

- [ ] `git describe --tags --abbrev=0` shows new tag
- [ ] `gh release view vX.Y.Z` shows the release
- [ ] Docker publish workflow triggered: `gh run list --workflow=docker-publish.yml --limit=1`
- [ ] Docker workflow completed successfully (check after ~5 min)

## Abbreviated Checklist (Hotfix Only)

For urgent hotfixes, use this reduced checklist:

- [ ] On `main` branch, working tree clean
- [ ] Tests pass (backend + frontend)
- [ ] Frontend builds
- [ ] CHANGELOG updated
- [ ] package.json updated
- [ ] Tag, push, GitHub Release created
- [ ] Docker workflow triggered

Skip: security audit, lint checks, migration deep review (unless the hotfix
includes migrations).
