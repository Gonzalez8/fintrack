"""Spanish rental income — *rendimientos del capital inmobiliario* (arts. 22–23 LIRPF, 13–15 RIRPF).

``compute_rental`` is a pure function: the simulator posts any figures to it and the yearly overview feeds it the
user's records. ``rental_overview`` builds those inputs per property — what happened up to today and a projection of
the whole year — from leases, rent payments (``OtherIncome`` linked to a lease), rental expenses, the property's tax
data and its mortgage.

Rules applied (simplified, documented in ADR-012):

- Income: rent received in the year (your ownership share).
- Loan interest + repairs/maintenance are deductible up to the income; the excess carries forward 4 years.
- Other expenses (IBI and local taxes, community, insurance, utilities, agency/management/legal, other) are
  deductible without that cap. Year-round costs of the whole property (IBI, community, insurance, interest) are
  prorated by the days rented within the period they cover and by the share of the property rented.
- Depreciation: 3 % a year of the higher of acquisition cost (price + purchase costs) and cadastral value, excluding
  the land (construction share of the cadastral value), plus improvements; furniture 10 %. Prorated like above.
- Reduction on a positive net rent when it is the tenant's main home: 50 % general, 60 % contracts before
  26/05/2023 or after a renovation, 70 % young tenants in stressed areas, 90 % lowered rent in stressed areas.
- Days the property was empty (not rented, not your home) impute 1.1 % (2 % if the cadastral value was not revised
  since 1994) of the cadastral value, prorated.
- The tax estimate applies an approximate combined state + regional general scale to the rent on top of the rest of
  your general base (payslips). Regional scales differ: it is an estimate, not the tax return.
"""

from __future__ import annotations

import calendar
from dataclasses import asdict, dataclass, field, fields
from datetime import date
from decimal import Decimal

from .common import q

ZERO = Decimal("0")
HUNDRED = Decimal("100")
DEPRECIATION_RATE = Decimal("0.03")
FURNITURE_RATE = Decimal("0.10")
IMPUTATION_REVISED = Decimal("0.011")
IMPUTATION_NOT_REVISED = Decimal("0.02")
WORK_EXPENSES_DEDUCTION = Decimal("2000")  # "otros gastos deducibles" of employment income

REDUCTION_PCT = {
    "PRE_2023": Decimal("60"),
    "GENERAL": Decimal("50"),
    "RENT_DROP": Decimal("90"),
    "YOUNG": Decimal("70"),
    "REHAB": Decimal("60"),
    "NONE": ZERO,
}

# Approximate combined (state + regional) general IRPF scale: (upper bound of the bracket, marginal rate %)
GENERAL_SCALE: tuple[tuple[Decimal | None, Decimal], ...] = (
    (Decimal("12450"), Decimal("19")),
    (Decimal("20200"), Decimal("24")),
    (Decimal("35200"), Decimal("30")),
    (Decimal("60000"), Decimal("37")),
    (Decimal("300000"), Decimal("45")),
    (None, Decimal("47")),
)

# Expense categories that recur every year (used to project the rest of the year from the previous one)
RECURRING = ("TAXES", "COMMUNITY", "INSURANCE", "UTILITIES", "SERVICES")
EXPENSE_FIELDS = ("financing", "repairs", "taxes", "community", "insurance", "utilities", "services", "other")


@dataclass
class RentalInputs:
    year: int
    income: Decimal = ZERO
    days_rented: int = 0
    days_vacant: int = 0
    rented_share_pct: Decimal = HUNDRED
    ownership_pct: Decimal = HUNDRED
    financing: Decimal = ZERO
    repairs: Decimal = ZERO
    taxes: Decimal = ZERO
    community: Decimal = ZERO
    insurance: Decimal = ZERO
    utilities: Decimal = ZERO
    services: Decimal = ZERO
    other: Decimal = ZERO
    acquisition_price: Decimal | None = None
    acquisition_costs: Decimal = ZERO
    cadastral_value: Decimal | None = None
    cadastral_construction_value: Decimal | None = None
    cadastral_revised: bool = True
    improvements: Decimal = ZERO
    furniture_value: Decimal = ZERO
    reduction_pct: Decimal = ZERO
    pending_excess: Decimal = ZERO
    other_general_base: Decimal = ZERO
    # Days the figures cover (the year by default; up to today for the year-to-date view)
    period_days: int | None = None

    @classmethod
    def from_dict(cls, data: dict) -> RentalInputs:
        values = {}
        for f in fields(cls):
            if f.name not in data or data[f.name] is None:
                continue
            raw = data[f.name]
            if f.name in ("year", "days_rented", "days_vacant", "period_days"):
                values[f.name] = int(raw)
            elif f.name == "cadastral_revised":
                values[f.name] = bool(raw)
            else:
                values[f.name] = Decimal(str(raw))
        return cls(**values)

    def to_dict(self) -> dict:
        return {k: (str(v) if isinstance(v, Decimal) else v) for k, v in asdict(self).items()}


def days_in_year(year: int) -> int:
    return 366 if calendar.isleap(year) else 365


def scale_tax(base: Decimal) -> Decimal:
    """Tax of ``base`` with the approximate general scale."""
    tax, lower = ZERO, ZERO
    for upper, rate in GENERAL_SCALE:
        if base <= lower:
            break
        top = base if upper is None else min(base, upper)
        tax += (top - lower) * rate / HUNDRED
        if upper is None:
            break
        lower = upper
    return tax


def marginal_rate(base: Decimal) -> Decimal:
    for upper, rate in GENERAL_SCALE:
        if upper is None or base <= upper:
            return rate
    return GENERAL_SCALE[-1][1]


def compute_rental(inp: RentalInputs) -> dict:
    """Net rental income, reduction, imputation and estimated tax for one property and year (your share)."""
    warnings: list[str] = []
    year_days = days_in_year(inp.year)
    rented = min(max(inp.days_rented, 0), year_days)
    vacant = min(max(inp.days_vacant, 0), year_days - rented)
    period = min(inp.period_days or year_days, year_days)
    share = inp.rented_share_pct / HUNDRED
    own = inp.ownership_pct / HUNDRED
    # Costs of the whole property paid in the period, by the share of that period it was rented
    prorate = Decimal(min(rented, period)) / Decimal(period) * share
    # Depreciation accrues per day rented over the year
    accrual = Decimal(rented) / Decimal(year_days) * share

    income = inp.income * own
    financing = inp.financing * prorate * own
    repairs = inp.repairs * own
    capped_group = financing + repairs + inp.pending_excess
    capped_applied = min(capped_group, max(income, ZERO))
    excess = capped_group - capped_applied

    taxes = inp.taxes * prorate * own
    community = inp.community * prorate * own
    insurance = inp.insurance * prorate * own
    rest = (inp.utilities + inp.services + inp.other) * own
    other_expenses = taxes + community + insurance + rest

    depreciation = ZERO
    acquisition = (inp.acquisition_price or ZERO) + inp.acquisition_costs
    if inp.cadastral_value and inp.cadastral_construction_value:
        construction_ratio = inp.cadastral_construction_value / inp.cadastral_value
        base_total = max(acquisition, inp.cadastral_value)
        building_base = base_total * construction_ratio + inp.improvements
        depreciation = building_base * DEPRECIATION_RATE * accrual * own
    elif rented:
        warnings.append(
            "Falta el valor catastral (total y de la construcción): sin él no se puede calcular la amortización "
            "del inmueble, que suele ser el gasto deducible más importante."
        )
    if not inp.acquisition_price and rented:
        warnings.append("Falta el precio de compra: la amortización se calcula solo con el valor catastral.")
    furniture = inp.furniture_value * FURNITURE_RATE * accrual * own

    net = income - capped_applied - other_expenses - depreciation - furniture
    reduction = net * inp.reduction_pct / HUNDRED if net > 0 else ZERO
    net_reduced = net - reduction

    imputation = ZERO
    if vacant and inp.cadastral_value:
        rate = IMPUTATION_REVISED if inp.cadastral_revised else IMPUTATION_NOT_REVISED
        imputation = inp.cadastral_value * rate * Decimal(vacant) / Decimal(year_days) * share * own
    elif vacant:
        warnings.append("Hay días sin alquilar: falta el valor catastral para calcular la imputación de renta.")

    base = max(inp.other_general_base, ZERO)
    taxable = net_reduced + imputation
    tax = scale_tax(max(base + taxable, ZERO)) - scale_tax(base)
    paid_expenses = (
        inp.financing
        + inp.repairs
        + inp.taxes
        + inp.community
        + inp.insurance
        + inp.utilities
        + inp.services
        + inp.other
    ) * own
    cash_result = income - paid_expenses - tax

    return {
        "income": str(q(income)),
        "capped_expenses": str(q(capped_group)),
        "capped_applied": str(q(capped_applied)),
        "excess_carry_forward": str(q(excess)),
        "other_expenses": str(q(other_expenses)),
        "expenses_detail": {
            "financing": str(q(financing)),
            "repairs": str(q(repairs)),
            "pending_excess": str(q(inp.pending_excess)),
            "taxes": str(q(taxes)),
            "community": str(q(community)),
            "insurance": str(q(insurance)),
            "utilities_services_other": str(q(rest)),
        },
        "depreciation": str(q(depreciation)),
        "furniture_depreciation": str(q(furniture)),
        "net": str(q(net)),
        "reduction_pct": str(inp.reduction_pct),
        "reduction": str(q(reduction)),
        "net_reduced": str(q(net_reduced)),
        "imputation": str(q(imputation)),
        "taxable": str(q(taxable)),
        "other_general_base": str(q(base)),
        "marginal_rate": str(marginal_rate(base + max(taxable, ZERO))),
        "estimated_tax": str(q(tax)),
        "effective_rate_on_income": str(q(tax / income * HUNDRED)) if income > 0 else None,
        "paid_expenses": str(q(paid_expenses)),
        "cash_result": str(q(cash_result)),
        "days_rented": rented,
        "days_vacant": vacant,
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Yearly overview from the user's records
# ---------------------------------------------------------------------------


def _overlap_days(start: date, end: date | None, lo: date, hi: date) -> set[date]:
    """Days of [start, end] inside [lo, hi] (as ordinals, to merge several leases)."""
    first = max(start, lo)
    last = min(end or hi, hi)
    if last < first:
        return set()
    return set(range(first.toordinal(), last.toordinal() + 1))


def _months_active(lease, year: int) -> list[int]:
    months = []
    for m in range(1, 13):
        first = date(year, m, 1)
        last = date(year, m, calendar.monthrange(year, m)[1])
        if lease.start_date <= last and (lease.end_date is None or lease.end_date >= first):
            months.append(m)
    return months


def other_general_base(user, year: int, today: date) -> tuple[Decimal, bool]:
    """Rough general taxable base from payslips (subject pay − social security − 2,000 €).

    For the current year it extrapolates the months recorded to twelve. Returns ``(base, is_projection)``.
    """
    from apps.payroll.models import Payroll

    total, months = ZERO, set()
    for p in Payroll.objects.filter(owner=user, period_end__year=year):
        total += (p.base_irpf if p.base_irpf is not None else p.gross) - (p.ss_employee or ZERO)
        months.add(p.period_end.month)
    projected = False
    if year == today.year and months and len(months) < 12:
        total = total / len(months) * 12
        projected = True
    return max(total - WORK_EXPENSES_DEDUCTION, ZERO) if months else ZERO, projected


@dataclass
class _Scenario:
    inputs: RentalInputs
    estimated: list[str] = field(default_factory=list)


def _property_scenarios(prop, year: int, today: date, base: Decimal) -> dict:
    from apps.realestate.models import RentalExpense
    from apps.realestate.mortgage import interest_in_year
    from apps.transactions.models import OtherIncome

    year_start, year_end = date(year, 1, 1), date(year, 12, 31)
    cutoff = min(today, year_end) if year >= today.year else year_end
    leases = [
        lease
        for lease in prop.leases.all()
        if lease.start_date <= year_end and (lease.end_date is None or lease.end_date >= year_start)
    ]

    rented_all, rented_to_date = set(), set()
    for lease in leases:
        rented_all |= _overlap_days(lease.start_date, lease.end_date, year_start, year_end)
        rented_to_date |= _overlap_days(lease.start_date, lease.end_date, year_start, cutoff)
    main = max(leases, key=lambda lease: len(_overlap_days(lease.start_date, lease.end_date, year_start, year_end)))
    share = max(lease.rented_share_pct for lease in leases)

    payments = list(OtherIncome.objects.filter(lease__in=leases, date__year=year).select_related("lease"))
    income_actual = sum((p.amount for p in payments), ZERO)
    paid_months: dict[str, set[int]] = {}
    for p in payments:
        paid_months.setdefault(str(p.lease_id), set()).add(p.date.month)

    expected_rest, missing_months = ZERO, []
    for lease in leases:
        paid = paid_months.get(str(lease.id), set())
        for m in _months_active(lease, year):
            if m in paid:
                continue
            if year > today.year or (year == today.year and m >= today.month):
                expected_rest += lease.monthly_rent
            else:
                missing_months.append(f"{year}-{m:02d}")

    def expenses(y: int, until: date | None = None) -> dict[str, Decimal]:
        qs = RentalExpense.objects.filter(property=prop, date__year=y)
        if until:
            qs = qs.filter(date__lte=until)
        totals: dict[str, Decimal] = {}
        for e in qs:
            totals[e.category] = totals.get(e.category, ZERO) + e.amount
        return totals

    actual = expenses(year, cutoff)
    full_actual = expenses(year)
    previous = expenses(year - 1)
    improvements = sum(
        (e.amount for e in prop.rental_expenses.filter(category="IMPROVEMENT", date__lte=year_end)),
        ZERO,
    )

    amortizations = list(prop.amortizations.all())
    mortgage_interest = interest_in_year(prop, amortizations, year)
    to_date_interest = (
        interest_in_year(prop, amortizations, year, before_month=f"{today.year}-{today.month:02d}")
        if year == today.year
        else mortgage_interest
    )
    projecting = year >= today.year

    def build(
        days: int, income: Decimal, exp: dict, interest: Decimal | None, proj: bool, period: int | None = None
    ) -> _Scenario:
        estimated: list[str] = []
        if proj:
            for cat in RECURRING:
                if previous.get(cat, ZERO) > exp.get(cat, ZERO):
                    exp = {**exp, cat: previous[cat]}
                    estimated.append(cat.lower())
        financing = exp.get("FINANCING")
        if financing is None and interest is not None:
            financing = interest
            estimated.append("financing")
        vacant = days_in_year(year) - len(rented_all) if leases else 0
        inputs = RentalInputs(
            year=year,
            income=income,
            days_rented=days,
            days_vacant=vacant if proj or not projecting else 0,
            rented_share_pct=share,
            ownership_pct=prop.ownership_pct,
            financing=financing or ZERO,
            repairs=exp.get("REPAIRS", ZERO),
            taxes=exp.get("TAXES", ZERO),
            community=exp.get("COMMUNITY", ZERO),
            insurance=exp.get("INSURANCE", ZERO),
            utilities=exp.get("UTILITIES", ZERO),
            services=exp.get("SERVICES", ZERO),
            other=exp.get("OTHER", ZERO),
            acquisition_price=prop.purchase_price,
            acquisition_costs=prop.acquisition_costs or ZERO,
            cadastral_value=prop.cadastral_value,
            cadastral_construction_value=prop.cadastral_construction_value,
            cadastral_revised=prop.cadastral_revised,
            improvements=improvements,
            furniture_value=prop.furniture_value or ZERO,
            reduction_pct=REDUCTION_PCT[main.reduction],
            other_general_base=base,
            period_days=period,
        )
        return _Scenario(inputs, estimated)

    elapsed = (cutoff - year_start).days + 1
    to_date = build(
        len(rented_to_date),
        income_actual,
        actual,
        to_date_interest,
        proj=False,
        period=elapsed if elapsed < days_in_year(year) else None,
    )
    projected = build(len(rented_all), income_actual + expected_rest, full_actual, mortgage_interest, proj=projecting)
    if expected_rest:
        projected.estimated.append("income")

    return {
        "property": {"id": str(prop.id), "name": prop.name},
        "leases": [
            {
                "id": str(lease.id),
                "tenant": lease.tenant,
                "start_date": lease.start_date.isoformat(),
                "end_date": lease.end_date.isoformat() if lease.end_date else None,
                "monthly_rent": str(lease.monthly_rent),
                "reduction": lease.reduction,
            }
            for lease in leases
        ],
        "missing_months": missing_months,
        "to_date": {"inputs": to_date.inputs.to_dict(), "result": compute_rental(to_date.inputs)},
        "projected": {
            "inputs": projected.inputs.to_dict(),
            "estimated": projected.estimated,
            "result": compute_rental(projected.inputs),
        },
    }


def rental_overview(user, year: int, today: date | None = None) -> dict:
    """Every property with a lease in ``year``: inputs and results up to today and projected to year end."""
    from django.utils import timezone

    from apps.realestate.models import Property

    today = today or timezone.localdate()
    base, base_projected = other_general_base(user, year, today)
    year_start, year_end = date(year, 1, 1), date(year, 12, 31)
    properties = [
        p
        for p in Property.objects.filter(owner=user, leases__isnull=False)
        .distinct()
        .prefetch_related("leases", "amortizations")
        .order_by("name")
        if any(
            lease.start_date <= year_end and (lease.end_date is None or lease.end_date >= year_start)
            for lease in p.leases.all()
        )
    ]
    return {
        "year": year,
        "other_general_base": str(q(base)),
        "other_general_base_projected": base_projected,
        "properties": [_property_scenarios(p, year, today, base) for p in properties],
    }
