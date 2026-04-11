---
name: fintrack-dev
description: Development workflow orchestrator for Fintrack. Classifies tasks, creates feature branches, guides implementation, and opens structured PRs. Use when starting any task, creating a branch, or opening a pull request.
---

# Development Workflow Orchestrator

Manage the full development lifecycle: classify task → create branch → implement
→ commit → open PR → hand off to review.

## Trigger

Use this skill when:

- The user provides a task, bug report, feature request, or any code change
- The user says "start working on...", "implement...", "fix...", "add..."
- The user says "create a branch", "open a PR", "abrir PR", "nueva tarea"
- The user asks to push changes or prepare code for review
- **Proactively**: whenever you are about to make code changes, activate this
  skill to ensure the branch workflow is followed

**CRITICAL RULE:** Never commit directly to `main`. Every change goes through a
feature branch and a PR. This is non-negotiable.

## Preconditions

Before starting a new task, verify:

1. The working directory is the Fintrack repo root
2. The working tree is clean (`git status --short` is empty). If dirty:
   - If on `main`: ask the user to stash or discard
   - If on a feature branch: ask if they want to continue on this branch
3. Fetch latest: `git fetch origin main`
4. If starting a new task: must be on `main` and up to date with `origin/main`

If the user is already on a feature branch and wants to continue working, skip
branch creation and go straight to the implementation phase.

## Step 0 — Classify the Task

Analyze the task description and determine:

1. **Type** — maps directly to the branch prefix and commit type:

| Type | Branch prefix | When to use |
|------|--------------|-------------|
| `feat` | `feat/` | New user-facing functionality |
| `fix` | `fix/` | Bug fix in deployed code |
| `chore` | `chore/` | Tooling, deps, CI, config, skills |
| `refactor` | `refactor/` | Code restructure, no behavior change |
| `docs` | `docs/` | Documentation only |
| `test` | `test/` | Adding or fixing tests |
| `perf` | `perf/` | Performance improvement |

2. **Scope** — the area affected (e.g., `realestate`, `auth`, `mortgage`, `i18n`)
3. **Short description** — kebab-case, max 30 chars (e.g., `amortization-fk-validation`)

Present the classification to the user for confirmation before proceeding:

```
Task classification:
  Type: fix
  Scope: security
  Branch: fix/amortization-fk-validation
  Description: Add FK ownership validation to AmortizationSerializer

Proceed? (or suggest changes)
```

## Step 1 — Create the Branch

### Branch naming convention

Format: `{type}/{short-kebab-description}`

Rules:
- Max 50 characters total
- Lowercase only, kebab-case for description
- Type must be one of: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`
- **Never use**: `feature/`, `claude/`, `hotfix/`, `bugfix/`
- No issue numbers in branch name (reference in commit messages / PR body)

### Commands

```bash
git checkout main
git pull origin main
git checkout -b {type}/{short-description}
```

If the branch name already exists, append a short disambiguator (e.g.,
`fix/auth-validation-2`).

## Step 2 — Implementation Phase

This is where the actual work happens. During implementation:

### Before every commit

1. Verify you are NOT on `main`:
   ```bash
   branch=$(git branch --show-current)
   if [ "$branch" = "main" ]; then
     echo "ERROR: Cannot commit on main. Switch to a feature branch."
     exit 1
   fi
   ```

2. Use the existing `/commit` command for each logical unit of work. If
   `/commit` is not available, follow conventional commit format:
   ```
   {type}({scope}): {description}
   ```

### Conventions reminder

When implementing, follow these project rules (from CLAUDE.md):

- **i18n:** Every new or modified i18n key MUST be added to ALL 5 locale files
  (`es`, `en`, `de`, `fr`, `it`). Missing translations break the UI.
- **Money:** Always `Decimal` in backend, never `float`
- **IDs:** UUID via `TimeStampedModel` base
- **Multi-tenancy:** Every model needs `owner` FK. ViewSets use `OwnedByUserMixin`
- **Auth:** JWT in httpOnly cookies. BFF pattern (browser → Next.js → Django)
- **Privacy:** Use `formatMoney(value, currency, isPublic)` with `isPublic=true`
  for public data
- **Mobile:** `SwipeCard` for list items, FAB for new items, responsive split
  (`sm:hidden` / `hidden sm:block`)

### Track changes for the PR

Keep a mental or written log of what changed, organized by area:
- Backend changes (models, views, serializers, services)
- Frontend changes (components, pages, lib, types)
- Config changes (i18n, settings, CI)

## Step 3 — Pre-PR Checklist

Before opening the PR, verify all of the following:

```bash
# 1. At least one commit ahead of main
git rev-list origin/main..HEAD --count  # must be > 0

# 2. Branch is pushed
git push -u origin $(git branch --show-current)

# 3. No merge conflicts with main
git fetch origin main
git merge-base --is-ancestor origin/main HEAD || echo "WARN: may have conflicts"

# 4. If backend changed: syntax check
docker compose exec -T backend python -c "
import py_compile, glob
for f in glob.glob('apps/**/*.py', recursive=True):
    py_compile.compile(f, doraise=True)
print('Backend syntax OK')
"

# 5. If frontend changed: type check + build
cd frontend && npx tsc --noEmit && npm run build

# 6. If i18n changed: verify all 5 locales have same key count
for f in frontend/src/i18n/messages/*.json; do
  echo "$(basename $f): $(grep -c '"' $f) keys"
done
```

Report any failures and fix them before proceeding.

## Step 4 — Create the Pull Request

Use `gh pr create` with the project's PR template structure:

```bash
gh pr create \
  --title "{type}({scope}): {short description}" \
  --body "$(cat <<'EOF'
## Summary

- {bullet 1: what changed and why}
- {bullet 2: what changed and why}
- {bullet 3: if needed}

## Type of Change

- [{x}] Bug fix / New feature / Breaking change / Documentation / Refactoring

## Changes

### Backend
- {list of backend changes, or "No backend changes"}

### Frontend
- {list of frontend changes, or "No frontend changes"}

### Other
- {i18n, config, CI changes, or "None"}

## Checklist

- [x] My code follows the project's style guidelines
- [{x or space}] I have added tests that cover my changes
- [x] All new and existing tests pass
- [x] I have updated the documentation accordingly
- [x] My changes generate no new warnings
- [x] Commit messages follow Conventional Commits
- [{x or space}] i18n keys added to all 5 locale files (if applicable)

## Test Plan

{How the changes were verified — manual testing, automated tests, build check}
EOF
)"
```

### PR title format

Match the conventional commit format without emoji:
- `fix(realestate): validate property FK ownership in amortizations`
- `feat(savings): add projection chart with locale-aware dates`
- `chore(skills): add development workflow skills`

## Step 5 — Handoff

After the PR is created:

1. **Show the PR URL** so the user can see it
2. **Suggest review:** "Run `/pr-review` to get an automated code review"
3. **Remind about CI:** "CI will run automatically — check status with `gh pr checks`"
4. **After merge:** Suggest `/fintrack-release` to evaluate if a release is needed

## Edge Cases

### Already on a feature branch
Ask: "You're on `{branch}`. Continue here, or create a new branch?" If
continuing, skip Steps 0-1 and go straight to implementation.

### Working tree is dirty on main
This means uncommitted changes on `main` (bad state). Options:
1. Stash → create branch → unstash: `git stash && git checkout -b {branch} && git stash pop`
2. Create branch from current state: `git checkout -b {branch}` (preserves changes)

Always prefer option 2 — it's safer.

### Task spans multiple areas
One branch, multiple commits, one PR. Use descriptive commit scopes:
```
fix(realestate): validate amortization FK ownership
fix(reports): handle DoesNotExist in savings projection
fix(auth): use separate Set-Cookie headers for demo tokens
```

### User wants to abort
```bash
git checkout main
git branch -D {branch}           # local only
git push origin --delete {branch} # if pushed
```

### Merge conflicts
```bash
git fetch origin main
git rebase origin/main
# resolve conflicts
git push --force-with-lease
```

## Pipeline Overview

```
/fintrack-dev          /commit              /pr-review         /fintrack-release
┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐
│ Classify     │    │ Stage files │    │ Branch check │    │ Classify commits│
│ Create branch│ →  │ Format msg  │ →  │ Code quality │ →  │ Version bump    │
│ Guide impl   │    │ Pre-commit  │    │ Security     │    │ CHANGELOG       │
│ Open PR      │    │ Commit      │    │ i18n check   │    │ Tag + Release   │
└─────────────┘    └─────────────┘    │ CI status    │    └─────────────────┘
                                      │ Verdict      │
                                      └──────────────┘
```
