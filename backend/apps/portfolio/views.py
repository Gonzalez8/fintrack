from rest_framework.response import Response
from rest_framework.views import APIView
from .services import calculate_portfolio_full


class PortfolioView(APIView):
    def get(self, request):
        data = calculate_portfolio_full(request.user)
        return Response(data)
