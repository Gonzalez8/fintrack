---
name: fintrack-release
description: >
  Coordinate Fintrack releases: analyze commits since the last tag, decide
  whether a new release is warranted, determine the correct semantic version
  bump (patch/minor/major), and guide the full release process (CHANGELOG,
  package.json, tag, GitHub Release, Docker image publish). Use when the user
  asks about versioning, tagging, releasing, publishing, or whether it's time
  to cut a new version. Also use when evaluating post-push release readiness.
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

Also activate proactively after pushing commits to main — evaluate whether a
release is due and suggest it if appropriate.

## Preconditions

Before proceeding, verify all of the following:

1. The current branch is `main`. Releases only happen from main.
2. The working tree is clean, including untracked files.
3. There is at least one commit since the last stable tag.
4. `CHANGELOG.md` exists at the repo root and follows Keep a Changelog format.
5. `frontend/package.json` exists and has a `version` field.

If any precondition fails, stop and report the blocker.

## Inputs

Collect these from the repository state:

```bash
# Current version
git describe --tags --abbrev=0

# Commits since last tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline

# Count
git rev-list $(git describe --tags --abbrev=0)..HEAD --count

# Working tree
git status --short

# Current branch
git branch --show-current
```

## Step 0 — Versioning Model

Fintrack uses **Semantic Versioning** with **Conventional Commits**:

- Tags: `vX.Y.Z` (the `v` prefix is required — the Docker workflow matches `v*`)
- Commit format: `type(scope): description`
- The tag push triggers `.github/workflows/docker-publish.yml` which builds and
  publishes Docker images to GHCR with tags: `latest`, `X.Y.Z`, `X.Y`

Critical consequences:

- every tag produces a Docker image — only tag stable, tested code
- never create a tag without explicit user confirmation
- never tag on a dirty working tree

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
`feat!:`) triggers a **major** bump. This requires explicit user approval.

## Step 2 — Decide the Version Bump

The highest-priority commit type wins:

1. **Major** — any breaking change
2. **Minor** — at least one `feat:` commit
3. **Patch** — `fix:`, `perf:`, runtime `refactor:`, runtime `chore(deps):`
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
- **Ask when borderline.** Present the trade-off and let the user decide.

## Step 3 — Present the Recommendation

Adapt depth to what the user asked.

### Quick questions

```
Current version: vX.Y.Z
Commits since tag: N (M release-worthy)
Recommendation: no release / patch / minor / major
Reason: one sentence
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

## Recommendation: PATCH / MINOR / MAJOR / NO RELEASE

Reason: [clear explanation]

## Pre-release Checklist
→ See references/release-readiness-checklist.md

## Blockers
- [any issues, or "None"]
```

After user confirms, proceed to Step 4.

## Step 4 — Execute the Release

Only after explicit user confirmation. Execute in this exact order.

### 4.1 Update CHANGELOG.md

Add a new section at the top (below the header). Follow Keep a Changelog format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- (from feat: commits)

### Changed
- (from refactor:/chore: that changed behavior)

### Fixed
- (from fix: commits)

### Dependencies
- (from chore(deps): commits, if relevant)
```

Only include sections that have entries. Rewrite commit messages for user clarity.

### 4.2 Update frontend/package.json

Change `"version"` to the new version without the `v` prefix.

### 4.3 Commit the version bump

```bash
git add CHANGELOG.md frontend/package.json
git commit -m "chore(release): vX.Y.Z — short description"
```

### 4.4 Create and push the tag

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

Remind the user: this triggers Docker image builds on GHCR.

### 4.5 Create GitHub Release

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z — Short description" \
  --latest \
  --notes "$(cat <<'EOF'
[CHANGELOG section for this version]
EOF
)"
```

### 4.6 Verify

```bash
git describe --tags --abbrev=0
gh release view vX.Y.Z
gh run list --workflow=docker-publish.yml --limit=1
```

## Edge Cases

### Feature branch, not main
Releases only happen from `main`. If the user is on a feature branch, explain
it must be merged first. Offer to evaluate the commits that would land after merge.

### Hotfix
An urgent fix (broken auth, data loss, crash) justifies an immediate patch even
as a single commit. Skip the batching policy for genuinely urgent fixes.

### Dirty working tree
Do not proceed. List uncommitted changes and ask the user to commit or stash.

### Very recent release
Push back: "The last release was very recent (vX.Y.Z, N minutes ago). Unless
this is urgent, I'd recommend batching with the next set of changes."

### Only non-release-worthy commits
Recommend no release: "The N commits since vX.Y.Z are all docs/CI/test changes.
No release needed — they'll ship with the next release that has user-facing changes."

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
- the tag and release are valid — fix the workflow issue separately
- do not create a new tag for the same version

## Output

When the skill completes, provide:

- current and new version
- list of release-worthy commits included
- CHANGELOG updated (yes/no)
- package.json updated (yes/no)
- tag created and pushed (yes/no)
- GitHub Release created (yes/no)
- Docker workflow status
- any follow-up actions needed
