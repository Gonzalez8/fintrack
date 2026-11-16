"""Pure aggregations used by the insights tools."""

from fintrack_mcp.insights import investment_flows, payroll_summary


def test_payroll_summary_splits_types_and_years():
    rows = [
        {
            "period_end": "2025-01-31",
            "payroll_type": "MONTHLY",
            "gross": "3000",
            "net": "2200",
            "ss_employee": "190",
            "irpf_withholding": "610",
        },
        {
            "period_end": "2025-12-31",
            "payroll_type": "MONTHLY",
            "gross": "3000",
            "net": "2200",
            "ss_employee": "190",
            "irpf_withholding": "610",
        },
        {
            "period_end": "2025-12-31",
            "payroll_type": "BONUS",
            "gross": "900",
            "net": "600",
            "ss_employee": "57",
            "irpf_withholding": "243",
        },
        {
            "period_end": "2025-04-30",
            "payroll_type": "ATRASOS",
            "gross": "100",
            "net": "70",
            "ss_employee": "6",
            "irpf_withholding": "24",
        },
        {
            "period_end": "2024-12-31",
            "payroll_type": "MONTHLY",
            "gross": "2500",
            "net": "1900",
            "ss_employee": "160",
            "irpf_withholding": "440",
        },
    ]
    y2024, y2025 = payroll_summary(rows)
    assert y2024["year"] == 2024 and y2024["bonus_gross"] == "0.00" and y2024["bonus_vs_monthly_pct"] == "0.00"
    assert y2025["payslips"] == 4 and y2025["gross"] == "7000.00" and y2025["net"] == "5070.00"
    assert y2025["bonus_vs_monthly_pct"] == "15.00"
    assert y2025["effective_irpf_pct"] == "21.24"  # 1487 / 7000
    assert set(y2025["by_type"]) == {"MONTHLY", "BONUS", "ATRASOS"}


def test_payroll_summary_without_fixed_salary_has_no_bonus_ratio():
    (y,) = payroll_summary([{"period_end": "2025-06-30", "payroll_type": "BONUS", "gross": "500", "net": "300"}])
    assert y["bonus_vs_monthly_pct"] is None


ASSETS = {
    "a": {"name": "Apple", "ticker": "AAPL", "type": "STOCK", "currency": "USD"},
    "b": {"name": "MSCI World", "ticker": "IWDA", "type": "ETF", "currency": "EUR"},
}


def tx(asset, type_, date, qty, price, commission="0", tax="0"):
    return {
        "asset": asset,
        "type": type_,
        "date": date,
        "quantity": qty,
        "price": price,
        "commission": commission,
        "tax": tax,
    }


def test_investment_flows_by_month_with_sells_and_gifts():
    rows = [
        tx("b", "BUY", "2026-01-10", "10", "100", commission="1"),
        tx("b", "BUY", "2026-01-20", "1", "100"),
        tx("a", "SELL", "2026-03-15", "2", "150", commission="1"),
        tx("a", "GIFT", "2026-03-20", "0.5", None),
    ]
    result = investment_flows(rows, ASSETS, "month")
    assert [g["month"] for g in result["groups"]] == ["2026-01", "2026-03"]
    jan, mar = result["groups"]
    assert (jan["bought"], jan["net_invested"]) == ("1101.00", "1101.00")
    assert (mar["sold"], mar["operations"]) == ("299.00", 2)
    assert result["totals"]["net_invested"] == "802.00"
    assert result["totals"]["months_in_period"] == 3
    assert result["mixed_currencies"] is True


def test_investment_flows_by_type_sorted_by_net():
    rows = [tx("a", "BUY", "2026-01-10", "1", "200"), tx("b", "BUY", "2026-02-10", "5", "100")]
    groups = investment_flows(rows, ASSETS, "type")["groups"]
    assert [(g["type"], g["net_invested"]) for g in groups] == [("ETF", "500.00"), ("STOCK", "200.00")]


def test_investment_flows_empty():
    result = investment_flows([], ASSETS)
    assert result["totals"]["net_invested"] == "0.00" and result["groups"] == []
