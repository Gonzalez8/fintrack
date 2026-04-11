# Rollback Procedures

Complete playbook for reverting a bad Fintrack release. Choose the scenario that
matches your situation and follow the steps in order.

## Decision Matrix

```
START
  |
  +-- Was the Docker image already built and pulled by anyone?
  |     NO --> Scenario A: Quick Retract
  |     YES --> Was there a database migration in this release?
  |               NO --> Scenario B: Hotfix Patch
  |               YES --> Scenario C: Full Rollback with Migration Revert
```

---

## Scenario A: Quick Retract

**When:** Bug found within minutes, Docker image not yet built or pulled.

```bash
# 1. Delete the GitHub Release
gh release delete vX.Y.Z --yes

# 2. Delete the remote tag
git push --delete origin vX.Y.Z

# 3. Delete the local tag
git tag -d vX.Y.Z

# 4. Revert the release commit
git revert HEAD --no-edit

# 5. Push the revert
git push origin main

# 6. Fix the issue, then re-release the SAME version
# (acceptable because the tag was never consumed)
```

**Important:** Only delete tags if you are 100% certain no one pulled the image.
When in doubt, use Scenario B instead.

---

## Scenario B: Hotfix Patch

**When:** Bug found after Docker image was published. No migration issues.

```bash
# 1. Fix the bug on main
git checkout main
# ... make the fix ...
git add <files>
git commit -m "fix: description of the fix"

# 2. Run the release skill for a new PATCH version
# The new release (vX.Y.Z+1) supersedes the bad one

# 3. Mark the bad GitHub Release as not latest
gh release edit vX.Y.Z --latest=false

# 4. Add a note to the bad release
gh release edit vX.Y.Z --notes "$(cat <<'EOF'
> **Superseded by vX.Y.Z+1** — this release contained [brief description].
> Please use vX.Y.Z+1 instead.

[original release notes]
EOF
)"
```

**Docker rollback while fixing:** If production is broken and you need to
immediately revert the Docker images:

```bash
# In docker-compose.prod.yml, pin to the previous version
# Change: image: ghcr.io/gonzalez8/fintrack-backend:latest
# To:     image: ghcr.io/gonzalez8/fintrack-backend:X.Y.Z-1

docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## Scenario C: Full Rollback with Migration Revert

**When:** The release included Django migrations that broke production.

### Step 1: Identify the bad migration

```bash
# List migrations added in the release
git diff --name-only vX.Y.Z-1..vX.Y.Z -- '*/migrations/*.py'

# Check which migrations were applied
docker compose exec backend python manage.py showmigrations <app_name>
```

### Step 2: Revert the migration

```bash
# Roll back to the migration BEFORE the bad one
# Find the previous migration number
docker compose exec backend python manage.py showmigrations <app_name> --list

# Revert (this runs the migration's reverse operation)
docker compose exec backend python manage.py migrate <app_name> <previous_migration_number>
```

**Warning:** Not all migrations are reversible. Operations like `RunSQL` without
a `reverse_sql`, or `RunPython` without a `reverse_code`, cannot be auto-reverted.
Check the migration file first.

### Step 3: Revert the Docker image

```bash
# Pin to the previous version in docker-compose.prod.yml
# image: ghcr.io/gonzalez8/fintrack-backend:X.Y.Z-1

docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Step 4: Fix and re-release

Follow Scenario B to create a hotfix patch that:
1. Fixes the migration issue (or removes the bad migration)
2. Creates a new migration that is safe
3. Releases as vX.Y.Z+1

---

## Tag Management Policy

| Situation | Delete tag? | Reasoning |
|-----------|-------------|-----------|
| Tag pushed < 5 min ago, no consumers | Yes | Safe to retract |
| Docker image built | No | Tag is referenced in image metadata |
| GitHub Release exists with downloads | No | URLs would break |
| Wrong version number | No | Cut correct version as next release |

**Golden rule:** When in doubt, do NOT delete the tag. Cut a new patch instead.
A slightly messy version history is far better than broken references.

---

## Post-Rollback Checklist

- [ ] Bad release marked as not-latest on GitHub
- [ ] Bad release notes updated with superseded notice
- [ ] Hotfix patch released and verified
- [ ] Docker images running correct version in production
- [ ] Database migrations in consistent state
- [ ] Team notified of the incident and resolution
- [ ] Root cause documented (optional: post-mortem if severe)
