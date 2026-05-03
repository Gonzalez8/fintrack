"""Tax-adapter contract.

Each country with a tax-declaration assistant lives in its own module
(`tax_adapters/{iso2}.py`) and exposes an instance that conforms to the
`TaxAdapter` protocol below. The registry in `__init__.py` dispatches by
ISO 3166-1 alpha-2 country code.
"""

from typing import Any, Protocol


class TaxAdapter(Protocol):
    """Country-specific tax-declaration adapter.

    Implementations should:
      - expose `country_code` as a 2-letter ISO 3166-1 alpha-2 string
      - implement `declare(user, year)` returning a serialisable dict whose
        shape is country-specific (the frontend renders a country-specific
        component per adapter)

    Adapters may keep all country-specific labels (form-box names, deduction
    rules, etc.) inline in their own module: tax-form terminology does not
    translate well, so we deliberately do NOT push those strings through the
    UI's i18n catalogue.
    """

    country_code: str

    def declare(self, user: Any, year: int) -> dict[str, Any]: ...
