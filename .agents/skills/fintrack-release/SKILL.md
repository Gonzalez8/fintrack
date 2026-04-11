---
name: fintrack-release
description: >
  Coordinate Fintrack releases: analyze commits since the last tag, decide
  whether a new release is warranted, determine the correct semantic version
  bump (patch/minor/major), and guide the full release process (CHANGELOG,
  package.json, tag, GitHub Release, Docker image publish). Supports dry-run
  preview, pre-release versions (alpha/beta/rc), force bump flags, rollback
  guidance, and comprehensive pre-release validation (tests, lint, security
  audit, migration safety). Use when the user asks about versioning, tagging,
  releasing, publishing, or whether it's time to cut a new version. Also use
  when evaluating post-push release readiness.
---

# Release Governor

Run the full Fintrack release governance workflow: from commit analysis through
tag creation and GitHub Release publication.

## Trigger

Use this skill when the user asks for:

- "preparar la release" / "prepare the release"
- "sacar release" / "ship a release"
- "qué versión toca" / "what version is next"
- "hace falta taggear" / "should we tag"
- "revisa si está lista para release"
- "do we need a release with these commits"
- "dry run" / "preview release" / "simulate release"
- "release alpha/beta/rc" / "pre-release"
- "rollback" / "revert release" / "bad release"

Also activate proactively after pushing commits to main — evaluate whether a
release is due and suggest it if appropriate.

## Modes

This skill supports three execution modes:

| Mode | Trigger | Side effects |
|------|---------|--------------|
| **Preview (dry-run)** | User says "dry run", "preview", "simulate", or "qué pasaría" | None — read-only analysis, shows what *would* happen |
| **Stable release** | Default when user confirms a release | Full execution: CHANGELOG, tag, push, GitHub Release |
| **Pre-release** | User requests alpha/beta/rc or specifies a pre-release channel | Tag format `vX.Y.Z-channel.N`, no `--latest` flag on gh release |

## Preconditions

Before proceeding, verify all of the following:

1. The current branch is `main`. Releases only happen from main.
2. The working tree is clean, including untracked files.
3. There is at least one commit since the last stable tag.
4. `CHANGELOG.md` exists at the repo root and follows Keep a Changelog format.
5. `frontend/package.json` exists and has a `version` field.
6. The local `main` is up to date with `origin/main` (no unpulled commits).

If any precondition fails, stop and report the blocker.

## Inputs

Collect these from the repository state:

```bash
# Current version (latest stable tag)
git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*'

# Current pre-release version (if any)
git describe --tags --abbrev=0 --match 'v[0-9]*-*' 2>/dev/null || echo "none"

# Commits since last stable tag
git log $(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*')..HEAD --oneline

# Count
git rev-list $(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*')..HEAD --count

# Working tree
git status --short

# Current branch
git branch --show-current

# Remote sync check
git fetch origin main --dry-run 2>&1

# Last tag date (for recency check)
git log -1 --format=%ci $(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*')
```

## Step 0 — Versioning Model

Fintrack uses **Semantic Versioning** with **Conventional Commits**:

- **Stable tags:** `vX.Y.Z` (the `v` prefix is required — the Docker workflow matches `v*`)
- **Pre-release tags:** `vX.Y.Z-channel.N` (e.g., `v3.0.0-beta.1`, `v2.4.0-rc.1`)
- **Commit format:** `type(scope): description`
- The tag push triggers `.github/workflows/docker-publish.yml` which builds and
  publishes Docker images to GHCR with tags: `latest`, `X.Y.Z`, `X.Y`

Critical consequences:

- every stable tag produces a Docker image — only tag stable, tested code
- pre-release tags also trigger Docker builds — use them deliberately
- never create a tag without explicit user confirmation
- never tag on a dirty working tree

### Force Bump Flags

The user can override automatic version detection:

- `--patch` / `--minor` / `--major` — force a specific bump level
- `--pre=channel` — create a pre-release (e.g., `--pre=beta`)
- When a force flag is used, skip the automatic classification but still validate
  that the bump makes sense (warn if forcing patch when there are feat: commits)

## Step 1 — Classify Commits

Parse each commit since the last tag. Classify by conventional commit type.

### Release-worthy (affect the deployed artifact)

| Type | Bump | Condition |
|------|------|-----------|
| `feat:` | minor | Always — new user-facing functionality |
| `fix:` | patch | Always — bug fix in deployed code |
| `perf:` | patch | Always — performance improvement |
| `refactor:` | patch | Only if it changes user-visible behavior or the Docker image |
| `chore(deps):` | patch | Only if runtime dependencies changed (not dev-only) |
| `security:` | patch | Always — security vulnerability fix |

### NOT release-worthy by themselves

| Type | Why not |
|------|---------|
| `docs:` | Does not change the deployed artifact |
| `test:` | Tests don't ship in the Docker image |
| `chore:` (CI, tooling) | Internal infrastructure, no user impact |
| `refactor:` (internal) | No behavior change, no deployment difference |
| `style:` | Formatting only |

Non-release-worthy commits can be included in a release that has release-worthy
commits. They just cannot justify a release on their own.

### Breaking changes

Any commit with `BREAKING CHANGE:` in the footer or `!` after the type (e.g.
`feat!:`) triggers a **major** bump. This activates the Breaking Change Protocol
(see `references/breaking-change-protocol.md`).

### Heuristic Detection (beyond commit messages)

Commit messages may under-report impact. Apply these additional checks:

1. **Runtime dependency major bumps:** If `requirements.txt` or `package.json`
   shows a major version bump in a runtime dependency, flag as potentially breaking.
2. **Django migration destructive ops:** Scan new migration files for
   `RemoveField`, `DeleteModel`, `AlterField` (type changes), `RemoveIndex`.
   Flag for review — these may require a breaking change release.
3. **API serializer field removal:** If a DRF serializer removes or renames a
   field, flag as potentially breaking for API consumers.
4. **Environment variable changes:** If new required env vars are introduced or
   existing ones removed, flag as deployment-affecting.

These heuristics produce warnings, not automatic bumps. Present findings to the
user for judgment.

## Step 2 — Decide the Version Bump

The highest-priority commit type wins:

1. **Major** — any breaking change (requires Breaking Change Protocol)
2. **Minor** — at least one `feat:` commit
3. **Patch** — `fix:`, `perf:`, `security:`, runtime `refactor:`, runtime `chore(deps):`
4. **No release** — only non-release-worthy commits

For the detailed decision tree, read `references/version-bump-decision.md`.

### Anti-spam policy

Even when commits are technically release-worthy, evaluate whether a release
makes sense right now:

- **Batch related fixes.** If fixes are part of ongoing work in the same area,
  suggest waiting. Ask the user: "These look like part of ongoing work on X.
  Want to wait and batch them?"
- **Single trivial fix.** Don't release for a typo or non-critical UI fix
  unless it's urgent (broken auth, data loss, crash).
- **Group features logically.** A feature spread across backend + frontend
  commits is one logical release, not two.
- **Time factor.** Last release < 1 day ago? Lean toward batching. Last release
  > 1 week with release-worthy commits? Suggest releasing.
- **Size factor.** Releases with 20+ commits may be too large — suggest
  splitting if logically separable. Releases with 1 trivial commit may be
  too small — suggest batching.
- **Ask when borderline.** Present the trade-off and let the user decide.

## Step 3 — Pre-Release Validation

Before presenting the recommendation, run the validation suite. For dry-run
mode, report what *would* be checked. For actual releases, all checks must pass.

See `references/release-readiness-checklist.md` for the full checklist.

### 3.1 Repository State

```bash
git branch --show-current               # Must be main
git status --short                      # Must be empty
git fetch origin main --dry-run 2>&1    # Must be up to date
```

### 3.2 Code Quality

```bash
# Backend
docker compose exec backend pytest --tb=short -q
docker compose exec backend ruff check .
docker compose exec backend ruff format --check .

# Frontend
docker compose exec frontend npm run build
docker compose exec frontend npm run lint
```

### 3.3 Security Audit

```bash
# Frontend dependencies
docker compose exec frontend npm audit --audit-level=high 2>&1

# Backend dependencies (if pip-audit available)
docker compose exec backend pip-audit 2>&1 || echo "pip-audit not installed — skip"
```

Report findings with severity levels. Block release on critical/high severity
CVEs in runtime dependencies. Dev-only vulnerabilities are informational.

### 3.4 Migration Safety

```bash
# Check for unapplied migrations
docker compose exec backend python manage.py showmigrations --list | grep "\[ \]"

# Check for missing migration files
docker compose exec backend python manage.py makemigrations --check --dry-run
```

If new migrations exist in the release, scan for destructive operations:

```bash
# Find new migration files in this release
git diff --name-only $(git describe --tags --abbrev=0)..HEAD -- '*/migrations/*.py'
```

Flag `RemoveField`, `DeleteModel`, `RenameField`, `AlterField` operations for
manual review. These may require a coordinated deployment strategy.

### 3.5 Validation Summary

Present results as a table:

```
## Pre-Release Validation

| Check                    | Status | Details              |
|--------------------------|--------|----------------------|
| Branch is main           | PASS   |                      |
| Working tree clean       | PASS   |                      |
| Remote in sync           | PASS   |                      |
| Backend tests            | PASS   | 142 passed, 0 failed |
| Backend lint (ruff)      | PASS   |                      |
| Frontend build           | PASS   |                      |
| Frontend lint            | PASS   |                      |
| npm audit                | WARN   | 2 moderate (dev-only)|
| pip-audit                | PASS   |                      |
| Migrations applied       | PASS   |                      |
| Migration safety         | WARN   | RemoveField in 0042  |
```

PASS = proceed. WARN = inform user, proceed with acknowledgment. FAIL = block.

## Step 4 — Present the Recommendation

Adapt depth to what the user asked.

### Quick questions

```
Current version: vX.Y.Z
Commits since tag: N (M release-worthy)
Recommendation: no release / patch / minor / major
Reason: one sentence
```

### Dry-run / Preview mode

```
## Release Preview (dry-run — no changes will be made)

Current version: vX.Y.Z
Proposed version: vA.B.C
Branch: main
Working tree: clean

## Commits Since Last Tag

### Release-worthy
- <hash> feat: description → minor
- <hash> fix: description → patch

### Included (not release-worthy alone)
- <hash> docs: description

## Heuristic Warnings
- [any detected, or "None"]

## Pre-Release Validation
[validation summary table]

## CHANGELOG Preview
[what the new CHANGELOG section would look like]

## Commands That Would Execute
1. Edit CHANGELOG.md — add [A.B.C] section
2. Edit frontend/package.json — version → "A.B.C"
3. git add CHANGELOG.md frontend/package.json
4. git commit -m "chore(release): vA.B.C — description"
5. git tag vA.B.C
6. git push origin main
7. git push origin vA.B.C
8. gh release create vA.B.C ...

No changes were made. Run the release without --dry-run to execute.
```

### Full release request

```
## Release Assessment

Current version: vX.Y.Z
Proposed version: vA.B.C
Branch: main
Working tree: clean / dirty

## Commits Since Last Tag

### Release-worthy
- <hash> feat: description → minor
- <hash> fix: description → patch

### Included (not release-worthy alone)
- <hash> docs: description

## Heuristic Warnings
- [any detected, or "None"]

## Pre-Release Validation
[validation summary table]

## Recommendation: PATCH / MINOR / MAJOR / NO RELEASE

Reason: [clear explanation]

## Blockers
- [any issues, or "None"]
```

After user confirms, proceed to Step 5.

## Step 5 — Execute the Release

Only after explicit user confirmation. Execute in this exact order.

### 5.1 Update CHANGELOG.md

Add a new section at the top (below the header). Follow Keep a Changelog format
with extended sections:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Breaking Changes
- (from commits with BREAKING CHANGE or ! suffix — ALWAYS first when present)

### Security
- (from security: or fix: commits addressing vulnerabilities)

### Added
- (from feat: commits)

### Changed
- (from refactor:/chore: that changed behavior)

### Fixed
- (from fix: commits)

### Performance
- (from perf: commits)

### Deprecated
- (features marked for future removal)

### Removed
- (features or APIs removed in this version)

### Dependencies
- (from chore(deps): commits, if relevant)
```

Rules for CHANGELOG entries:

- Only include sections that have entries
- Rewrite commit messages for user clarity — do NOT copy git log verbatim
- Be specific: "Fix dividend withholding tax calculation for US stocks" not "bug fixes"
- Link to PR numbers when available: `description (#123)`
- Breaking Changes section is ALWAYS first when present
- Security section is ALWAYS second when present

### 5.2 Update frontend/package.json

Change `"version"` to the new version without the `v` prefix.

For pre-releases: use the full pre-release identifier (e.g., `"3.0.0-beta.1"`).

### 5.3 Commit the version bump

```bash
git add CHANGELOG.md frontend/package.json
git commit -m "chore(release): vX.Y.Z — short description"
```

### 5.4 Create and push the tag

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

For pre-releases:
```bash
git tag vX.Y.Z-channel.N
git push origin main
git push origin vX.Y.Z-channel.N
```

Remind the user: this triggers Docker image builds on GHCR.

### 5.5 Create GitHub Release

For stable releases:
```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z — Short description" \
  --latest \
  --notes "$(cat <<'EOF'
[CHANGELOG section for this version]
EOF
)"
```

For pre-releases:
```bash
gh release create vX.Y.Z-channel.N \
  --title "vX.Y.Z-channel.N — Short description" \
  --prerelease \
  --notes "$(cat <<'EOF'
[CHANGELOG section for this version]

> This is a pre-release. Not recommended for production use.
EOF
)"
```

### 5.6 Post-Release Verification

```bash
# Tag verification
git describe --tags --abbrev=0

# GitHub Release verification
gh release view vX.Y.Z

# Docker workflow status
gh run list --workflow=docker-publish.yml --limit=1

# Wait and verify Docker image availability (informational)
gh run watch $(gh run list --workflow=docker-publish.yml --limit=1 --json databaseId --jq '.[0].databaseId') --exit-status 2>/dev/null &
echo "Docker build running — check GHCR in ~5 minutes for ghcr.io/gonzalez8/fintrack-{backend,frontend}:X.Y.Z"
```

## Step 6 — Release Summary

When the skill completes, provide a structured summary:

```
## Release Complete

| Item                     | Status |
|--------------------------|--------|
| Previous version         | vX.Y.Z |
| New version              | vA.B.C |
| Release-worthy commits   | N      |
| CHANGELOG updated        | Yes    |
| package.json updated     | Yes    |
| Tag created & pushed     | Yes    |
| GitHub Release created   | Yes    |
| Docker workflow triggered | Yes    |

### Release Cadence
- Days since last release: N
- Commits in this release: N
- Average commits/release (last 5): N

### Follow-up Actions
- [any needed, or "None"]
```

## Pre-Release Versions

For detailed pre-release version management (alpha, beta, rc channels, promotion
between channels, and graduation to stable), see `references/pre-release-versions.md`.

Quick reference:

| Channel | When to use | Docker tag | GitHub Release flag |
|---------|-------------|------------|---------------------|
| `alpha` | Early development, unstable | `X.Y.Z-alpha.N` | `--prerelease` |
| `beta` | Feature-complete, testing | `X.Y.Z-beta.N` | `--prerelease` |
| `rc` | Release candidate, final testing | `X.Y.Z-rc.N` | `--prerelease` |
| stable | Production-ready | `X.Y.Z` + `latest` | `--latest` |

## Edge Cases

### Feature branch, not main
Releases only happen from `main`. If the user is on a feature branch, explain
it must be merged first. Offer to evaluate the commits that would land after merge.

### Hotfix
An urgent fix (broken auth, data loss, crash) justifies an immediate patch even
as a single commit. Skip the batching policy for genuinely urgent fixes. Run
abbreviated validation (tests + build only, skip audit).

### Dirty working tree
Do not proceed. List uncommitted changes and ask the user to commit or stash.

### Very recent release
Push back: "The last release was very recent (vX.Y.Z, N minutes ago). Unless
this is urgent, I'd recommend batching with the next set of changes."

### Only non-release-worthy commits
Recommend no release: "The N commits since vX.Y.Z are all docs/CI/test changes.
No release needed — they'll ship with the next release that has user-facing changes."

### Breaking change detected
Activate the Breaking Change Protocol (see `references/breaking-change-protocol.md`).
This requires a 3-phase review before proceeding with a major bump.

### Major version bump
Major bumps are significant milestones. In addition to the Breaking Change Protocol:
- Review whether a migration guide is needed
- Consider whether the CHANGELOG needs a prominent "Upgrade Guide" section
- Confirm with the user that this is intentional and not an accidental `!` suffix

## Rollback

If a release goes wrong after tagging, see `references/rollback-procedures.md`
for the complete rollback playbook covering:

- Bad release with code issues
- Docker image rollback
- Django migration rollback
- GitHub Release correction
- Tag management (delete vs. retag policy)

Quick rollback decision:

| Situation | Action |
|-----------|--------|
| Bug found immediately, no one pulled | Delete tag + release, fix, re-release same version |
| Bug found after Docker image published | Cut a new patch version with the fix |
| Migration broke production | See migration rollback procedures |
| Wrong version number | Never retag — cut the correct version as next release |

## Failure Handling

If the tag push fails:

- check remote permissions, retry once
- do not delete and recreate the tag without asking

If `gh release create` fails:

- check authentication with `gh auth status`
- retry with explicit `--repo` flag if needed
- the tag is already pushed — fix the GitHub Release, do not retag

If the Docker workflow fails after tag push:

- check workflow status: `gh run list --workflow=docker-publish.yml --limit=1`
- check workflow logs: `gh run view <run-id> --log-failed`
- the tag and release are valid — fix the workflow issue separately
- do not create a new tag for the same version
- re-run the workflow if appropriate: `gh run rerun <run-id>`
