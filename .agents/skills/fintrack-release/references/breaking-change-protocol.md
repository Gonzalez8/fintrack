# Breaking Change Protocol

A major version bump is a significant event. It signals to users that upgrading
may require changes on their end. This protocol ensures breaking changes are
deliberate, well-documented, and properly communicated.

## When This Applies

This protocol activates when any of the following are detected:

1. A commit with `!` suffix (e.g., `feat!:`, `fix!:`)
2. A commit with `BREAKING CHANGE:` in the footer
3. Heuristic detection flags (see Phase 1)

## Phase 1: Impact Assessment

Analyze what is actually breaking and who is affected.

### Automatic Checks

```bash
# Find commits with breaking change indicators
git log $(git describe --tags --abbrev=0)..HEAD --grep="BREAKING CHANGE" --oneline
git log $(git describe --tags --abbrev=0)..HEAD --format="%s" | grep '!:'

# Check for API changes (serializer field removals/renames)
git diff $(git describe --tags --abbrev=0)..HEAD -- 'backend/apps/*/serializers.py'

# Check for model field removals
git diff $(git describe --tags --abbrev=0)..HEAD -- 'backend/apps/*/models.py' | grep -E '^\-.*Field\('

# Check for URL pattern changes
git diff $(git describe --tags --abbrev=0)..HEAD -- 'backend/config/urls.py' 'backend/apps/*/urls.py'

# Check for runtime dependency major bumps
git diff $(git describe --tags --abbrev=0)..HEAD -- 'backend/requirements.txt' 'frontend/package.json'

# Check for environment variable changes
git diff $(git describe --tags --abbrev=0)..HEAD -- 'docker-compose.prod.yml' '.env.example'

# Check for destructive migrations
git diff --name-only $(git describe --tags --abbrev=0)..HEAD -- '*/migrations/*.py' | while read f; do
  grep -l 'RemoveField\|DeleteModel\|RenameField\|AlterField' "$f" 2>/dev/null
done
```

### Impact Report

Present findings in this format:

```
## Breaking Change Impact Assessment

### Direct Breaking Changes (from commit messages)
- <hash> feat!: description — [what breaks]

### Heuristic Warnings (may or may not be breaking)
- Serializer field removed: `AssetSerializer.legacy_field`
- Migration: `RemoveField` in `0042_remove_asset_legacy`
- Runtime dependency: Django 5.1 → 6.0 (major bump)
- Env var removed: `LEGACY_AUTH_MODE`

### Affected Areas
- [ ] API endpoints (external consumers)
- [ ] Database schema (migration required)
- [ ] Environment variables (deployment config change)
- [ ] Docker image behavior (runtime change)
- [ ] Frontend API contract (BFF layer)

### Users Affected
- Self-hosted users running docker-compose.prod.yml
- Anyone consuming the API directly (if applicable)
```

## Phase 2: User Confirmation

Present the impact assessment and ask explicitly:

> "This release includes breaking changes that will bump the major version from
> vX to v(X+1).0.0. Here's what breaks: [summary]. Users upgrading will need to:
> [migration steps]. Do you want to proceed with a major bump?"

The user MUST explicitly confirm. If they hesitate, explore alternatives:

- Can the breaking change be made backward-compatible?
- Can it be behind a feature flag temporarily?
- Can it be split into a deprecation (this release) + removal (next major)?

### Deprecation-First Strategy

For non-urgent breaking changes, prefer this two-release approach:

1. **Release vX.Y.0:** Add deprecation warnings. Old behavior still works.
   ```python
   import warnings
   warnings.warn("legacy_field is deprecated, use new_field", DeprecationWarning)
   ```
2. **Release v(X+1).0.0:** Remove deprecated functionality.

This gives users time to migrate and reduces upgrade friction.

## Phase 3: Documentation

If the user confirms the major bump, ensure these documentation pieces exist
before tagging:

### CHANGELOG Entry

The `### Breaking Changes` section MUST be first in the version entry and MUST
include:

- What changed
- Why it changed
- What users need to do to upgrade

Example:

```markdown
## [3.0.0] - 2026-04-15

### Breaking Changes
- **API:** Removed `/api/v1/legacy-assets/` endpoint. Use `/api/assets/` instead.
  Existing integrations must update their API calls.
- **Database:** `Asset.legacy_category` field removed. Run migrations before
  starting the new version. Data from this field was migrated to `Asset.category`
  in v2.4.0.
- **Environment:** `LEGACY_AUTH_MODE` environment variable no longer supported.
  Remove it from your `.env` or `docker-compose.prod.yml`.
```

### Migration Notes in GitHub Release

The GitHub Release body should include a prominent upgrade section:

```markdown
## Upgrade Guide

### From v2.x to v3.0.0

1. **Before upgrading:** Back up your database
2. **Environment:** Remove `LEGACY_AUTH_MODE` from your environment
3. **Database:** Migrations will run automatically on container start
4. **API:** Update any direct API calls from `/api/v1/legacy-assets/` to `/api/assets/`

### Docker Compose users
```bash
# Pull new images
docker compose -f docker-compose.prod.yml pull
# Apply migrations (happens automatically on start)
docker compose -f docker-compose.prod.yml up -d
```
```

## Checklist

Before proceeding with a major version release:

- [ ] All breaking changes identified (commit messages + heuristics)
- [ ] Impact assessment presented to user
- [ ] User explicitly confirmed major bump
- [ ] Deprecation-first strategy evaluated (and rejected or applied)
- [ ] CHANGELOG has Breaking Changes section with upgrade instructions
- [ ] GitHub Release notes include upgrade guide
- [ ] Migration reversibility verified (in case rollback is needed)
