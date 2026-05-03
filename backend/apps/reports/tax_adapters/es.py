"""Spanish (ES) tax-declaration adapter — Modo Renta.

Maps Fintrack data to the AEAT Renta Web casillas. Output shape is consumed by
``frontend/src/app/(dashboard)/tax/adapters/es-renta-tab.tsx``.

Form-box labels (``casilla`` keys) are kept here in Spanish on purpose — they
are the literal terms the user copies into Renta Web, so translating them
would defeat the workflow.
"""

from decimal import Decimal

from apps.portfolio.services import calculate_realized_pnl_fiscal
from apps.transactions.models import Dividend, Interest

from . import register
from .common import (
    NET_MISMATCH_TOLERANCE,
    asset_country,
    interest_withholding,
    q,
)

# Default cap (Spanish bilateral treaties default to 15 %) when the user has
# not configured a per-country override in ``Settings.tax_treaty_limits``.
DEFAULT_TREATY_RATE = Decimal("0.15")


def _is_es_dividend(asset) -> bool:
    """True when the dividend is treated as Spanish for IRPF purposes."""
    if asset.withholding_country:
        return asset.withholding_country.upper() == "ES"
    if asset.issuer_country:
        return asset.issuer_country.upper() == "ES"
    return False


class SpanishTaxAdapter:
    """AEAT / Modelo 100 Renta Web adapter."""

    country_code = "ES"

    def declare(self, user, year: int) -> dict:
        from apps.assets.models import Settings as UserSettings

        user_settings = UserSettings.load(user)
        treaty_limits = user_settings.tax_treaty_limits or {}

        warnings: list[dict] = []
        infos: list[dict] = []

        # ----- INTERESES ----------------------------------------------------
        interests_qs = (
            Interest.objects.filter(owner=user, date_end__year=year)
            .select_related("account")
            .order_by("account__name", "date_end")
        )
        int_by_acct: dict[str, dict[str, Decimal]] = {}
        int_gross = int_with = int_comm = int_net = Decimal("0")
        for i in interests_qs:
            acct = i.account.name if i.account else "—"
            bucket = int_by_acct.setdefault(
                acct,
                {
                    "gross": Decimal("0"),
                    "withholding": Decimal("0"),
                    "commission": Decimal("0"),
                    "net": Decimal("0"),
                },
            )
            wh = interest_withholding(i)
            comm = i.commission or Decimal("0")
            bucket["gross"] += i.gross
            bucket["withholding"] += wh
            bucket["commission"] += comm
            bucket["net"] += i.net
            int_gross += i.gross
            int_with += wh
            int_comm += comm
            int_net += i.net

            # Net mismatch (interests): only when tax is informed (otherwise it's tautological).
            if i.tax is not None:
                expected = i.gross - i.tax - comm
                if abs(expected - i.net) > NET_MISMATCH_TOLERANCE:
                    warnings.append(
                        {
                            "kind": "net_mismatch",
                            "scope": "interest",
                            "message": (
                                f"Descuadre en interés de '{acct}' ({i.date_end}): "
                                f"bruto {i.gross} − retención {i.tax} − comisión {comm} ≠ neto {i.net}"
                            ),
                        }
                    )

        interests_block = {
            "casilla": "Rendimientos del capital mobiliario · Intereses de cuentas, depósitos y activos financieros",
            "gross": str(q(int_gross)),
            "withholding": str(q(int_with)),
            "commission": str(q(int_comm)),
            "net": str(q(int_net)),
            "by_entity": [
                {
                    "name": name,
                    "gross": str(q(b["gross"])),
                    "withholding": str(q(b["withholding"])),
                    "commission": str(q(b["commission"])),
                    "net": str(q(b["net"])),
                }
                for name, b in sorted(int_by_acct.items(), key=lambda x: x[0].lower())
            ],
        }

        # ----- DIVIDENDOS ---------------------------------------------------
        dividends_qs = Dividend.objects.filter(owner=user, date__year=year).select_related("asset").order_by("date")

        div_gross = div_tax_es = div_tax_total = div_comm = div_net = Decimal("0")
        by_country_entity: dict[tuple, dict] = {}
        foreign_by_country: dict[str, dict[str, Decimal]] = {}
        seen_missing_country = False

        for d in dividends_qs:
            is_es = _is_es_dividend(d.asset)
            country = asset_country(d.asset)
            comm = d.commission or Decimal("0")

            div_gross += d.gross
            div_tax_total += d.tax
            div_comm += comm
            div_net += d.net
            if is_es:
                div_tax_es += d.tax

            # Net mismatch (dividends): always check, since fields are non-null.
            expected = d.gross - d.tax - comm
            if abs(expected - d.net) > NET_MISMATCH_TOLERANCE:
                warnings.append(
                    {
                        "kind": "net_mismatch",
                        "scope": "dividend",
                        "message": (
                            f"Descuadre en dividendo de '{d.asset.name}' ({d.date}): "
                            f"bruto {d.gross} − retención {d.tax} − comisión {comm} ≠ neto {d.net}"
                        ),
                    }
                )

            # Group by (country_for_display, asset.name).
            country_key = country or "—"
            ce_key = (country_key, d.asset.name)
            ce = by_country_entity.setdefault(
                ce_key,
                {
                    "country": country_key,
                    "entity": d.asset.name,
                    "is_es": is_es,
                    "gross": Decimal("0"),
                    "withholding": Decimal("0"),
                    "commission": Decimal("0"),
                    "net": Decimal("0"),
                },
            )
            ce["gross"] += d.gross
            ce["withholding"] += d.tax
            ce["commission"] += comm
            ce["net"] += d.net

            # Track missing-country only for non-ES rows that have withholding (otherwise irrelevant).
            if not country and not is_es:
                seen_missing_country = True

            if not is_es and country:
                fbc = foreign_by_country.setdefault(country, {"gross": Decimal("0"), "withholding": Decimal("0")})
                fbc["gross"] += d.gross
                fbc["withholding"] += d.tax

        dividends_block = {
            "casilla": "Rendimientos del capital mobiliario · Dividendos y rendimientos por participación en fondos propios",
            "gross_total": str(q(div_gross)),
            "withholding_es": str(q(div_tax_es)),
            "withholding_total": str(q(div_tax_total)),
            "commission": str(q(div_comm)),
            "net_informative": str(q(div_net)),
            "by_country_entity": [
                {
                    "country": v["country"],
                    "entity": v["entity"],
                    "is_es": v["is_es"],
                    "gross": str(q(v["gross"])),
                    "withholding": str(q(v["withholding"])),
                    "commission": str(q(v["commission"])),
                    "net": str(q(v["net"])),
                }
                for v in sorted(
                    by_country_entity.values(),
                    key=lambda x: (x["country"], x["entity"].lower()),
                )
            ],
        }

        if seen_missing_country:
            warnings.append(
                {
                    "kind": "missing_tax_country",
                    "scope": "dividend",
                    "message": (
                        "Hay dividendos sin país fiscal asignado (ni withholding_country ni issuer_country). "
                        "Sin esto no se pueden clasificar como ES vs extranjeros ni aplicar doble imposición."
                    ),
                }
            )

        # ----- DOBLE IMPOSICIÓN INTERNACIONAL -------------------------------
        foreign_gross_total = Decimal("0")
        deductible_total = Decimal("0")
        by_country_rows = []
        foreign_uncomputed_with_tax = False

        for country, agg in sorted(foreign_by_country.items()):
            rate_raw = treaty_limits.get(country)
            if rate_raw is not None:
                try:
                    rate = Decimal(str(rate_raw))
                    is_default = False
                except Exception:
                    rate = DEFAULT_TREATY_RATE
                    is_default = True
            else:
                rate = DEFAULT_TREATY_RATE
                is_default = True

            gross = agg["gross"]
            withholding = agg["withholding"]
            limit = gross * rate
            deductible = min(withholding, limit)

            foreign_gross_total += gross
            deductible_total += deductible

            if withholding > Decimal("0") and deductible <= Decimal("0") and rate > Decimal("0"):
                foreign_uncomputed_with_tax = True

            by_country_rows.append(
                {
                    "country": country,
                    "gross": str(q(gross)),
                    "withholding": str(q(withholding)),
                    "rate_applied": str(rate),
                    "is_default_rate": is_default,
                    "limit": str(q(limit)),
                    "deductible": str(q(deductible)),
                }
            )

        double_taxation_block = {
            "casilla": "Deducción por doble imposición internacional · Rendimientos obtenidos en el extranjero",
            "foreign_gross_total": str(q(foreign_gross_total)),
            "deductible_total": str(q(deductible_total)),
            "by_country": by_country_rows,
        }

        if foreign_uncomputed_with_tax:
            warnings.append(
                {
                    "kind": "foreign_with_uncomputed_deduction",
                    "scope": "double_taxation",
                    "message": (
                        "Existe retención extranjera con deducción 0 sin que el motivo sea un tipo 0 % "
                        "configurado en Settings.tax_treaty_limits. Revisa los datos del país afectado."
                    ),
                }
            )

        if foreign_gross_total > Decimal("0"):
            infos.append(
                {
                    "kind": "double_taxation_applied",
                    "message": (
                        f"Se ha calculado deducción por doble imposición de "
                        f"{q(deductible_total)} € sobre rendimientos extranjeros de "
                        f"{q(foreign_gross_total)} €."
                    ),
                }
            )

        # ----- VENTAS (Ganancias y pérdidas patrimoniales) -----------------
        realized = calculate_realized_pnl_fiscal(user)
        sales_rows = []
        transmission_total = Decimal("0")
        acquisition_total = Decimal("0")
        total_gains = Decimal("0")
        total_losses = Decimal("0")
        net_pnl = Decimal("0")
        sale_without_cost_basis_count = 0

        for s in realized["realized_sales"]:
            sale_year = int(s["date"][:4])
            if sale_year != year:
                continue
            proceeds = Decimal(s["proceeds"])
            cost_basis = Decimal(s["cost_basis"])
            pnl = Decimal(s["realized_pnl"])
            oversell = Decimal(s.get("oversell_quantity", "0"))

            transmission_total += proceeds
            acquisition_total += cost_basis
            net_pnl += pnl
            if pnl >= 0:
                total_gains += pnl
            else:
                total_losses += pnl

            if oversell > Decimal("0") or cost_basis <= Decimal("0"):
                sale_without_cost_basis_count += 1

            sales_rows.append(
                {
                    "date": s["date"],
                    "asset_name": s["asset_name"],
                    "asset_ticker": s.get("asset_ticker", ""),
                    "quantity": s["quantity"],
                    "transmission": str(q(proceeds)),
                    "acquisition": str(q(cost_basis)),
                    "pnl": str(q(pnl)),
                    "oversell_quantity": s.get("oversell_quantity", "0"),
                }
            )

        capital_gains_block = {
            "casilla": ("Ganancias y pérdidas patrimoniales · Transmisiones de acciones admitidas a negociación"),
            "transmission_total": str(q(transmission_total)),
            "acquisition_total": str(q(acquisition_total)),
            "total_gains": str(q(total_gains)),
            "total_losses": str(q(total_losses)),
            "net_result": str(q(net_pnl)),
            "rows": sales_rows,
        }

        if sale_without_cost_basis_count > 0:
            warnings.append(
                {
                    "kind": "sale_without_cost_basis",
                    "scope": "capital_gains",
                    "message": (
                        f"{sale_without_cost_basis_count} venta(s) sin valor de adquisición "
                        "completo (oversell o cost basis 0). Verifica el histórico de compras."
                    ),
                }
            )

        # ----- RENDIMIENTOS DEL TRABAJO -------------------------------------
        employment_block = self._build_employment_block(user, year, warnings)

        # ----- SUMMARY ------------------------------------------------------
        summary = {
            "interests_gross": interests_block["gross"],
            "interests_withholding": interests_block["withholding"],
            "dividends_gross": dividends_block["gross_total"],
            "dividends_withholding_es": dividends_block["withholding_es"],
            "dividends_commission": dividends_block["commission"],
            "double_taxation_foreign_gross": double_taxation_block["foreign_gross_total"],
            "double_taxation_deductible": double_taxation_block["deductible_total"],
            "sales_transmission": capital_gains_block["transmission_total"],
            "sales_acquisition": capital_gains_block["acquisition_total"],
            "sales_net": capital_gains_block["net_result"],
            "employment_gross": employment_block["gross"],
            "employment_ss_deductible": employment_block["ss_deductible"],
            "employment_withholding": employment_block["withholding"],
        }

        return {
            "year": year,
            "interests": interests_block,
            "dividends": dividends_block,
            "double_taxation": double_taxation_block,
            "capital_gains": capital_gains_block,
            "employment_income": employment_block,
            "summary": summary,
            "warnings": warnings,
            "infos": infos,
        }

    def _build_employment_block(self, user, year: int, warnings: list[dict]) -> dict:
        """Aggregate Payroll rows into the "Rendimientos del trabajo" block.

        - Sums gross / ss_employee / irpf_withholding / net for the year.
        - Breaks down by employer (every employer with at least one payroll
          in the year, even if its totals are 0).
        - Emits informational warnings (never errors) for net-mismatch and
          missing-month gaps. Real payslips legitimately break the
          gross - ss - irpf == net identity (anticipos, embargos, dietas
          exentas, especie, regularizaciones); we say so in the message
          to avoid scaring the user.
        """
        # Imported lazily to avoid coupling at module load between apps.
        from apps.payroll.models import Payroll

        payrolls_qs = (
            Payroll.objects.filter(owner=user, period_end__year=year)
            .select_related("employer")
            .order_by("employer__name", "period_end")
        )

        total_gross = total_ss = total_irpf = total_net = Decimal("0")
        by_employer_acc: dict[str, dict] = {}

        for p in payrolls_qs:
            total_gross += p.gross
            total_ss += p.ss_employee or Decimal("0")
            total_irpf += p.irpf_withholding or Decimal("0")
            total_net += p.net

            key = str(p.employer_id)
            bucket = by_employer_acc.setdefault(
                key,
                {
                    "name": p.employer.name,
                    "cif": p.employer.cif or "",
                    "gross": Decimal("0"),
                    "ss_deductible": Decimal("0"),
                    "withholding": Decimal("0"),
                    "net": Decimal("0"),
                    "_months": set(),
                },
            )
            bucket["gross"] += p.gross
            bucket["ss_deductible"] += p.ss_employee or Decimal("0")
            bucket["withholding"] += p.irpf_withholding or Decimal("0")
            bucket["net"] += p.net
            bucket["_months"].add(p.period_end.month)

            # Net-mismatch is informational. The text deliberately avoids
            # implying the payslip is wrong — many real ones break the
            # identity legitimately.
            expected = p.gross - (p.ss_employee or Decimal("0")) - (p.irpf_withholding or Decimal("0"))
            if abs(expected - p.net) > NET_MISMATCH_TOLERANCE:
                warnings.append(
                    {
                        "kind": "payroll_net_mismatch",
                        "scope": "employment_income",
                        "message": (
                            f"Nómina de '{p.employer.name}' ({p.period_end}): "
                            f"gross − ss − irpf = {q(expected)} difiere del neto {q(p.net)}. "
                            "Es esperable cuando hay anticipos, embargos, dietas exentas, "
                            "retribución en especie u otros ajustes; revisa si procede."
                        ),
                    }
                )

        # Missing-months heuristic: if an employer has at least one payslip
        # this year, flag the months between the earliest and the latest
        # that don't have a payslip. Best-effort — doesn't try to detect
        # contracts that started/ended mid-year.
        for bucket in by_employer_acc.values():
            months = bucket.pop("_months")
            if not months:
                continue
            first = min(months)
            last = max(months)
            missing = [m for m in range(first, last + 1) if m not in months]
            if missing:
                warnings.append(
                    {
                        "kind": "payroll_missing_months",
                        "scope": "employment_income",
                        "message": (
                            f"Empleador '{bucket['name']}': faltan nóminas en los meses "
                            f"{', '.join(str(m) for m in missing)} del {year} entre la primera y la última registradas."
                        ),
                    }
                )

        return {
            "casilla": "Rendimientos del trabajo · Retribuciones dinerarias y retenciones",
            "gross": str(q(total_gross)),
            "ss_deductible": str(q(total_ss)),
            "withholding": str(q(total_irpf)),
            "net_informative": str(q(total_net)),
            "by_employer": [
                {
                    "name": v["name"],
                    "cif": v["cif"],
                    "gross": str(q(v["gross"])),
                    "ss_deductible": str(q(v["ss_deductible"])),
                    "withholding": str(q(v["withholding"])),
                    "net": str(q(v["net"])),
                }
                for v in sorted(by_employer_acc.values(), key=lambda x: x["name"].lower())
            ],
        }


register("ES", SpanishTaxAdapter())
