"""Contract for payslip parsers.

Each parser is a strategy that takes an uploaded PDF (or any file-like
object) and returns a :class:`PayslipParseResult`. The view layer talks to
the abstraction; concrete parsers live in their own modules so we can add
new ones (AI-based, OCR-based, per-employer template…) without touching
the existing code.

Add a new parser by:

  1. Creating ``parsers/<name>.py``.
  2. Exposing a class with ``name: str`` and ``parse(file) -> PayslipParseResult``.
  3. Ending the module with ``register(<MyParser>())``.
  4. Importing the module from ``parsers/__init__.py`` so it self-registers.
  5. Optionally: set ``PAYSLIP_PARSER=<name>`` in env/settings to switch the
     default. No other file needs to change.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass
class PayslipParseResult:
    """Structured output every parser returns."""

    suggested: dict[str, Any]
    """Field-by-field suggestions for the payroll form (keys match the
    `PayrollFormData` shape on the frontend: ``period_start``,
    ``period_end``, ``concept``, ``gross``, ``ss_employee``,
    ``irpf_withholding``, ``net``, ``base_irpf``, ``base_cc``,
    ``employer_cost``, ``employer_name``, ``employer_cif``).

    Any field that the parser could not determine should be ``None``."""

    confidence: float
    """0..1 — what fraction of the expected fields the parser filled in.
    Used by the view to decide whether to return 422 (low confidence,
    rellena a mano) or 200 (sugerir al usuario)."""

    warnings: list[str] = field(default_factory=list)
    """Human-readable hints the user might want to know (missing fields,
    fields with low certainty, ambiguous extraction)."""

    extracted_text: str | None = None
    """Optional raw text the parser worked from. Surfaced to the user so
    they can diagnose why the parser missed a field on an unusual
    template, without having to round-trip the binary PDF."""

    parser_name: str = ""
    """Identifier of the parser that produced this result. Useful for
    debugging and analytics."""


@runtime_checkable
class PayslipParser(Protocol):
    """Strategy interface every payslip parser implements.

    Implementations should:

    - expose a stable ``name`` string for the registry (e.g. ``"regex-es"``,
      ``"ai-claude"``, ``"ocr-tesseract"``)
    - never persist data — they are pure suggestion engines (see ADR-008
      "Reglas innegociables del parser")
    - return ``confidence = 0.0`` and a useful warning instead of raising
      when the input is unrecognisable

    The view layer treats every parser the same way; swap is via Django
    settings, no code edit.
    """

    name: str

    def parse(self, file_obj: Any) -> PayslipParseResult: ...
