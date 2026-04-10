# Version Bump Decision Tree

## Decision Flow

```
START
  │
  ├─ Any commit with BREAKING CHANGE footer or type! suffix?
  │    YES → MAJOR (vX.0.0) — requires explicit user approval
  │    NO  ↓
  │
  ├─ Any feat: commits?
  │    YES → MINOR (vX.Y+1.0)
  │    NO  ↓
  │
  ├─ Any fix:, perf:, or runtime-affecting refactor:/chore(deps): commits?
  │    YES → PATCH (vX.Y.Z+1)
  │    NO  ↓
  │
  └─ Only docs:, test:, chore: (CI/tooling), style:, internal refactor:?
       → NO RELEASE — wait for release-worthy commits
```

## Commit Type Quick Reference

### Triggers MAJOR (breaking)
- `feat!: remove legacy API endpoints`
- `fix!: change auth token format` (with BREAKING CHANGE footer)

### Triggers MINOR
- `feat: add mortgage amortization table`
- `feat(reports): add CSV export for dividends`

### Triggers PATCH
- `fix: correct dividend withholding tax calculation`
- `perf: optimize portfolio snapshot query`
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
| Urgent fix (auth, data loss, crash) | Release immediately as patch |
| Multiple fixes in same area | Batch into one patch |
| Feature across multiple commits | One minor release for the logical feature |
| Last release < 1 day ago | Batch unless urgent |
| Last release > 1 week with release-worthy commits | Suggest releasing |
| Only CI/docs/test changes | No release |
| Mix of feat + fix | Minor (highest wins) |
