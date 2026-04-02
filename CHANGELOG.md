# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-01

### Added

- **Portfolio engine**: FIFO/LIFO/WAC cost basis calculation with realized P&L tracking
- **Asset management**: Stock, ETF, Fund, Crypto with Yahoo Finance price sync
- **Account tracking**: Checking, savings, investment, deposit accounts with balance snapshots
- **Transactions**: Buy/Sell/Gift with commission and tax tracking
- **Dividends**: Per-asset dividend tracking with withholding tax by country
- **Interests**: Account interest income with date ranges
- **Real estate**: Property tracking with mortgage management and amortization simulation
- **Reports**: Tax summary, net worth evolution, monthly/annual savings, CSV exports
- **Savings goals**: Target-based projections with conservative/average/optimistic scenarios
- **Privacy mode**: Toggle to mask all monetary amounts across the app
- **i18n**: Full support for 5 languages (es, en, de, fr, it)
- **Demo mode**: MSW-based mock data, works without backend
- **Auth**: JWT in httpOnly cookies, Google OAuth2, registration
- **BFF pattern**: Next.js Route Handlers proxy all API calls to Django
- **Docker**: Full development and production Docker Compose setup
- **CI/CD**: GitHub Actions for tests and Docker image publishing

## [1.1.0] - 2026-04-02

### Added

- **Test coverage**: Comprehensive backend (pytest) and frontend (vitest) test suites
- **CI enhancements**: Linting (ruff, ESLint), type checking (mypy, tsc), coverage reporting
- **Pre-commit hooks**: Automated code quality checks before commits
- **Documentation**: DEVELOPMENT.md, SECURITY.md, CONTRIBUTING.md, expanded ADRs
- **GitHub templates**: Issue and PR templates for consistent contributions
- **Dependabot**: Automated dependency security updates
- **Code quality**: ruff + black formatting, mypy type checking for Python; prettier for TypeScript
- **Coverage reporting**: pytest-cov and vitest coverage with Codecov integration

### Changed

- Enhanced CI workflow with lint, typecheck, and coverage upload steps
- Added coverage thresholds to prevent regressions
