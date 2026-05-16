from decimal import Decimal

from rest_framework import serializers

from apps.transactions.serializers import _OwnershipValidationMixin

from .models import Employer, Payroll


class EmployerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employer
        fields = [
            "id",
            "name",
            "cif",
            "ss_account",
            "address",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return value
        qs = Employer.objects.filter(owner=request.user, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("An employer with this name already exists.")
        return value


class PayrollSerializer(_OwnershipValidationMixin, serializers.ModelSerializer):
    employer_name = serializers.CharField(source="employer.name", read_only=True)
    employer_cif = serializers.CharField(source="employer.cif", read_only=True)
    irpf_rate = serializers.SerializerMethodField()
    net_mismatch = serializers.SerializerMethodField()

    class Meta:
        model = Payroll
        fields = [
            "id",
            "period_start",
            "period_end",
            "concept",
            "payroll_type",
            "employer",
            "employer_name",
            "employer_cif",
            "gross",
            "ss_employee",
            "irpf_withholding",
            "irpf_rate",
            "net",
            "base_irpf",
            "base_cc",
            "employer_cost",
            "notes",
            "net_mismatch",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "irpf_rate",
            "net_mismatch",
            "created_at",
            "updated_at",
        ]

    def get_irpf_rate(self, obj):
        if obj.gross and obj.gross > 0:
            return str((obj.irpf_withholding / obj.gross * 100).quantize(Decimal("0.01")))
        return None

    def get_net_mismatch(self, obj):
        """Return the (gross - ss - irpf) - net delta as a string.

        Informational only — never used to reject the record. Real payslips
        legitimately break this identity (anticipos, embargos, dietas exentas,
        especie, regularizations…). The client decides what to display."""
        if obj.gross is None or obj.net is None:
            return None
        expected = obj.gross - (obj.ss_employee or Decimal("0")) - (obj.irpf_withholding or Decimal("0"))
        delta = expected - obj.net
        return str(delta.quantize(Decimal("0.01")))

    def validate_employer(self, value):
        return self._validate_owned_fk(value, "employer")

    def validate(self, data):
        period_start = data.get("period_start") or (self.instance and self.instance.period_start)
        period_end = data.get("period_end") or (self.instance and self.instance.period_end)
        if period_start and period_end and period_end < period_start:
            raise serializers.ValidationError({"period_end": "period_end must be on or after period_start."})

        # Surface the (owner, employer, period_start, period_end, concept)
        # UniqueConstraint as a 400 ValidationError instead of letting the DB
        # raise IntegrityError → 500.
        # Same period with different concepts is allowed by design (e.g. a
        # monthly salary and a bonus that covers the same window). Only a
        # genuine duplicate — same employer + period + concept — is rejected.
        request = self.context.get("request")
        employer = data.get("employer") or (self.instance and self.instance.employer)
        concept = data.get("concept")
        if concept is None and self.instance is not None:
            concept = self.instance.concept
        if concept is None:
            concept = ""
        if request and request.user.is_authenticated and employer and period_start and period_end:
            qs = Payroll.objects.filter(
                owner=request.user,
                employer=employer,
                period_start=period_start,
                period_end=period_end,
                concept=concept,
            )
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            existing = qs.first()
            if existing is not None:
                existing_concept = existing.concept or "(sin concepto)"
                raise serializers.ValidationError(
                    f"Ya existe una nómina para {employer.name} con periodo "
                    f"{existing.period_start} → {existing.period_end} "
                    f'y concepto "{existing_concept}". '
                    "Si es un bonus o concepto distinto, cambia el campo Concepto."
                )
        return data
