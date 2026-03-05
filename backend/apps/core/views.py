from django.conf import settings as django_settings
from django.contrib.auth import authenticate, login, logout
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken


def _set_refresh_cookie(response, refresh_token_str):
    """Attach refresh token as httpOnly cookie to `response`."""
    response.set_cookie(
        key=django_settings.JWT_REFRESH_COOKIE_NAME,
        value=refresh_token_str,
        httponly=django_settings.JWT_REFRESH_COOKIE_HTTPONLY,
        samesite=django_settings.JWT_REFRESH_COOKIE_SAMESITE,
        secure=getattr(django_settings, "JWT_REFRESH_COOKIE_SECURE", False),
        max_age=int(django_settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path="/",
    )


def _delete_refresh_cookie(response):
    """Remove the refresh token cookie."""
    response.delete_cookie(
        key=django_settings.JWT_REFRESH_COOKIE_NAME,
        path="/",
    )


# ---------------------------------------------------------------------------
# JWT endpoints (primary auth for the SPA)
# ---------------------------------------------------------------------------

class JWTLoginView(APIView):
    """POST /api/auth/token/ — authenticate and issue access + refresh tokens.

    Returns:
        Body:   { access: str, user: { id, username } }
        Cookie: refresh_token (httpOnly, SameSite=Lax)
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response(
                {"detail": "Credenciales incorrectas."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        refresh = RefreshToken.for_user(user)
        response = Response({
            "access": str(refresh.access_token),
            "user": {"id": user.pk, "username": user.username},
        })
        _set_refresh_cookie(response, str(refresh))
        return response


class JWTRefreshView(APIView):
    """POST /api/auth/token/refresh/ — rotate refresh token using httpOnly cookie.

    Delegates to TokenRefreshSerializer which handles ROTATE_REFRESH_TOKENS
    and BLACKLIST_AFTER_ROTATION automatically.

    Returns:
        Body:   { access: str }
        Cookie: refresh_token (rotated when ROTATE_REFRESH_TOKENS=True)
    """
    permission_classes = [AllowAny]

    def post(self, request):
        raw_token = request.COOKIES.get(django_settings.JWT_REFRESH_COOKIE_NAME)
        if not raw_token:
            return Response(
                {"detail": "Refresh token no encontrado."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = TokenRefreshSerializer(data={"refresh": raw_token})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, InvalidToken) as e:
            return Response({"detail": str(e)}, status=status.HTTP_401_UNAUTHORIZED)

        data = serializer.validated_data
        response = Response({"access": data["access"]})

        # When ROTATE_REFRESH_TOKENS=True, serializer returns a new refresh token.
        if "refresh" in data:
            _set_refresh_cookie(response, data["refresh"])

        return response


class JWTLogoutView(APIView):
    """POST /api/auth/logout/ — blacklist refresh token and clear httpOnly cookie."""

    def post(self, request):
        raw_token = request.COOKIES.get(django_settings.JWT_REFRESH_COOKIE_NAME)
        if raw_token:
            try:
                RefreshToken(raw_token).blacklist()
            except (TokenError, InvalidToken):
                pass  # Already invalid — still clear the cookie

        response = Response({"detail": "Sesión cerrada."})
        _delete_refresh_cookie(response)
        return response


# ---------------------------------------------------------------------------
# Shared auth endpoint
# ---------------------------------------------------------------------------

class MeView(APIView):
    """GET /api/auth/me/ — return current authenticated user (JWT or session)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "id": request.user.pk,
            "username": request.user.username,
        })


# ---------------------------------------------------------------------------
# Celery task status
# ---------------------------------------------------------------------------

class TaskStatusView(APIView):
    """GET /api/tasks/{task_id}/ — poll a Celery task result.

    Returns:
        { task_id, status }                          while PENDING / STARTED
        { task_id, status, result }                  on SUCCESS
        { task_id, status, error }                   on FAILURE
    """

    def get(self, request, task_id: str):
        from celery.result import AsyncResult
        result = AsyncResult(task_id)
        data: dict = {"task_id": task_id, "status": result.status}
        if result.ready():
            if result.successful():
                data["result"] = result.result
            else:
                data["error"] = str(result.result)
        return Response(data)


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

class RegisterView(APIView):
    """POST /api/auth/register/ — create a new user and return JWT tokens.

    Respects the ALLOW_REGISTRATION setting (default True).
    Returns same shape as JWTLoginView: { access, user } + httpOnly refresh cookie.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_register"

    def post(self, request):
        from apps.core.serializers import RegisterSerializer

        if not django_settings.ALLOW_REGISTRATION:
            return Response(
                {"detail": "El registro está deshabilitado."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        response = Response(
            {
                "access": str(refresh.access_token),
                "user": {"id": user.pk, "username": user.username},
            },
            status=status.HTTP_201_CREATED,
        )
        _set_refresh_cookie(response, str(refresh))
        return response


# ---------------------------------------------------------------------------
# Google OAuth2
# ---------------------------------------------------------------------------

class GoogleAuthView(APIView):
    """POST /api/auth/google/ — verify a Google ID token and issue JWT tokens.

    Body: { credential: "<google-id-token>" }

    Finds an existing user by email or creates a new one. Returns same shape
    as JWTLoginView: { access, user } + httpOnly refresh cookie.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_google"

    def post(self, request):
        if not django_settings.GOOGLE_CLIENT_ID:
            return Response(
                {"detail": "Google login no configurado."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        credential = request.data.get("credential", "")
        if not credential:
            return Response(
                {"detail": "Credencial de Google requerida."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from google.oauth2 import id_token as google_id_token
            from google.auth.transport.requests import Request as GoogleRequest
            idinfo = google_id_token.verify_oauth2_token(
                credential, GoogleRequest(), django_settings.GOOGLE_CLIENT_ID
            )
        except ValueError as exc:
            return Response(
                {"detail": f"Token de Google inválido: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = idinfo.get("email", "")
        if not email:
            return Response(
                {"detail": "No se pudo obtener el email de Google."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.contrib.auth import get_user_model
        User = get_user_model()

        user = User.objects.filter(email=email).first()
        if user is None:
            # Derive a username from the email prefix, avoiding collisions.
            base_username = email.split("@")[0]
            username = base_username
            counter = 2
            while User.objects.filter(username=username).exists():
                username = f"{base_username}_{counter}"
                counter += 1
            user = User.objects.create_user(username=username, email=email)

        refresh = RefreshToken.for_user(user)
        response = Response({
            "access": str(refresh.access_token),
            "user": {"id": user.pk, "username": user.username},
        })
        _set_refresh_cookie(response, str(refresh))
        return response


# ---------------------------------------------------------------------------
# Profile & password
# ---------------------------------------------------------------------------

class ProfileView(APIView):
    """GET/PUT /api/auth/profile/ — read and update the authenticated user's profile."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.core.serializers import ProfileSerializer
        return Response(ProfileSerializer(request.user, context={"request": request}).data)

    def put(self, request):
        from apps.core.serializers import ProfileSerializer
        serializer = ProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ — change password and rotate JWT tokens."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_password"

    def post(self, request):
        from apps.core.serializers import ChangePasswordSerializer

        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data["current_password"]):
            return Response(
                {"current_password": "Contraseña actual incorrecta."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data["new_password"])
        user.save()

        # Blacklist old refresh token if present, then issue new pair.
        raw_token = request.COOKIES.get(django_settings.JWT_REFRESH_COOKIE_NAME)
        if raw_token:
            try:
                RefreshToken(raw_token).blacklist()
            except (TokenError, InvalidToken):
                pass

        refresh = RefreshToken.for_user(user)
        response = Response({"access": str(refresh.access_token)})
        _set_refresh_cookie(response, str(refresh))
        return response


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

class HealthView(APIView):
    """GET /api/health/ — liveness probe for load balancers and container orchestrators.

    Returns 200 when the DB is reachable, 503 otherwise.
    """
    permission_classes = [AllowAny]
    authentication_classes = []  # Skip JWT auth for health checks

    def get(self, request):
        from django.db import connection
        try:
            connection.ensure_connection()
            return Response({"status": "ok"})
        except Exception:
            return Response({"status": "error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


# ---------------------------------------------------------------------------
# Legacy session endpoints (kept for Django /admin/ compatibility)
# ---------------------------------------------------------------------------

@method_decorator(ensure_csrf_cookie, name="dispatch")
class LoginView(APIView):
    """Legacy session-based login used by Django admin.
    New SPA clients should use JWTLoginView (POST /api/auth/token/).
    """
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"detail": "CSRF cookie set"})

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")
        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response(
                {"detail": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        login(request, user)
        return Response({"id": user.pk, "username": user.username})
