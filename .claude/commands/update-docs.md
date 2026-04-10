---
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: [area] | --changelog | --architecture | --adr | --all
description: Update project documentation to reflect current implementation state
---

# Documentation Update

Update Fintrack documentation: $ARGUMENTS

## Current State

- Recent changes: !`git log --oneline -10`
- Last tag: !`git describe --tags --abbrev=0 2>/dev/null || echo "no tags"`
- Docs directory: !`ls docs/ 2>/dev/null`
- ADRs: !`ls docs/adr/ 2>/dev/null`

## What to Update

### 1. CHANGELOG.md (if `--changelog` or `--all`)

- Review commits since the last CHANGELOG entry
- Add entries following Keep a Changelog format
- Sections: Added, Changed, Fixed, Dependencies (only include sections with entries)
- Rewrite commit messages for user clarity — don't just copy the commit subject

### 2. Architecture docs (if `--architecture` or `--all`)

- Update `docs/architecture.md` to reflect current system state
- Verify documented components match actual implementation
- Update diagrams or descriptions if architecture has changed

### 3. ADRs (if `--adr` or `--all`)

- Review `docs/adr/` for any decisions that need documenting
- If a recent change represents an architectural decision, create a new ADR
- ADR format: title, status, context, decision, consequences

### 4. CLAUDE.md (if `--all`)

- Verify project structure matches reality
- Check that conventions still apply
- Update tech stack versions if they've changed
- Remove any stale references

### 5. Other docs (if `--all`)

- `docs/DEVELOPMENT.md` — dev setup, commands, workflows
- `docs/CONTRIBUTING.md` — contribution guidelines
- `docs/SECURITY.md` — security policy

## Guidelines

- Only update what has actually changed — don't rewrite docs that are current
- Read each file before editing to understand existing structure
- Preserve existing formatting and style
- Verify claims against actual code before writing them into docs
- If a doc is already accurate, skip it and report "no changes needed"

## Output

After completing, provide:
1. Files updated (with brief description of changes)
2. Files reviewed but unchanged
3. Any issues found (stale docs, missing docs, inconsistencies)
