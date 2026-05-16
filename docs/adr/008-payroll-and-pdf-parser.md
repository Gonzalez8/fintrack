# ADR-008: Payroll Tracking and Best-Effort PDF Parser

## Status

Accepted

## Date

2026-05-03

## Context

Until now Fintrack tracked *Rendimientos del capital mobiliario* (interests, dividends) and *Ganancias patrimoniales* (capital gains), but not the largest single block of a salaried user's income tax declaration: **Rendimientos del trabajo**. For a Spanish employee, this is the dominant fiscal concept of the year — without it, the Modo Renta assistant covers a narrow slice of reality.

Two needs to address at once:

1. A persistent record of monthly payslips (gross, SS contributions, IRPF withholding, net) that we can aggregate into the Spanish tax-return assistant and into future income/savings reports.
2. A way to digitise existing payslip PDFs without forcing the user to re-type every figure by hand. PDFs are the dominant payslip format in Spain, and most are digitally generated (selectable text), so a regex-based parser is feasible without OCR for the common case.

We deliberately separate these concerns: the persistent record must be reliable and country-agnostic; the parser is an experimental convenience that can fail without affecting the core data model.

## Decision

### Data model

A new app `apps/payroll/` with two models:

- **`Employer`** — recurring pagador. Fields: `name`, `cif` (Spanish NIF/CIF, optional), `ss_account`, `address`, `notes`. Owned by user. Unique by `(owner, name)`.
- **`Payroll`** — one record per monthly payslip. FK `employer` (PROTECT). Period via `period_start`/`period_end` (so we can filter by year and group by month). Numeric fields:
  - `gross` — **retribución dineraria total** (Total devengado / REM. TOTAL). MVP-only.
  - `ss_employee` — sum of worker SS contributions.
  - `irpf_withholding` — retención por rendimientos del trabajo.
  - `net` — líquido a percibir, **as it appears on the payslip**.
  - Optional: `base_irpf`, `base_cc`, `employer_cost`.
  - `notes`, `import_hash` (dedup hook for future bulk imports).

Unique constraints: `(owner, employer, period_start, period_end)` to avoid duplicating a month for the same employer; `(owner, import_hash)` (conditional) for future PDF-import deduplication.

### Localisation rule for `gross`

`Payroll.gross` represents *only* monetary compensation (retribución dineraria) for the MVP. Real Spanish payslips sometimes include retribución en especie (vehicle, housing…), exempt income (dietas exoneradas, indemnizaciones por despido…) and non-salary adjustments (anticipos, embargos, regularizations). We do **not** model these in the MVP and document the gap explicitly:

- Future fields `gross_in_kind`, `gross_exempt`, `non_salary_adjustments` are reserved in the help_text and ADR. Adding them later does not break the existing schema.
- The serializer **never** rejects a record on the basis of `gross − ss − irpf ≠ net`. Real payslips legitimately break that identity. Instead, an informational `net_mismatch` field exposes the delta and a payroll-level warning is surfaced from the Modo Renta block.

### API

- `GET / POST /api/employers/` and `GET / PUT / DELETE /api/employers/{id}/`.
- `GET / POST /api/payrolls/` (filters `?year=`, `?month=`, `?employer_id=`) and `GET / PUT / DELETE /api/payrolls/{id}/`.
- `POST /api/payrolls/parse-pdf/` — see below.

### Modo Renta integration

`SpanishTaxAdapter.declare()` gains a fifth block, `employment_income`, with stable Spanish concept names (no casilla numbers — those rotate each year):

```python
{
    "casilla": "Rendimientos del trabajo · Retribuciones dinerarias y retenciones",
    "gross": ...,           # Retribución dineraria total
    "ss_deductible": ...,   # Cotizaciones a la Seguridad Social
    "withholding": ...,     # Retenciones por rendimientos del trabajo
    "net_informative": ...,
    "by_employer": [{name, cif, gross, ss_deductible, withholding, net}, ...],
}
```

The `summary` dict is extended with `employment_gross`, `employment_ss_deductible`, `employment_withholding`. New informational warnings (always non-blocking):

- `payroll_net_mismatch` — when `gross − ss − irpf − net` exceeds the standard tolerance on a single payroll. The message reminds the user that the discrepancy is expected with anticipos / embargos / dietas / especie / regularizations.
- `payroll_missing_months` — best-effort heads-up if there are gaps between the first and last payroll of the year for an employer.

We **never** mix work-income retentions with capital-mobiliary casillas. (The well-known confusion of casilla 0596 vs 0597 — the latter is *capital mobiliario*, not employment — is avoided by aggregating only work-income retentions in this block.)

### Frontend

- New `/nominas` page mirroring the `/interests` CRUD pattern (filters, mobile cards via `SwipeCard`, desktop `DataTable`, dialog form, detail drawer). Sidebar entry under "Operaciones".
- Inline employer creation from the payroll dialog — no separate `/empleadores` page in the MVP.
- The Modo Renta tab renders `<EmploymentBlock>` first (above interests) so a salaried user sees their main block at the top. Copy-all payload starts with the work-income totals.
- 23 + 5 + 6 = ~34 new i18n keys per locale (× 5 = 170 keys total).

### PDF parser

The parser is structured as a **Strategy registry** so we can add alternative implementations (AI, OCR, per-employer template) later without touching the rest of the codebase. SOLID-friendly: the view depends on the abstraction, concrete parsers live in their own files, and switching the active one is a Django setting away.

```
apps/payroll/services/
├── pdf_parser.py             # legacy regex helpers (parse_es_decimal,
│                             # parse_payslip_text, extract_text). Kept as
│                             # internal utilities used by regex_es.py.
└── parsers/
    ├── __init__.py           # registry + get_default_parser() reading
    │                         # `settings.PAYSLIP_PARSER`
    ├── base.py               # PayslipParser Protocol + PayslipParseResult
    │                         # dataclass — the abstraction the view depends on
    └── regex_es.py           # RegexEsPayslipParser — wraps pdf_parser.py;
                              # self-registers as "regex-es" (the default)
```

Hard rules (non-negotiable, apply to every parser):

1. **Read-only.** The parser never creates, modifies, or deletes records.
2. **Suggestion only.** The frontend pre-fills the form and the user *must* confirm. Strict parse-then-review.
3. **Explicit invocation only.** Triggered by user file upload from the dialog. No cron, no email handler, no folder watcher.
4. **Best-effort.** When confidence < 0.3 the endpoint returns `422` and the user fills the form by hand. Each parser is documented as `experimental` until proven on a wide range of templates.

The endpoint accepts `multipart/form-data` (max 10 MB), uses `IsAuthenticated`, and asks the registry for `get_default_parser()`. The registry reads `settings.PAYSLIP_PARSER` (env `PAYSLIP_PARSER`, default `"regex-es"`) and returns the matching implementation. Misspelt setting → loud `RuntimeError` at request time so the operator notices immediately.

#### Adding a new parser (e.g. AI-based)

The minimum surface to ship a Claude-powered parser:

1. **Create `parsers/ai_claude.py`** with a class that satisfies the Protocol:

   ```python
   from . import register
   from .base import PayslipParseResult

   class AiClaudePayslipParser:
       name = "ai-claude"

       def __init__(self, client=None):
           self.client = client or _build_default_client()

       def parse(self, file_obj) -> PayslipParseResult:
           # Send PDF bytes to Claude, get structured JSON back
           response = self.client.messages.create(...)
           suggested = _to_payslip_dict(response)
           return PayslipParseResult(
               suggested=suggested,
               confidence=_score(suggested),
               warnings=[],
               extracted_text=None,  # AI parsers don't necessarily extract text
               parser_name=self.name,
           )

   register(AiClaudePayslipParser())
   ```

2. **Import it from `parsers/__init__.py`** so it self-registers at startup:

   ```python
   from . import regex_es  # noqa
   from . import ai_claude  # noqa
   ```

3. **Switch the default** with an env var:

   ```bash
   PAYSLIP_PARSER=ai-claude
   ```

The view, the regex parser, the frontend dialog, the URL routing, the form contract, the i18n keys and the existing tests do **not** change. Operators can also flip the setting per environment (regex in CI, AI in production) without rebuilds.

#### Why a registry instead of a flag?

- A flag (`USE_AI_PARSER=true`) forces a binary choice and bakes `if` branches into the view.
- A registry lets us run **multiple** parsers at once — e.g. compare AI vs regex on a sample to evaluate accuracy — by selecting them by name from tests or admin scripts.
- It satisfies Open/Closed: adding a parser is *only additive*. No edits to any file already shipped.
- It mirrors `apps/reports/tax_adapters/` (ADR-007) so contributors familiar with that area already know the pattern.

## Consequences

### Positive

- **Tax-return completeness for salaried users.** The largest block of an IRPF return is now covered.
- **Faster data entry.** Most monthly payslips are digitally generated PDFs; the parser cuts the typing in half for users with the common Spanish payroll templates.
- **Country-agnostic data model.** Although the Modo Renta integration is Spain-specific, the `Employer`/`Payroll` schema works for any country. Future country adapters can read from it without changes.
- **Defensive-by-design parser.** The strict parse-then-review rule keeps the parser as a *convenience*; it cannot corrupt data.
- **Schema headroom.** Reserved fields for retribución en especie / exentos / non-salary adjustments mean we can extend without a disruptive migration.

### Negative

- **MVP doesn't cover retribución en especie or exentos.** Users with car/housing benefits or large dietas exoneradas will see a `net_mismatch` warning until the schema grows. Documented up front.
- **Parser depends on Spanish payslip terminology.** Templates that diverge from the typical AEAT-aligned vocabulary will fail to extract one or more fields. Users fall back to manual entry — acceptable trade-off for an experimental feature.
- **No OCR.** Scanned-image PDFs aren't supported. Adding `pytesseract` + `pdf2image` would inflate the Docker image significantly; deferred until justified by demand.
- **Cross-page frontend coupling.** The payroll page is independent, but the Modo Renta tab now reads from the Payroll model — so the Spanish adapter has a new soft dependency on `apps.payroll`. Imported lazily inside `_build_employment_block` to keep the registry / module load order untouched.

## Alternatives considered

- **Embed payroll fields in `apps/transactions/`.** Rejected: that app is already heterogenous (BUY/SELL transactions + dividends + interests). Adding employer + payroll would muddy it further. A dedicated app keeps the schema migrations and tests focused.
- **Store gross only, derive ss/irpf from rates.** Rejected: payroll math is not derivable from a single base rate; multiple bases (CC, AT/EP, IRPF) and multiple worker contribution rates apply, and they vary year to year. Storing the actuals is correct.
- **Reject payslips that don't satisfy `gross − ss − irpf == net`.** Rejected — see the localisation rule above. Real payslips break that identity legitimately.
- **OCR-first parser using Tesseract.** Rejected for the MVP: scope explosion, image-mode dependency, slow CI. We start with `pdfplumber` text extraction and revisit if users with scanned PDFs report demand.
- **Per-employer template parsers (registry-of-templates).** Rejected for the MVP: requires per-template setup that doesn't exist yet. The single Spanish-template heuristic covers the common case; adding a registry can be a follow-up if needed.
- **Auto-create payrolls from a parsed PDF.** Rejected as fundamentally unsafe — the parser must be advisory only. See the hard rules above.
