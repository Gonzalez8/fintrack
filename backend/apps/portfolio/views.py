from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.cache import NS_PORTFOLIO, get_user_cache, set_user_cache

from .returns import BENCHMARKS, DEFAULT_BENCHMARK, calculate_returns
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
