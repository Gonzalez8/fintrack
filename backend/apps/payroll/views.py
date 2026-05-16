from rest_framework import viewsets
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.mixins import OwnedByUserMixin

from .filters import EmployerFilter, PayrollFilter
from .models import Employer, Payroll
from .serializers import EmployerSerializer, PayrollSerializer

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

        from .services.pdf_parser import parse_payslip

        try:
            result = parse_payslip(upload)
        except Exception as exc:
            return Response(
                {"detail": f"Could not read PDF: {exc.__class__.__name__}."},
                status=422,
            )

        if result["confidence"] < PARSE_PDF_MIN_CONFIDENCE:
            return Response(
                {
                    "detail": ("PDF no reconocido como nómina española. Rellena los campos manualmente."),
                    "confidence": result["confidence"],
                },
                status=422,
            )
        return Response(result)
