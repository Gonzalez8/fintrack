from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication


class CookieJWTAuthentication(JWTAuthentication):
    """Read the access token from an httpOnly cookie if no Authorization header is present."""

    def authenticate(self, request):
        # Try the standard Authorization header first
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)

        # Fall back to cookie
        raw_token = request.COOKIES.get(settings.JWT_AUTH_COOKIE_ACCESS)
        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
