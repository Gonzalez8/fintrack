from rest_framework import serializers

from apps.assets.models import Account, AccountSnapshot, Asset, PortfolioSnapshot, Settings
from apps.payroll.models import Employer, Payroll
from apps.realestate.models import Amortization, Lease, Property, RentalExpense
from apps.reports.models import SavingsGoal
from apps.transactions.models import Dividend, DividendSuggestion, Interest, OtherIncome, StockSplit, Transaction


class BackupAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = [
            "id",
            "name",
            "ticker",
            "isin",
            "type",
            "currency",
            "current_price",
            "price_mode",
            "issuer_country",
            "domicile_country",
            "withholding_country",
            "price_source",
        ]
        extra_kwargs = {"id": {"read_only": False}}


class BackupAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ["id", "name", "type", "currency"]
        extra_kwargs = {"id": {"read_only": False}}


class BackupTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            "id",
            "date",
            "type",
            "asset",
            "account",
            "quantity",
            "price",
            "commission",
            "tax",
            "notes",
            "import_hash",
        ]
        extra_kwargs = {"id": {"read_only": False}}


class BackupDividendSerializer(serializers.ModelSerializer):
    class Meta:
        model = Dividend
        fields = [
            "id",
            "date",
            "asset",
            "shares",
            "gross",
            "tax",
            "domestic_tax",
            "commission",
            "net",
            "import_hash",
        ]
        extra_kwargs = {"id": {"read_only": False}}


class BackupInterestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interest
        fields = [
            "id",
            "date_start",
            "date_end",
            "account",
            "gross",
            "tax",
            "commission",
            "net",
            "balance",
            "import_hash",
        ]
        extra_kwargs = {"id": {"read_only": False}}


class BackupOtherIncomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = OtherIncome
        fields = ["id", "date", "category", "description", "amount", "account", "lease", "notes"]
        extra_kwargs = {"id": {"read_only": False}}


class BackupAccountSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountSnapshot
        fields = ["id", "account", "date", "balance", "note"]
        extra_kwargs = {"id": {"read_only": False}}


class BackupPortfolioSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioSnapshot
        fields = ["id", "captured_at", "batch_id", "total_market_value", "total_cost", "total_unrealized_pnl"]
        extra_kwargs = {"id": {"read_only": False}}


class BackupSavingsGoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavingsGoal
        fields = ["id", "name", "target_amount", "base_type", "deadline", "icon"]
        extra_kwargs = {"id": {"read_only": False}}


class BackupPropertySerializer(serializers.ModelSerializer):
    class Meta:
        model = Property
        fields = [
            "id",
            "name",
            "current_value",
            "purchase_price",
            "purchase_date",
            "currency",
            "notes",
            "original_loan_amount",
            "outstanding_balance",
            "annual_interest_rate",
            "total_term_months",
            "months_paid",
            "monthly_payment",
            "acquisition_costs",
            "cadastral_value",
            "cadastral_construction_value",
            "cadastral_revised",
            "furniture_value",
            "ownership_pct",
        ]
        extra_kwargs = {"id": {"read_only": False}}


class BackupAmortizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Amortization
        fields = ["id", "property", "month", "amount", "strategy"]
        extra_kwargs = {"id": {"read_only": False}}


class BackupStockSplitSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockSplit
        fields = ["id", "asset", "date", "ratio_from", "ratio_to", "status", "source"]
        extra_kwargs = {"id": {"read_only": False}}


class BackupDividendSuggestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DividendSuggestion
        fields = [
            "id",
            "asset",
            "ex_date",
            "amount_per_share",
            "currency",
            "shares",
            "gross",
            "tax",
            "domestic_tax",
            "status",
            "dividend",
        ]
        extra_kwargs = {"id": {"read_only": False}}


class BackupSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Settings
        fields = [
            "base_currency",
            "cost_basis_method",
            "fiscal_cost_method",
            "gift_cost_mode",
            "rounding_money",
            "rounding_qty",
            "price_update_interval",
            "default_price_source",
            "snapshot_frequency",
            "data_retention_days",
            "purge_portfolio_snapshots",
            "tax_treaty_limits",
            "tax_country",
            "mcp_backend_url",
        ]


class BackupEmployerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employer
        fields = ["id", "name", "cif", "ss_account", "address", "notes"]
        extra_kwargs = {"id": {"read_only": False}}


class BackupPayrollSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payroll
        fields = [
            "id",
            "employer",
            "period_start",
            "period_end",
            "concept",
            "payroll_type",
            "gross",
            "ss_employee",
            "irpf_withholding",
            "net",
            "base_irpf",
            "base_cc",
            "employer_cost",
            "notes",
            "import_hash",
        ]
        extra_kwargs = {"id": {"read_only": False}}


class BackupLeaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lease
        fields = [
            "id",
            "property",
            "tenant",
            "start_date",
            "end_date",
            "monthly_rent",
            "deposit",
            "reduction",
            "rented_share_pct",
            "notes",
        ]
        extra_kwargs = {"id": {"read_only": False}}


class BackupRentalExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = RentalExpense
        fields = ["id", "property", "date", "category", "amount", "description"]
        extra_kwargs = {"id": {"read_only": False}}
