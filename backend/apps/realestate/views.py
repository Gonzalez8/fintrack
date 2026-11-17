from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.mixins import OwnedByUserMixin

from .models import Amortization, Property
from .serializers import AmortizationSerializer, MortgageSimulationInputSerializer, PropertySerializer
from .services import simulate_amortization


class PropertyViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = Property.objects.prefetch_related("amortizations")
    serializer_class = PropertySerializer
    invalidates_financial_cache = False


class AmortizationViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = Amortization.objects.all()
    serializer_class = AmortizationSerializer
    invalidates_financial_cache = False

    def get_queryset(self):
        qs = super().get_queryset()
        property_id = self.request.query_params.get("property")
        if property_id:
            qs = qs.filter(property_id=property_id)
        return qs


class MortgageSimulationView(APIView):
    def post(self, request):
        serializer = MortgageSimulationInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = simulate_amortization(**serializer.validated_data)
        return Response(result)
