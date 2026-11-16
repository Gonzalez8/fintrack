from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.permissions import SAFE_METHODS
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import ApiToken


class ApiTokenAuthentication(BaseAuthentication):
    """Authenticate ``Authorization: Bearer ft_…`` personal access tokens.

    Tokens are for working with financial data only. They can never reach
    ``/api/auth/`` (tokens, password, profile) or restore backups, they can
    never delete, and READ tokens can only use safe methods. The rules live here
    rather than in a permission class because several views override
    ``permission_classes``. Must run before ``CookieJWTAuthentication``, which
    would reject any non-JWT bearer value.
    """

    keyword = "Bearer"
    blocked_paths = ("/api/auth/", "/api/backup/import/")
    last_used_resolution = timedelta(minutes=5)

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if len(parts) != 2 or parts[0].lower() != self.keyword.lower().encode():
            return None
        key = parts[1].decode(errors="ignore")
        if not key.startswith(ApiToken.PREFIX):
            return None  # a JWT: let CookieJWTAuthentication handle it

        token = (
            ApiToken.objects.select_related("owner")
            .filter(key_hash=ApiToken.hash_key(key), revoked_at__isnull=True)
            .first()
        )
        if token is None or not token.owner.is_active:
            raise AuthenticationFailed("Invalid or revoked API token.")
        if request.path.startswith(self.blocked_paths):
            raise PermissionDenied("API tokens cannot access this endpoint.")
        if request.method == "DELETE":
            raise PermissionDenied("API tokens cannot delete data.")
        if token.scope == ApiToken.Scope.READ and request.method not in SAFE_METHODS:
            raise PermissionDenied("This API token is read-only.")

        now = timezone.now()
        if token.last_used_at is None or now - token.last_used_at > self.last_used_resolution:
            ApiToken.objects.filter(pk=token.pk).update(last_used_at=now)
        return token.owner, token

    def authenticate_header(self, request):
        return self.keyword


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
