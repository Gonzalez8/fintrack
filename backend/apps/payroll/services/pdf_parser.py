"""Best-effort parser for Spanish payslips (nóminas).

Strategy:
1. ``extract_text(file_obj)`` reads the PDF with pdfplumber and returns the
   raw concatenated text. Plain wrapper around the library.
2. ``parse_payslip_text(text)`` is a pure function that runs regex against
   that text and returns a dict of suggested fields plus a confidence score.

Both functions are exposed so tests can exercise the parsing logic with
hand-written text fixtures, no real PDFs required.

Reglas innegociables (ver ADR-008):
- Este módulo NUNCA crea ni modifica registros. Sólo sugiere datos para que
  el usuario los revise antes de pulsar "Crear".
- Es experimental y best-effort. Si la confianza es baja, el endpoint que
  consume este parser devuelve 422 y el usuario rellena la nómina a mano.
- Solo cubre PDFs digitalmente generados (texto seleccionable). Los
  payslips escaneados requieren OCR (pdf2image + pytesseract), fuera de
  alcance del MVP.
"""

import re
from decimal import Decimal, InvalidOperation
from typing import Any

# All numeric fields the parser tries to extract. confidence = found / total.
_NUMERIC_FIELDS = (
    "gross",
    "ss_employee",
    "irpf_withholding",
    "net",
    "base_irpf",
    "base_cc",
    "employer_cost",
)

_SPANISH_MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}


def parse_es_decimal(raw: str) -> Decimal | None:
    """Convert a Spanish-formatted number ("1.594,05") to a ``Decimal``.

    Returns ``None`` if the string can't be parsed.
    """
    if not raw:
        return None
    cleaned = raw.strip().replace(" ", "").replace(" ", "")
    # Spanish format: thousands "." and decimal ",". Drop "." and swap "," → ".".
    cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


# Strict Spanish monetary number: optional sign, integer part with optional
# thousand groups (e.g. "5.523" or just "5523"), REQUIRED comma decimal
# ",NN". The leading negative lookbehind `(?<![\d.,])` prevents the engine
# from starting a match in the middle of a longer number. This deliberately
# avoids matching percentages like "28.86" (no comma decimal), so we don't
# grab the IRPF rate when looking for the IRPF amount.
_MONEY_RE = r"(?<![\d.,])-?\d+(?:\.\d{3})*,\d{2}"


def _first_money_after(text: str, pattern: str) -> Decimal | None:
    """Find the first Spanish-formatted monetary value after ``pattern``."""
    match = re.search(pattern + r"[\s\S]*?(" + _MONEY_RE + r")", text, re.IGNORECASE)
    if not match:
        return None
    return parse_es_decimal(match.group(1))


def _normalize_for_period_search(text: str) -> str:
    """Aggressively collapse whitespace and normalise dashes for period scan.

    Real PDFs sometimes split the period across lines (e.g. "...31 Diciembre\n
    2024 180") or use Unicode dashes (en-dash —, em-dash —). The strict regex
    won't match those without help. This helper:

      - Replaces Unicode dashes / hyphens with the ASCII '-' so the dash in
        "Concept - DD Mes YYYY a DD Mes YYYY" lines up.
      - Collapses any run of whitespace (spaces, tabs, newlines, NBSP) to a
        single space, removing the line-break problem entirely.

    We use this only for the period scan; the rest of the parser keeps
    line-by-line semantics (needed for `_extract_base_cc`, ss_employee, …).
    """
    # Common Unicode dash variants → ASCII hyphen-minus.
    for dash in ("–", "—", "−", "‒", "﹣", "－"):
        text = text.replace(dash, "-")
    # Collapse ANY whitespace (incl. NBSP  ) into a single space.
    return re.sub(r"\s+", " ", text)


def _parse_period_and_concept(text: str) -> tuple[str | None, str | None, str | None]:
    """Extract (period_start, period_end, concept) from the period line.

    Spanish payslips include a line like::

        Mensual - 1 Enero 2026 a 31 Enero 2026 30
        Atrasos Convenio - 1 Enero 2025 a 31 Agosto 2025 240
        INCENT. EMPRESA 1S - 1 Enero 2025 a 30 Junio 2025 180
        INCENTIVO 2S 2024 - 1 Julio 2024 a 31 Diciembre 2024 180

    where the text before the date span identifies the kind of payroll
    (Mensual, Extra, Atrasos, Incentivo…). We capture both the date span
    and that label so the user can tell the records apart at a glance.

    Strategy:
      1. Try the concept-aware regex on the original text.
      2. Try the bare date-span regex on the original text.
      3. Fall back to the same two regexes on a whitespace-normalised
         copy (collapses line breaks, normalises Unicode dashes). This
         covers PDFs where pdfplumber splits the period across rows.
    """
    # The capture group for the concept allows letters, digits, dots and
    # whitespace. Anchored on a non-word boundary so we don't start mid-token
    # like inside an SS number "0807907203 000098 Mensual".
    concept_pattern = (
        r"(?<![\w.])([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ0-9.\s]*?)"
        r"\s*-\s*"
        r"(\d{1,2})\s+(\w+)\s+(\d{4})\s+a\s+(\d{1,2})\s+(\w+)\s+(\d{4})"
    )
    date_only_pattern = r"(\d{1,2})\s+(\w+)\s+(\d{4})\s+a\s+(\d{1,2})\s+(\w+)\s+(\d{4})"

    def _build(d1, m1, y1, d2, m2, y2):
        m1n = _SPANISH_MONTHS.get(m1.lower())
        m2n = _SPANISH_MONTHS.get(m2.lower())
        if not m1n or not m2n:
            return None, None
        return (
            f"{int(y1):04d}-{m1n:02d}-{int(d1):02d}",
            f"{int(y2):04d}-{m2n:02d}-{int(d2):02d}",
        )

    # Pass 1: try the concept-aware regex on both the original and the
    # normalised text. We prefer this over a bare date match because it
    # gives us the concept too.
    for candidate in (text, _normalize_for_period_search(text)):
        m = re.search(concept_pattern, candidate)
        if not m:
            continue
        concept_raw, d1, m1, y1, d2, m2, y2 = m.groups()
        start, end = _build(d1, m1, y1, d2, m2, y2)
        if start is not None:
            concept = " ".join(concept_raw.split()).strip() or None
            return start, end, concept

    # Pass 2: only the date span (no concept). Same two-text fallback.
    for candidate in (text, _normalize_for_period_search(text)):
        m = re.search(date_only_pattern, candidate, re.IGNORECASE)
        if not m:
            continue
        d1, m1, y1, d2, m2, y2 = m.groups()
        start, end = _build(d1, m1, y1, d2, m2, y2)
        if start is not None:
            return start, end, None

    return None, None, None


def _parse_employer(text: str) -> tuple[str | None, str | None]:
    """Extract employer name and CIF/NIF if present.

    Heuristics: Spanish CIF is one letter + 8 digits, or 8 digits + one letter.
    Employer name typically appears between the "EMPRESA" header and the
    "DOMICILIO" header in template-style payslips.
    """
    name = None
    cif = None

    cif_match = re.search(r"\b([A-HJ-NP-SUVW]\d{8}|\d{8}[A-HJ-NP-TV-Z])\b", text)
    if cif_match:
        cif = cif_match.group(1)

    name_match = re.search(
        r"EMPRESA\s+DOMICILIO[\s\S]*?\n([A-Z0-9 .,\-&'\"ÑÁÉÍÓÚ]{3,})\s+(?:CL|C/|AV|AVDA|PASEO|P°|PLAZA)",
        text,
    )
    if name_match:
        name = name_match.group(1).strip()
    return name, cif


# Lines that typically appear in the "APORTACIÓN EMPRESA" column of the
# verbose bottom block. The last monetary number on each is the employer
# contribution for that concept; summing them yields the total employer cost.
_EMPLOYER_COST_LINES = (
    "Base Incapacidad Temporal",
    "AT y EP",
    "Desempleo",
    "Formación Profesional",
    "Fondo de garantía salarial",
)


def _extract_employer_cost(text: str) -> Decimal | None:
    """Return the total employer cost for the payslip.

    Some templates include an explicit footer ``Coste Empresa : NNNN,NN``;
    we use that when present. When it isn't (most monthly templates from
    common Spanish payrolls), we fall back to summing the per-concept
    APORTACIÓN EMPRESA column inside the
    "DETERMINACIÓN DE LAS BASES DE COTIZACIÓN" verbose block.

    The summed concepts are the standard ones a Spanish payslip declares:
    Contingencias Comunes (vía la línea "Base Incapacidad Temporal"), AT y
    EP, Desempleo, Formación Profesional and Fondo de garantía salarial.
    Each of those lines ends with the empresa contribution; we read the
    last number on the line.
    """
    explicit = _first_money_after(text, r"Coste\s+Empresa\s*:?")
    if explicit is not None:
        return explicit

    # Restrict the search to the bottom block so we don't accidentally pull
    # numbers from the header tables.
    parts = re.split(
        r"DETERMINACIÓN\s+DE\s+LAS\s+BASES",
        text,
        maxsplit=1,
        flags=re.IGNORECASE,
    )
    if len(parts) < 2:
        return None
    bottom = parts[1]

    found: list[Decimal] = []
    for line in bottom.splitlines():
        if not any(kw in line for kw in _EMPLOYER_COST_LINES):
            continue
        numbers = re.findall(_MONEY_RE, line)
        if not numbers:
            continue
        # Last number on the line is the empresa contribution for that
        # concept (the layout is "<concept> <base> <rate> <aportación>").
        value = parse_es_decimal(numbers[-1])
        if value is not None:
            found.append(value)
    if not found:
        return None
    return sum(found, Decimal("0"))


def _extract_base_cc(text: str) -> Decimal | None:
    """Extract the base de contingencias comunes from the bottom verbose block.

    The expected line is::

        Base Incapacidad Temporal Total <BASE> <RATE>% <APORTACIÓN>

    On payslips that don't trigger SS contingencies (e.g. "atrasos
    convenio") the line collapses to just::

        Base Incapacidad Temporal Total <APORTACIÓN>

    and there's no real base CC. We disambiguate by counting numbers on
    the line: with two or more, the first is the base; with only one
    (and no ``%`` separator), it's the empresa contribution and the base
    is unknown — return ``None`` rather than misreport it.
    """
    for line in text.splitlines():
        if "Base Incapacidad Temporal" not in line:
            continue
        numbers = re.findall(_MONEY_RE, line)
        has_pct = "%" in line
        if numbers and (len(numbers) >= 2 or has_pct):
            return parse_es_decimal(numbers[0])
        return None
    return None


def _sum_ss_employee(text: str) -> Decimal | None:
    """Sum every Cotización* line found in the deductions section.

    Spanish payslips list the worker's SS contributions as separate lines:
    Contingencias Comunes, MEI, Adicional Solidaridad, Formación Profesional,
    Desempleo. We sum whichever ones we find.

    We match only Spanish-formatted monetary values (with comma decimal) so
    the parenthesised percentages like "(4.70%)" are skipped automatically.
    """
    found: list[Decimal] = []
    for line in text.splitlines():
        if "Cotización" in line:
            numbers = re.findall(_MONEY_RE, line)
            if numbers:
                # The monetary amount is always the last on the line.
                value = parse_es_decimal(numbers[-1])
                if value is not None:
                    found.append(value)
    if not found:
        return None
    return sum(found, Decimal("0"))


def parse_payslip_text(text: str) -> dict[str, Any]:
    """Parse the raw text of a Spanish payslip.

    Returns a dict shaped like::

        {
            "suggested": {
                "period_start": str | None,
                "period_end": str | None,
                "concept": str | None,        # "Mensual" / "Atrasos Convenio" / …
                "gross": str | None,
                "ss_employee": str | None,
                "irpf_withholding": str | None,
                "net": str | None,
                "base_irpf": str | None,
                "base_cc": str | None,
                "employer_cost": str | None,
                "employer_name": str | None,
                "employer_cif": str | None,
            },
            "confidence": float,   # 0..1
            "warnings": [str],
        }
    """
    warnings: list[str] = []

    period_start, period_end, concept = _parse_period_and_concept(text)
    employer_name, employer_cif = _parse_employer(text)

    gross = _first_money_after(text, r"REM\.\s*TOTAL")
    if gross is None:
        gross = _first_money_after(text, r"Total\s+devengado")

    net = _first_money_after(text, r"Líquido\s+a\s+Percibir")
    # IRPF amount appears after the parenthesised rate: "Tributación IRPF(28.86%)  1594,05".
    # The strict monetary regex skips the rate (no comma decimal).
    irpf = _first_money_after(text, r"Tributación\s+IRPF")
    # Anchor on the verbose bottom block: "Base sujeta a retención I.R.P.F.  5523,40".
    base_irpf = _first_money_after(text, r"Base\s+sujeta\s+a\s+retención\s+I\.R\.P\.F\.")
    # base_cc only appears with a real value when the line has 2+ monetary
    # numbers (or a percentage) — see _extract_base_cc. On atrasos / extras
    # without SS contingencies the line collapses and we report None instead
    # of misreporting the empresa contribution.
    base_cc = _extract_base_cc(text)
    employer_cost = _extract_employer_cost(text)
    ss_employee = _sum_ss_employee(text)

    suggested: dict[str, str | None] = {
        "period_start": period_start,
        "period_end": period_end,
        "concept": concept,
        "gross": str(gross) if gross is not None else None,
        "ss_employee": str(ss_employee) if ss_employee is not None else None,
        "irpf_withholding": str(irpf) if irpf is not None else None,
        "net": str(net) if net is not None else None,
        "base_irpf": str(base_irpf) if base_irpf is not None else None,
        "base_cc": str(base_cc) if base_cc is not None else None,
        "employer_cost": str(employer_cost) if employer_cost is not None else None,
        "employer_name": employer_name,
        "employer_cif": employer_cif,
    }

    found = sum(1 for f in _NUMERIC_FIELDS if suggested.get(f) is not None)
    confidence = round(found / len(_NUMERIC_FIELDS), 2)

    if confidence < 1.0:
        missing = [f for f in _NUMERIC_FIELDS if suggested.get(f) is None]
        warnings.append(f"Campos no detectados: {', '.join(missing)}.")
    if period_start is None or period_end is None:
        warnings.append("Periodo no detectado — rellénalo manualmente.")

    return {"suggested": suggested, "confidence": confidence, "warnings": warnings}


def extract_text(file_obj) -> str:
    """Read a PDF and return the concatenated text of every page.

    Imported lazily so the rest of the module is testable without
    pdfplumber installed (CI mocks it for unit tests).
    """
    import pdfplumber

    chunks: list[str] = []
    with pdfplumber.open(file_obj) as pdf:
        for page in pdf.pages:
            chunks.append(page.extract_text() or "")
    return "\n".join(chunks)


def parse_payslip(file_obj) -> dict[str, Any]:
    """Convenience wrapper: extract text from a PDF and parse it."""
    return parse_payslip_text(extract_text(file_obj))
