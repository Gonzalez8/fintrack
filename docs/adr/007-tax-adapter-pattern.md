# ADR-007: Per-Country Tax Adapter Pattern

## Status

Accepted

## Date

2026-05-03

## Context

Fintrack ships an assistant that maps the user's transactions, dividends, interests and capital gains to the boxes (*casillas*) of a tax-declaration form. The first implementation targeted Spanish IRPF (AEAT Renta Web / Modelo 100) and was inlined in `apps/reports/services.py` (`tax_declaration()` plus helpers, ~330 lines) with the matching React component hardcoded into `tax-content.tsx`.

That worked while only Spain was supported, but every country has its own form, casilla labels, deduction rules and quirks (e.g. German *Anlage KAP* / *Abgeltungsteuer*, French *PFU*, Italian *cedolare secca*). Adding a second country to the original layout would have meant editing the same shared files for every country, with cross-country logic accumulating in one place and growing harder to test in isolation.

Two earlier changes set the stage:

- The `Settings.tax_country` field (ISO 3166-1 alpha-2, default `"ES"`) became the authoritative source for the user's fiscal residence.
- A simple `SUPPORTED_TAX_COUNTRIES = {"ES"}` constant gated the `/api/reports/tax-declaration/` endpoint and the Renta tab.

The remaining problem was *where the per-country code lives* and *how a contributor adds a new country without touching the existing one*.

## Decision

Adopt a **registry-based adapter pattern**. Each country has its own backend module and frontend component; both register themselves with a small dispatcher, and the rest of the application reads through the dispatcher.

### Backend layout

```
apps/reports/
├── services.py                       # generic services only
├── tax_adapters/
│   ├── __init__.py                   # _REGISTRY + register() / get_adapter() / supported_tax_countries()
│   ├── base.py                       # TaxAdapter Protocol
│   ├── common.py                     # country-agnostic helpers (q(), interest_withholding(), asset_country(), MONEY_Q, NET_MISMATCH_TOLERANCE)
│   └── es.py                         # SpanishTaxAdapter — auto-registers "ES"
└── tests/tax_adapters/
    ├── test_dispatcher.py
    └── test_es.py
```

`base.py` defines the contract:

```python
class TaxAdapter(Protocol):
    country_code: str
    def declare(self, user, year: int) -> dict[str, Any]: ...
```

Country modules end with `register("XX", MyAdapter())`. `__init__.py` imports every supported module so the registry is populated on app startup. `TaxDeclarationView` is a one-liner:

```python
adapter = get_adapter(user_settings.tax_country)
if adapter is None:
    return Response({"detail": ...}, status=404)
return Response(adapter.declare(request.user, year))
```

### Frontend layout

```
app/(dashboard)/tax/
├── tax-content.tsx                   # uses getTaxAdapter() dynamically
└── adapters/
    ├── index.ts                      # TAX_ADAPTERS map + getTaxAdapter() + SUPPORTED_TAX_COUNTRIES
    └── es-renta-tab.tsx              # EsRentaTab (Spanish form)
```

`SUPPORTED_TAX_COUNTRIES` is **derived** from `Object.keys(TAX_ADAPTERS)`, so the frontend gate stays in sync with what's actually wired up.

### Localization rule

Country-specific tax-form labels (casillas, deduction names, IRPF/Steuer terminology) stay **inside the adapter module** in the source language of that country's tax form. They are *not* pushed through the i18n catalogue. Rationale: `"Rendimientos del capital mobiliario"` is the literal term the user copies into Renta Web — translating it would defeat the workflow, and we'd need a per-country mini-glossary in every locale anyway. Only the UI chrome (tab titles, buttons, generic tooltips) is translated through `i18n/messages/*.json`.

### Adding a new country (e.g. Germany)

| Step | Backend | Frontend |
|------|---------|----------|
| 1 | Implement `tax_adapters/de.py` with a class whose `country_code = "DE"` and `declare()` returns the German block shape. End the module with `register("DE", GermanTaxAdapter())`. | Implement `adapters/de-steuer-tab.tsx` rendering that block shape. |
| 2 | Add `from . import de` to `tax_adapters/__init__.py`. | Add `DE: DeSteuerTab` to the `TAX_ADAPTERS` map in `adapters/index.ts`. |
| 3 | Tests in `apps/reports/tests/tax_adapters/test_de.py`. | (Component tests if needed.) |

No edits to `services.py`, `views.py`, `tax-content.tsx`, `settings-content.tsx`, or any existing country adapter.

## Consequences

### Positive

- **Isolation**: Each country lives in its own file/test/component. A bug fix for Spain cannot accidentally touch Germany.
- **Onboarding**: A contributor adding Italy reads `es.py` as a template and writes `it.py` — no need to understand the rest of the codebase.
- **Defense in depth**: The dispatcher returns 404 when no adapter exists, even if the frontend miscalculates the gate.
- **Single source of truth**: `SUPPORTED_TAX_COUNTRIES` is derived from the registry on both sides, so the Settings dropdown's ✓ marker, the Renta tab's visibility and the API gate all agree by construction.
- **No i18n explosion**: Country-specific tax labels remain monolingual inside their adapter; we don't ship 50+ glossary keys per locale.

### Negative

- **Slightly more files**: One extra module + one extra component per country, vs. inline functions. Acceptable for the scale.
- **Auto-registration via import side effects**: `tax_adapters/__init__.py` imports every country module so they self-register. This is conventional in Python plugin systems but does mean the import order of `__init__.py` is load-bearing.
- **Frontend cross-page import**: `settings-content.tsx` imports `isSupportedTaxCountry` from `app/(dashboard)/tax/adapters/`. This is a small piece of cross-page coupling; alternatives (duplicating the registry or moving it to `lib/`) traded clarity for indirection, so we accepted the import.

## Alternatives considered

- **Keep everything in `services.py` and grow `tax_declaration()` with per-country branching.** Rejected: the function would balloon to thousands of lines and any change risks cross-country regressions.
- **Strategy pattern via a single `TaxStrategy` class with country-specific subclasses inside one file.** Rejected: same physical-locality problem as the previous option.
- **Plugin discovery via entry points.** Rejected as over-engineered for an internal codebase. The explicit `from . import xx` in `__init__.py` is one extra line per country and makes the registry trivially auditable.
- **Translate every casilla through the i18n catalogue.** Rejected — see the localization rule above. Tax-form terminology is inherently monolingual.
