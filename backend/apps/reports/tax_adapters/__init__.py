"""Tax-adapter registry.

Country adapters self-register at import time by calling :func:`register` from
their own module. Adding a new country is a 3-step recipe:

    1. Create ``tax_adapters/{iso2}.py`` exposing a class/instance whose
       ``country_code`` matches the ISO 3166-1 alpha-2 code, and which
       implements :class:`apps.reports.tax_adapters.base.TaxAdapter`.
    2. End that module with ``register("XX", MyAdapter())``.
    3. Import it from this file (see the bottom of this module) so the
       registry is populated on app startup.

The frontend mirrors this layout under ``frontend/src/app/(dashboard)/tax/
adapters/`` and keeps its own registry of UI components per country code.
"""

from .base import TaxAdapter

_REGISTRY: dict[str, TaxAdapter] = {}


def register(code: str, adapter: TaxAdapter) -> None:
    """Register an adapter under its ISO 3166-1 alpha-2 country code.

    The code is normalised to uppercase so callers do not need to worry about
    casing. Re-registering the same code overwrites the previous adapter (this
    is helpful in tests).
    """
    _REGISTRY[code.upper()] = adapter


def get_adapter(country_code: str | None) -> TaxAdapter | None:
    """Return the adapter for ``country_code`` or ``None`` if unsupported."""
    if not country_code:
        return None
    return _REGISTRY.get(country_code.upper())


def supported_tax_countries() -> frozenset[str]:
    """ISO codes of the countries currently exposed by the registry."""
    return frozenset(_REGISTRY)


# Adapter modules are imported here so registration happens on app startup.
# noqa: E402 — ordering matters; the import must come after `register` is defined.
from . import es  # noqa: E402,F401
