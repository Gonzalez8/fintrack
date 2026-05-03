"""Building blocks shared by all country adapters.

Helpers placed here must be country-agnostic. Anything that encodes
country-specific tax rules belongs in its own adapter module
(`tax_adapters/{iso2}.py`).
"""

from decimal import Decimal

MONEY_Q = Decimal("0.01")
NET_MISMATCH_TOLERANCE = Decimal("0.02")


def q(value):
    """Quantize a Decimal to 2 decimal places, treating ``None`` as zero."""
    return (value or Decimal("0")).quantize(MONEY_Q)


def interest_withholding(interest):
    """Return the withholding amount for a given Interest row.

    `interest.tax` is the WITHHOLDING TAX in origin (not a rate).
      - tax IS NOT NULL → respect literally (Decimal("0") = "no withholding").
      - tax IS NULL     → not informed; infer from ``gross - net - commission``
        and clamp to 0.
    """
    if interest.tax is not None:
        return interest.tax
    inferred = interest.gross - interest.net - (interest.commission or Decimal("0"))
    return inferred if inferred > Decimal("0") else Decimal("0")


def asset_country(asset):
    """Best-effort country for an asset (used for foreign tax classification).

    Prefers ``withholding_country`` (overridable by the user); falls back to
    ``issuer_country``. Returns the upper-case ISO code or ``None``.
    """
    return (asset.withholding_country or asset.issuer_country or "").upper() or None
