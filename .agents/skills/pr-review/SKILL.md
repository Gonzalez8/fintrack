---
name: pr-review
description: Automated code review for Fintrack pull requests. Checks code quality, security, i18n completeness, conventional commits, and CI status. Produces structured review with approval or change requests.
---

# PR Review

Perform a thorough code review of a Fintrack pull request, checking project
conventions, code quality, security, and CI status.

## Trigger

Use this skill when:

- User says "review PR", "review this PR", "review #N", "revisa el PR"
- User provides a PR URL from the Fintrack repo
- After `/fintrack-dev` opens a PR (suggested automatically)
- User asks for a "code review" of pending changes

## Inputs

The skill needs a PR reference. Obtain it from:

1. Explicit PR number: `gh pr view 42`
2. Current branch: `gh pr view --json number`
3. PR URL provided by user

## Preconditions

1. `gh` CLI is authenticated: `gh auth status`
2. The PR exists and targets `main`
3. The PR is open (not merged or closed)

## Step 0 — Gather Context

```bash
# PR metadata
gh pr view {PR} --json title,body,headRefName,baseRefName,additions,deletions,changedFiles,commits,state,statusCheckRollup

# Full diff
gh pr diff {PR}

# Commit list
gh pr view {PR} --json commits --jq '.commits[].messageHeadline'

# Files changed
gh pr diff {PR} --name-only

# CI status
gh pr checks {PR}
```

## Step 1 — Branch Naming Check

Verify the branch name matches the convention: `{type}/{kebab-description}`

Valid types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`

| Finding | Severity |
|---------|----------|
| Correct format (`fix/auth-validation`) | PASS |
| Wrong prefix (`feature/` instead of `feat/`) | WARNING |
| No prefix or unknown prefix (`claude/`, `hotfix/`) | WARNING |
| CamelCase or underscores | NOTE |

## Step 2 — Commit Format Check

For each commit in the PR, verify:

1. **Format:** `{type}({scope}): {description}` or `{type}: {description}`
   - Emoji prefix is acceptable (from `/commit` command)
2. **First line:** ≤ 72 characters
3. **Type consistency:** Primary type should match branch type
   - A `fix/` branch should have mostly `fix:` commits
   - Supporting `refactor:`, `test:`, `docs:` commits are fine

| Finding | Severity |
|---------|----------|
| All commits follow format | PASS |
| Minor deviations (missing scope) | NOTE |
| Non-conventional messages | WARNING |

## Step 3 — Code Quality Review

Read the full diff and analyze for issues. For the detailed checklist, see
`references/review-checklist.md`.

### 3.1 General Quality

- Dead code or commented-out code
- `console.log` / `print()` left in production code
- TODO/FIXME/HACK without issue tracking
- Duplicated code that should be extracted
- Functions with excessive complexity
- Missing error handling at system boundaries

### 3.2 Backend (if `backend/` files changed)

- **Multi-tenancy:** New ViewSets must use `OwnedByUserMixin`
- **Money:** Must use `Decimal`, never `float` for monetary values
- **Models:** Must extend `TimeStampedModel` (UUID pk, created_at, updated_at)
- **Models:** Must have `owner = ForeignKey(User)` for user-scoped data
- **FK validation:** Serializers with FK fields to user-owned models must use
  `_OwnershipValidationMixin._validate_owned_fk()`
- **ORM:** Check for N+1 patterns — `select_related`/`prefetch_related` usage
- **Migrations:** Flag `RemoveField`, `DeleteModel`, `RenameField`, `AlterField`
  as needing careful review
- **Tests:** New views/serializers should have corresponding tests (WARNING, not
  BLOCKER, unless the PR is a `fix:` or `feat:` type)

### 3.3 Frontend (if `frontend/` files changed)

- **i18n (BLOCKER):** Every new user-facing string MUST have keys in ALL 5
  locale files (`es`, `en`, `de`, `fr`, `it`). Missing translations break
  the UI for affected languages. Check:
  ```bash
  # Count keys in each locale file
  for f in frontend/src/i18n/messages/*.json; do
    echo "$(basename $f): $(python3 -c "import json; print(len(json.load(open('$f'))))")";
  done
  ```
- **BFF proxy:** Browser code must never call Django directly. All API calls go
  through `/api/proxy/*` (via `api.get/post/put/delete` from `api-client.ts`)
  or `/api/auth/*`
- **Privacy mode:** New monetary displays must use `formatMoney(value, currency, isPublic)`
  with `isPublic=true` for public data (market prices, percentages)
- **Mobile UX:** List items need `SwipeCard` (`sm:hidden`), desktop uses inline
  actions (`hidden sm:block`). No horizontal scroll on mobile.
- **Types:** New API responses should have corresponding TypeScript interfaces
  in `types/index.ts`
- **Hardcoded strings:** No hardcoded Spanish text (common mistake — check for
  Spanish words outside of `es.json`)

## Step 4 — Security Review

- **Permissions:** New API endpoints must have appropriate permission classes
- **Input validation:** User input validated at system boundaries
- **SQL injection:** No raw SQL with string interpolation
- **XSS:** No `dangerouslySetInnerHTML` without sanitization
- **Secrets:** No hardcoded API keys, tokens, or passwords in the diff
- **Auth bypass:** No endpoints that skip JWT validation
- **Cross-tenant:** Verify `owner` filtering on all user-data queries

| Finding | Severity |
|---------|----------|
| Cross-tenant data leak | BLOCKER |
| Missing permission class | BLOCKER |
| Hardcoded secret | BLOCKER |
| Missing input validation | WARNING |

## Step 5 — CI Status Check

```bash
gh pr checks {PR}
```

| Check | Expected |
|-------|----------|
| backend-lint | PASS required |
| backend-tests | PASS required |
| frontend-lint | PASS required |
| frontend-tests | PASS required |

If checks are still running, note "PENDING" status. If any check failed, include
failure details and mark as a blocking issue.

## Step 6 — Produce the Review

Output format:

```
## PR Review: #{number} — {title}

### Overview
{1-2 sentences: what this PR does and why}

**Branch:** `{branch}` — {PASS/WARN}
**Commits:** {N} — {PASS/WARN}
**Size:** +{additions} / -{deletions} across {files} files — {OK/WARN if >500 lines}

### Code Quality

| # | Area | Finding | Severity |
|---|------|---------|----------|
| 1 | ... | ... | BLOCKER/WARNING/NOTE |

### Security
{Findings table, or "No security concerns identified."}

### i18n Completeness
{PASS: all keys present in all 5 locales}
{BLOCKER: missing keys listed with file and line}

### CI Status

| Check | Status |
|-------|--------|
| backend-lint | PASS/FAIL/PENDING |
| backend-tests | PASS/FAIL/PENDING |
| frontend-lint | PASS/FAIL/PENDING |
| frontend-tests | PASS/FAIL/PENDING |

### Verdict: APPROVE / REQUEST CHANGES

**APPROVE:** "This PR is ready to merge. No blocking issues found."

**REQUEST CHANGES:** Numbered list of what must be fixed before merging.
```

## Step 7 — Post-Review Actions

### If APPROVE

Tell the user:
1. "PR is approved. You can merge with: `gh pr merge {PR} --squash --delete-branch`"
2. "After merge, run `/fintrack-release` to evaluate if a release is warranted."
3. Clean up: `git checkout main && git pull origin main`

### If REQUEST CHANGES

Tell the user:
1. List the specific changes needed
2. "Fix these issues, commit, and push. Then run `/pr-review` again."
3. The PR remains open — no need to create a new one

## Edge Cases

### PR has merge conflicts
Flag as BLOCKER. Suggest: `git fetch origin main && git rebase origin/main`

### PR is very large (>500 lines changed)
Warn that the PR may be hard to review. Suggest splitting if changes are
logically separable. Still review it fully.

### PR has no tests
- For `feat:` or `fix:` PRs: WARNING (should have tests)
- For `docs:`, `chore:`, `style:` PRs: acceptable

### Draft PR
Note that the review is preliminary. Still perform all checks.

### PR targets non-main branch
Warn: "This PR targets `{base}` instead of `main`. Releases only deploy from
`main`. Is this intentional?"

### Dependabot / external PRs
Review normally but note that branch naming conventions may not apply.
