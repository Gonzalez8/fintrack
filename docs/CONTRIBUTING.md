# Contributing to Fintrack

Thank you for your interest in contributing to Fintrack! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/fintrack.git`
3. Create a feature branch: `git checkout -b feat/your-feature`
4. Set up the development environment (see [DEVELOPMENT.md](./DEVELOPMENT.md))

## Development Workflow

### Branch Naming

Use descriptive branch names with a prefix:

- `feat/` — new features
- `fix/` — bug fixes
- `docs/` — documentation changes
- `refactor/` — code refactoring
- `test/` — adding or updating tests
- `chore/` — maintenance tasks

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`

**Scopes:** `backend`, `frontend`, `ci`, `docs`, `deps`

Examples:
```
feat(backend): add dividend withholding tax report
fix(frontend): correct privacy mode toggle persistence
test(backend): add transaction CRUD tests
docs: update DEVELOPMENT.md with backup instructions
```

## Pull Request Requirements

Every PR must:

1. **Include tests** — New features need tests; bug fixes need regression tests
2. **Pass CI checks** — Lint, typecheck, and all tests must pass
3. **Maintain coverage** — Don't decrease test coverage
4. **Follow conventions** — Use the existing code style and patterns
5. **Update docs** — If behavior changes, update relevant documentation
6. **Add i18n keys** — New UI text must be added to ALL 5 locale files (es, en, de, fr, it)

## Code Style

### Python (Backend)

- **Formatter:** ruff format (line length: 120)
- **Linter:** ruff (rules: E, F, I, UP, B, SIM, W)
- **Type hints:** Encouraged but not yet enforced via mypy
- **Money:** Always use `Decimal`, never `float`
- **IDs:** UUID via `TimeStampedModel` base class
- **Multi-tenancy:** Every model must have an `owner` FK

### TypeScript (Frontend)

- **Formatter:** Prettier
- **Linter:** ESLint with next/core-web-vitals
- **Types:** Strict TypeScript — no `any` unless absolutely necessary
- **Components:** Prefer Server Components; use Client Components only for interactivity
- **Data fetching:** Server Components use `djangoFetch()`; Client mutations use React Query

### Testing

**Backend:**
- Framework: pytest + pytest-django
- Use `@pytest.mark.django_db` on test classes
- Use `APIClient` with `force_authenticate` for API tests
- Use `Decimal` for all monetary assertions

**Frontend:**
- Framework: vitest + @testing-library/react
- Pure functions: Unit tests (e.g., `mortgage-math.test.ts`)
- Components: Render tests with @testing-library
- API calls: Mock `fetch` with `vi.fn()`

## Architecture Guidelines

- **BFF pattern:** Browser never calls Django directly. All API calls go through Next.js Route Handlers
- **Privacy-aware:** Use `formatMoney(value, currency, isPublic)` — set `isPublic=true` only for market data
- **Mobile-first:** Use `SwipeCard` for list items on mobile, inline buttons on desktop
- **No premature abstraction:** Three similar lines > one premature helper

## Reporting Issues

- Use the [bug report template](./.github/ISSUE_TEMPLATE/bug_report.md) for bugs
- Use the [feature request template](./.github/ISSUE_TEMPLATE/feature_request.md) for ideas
- Security issues: See [SECURITY.md](./SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](../LICENSE).
