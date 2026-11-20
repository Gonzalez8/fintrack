from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("api-tokens", views.ApiTokenViewSet, basename="api-token")

urlpatterns = [
    # JWT auth
    path("token/", views.JWTLoginView.as_view(), name="jwt-login"),
    path("token/refresh/", views.JWTRefreshView.as_view(), name="jwt-refresh"),
    path("logout/", views.JWTLogoutView.as_view(), name="logout"),
    path("me/", views.MeView.as_view(), name="me"),
    # Registration & social auth
    path("register/", views.RegisterView.as_view(), name="register"),
    path("google/", views.GoogleAuthView.as_view(), name="google-auth"),
    # Profile & password
    path("profile/", views.ProfileView.as_view(), name="profile"),
    path("avatar/", views.AvatarView.as_view(), name="avatar"),
    path("change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    # Personal access tokens (MCP server, scripts)
    path("", include(router.urls)),
]
