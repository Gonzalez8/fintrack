# Pre-Release Versions

Guide for managing alpha, beta, and release candidate versions in Fintrack.

## When to Use Pre-Releases

| Channel | Purpose | Stability | When |
|---------|---------|-----------|------|
| `alpha` | Early development snapshot | Unstable, may break | Major rewrites, experimental features |
| `beta` | Feature-complete, needs testing | Mostly stable | Before a major release, community testing |
| `rc` | Release candidate, final validation | Should be stable | Final check before stable release |

## Version Format

```
vX.Y.Z-channel.N

Examples:
v3.0.0-alpha.1    First alpha for v3.0.0
v3.0.0-alpha.2    Second alpha (fixes/additions to alpha.1)
v3.0.0-beta.1     First beta (feature-complete)
v3.0.0-beta.2     Second beta (bug fixes from beta testing)
v3.0.0-rc.1       First release candidate
v3.0.0-rc.2       Second RC (critical fix found in rc.1)
v3.0.0            Stable release (promotes rc.2)
```

## Precedence

Per SemVer, pre-release versions have lower precedence than the stable version:

```
v3.0.0-alpha.1 < v3.0.0-alpha.2 < v3.0.0-beta.1 < v3.0.0-rc.1 < v3.0.0
```

## Workflow

### Creating a Pre-Release

```bash
# 1. Determine the target stable version
#    (e.g., v3.0.0 for a major release)

# 2. Check for existing pre-releases in this series
git tag --list 'v3.0.0-*' --sort=-version:refname

# 3. Determine the next number
#    If v3.0.0-beta.2 exists, next is v3.0.0-beta.3
#    If moving channels: alpha → beta resets to .1

# 4. Update CHANGELOG.md
#    Add section: ## [3.0.0-beta.1] - YYYY-MM-DD

# 5. Update frontend/package.json
#    "version": "3.0.0-beta.1"

# 6. Commit, tag, push
git add CHANGELOG.md frontend/package.json
git commit -m "chore(release): v3.0.0-beta.1 — description"
git tag v3.0.0-beta.1
git push origin main
git push origin v3.0.0-beta.1

# 7. Create GitHub Release with --prerelease flag
gh release create v3.0.0-beta.1 \
  --title "v3.0.0-beta.1 — description" \
  --prerelease \
  --notes "$(cat <<'EOF'
[CHANGELOG content]

> **Pre-release:** This is a beta version for testing. Not recommended for production.
EOF
)"
```

### Promoting Between Channels

When moving from one channel to the next:

```
alpha → beta:   Feature freeze. Only bug fixes from here.
beta → rc:      Code freeze. Only critical fixes from here.
rc → stable:    No code changes. Promotes the RC as-is.
```

When promoting rc to stable:

```bash
# The stable release is essentially the same code as the last RC
# but gets the clean version number

# 1. Update CHANGELOG: consolidate all pre-release entries into one stable entry
# 2. Update package.json: "3.0.0" (remove pre-release suffix)
# 3. Commit: "chore(release): v3.0.0 — description"
# 4. Tag: v3.0.0
# 5. GitHub Release: --latest (not --prerelease)
```

### CHANGELOG for Pre-Releases

Option A — Separate entries (recommended for long pre-release cycles):

```markdown
## [3.0.0] - 2026-05-01

### Added
- (consolidated from all pre-releases)

## [3.0.0-rc.1] - 2026-04-25

### Fixed
- Fix regression in beta.2

## [3.0.0-beta.2] - 2026-04-20

### Fixed
- Fix crash on empty portfolio

## [3.0.0-beta.1] - 2026-04-15

### Added
- New portfolio engine
```

Option B — Single entry (recommended for short cycles):

```markdown
## [3.0.0] - 2026-05-01

### Added
- New portfolio engine

### Fixed
- Fix crash on empty portfolio
- Fix regression from beta testing
```

When the stable version is released, the consolidated entry should be
self-contained — a user reading it shouldn't need to refer to pre-release entries.

## Docker Image Tags

Pre-release tags trigger Docker builds just like stable tags (the workflow
matches `v*`). The resulting Docker images get:

- `X.Y.Z-channel.N` tag (e.g., `3.0.0-beta.1`)
- `X.Y` tag (e.g., `3.0`) — **caution:** this overwrites the previous `3.0` tag

Pre-release images do NOT get the `latest` tag (controlled by the `--latest` /
`--prerelease` flag on `gh release`).

**Recommendation:** For alpha/beta testing, consider pulling by exact tag:
```yaml
# docker-compose.prod.yml (testing pre-release)
image: ghcr.io/gonzalez8/fintrack-backend:3.0.0-beta.1
```

## When NOT to Use Pre-Releases

- **Patch releases:** Never pre-release a patch. If it's urgent enough for a
  patch, it's urgent enough to go straight to stable.
- **Minor releases with small scope:** If a minor release adds one feature,
  just release it as stable. Pre-releases add overhead.
- **Internal testing only:** If you're the only tester, a pre-release tag is
  unnecessary overhead. Just test on main before tagging stable.

Pre-releases are most valuable when:
- Major version with breaking changes needs external validation
- Large feature set needs soak testing before stable stamp
- Multiple deployment environments need staged rollout
