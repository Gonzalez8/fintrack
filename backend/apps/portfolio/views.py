from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.cache import NS_PORTFOLIO, get_user_cache, set_user_cache

from .returns import BENCHMARKS, DEFAULT_BENCHMARK, calculate_returns
from .sale_simulation import SaleSimulationError, loss_harvest, simulate_sale
from .services import calculate_portfolio_full


class PortfolioView(APIView):
    def get(self, request):
        cached = get_user_cache(request.user.pk, NS_PORTFOLIO)
        if cached is not None:
            return Response(cached)

        data = calculate_portfolio_full(request.user)
        set_user_cache(request.user.pk, NS_PORTFOLIO, data, timeout=60)
        return Response(data)


class ReturnsView(APIView):
    """GET /api/portfolio/returns/?benchmark=msci_world|sp500|all_world|none

    Annualized money-weighted return (XIRR) of the portfolio and of each asset, plus the same money
    replayed in an accumulating index ETF.
    """

    def get(self, request):
        benchmark = request.query_params.get("benchmark", DEFAULT_BENCHMARK)
        if benchmark != "none" and benchmark not in BENCHMARKS:
            return Response(
                {"detail": f"Unknown benchmark. Use one of: {', '.join(BENCHMARKS)}, none."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(calculate_returns(request.user, None if benchmark == "none" else benchmark))


class SimulateSaleView(APIView):
    """GET /api/portfolio/simulate-sale/?asset_id=&quantity=&price=&commission=

    What-if sale: lots that would go out with the fiscal cost method, the gain and, for supported fiscal countries,
    the estimated tax. Records nothing.
    """

    def get(self, request):
        params = request.query_params
        try:
            quantity = Decimal(params.get("quantity", ""))
            price = Decimal(params["price"]) if params.get("price") else None
            commission = Decimal(params.get("commission") or "0")
            # Decimal accepts "NaN" and "Infinity", and comparing NaN raises
            if not all(v.is_finite() for v in (quantity, commission, price or Decimal("0"))):
                raise ValueError
        except (InvalidOperation, ValueError):
            return Response(
                {"detail": "quantity, price and commission must be numbers."}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            data = simulate_sale(request.user, params.get("asset_id"), quantity, price, commission)
        except (SaleSimulationError, DjangoValidationError) as exc:
            return Response(
                {"detail": str(exc) if isinstance(exc, SaleSimulationError) else "Unknown asset."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(data)


class LossHarvestingView(APIView):
    """GET /api/portfolio/loss-harvesting/?selected=<asset_id>,<asset_id>

    Positions that would be sold at a loss today and the tax each one (and the selected ones together) would save
    this year, for supported fiscal countries. Records nothing.
    """

    def get(self, request):
        selected = {s for s in request.query_params.get("selected", "").split(",") if s}
        return Response(loss_harvest(request.user, selected))
