import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from apps.assets.models import Settings


@pytest.fixture
def user(db):
    return User.objects.create_user(username="jwt_user", password="secure_pass")


@pytest.fixture
def api_client():
    return APIClient()


def _login(client, username="jwt_user", password="secure_pass"):
    return client.post("/api/auth/token/", {"username": username, "password": password})


@pytest.mark.django_db
class TestJWTLogin:
    def test_valid_credentials_return_access_token(self, api_client, user):
        response = _login(api_client)
        assert response.status_code == 200
        data = response.json()
        assert "access" in data
        assert "user" in data
        assert data["user"]["username"] == "jwt_user"

    def test_valid_credentials_set_refresh_cookie(self, api_client, user):
        response = _login(api_client)
        assert response.status_code == 200
        assert "refresh_token" in response.cookies
        assert response.cookies["refresh_token"]["httponly"]

    def test_invalid_password_returns_401(self, api_client, user):
        response = _login(api_client, password="wrong")
        assert response.status_code == 401

    def test_unknown_user_returns_401(self, api_client, db):
        response = _login(api_client, username="nobody", password="whatever")
        assert response.status_code == 401


@pytest.mark.django_db
class TestJWTRefresh:
    def test_valid_cookie_returns_new_access_token(self, api_client, user):
        login_resp = _login(api_client)
        api_client.cookies["refresh_token"] = login_resp.cookies["refresh_token"].value

        response = api_client.post("/api/auth/token/refresh/")
        assert response.status_code == 200
        assert "access" in response.json()

    def test_missing_cookie_returns_401(self, api_client, db):
        response = api_client.post("/api/auth/token/refresh/")
        assert response.status_code == 401

    def test_invalid_token_returns_401(self, api_client, db):
        api_client.cookies["refresh_token"] = "not.a.valid.jwt"
        response = api_client.post("/api/auth/token/refresh/")
        assert response.status_code == 401


@pytest.mark.django_db
class TestJWTLogout:
    def test_logout_clears_refresh_cookie(self, api_client, user):
        login_resp = _login(api_client)
        api_client.cookies["refresh_token"] = login_resp.cookies["refresh_token"].value
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_resp.json()['access']}")

        response = api_client.post("/api/auth/logout/")
        assert response.status_code == 200
        # Cookie deleted = empty value
        assert response.cookies["refresh_token"].value == ""

    def test_logout_blacklists_refresh_token(self, api_client, user):
        login_resp = _login(api_client)
        refresh_cookie_value = login_resp.cookies["refresh_token"].value
        api_client.cookies["refresh_token"] = refresh_cookie_value
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_resp.json()['access']}")

        api_client.post("/api/auth/logout/")

        # Old refresh token should now be blacklisted
        api_client.cookies["refresh_token"] = refresh_cookie_value
        response = api_client.post("/api/auth/token/refresh/")
        assert response.status_code == 401


@pytest.mark.django_db
class TestJWTProtectedEndpoints:
    def test_portfolio_without_token_returns_401(self, api_client, db):
        response = api_client.get("/api/portfolio/")
        assert response.status_code == 401

    def test_portfolio_with_valid_token_returns_200(self, api_client, user):
        Settings.load(user)
        login_resp = _login(api_client)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_resp.json()['access']}")

        response = api_client.get("/api/portfolio/")
        assert response.status_code == 200

    def test_portfolio_with_malformed_token_returns_401(self, api_client, db):
        api_client.credentials(HTTP_AUTHORIZATION="Bearer invalid.token.here")
        response = api_client.get("/api/portfolio/")
        assert response.status_code == 401

    def test_me_endpoint_returns_current_user(self, api_client, user):
        login_resp = _login(api_client)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_resp.json()['access']}")

        response = api_client.get("/api/auth/me/")
        assert response.status_code == 200
        assert response.json()["username"] == "jwt_user"
