# Version Bump Decision Tree

## Decision Flow

```
START
  |
  +-- User forced a bump level (--major, --minor, --patch)?
  |     YES --> Use forced level (but WARN if it conflicts with commit analysis)
  |     NO  |
  |
  +-- Any commit with BREAKING CHANGE footer or type! suffix?
  |     YES --> MAJOR (vX.0.0) — activate Breaking Change Protocol
  |     NO  |
  |
  +-- Heuristic: runtime dependency major bump, destructive migration,
  |   or API field removal detected?
  |     YES --> WARN user, may be MAJOR — present findings for judgment
  |     NO  |
  |
  +-- Any feat: commits?
  |     YES --> MINOR (vX.Y+1.0)
  |     NO  |
  |
  +-- Any fix:, perf:, security:, or runtime-affecting refactor:/chore(deps):?
  |     YES --> PATCH (vX.Y.Z+1)
  |     NO  |
  |
  +-- Only docs:, test:, chore: (CI/tooling), style:, internal refactor:?
       --> NO RELEASE — wait for release-worthy commits
```

## Pre-Release Decision Flow

```
User requests pre-release (--pre=channel)?
  |
  +-- Is there an existing pre-release in this series?
  |     YES --> Increment: v3.0.0-beta.1 → v3.0.0-beta.2
  |     NO  --> Start at .1: v3.0.0-beta.1
  |
  +-- Is the user promoting channels?
        alpha → beta: Feature freeze, reset to .1
        beta → rc:    Code freeze, reset to .1
        rc → stable:  Remove suffix, release as vX.Y.Z
```

## Commit Type Quick Reference

### Triggers MAJOR (breaking)
- `feat!: remove legacy API endpoints`
- `fix!: change auth token format` (with BREAKING CHANGE footer)
- Heuristic: major runtime dependency bump (e.g., Django 5 → 6)
- Heuristic: destructive migration (RemoveField, DeleteModel)

### Triggers MINOR
- `feat: add mortgage amortization table`
- `feat(reports): add CSV export for dividends`

### Triggers PATCH
- `fix: correct dividend withholding tax calculation`
- `perf: optimize portfolio snapshot query`
- `security: fix XSS vulnerability in notes field`
- `chore(deps): bump Django to 5.1.4` (runtime dependency)

### Does NOT trigger release (alone)
- `docs: update API documentation`
- `test: add portfolio engine unit tests`
- `chore: update GitHub Actions workflow`
- `chore(deps): bump eslint to 9.x` (dev-only)
- `style: fix formatting in models.py`

## Anti-Spam Quick Reference

| Situation | Action |
|-----------|--------|
| Single trivial fix | Wait — batch with next release |
| Urgent fix (auth, data loss, crash, security) | Release immediately as patch |
| Multiple fixes in same area | Batch into one patch |
| Feature across multiple commits | One minor release for the logical feature |
| Last release < 1 day ago | Batch unless urgent |
| Last release > 1 week with release-worthy commits | Suggest releasing |
| Only CI/docs/test changes | No release |
| Mix of feat + fix | Minor (highest wins) |
| 20+ commits accumulated | Consider releasing to avoid mega-releases |
| 1 trivial commit | Batch unless urgent |

## Force Bump Validation

When the user forces a bump level, validate it makes sense:

| Forced | Commits say | Action |
|--------|-------------|--------|
| `--patch` | Has `feat:` commits | WARN: "This includes new features — sure you want patch?" |
| `--minor` | Has breaking changes | WARN: "This includes breaking changes — sure you don't want major?" |
| `--major` | Only `fix:` commits | WARN: "No breaking changes detected — sure you want major?" |
| `--patch` | Only `fix:` commits | OK — matches analysis |
| `--minor` | Has `feat:` commits | OK — matches analysis |
| `--major` | Has breaking changes | OK — matches analysis |

Accept the user's decision after warning. They may have context you don't.
