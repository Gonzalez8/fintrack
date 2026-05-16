from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.mixins import OwnedByUserMixin

from .filters import EmployerFilter, PayrollFilter
from .models import Employer, Payroll
from .serializers import EmployerSerializer, PayrollSerializer

# Defensive caps so a malicious or fat-fingered request can't pin the DB.
BULK_MAX_ITEMS = 100

# Suggested-field threshold below which we assume the upload is not a Spanish
# payslip and reject the request. Picked deliberately low so that partially
# scanned or unusual templates still go through and the user can fix the gaps
# manually.
PARSE_PDF_MIN_CONFIDENCE = 0.3
PARSE_PDF_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


class EmployerViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = Employer.objects.all()
    serializer_class = EmployerSerializer
    filterset_class = EmployerFilter
    ordering_fields = ["name", "created_at"]


class PayrollViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = Payroll.objects.select_related("employer").all()
    serializer_class = PayrollSerializer
    filterset_class = PayrollFilter
    ordering_fields = ["period_end", "gross", "net", "irpf_withholding"]

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """Delete several payrolls in a single transaction.

        Body: ``{"ids": ["uuid", "uuid", ...]}``. The queryset is already
        owner-scoped via ``OwnedByUserMixin.get_queryset`` so an attacker
        can't reach another user's records even if they guess UUIDs.
        Returns ``{"deleted": N}``.
        """
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
            return Response(
                {"detail": "Expected 'ids' as a list of UUID strings."},
                status=400,
            )
        if len(ids) > BULK_MAX_ITEMS:
            return Response(
                {"detail": f"Too many ids (max {BULK_MAX_ITEMS})."},
                status=400,
            )
        if not ids:
            return Response({"deleted": 0})
        deleted, _ = self.get_queryset().filter(id__in=ids).delete()
        return Response({"deleted": deleted})

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        """Create several payrolls in a single transaction.

        Body: ``{"payrolls": [{<payroll>}, {<payroll>}, ...]}`` — same item
        shape as ``POST /api/payrolls/``. All items are validated up
        front; if any one fails, none are saved. Response shape:

            { "created": [<full payroll>, ...] }  (HTTP 201)

        or, on validation failure:

            { "errors": [null, {<errors row 1>}, null, ...] }  (HTTP 400)
        """
        items = request.data.get("payrolls")
        if not isinstance(items, list):
            return Response(
                {"detail": "Expected 'payrolls' as a list of objects."},
                status=400,
            )
        if not items:
            return Response({"created": []}, status=201)
        if len(items) > BULK_MAX_ITEMS:
            return Response(
                {"detail": f"Too many payrolls (max {BULK_MAX_ITEMS})."},
                status=400,
            )

        # Pre-validate everything so we either save the whole batch or
        # nothing. Per-row errors are returned in the same order so the
        # frontend can highlight the offending rows.
        per_row = [self.get_serializer(data=item) for item in items]
        errors: list[dict | None] = []
        any_invalid = False
        for s in per_row:
            if s.is_valid():
                errors.append(None)
            else:
                errors.append(s.errors)
                any_invalid = True
        if any_invalid:
            return Response({"errors": errors}, status=400)

        with transaction.atomic():
            for s in per_row:
                s.save(owner=request.user)
        return Response({"created": [s.data for s in per_row]}, status=201)


class PayrollParsePdfView(APIView):
    """Best-effort, suggestion-only PDF parser for Spanish payslips.

    Hard rules (see ADR-008):
    - Never creates, modifies, or deletes records. Read-only.
    - Returns suggested values for the user to review and confirm in the
      frontend before saving. The save still happens through POST /api/payrolls/.
    - Experimental: if the PDF is scanned, encrypted, or simply doesn't match
      a Spanish payslip layout, returns 422 and the user fills the form by hand.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Missing 'file' in form data."}, status=400)
        if upload.size > PARSE_PDF_MAX_BYTES:
            return Response({"detail": "File too large (max 10 MB)."}, status=400)

        # The view talks to the Strategy interface only — never to a
        # concrete parser. Swap the implementation via the PAYSLIP_PARSER
        # Django setting (default "regex-es"). See ADR-008 for the full
        # parser-strategy design.
        from .services.parsers import get_default_parser

        parser = get_default_parser()
        try:
            result = parser.parse(upload)
        except Exception as exc:
            return Response(
                {"detail": f"Could not read PDF: {exc.__class__.__name__}."},
                status=422,
            )

        if result.confidence < PARSE_PDF_MIN_CONFIDENCE:
            return Response(
                {
                    "detail": ("PDF no reconocido como nómina española. Rellena los campos manualmente."),
                    "confidence": result.confidence,
                    "parser": result.parser_name,
                },
                status=422,
            )

        # Enrich every parser's output with a payroll_type suggestion so
        # the frontend doesn't have to duplicate the keyword inference.
        # Lives in the view (not the parser) so any new parser benefits
        # automatically without code changes.
        from .models import infer_payroll_type

        suggested = dict(result.suggested)
        suggested["payroll_type"] = infer_payroll_type(suggested.get("concept"))

        # Truncated extracted_text helps users diagnose parser misses on
        # unusual templates without round-tripping the binary PDF.
        return Response(
            {
                "suggested": suggested,
                "confidence": result.confidence,
                "warnings": result.warnings,
                "parser": result.parser_name,
                "extracted_text": (result.extracted_text[:3000] if result.extracted_text else None),
            }
        )
