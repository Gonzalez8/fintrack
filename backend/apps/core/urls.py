from django.urls import path
from . import views

urlpatterns = [
    # JWT auth (primary for SPA)
    path("token/", views.JWTLoginView.as_view(), name="jwt-login"),
    path("token/refresh/", views.JWTRefreshView.as_view(), name="jwt-refresh"),
    path("logout/", views.JWTLogoutView.as_view(), name="logout"),
    path("me/", views.MeView.as_view(), name="me"),
    # Registration & social auth
    path("register/", views.RegisterView.as_view(), name="register"),
    path("google/", views.GoogleAuthView.as_view(), name="google-auth"),
    # Profile & password
    path("profile/", views.ProfileView.as_view(), name="profile"),
    path("change-password/", views.ChangePasswordView.as_view(), name="change-password"),
    # Legacy session auth (kept for Django admin)
    path("login/", views.LoginView.as_view(), name="session-login"),
]
