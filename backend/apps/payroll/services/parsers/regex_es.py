"""Regex-based Spanish payslip parser.

Thin :class:`PayslipParser` wrapper around the legacy module-level
functions in ``apps.payroll.services.pdf_parser``. We keep the regex
helpers in the legacy file so the existing parser tests continue to
import them from the same path; this module only adapts them to the
registry contract.

To replace this parser with an AI-based one (e.g. Claude or GPT
extracting the payslip into structured JSON), copy the shape: define
a class with ``name`` + ``parse(file)``, end the module with
``register(YourParser())``, and import it from
``parsers/__init__.py``. No edits to the view layer or to this file.
"""

from typing import Any

from . import register
from .base import PayslipParseResult


class RegexEsPayslipParser:
    """Default parser for Spanish payslips. Uses pdfplumber + regex.

    The implementation lives in
    ``apps.payroll.services.pdf_parser`` (``extract_text`` and
    ``parse_payslip_text``). This class is a thin Strategy adapter
    around them so the rest of the codebase can stay decoupled from
    the regex details.
    """

    name = "regex-es"

    def parse(self, file_obj: Any) -> PayslipParseResult:
        # Imported lazily so a deployment that swaps this parser for an
        # AI one doesn't have to keep pdfplumber installed.
        from apps.payroll.services.pdf_parser import (
            extract_text,
            parse_payslip_text,
        )

        raw_text = extract_text(file_obj)
        parsed = parse_payslip_text(raw_text)
        return PayslipParseResult(
            suggested=parsed["suggested"],
            confidence=parsed["confidence"],
            warnings=list(parsed.get("warnings", [])),
            extracted_text=raw_text,
            parser_name=self.name,
        )


register(RegexEsPayslipParser())
