# Release Readiness Checklist

Use this checklist before every Fintrack release. All items must pass before tagging.

## Repository State

- [ ] On `main` branch
- [ ] Working tree is clean (`git status --short` returns empty)
- [ ] All intended commits are pushed to remote
- [ ] No open PRs that should be included in this release

## Code Quality

- [ ] Backend tests pass: `docker compose exec backend pytest`
- [ ] Frontend builds without errors: `docker compose exec frontend npm run build`
- [ ] No known regressions from commits included in this release

## Version Files

- [ ] `CHANGELOG.md` updated with new version section at the top
- [ ] CHANGELOG follows Keep a Changelog format (Added, Changed, Fixed, Dependencies)
- [ ] CHANGELOG date is today's date (YYYY-MM-DD)
- [ ] `frontend/package.json` version matches new version (no `v` prefix)
- [ ] Release commit created: `chore(release): vX.Y.Z — description`

## Release Execution

- [ ] Tag created: `git tag vX.Y.Z`
- [ ] Main pushed: `git push origin main`
- [ ] Tag pushed: `git push origin vX.Y.Z`
- [ ] GitHub Release created with `gh release create`
- [ ] Release notes match CHANGELOG content

## Post-Release Verification

- [ ] `git describe --tags --abbrev=0` shows new tag
- [ ] `gh release view vX.Y.Z` shows the release
- [ ] Docker publish workflow triggered: `gh run list --workflow=docker-publish.yml --limit=1`
