from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.transactions.serializers import _OwnershipValidationMixin

from .models import Amortization, Property
from .mortgage import mortgage_state

ZERO = Decimal("0.00")


class PropertySerializer(serializers.ModelSerializer):
    """Property with its mortgage as of today.

    ``months_paid`` and ``outstanding_balance`` are stored as a snapshot when the
    property is saved; on read they are replaced by the current values (early
    amortizations applied — see ``mortgage.py``), so the API, the MCP and the screen
    agree and nothing goes stale. ``months_paid`` counts payments actually made and
    stops when the mortgage ends; ``months_elapsed`` counts calendar months since the
    start. ``has_mortgage`` means mortgage data exists (finished ones too);
    ``has_active_mortgage`` / ``mortgage_status`` tell whether there is still debt.
    """

    net_equity = serializers.SerializerMethodField()
    amortized_capital = serializers.SerializerMethodField()
    has_mortgage = serializers.SerializerMethodField()
    has_active_mortgage = serializers.SerializerMethodField()
    mortgage_status = serializers.SerializerMethodField()
    months_elapsed = serializers.SerializerMethodField()
    current_monthly_payment = serializers.SerializerMethodField()
    mortgage_end_date = serializers.SerializerMethodField()
    extra_amortizations = serializers.SerializerMethodField()

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
            # computed
            "net_equity",
            "amortized_capital",
            "has_mortgage",
            "has_active_mortgage",
            "mortgage_status",
            "months_elapsed",
            "current_monthly_payment",
            "mortgage_end_date",
            "extra_amortizations",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def _state(self, obj):
        # Cached per instance: several fields read it
        if getattr(obj, "_mortgage_state", None) is None:
            obj._mortgage_state = mortgage_state(obj, obj.amortizations.all(), timezone.localdate())
        return obj._mortgage_state

    def _balance(self, obj):
        state = self._state(obj)
        return state.outstanding_balance if state.outstanding_balance is not None else ZERO

    def get_net_equity(self, obj):
        return str((obj.current_value - self._balance(obj)).quantize(Decimal("0.01")))

    def get_amortized_capital(self, obj):
        if obj.original_loan_amount is None:
            return None
        return str((obj.original_loan_amount - self._balance(obj)).quantize(Decimal("0.01")))

    def get_has_mortgage(self, obj):
        """Mortgage data exists (also for finished mortgages, whose history the web still shows)."""
        return obj.original_loan_amount is not None

    def get_has_active_mortgage(self, obj):
        """Debt is still being paid — what any debt calculation should check."""
        return self._state(obj).status == "ACTIVE"

    def get_months_elapsed(self, obj):
        """Calendar months since the start (capped at the term): the web's "today" in the schedule."""
        return self._state(obj).months_elapsed

    def get_mortgage_status(self, obj):
        """NONE (no mortgage), ACTIVE or FINISHED (paid off, early amortizations included)."""
        return self._state(obj).status

    def get_current_monthly_payment(self, obj):
        value = self._state(obj).current_monthly_payment
        return None if value is None else str(value)

    def get_mortgage_end_date(self, obj):
        return self._state(obj).end_date

    def get_extra_amortizations(self, obj):
        value = self._state(obj).extra_amortizations
        return None if value is None else str(value)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        state = self._state(instance)
        if state.status != "NONE":
            # Current values instead of the snapshot taken when the property was saved
            data["months_paid"] = state.months_paid
            data["outstanding_balance"] = str(state.outstanding_balance)
        return data


class AmortizationSerializer(_OwnershipValidationMixin, serializers.ModelSerializer):
    class Meta:
        model = Amortization
        fields = ["id", "property", "month", "amount", "strategy", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_property(self, value):
        return self._validate_owned_fk(value, "property")


class MortgageSimulationInputSerializer(serializers.Serializer):
    STRATEGY_CHOICES = [
        ("REDUCE_PAYMENT", "Reduce monthly payment"),
        ("REDUCE_TERM", "Reduce term"),
    ]

    outstanding_balance = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    annual_interest_rate = serializers.DecimalField(max_digits=6, decimal_places=4, min_value=Decimal("0"))
    remaining_months = serializers.IntegerField(min_value=1)
    monthly_payment = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    extra_payment = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    strategy = serializers.ChoiceField(choices=STRATEGY_CHOICES)
