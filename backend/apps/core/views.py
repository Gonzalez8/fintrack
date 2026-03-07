from django.conf import settings as django_settings
from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken


# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------

def _set_auth_cookies(response, access_token_str, refresh_token_str):
    """Set both access and refresh tokens as httpOnly cookies."""
    response.set_cookie(
        key=django_settings.JWT_AUTH_COOKIE_ACCESS,
        value=access_token_str,
        httponly=django_settings.JWT_AUTH_COOKIE_HTTPONLY,
        samesite=django_settings.JWT_AUTH_COOKIE_SAMESITE,
        secure=django_settings.JWT_AUTH_COOKIE_SECURE,
        max_age=int(django_settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        path=django_settings.JWT_AUTH_COOKIE_PATH,
    )
    response.set_cookie(
        key=django_settings.JWT_AUTH_COOKIE_REFRESH,
        value=refresh_token_str,
        httponly=django_settings.JWT_AUTH_COOKIE_HTTPONLY,
        samesite=django_settings.JWT_AUTH_COOKIE_SAMESITE,
        secure=django_settings.JWT_AUTH_COOKIE_SECURE,
        max_age=int(django_settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=django_settings.JWT_AUTH_COOKIE_PATH,
    )


def _set_access_cookie(response, access_token_str):
    """Set only the access token cookie (used on refresh)."""
    response.set_cookie(
        key=django_settings.JWT_AUTH_COOKIE_ACCESS,
        value=access_token_str,
        httponly=django_settings.JWT_AUTH_COOKIE_HTTPONLY,
        samesite=django_settings.JWT_AUTH_COOKIE_SAMESITE,
        secure=django_settings.JWT_AUTH_COOKIE_SECURE,
        max_age=int(django_settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        path=django_settings.JWT_AUTH_COOKIE_PATH,
    )


def _delete_auth_cookies(response):
    """Remove both auth cookies."""
    response.delete_cookie(django_settings.JWT_AUTH_COOKIE_ACCESS, path="/")
    response.delete_cookie(django_settings.JWT_AUTH_COOKIE_REFRESH, path="/")


def _user_payload(user):
    return {"id": user.pk, "username": user.username}


# ---------------------------------------------------------------------------
# JWT endpoints
# ---------------------------------------------------------------------------

class JWTLoginView(APIView):
    """POST /api/auth/token/ — authenticate and issue JWT tokens.

    Returns body { access, user } + httpOnly cookies (access_token, refresh_token).
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
        access = str(refresh.access_token)
        response = Response({
            "access": access,
            "user": _user_payload(user),
        })
        _set_auth_cookies(response, access, str(refresh))
        return response


class JWTRefreshView(APIView):
    """POST /api/auth/token/refresh/ — rotate refresh token using httpOnly cookie.

    Returns body { access } + updated cookies.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        raw_token = request.COOKIES.get(django_settings.JWT_AUTH_COOKIE_REFRESH)
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
        access = data["access"]
        response = Response({"access": access})
        _set_access_cookie(response, access)

        if "refresh" in data:
            response.set_cookie(
                key=django_settings.JWT_AUTH_COOKIE_REFRESH,
                value=data["refresh"],
                httponly=django_settings.JWT_AUTH_COOKIE_HTTPONLY,
                samesite=django_settings.JWT_AUTH_COOKIE_SAMESITE,
                secure=django_settings.JWT_AUTH_COOKIE_SECURE,
                max_age=int(django_settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
                path=django_settings.JWT_AUTH_COOKIE_PATH,
            )

        return response


class JWTLogoutView(APIView):
    """POST /api/auth/logout/ — blacklist refresh token and clear cookies."""

    def post(self, request):
        raw_token = request.COOKIES.get(django_settings.JWT_AUTH_COOKIE_REFRESH)
        if raw_token:
            try:
                RefreshToken(raw_token).blacklist()
            except (TokenError, InvalidToken):
                pass

        response = Response({"detail": "Sesion cerrada."})
        _delete_auth_cookies(response)
        return response


# ---------------------------------------------------------------------------
# User info
# ---------------------------------------------------------------------------

class MeView(APIView):
    """GET /api/auth/me/ — return current authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_user_payload(request.user))


# ---------------------------------------------------------------------------
# Celery task status
# ---------------------------------------------------------------------------

class TaskStatusView(APIView):
    """GET /api/tasks/{task_id}/ — poll a Celery task result."""

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
    """POST /api/auth/register/ — create a new user and return JWT tokens."""
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_register"

    def post(self, request):
        from apps.core.serializers import RegisterSerializer

        if not django_settings.ALLOW_REGISTRATION:
            return Response(
                {"detail": "El registro esta deshabilitado."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        response = Response(
            {"access": access, "user": _user_payload(user)},
            status=status.HTTP_201_CREATED,
        )
        _set_auth_cookies(response, access, str(refresh))
        return response


# ---------------------------------------------------------------------------
# Google OAuth2
# ---------------------------------------------------------------------------

class GoogleAuthView(APIView):
    """POST /api/auth/google/ — verify Google ID token and issue JWT tokens."""
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
                {"detail": f"Token de Google invalido: {exc}"},
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
            base_username = email.split("@")[0]
            username = base_username
            counter = 2
            while User.objects.filter(username=username).exists():
                username = f"{base_username}_{counter}"
                counter += 1
            user = User.objects.create_user(username=username, email=email)

        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        response = Response({
            "access": access,
            "user": _user_payload(user),
        })
        _set_auth_cookies(response, access, str(refresh))
        return response


# ---------------------------------------------------------------------------
# Profile & password
# ---------------------------------------------------------------------------

class ProfileView(APIView):
    """GET/PUT /api/auth/profile/ — read and update user profile."""
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
                {"current_password": "Contrasena actual incorrecta."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data["new_password"])
        user.save()

        raw_token = request.COOKIES.get(django_settings.JWT_AUTH_COOKIE_REFRESH)
        if raw_token:
            try:
                RefreshToken(raw_token).blacklist()
            except (TokenError, InvalidToken):
                pass

        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        response = Response({"access": access})
        _set_auth_cookies(response, access, str(refresh))
        return response


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

class HealthView(APIView):
    """GET /api/health/ — liveness probe."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        from django.db import connection
        try:
            connection.ensure_connection()
            return Response({"status": "ok"})
        except Exception:
            return Response({"status": "error"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
