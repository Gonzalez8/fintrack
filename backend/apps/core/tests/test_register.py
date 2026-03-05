"""Tests for registration, Google auth, profile and change-password endpoints."""
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client():
    from rest_framework.test import APIClient
    return APIClient()


@pytest.fixture
def existing_user(db):
    return User.objects.create_user(
        username="existing",
        email="existing@example.com",
        password="password123",
    )


@pytest.fixture
def auth_client(existing_user):
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken
    client = APIClient()
    token = str(RefreshToken.for_user(existing_user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestRegister:
    URL = "/api/auth/register/"

    def test_register_success(self, api_client):
        resp = api_client.post(
            self.URL,
            {"username": "newuser", "password": "secret123", "password_confirm": "secret123"},
            format="json",
        )
        assert resp.status_code == 201
        assert "access" in resp.data
        assert resp.data["user"]["username"] == "newuser"
        assert User.objects.filter(username="newuser").exists()

    def test_register_sets_refresh_cookie(self, api_client):
        resp = api_client.post(
            self.URL,
            {"username": "cookieuser", "password": "secret123", "password_confirm": "secret123"},
            format="json",
        )
        assert "refresh_token" in resp.cookies

    def test_register_with_email(self, api_client):
        resp = api_client.post(
            self.URL,
            {
                "username": "emailuser",
                "email": "emailuser@example.com",
                "password": "secret123",
                "password_confirm": "secret123",
            },
            format="json",
        )
        assert resp.status_code == 201
        user = User.objects.get(username="emailuser")
        assert user.email == "emailuser@example.com"

    def test_register_duplicate_username(self, api_client, existing_user):
        resp = api_client.post(
            self.URL,
            {"username": "existing", "password": "secret123", "password_confirm": "secret123"},
            format="json",
        )
        assert resp.status_code == 400
        assert "username" in resp.data

    def test_register_duplicate_email(self, api_client, existing_user):
        resp = api_client.post(
            self.URL,
            {
                "username": "other",
                "email": "existing@example.com",
                "password": "secret123",
                "password_confirm": "secret123",
            },
            format="json",
        )
        assert resp.status_code == 400
        assert "email" in resp.data

    def test_register_password_mismatch(self, api_client):
        resp = api_client.post(
            self.URL,
            {"username": "mismatch", "password": "secret123", "password_confirm": "different"},
            format="json",
        )
        assert resp.status_code == 400

    def test_register_password_too_short(self, api_client):
        resp = api_client.post(
            self.URL,
            {"username": "shortpw", "password": "abc", "password_confirm": "abc"},
            format="json",
        )
        assert resp.status_code == 400

    def test_register_disabled(self, api_client, settings):
        settings.ALLOW_REGISTRATION = False
        resp = api_client.post(
            self.URL,
            {"username": "blocked", "password": "secret123", "password_confirm": "secret123"},
            format="json",
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Google Auth
# ---------------------------------------------------------------------------

FAKE_IDINFO = {
    "email": "google@example.com",
    "sub": "12345",
    "email_verified": True,
}


@pytest.mark.django_db
class TestGoogleAuth:
    URL = "/api/auth/google/"

    def test_google_auth_no_client_id(self, api_client, settings):
        settings.GOOGLE_CLIENT_ID = ""
        resp = api_client.post(self.URL, {"credential": "token"}, format="json")
        assert resp.status_code == 503

    def test_google_auth_new_user(self, api_client, settings):
        settings.GOOGLE_CLIENT_ID = "test-client-id"
        with patch(
            "google.oauth2.id_token.verify_oauth2_token", return_value=FAKE_IDINFO
        ):
            resp = api_client.post(self.URL, {"credential": "valid-token"}, format="json")
        assert resp.status_code == 200
        assert "access" in resp.data
        assert User.objects.filter(email="google@example.com").exists()

    def test_google_auth_existing_user_by_email(self, api_client, settings, existing_user):
        settings.GOOGLE_CLIENT_ID = "test-client-id"
        idinfo = {**FAKE_IDINFO, "email": "existing@example.com"}
        with patch(
            "google.oauth2.id_token.verify_oauth2_token", return_value=idinfo
        ):
            resp = api_client.post(self.URL, {"credential": "valid-token"}, format="json")
        assert resp.status_code == 200
        assert resp.data["user"]["username"] == "existing"
        # No duplicate user created
        assert User.objects.filter(email="existing@example.com").count() == 1

    def test_google_auth_username_collision(self, api_client, settings):
        settings.GOOGLE_CLIENT_ID = "test-client-id"
        User.objects.create_user(username="google", email="other@example.com", password="x")
        with patch(
            "google.oauth2.id_token.verify_oauth2_token", return_value=FAKE_IDINFO
        ):
            resp = api_client.post(self.URL, {"credential": "valid-token"}, format="json")
        assert resp.status_code == 200
        created = User.objects.get(email="google@example.com")
        assert created.username == "google_2"

    def test_google_auth_invalid_token(self, api_client, settings):
        settings.GOOGLE_CLIENT_ID = "test-client-id"
        with patch(
            "google.oauth2.id_token.verify_oauth2_token",
            side_effect=ValueError("bad token"),
        ):
            resp = api_client.post(self.URL, {"credential": "bad"}, format="json")
        assert resp.status_code == 400

    def test_google_auth_missing_credential(self, api_client, settings):
        settings.GOOGLE_CLIENT_ID = "test-client-id"
        resp = api_client.post(self.URL, {}, format="json")
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestProfile:
    URL = "/api/auth/profile/"

    def test_profile_get(self, auth_client, existing_user):
        resp = auth_client.get(self.URL)
        assert resp.status_code == 200
        assert resp.data["username"] == "existing"
        assert resp.data["email"] == "existing@example.com"
        assert "date_joined" in resp.data

    def test_profile_update_email(self, auth_client, existing_user):
        resp = auth_client.put(
            self.URL, {"email": "new@example.com"}, format="json"
        )
        assert resp.status_code == 200
        existing_user.refresh_from_db()
        assert existing_user.email == "new@example.com"

    def test_profile_duplicate_username(self, auth_client, db):
        User.objects.create_user(username="taken", password="x")
        resp = auth_client.put(self.URL, {"username": "taken"}, format="json")
        assert resp.status_code == 400

    def test_profile_requires_auth(self, api_client):
        resp = api_client.get(self.URL)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Change password
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestChangePassword:
    URL = "/api/auth/change-password/"

    def test_change_password_success(self, auth_client, existing_user):
        resp = auth_client.post(
            self.URL,
            {
                "current_password": "password123",
                "new_password": "newpassword99",
                "new_password_confirm": "newpassword99",
            },
            format="json",
        )
        assert resp.status_code == 200
        assert "access" in resp.data
        existing_user.refresh_from_db()
        assert existing_user.check_password("newpassword99")

    def test_change_password_wrong_current(self, auth_client):
        resp = auth_client.post(
            self.URL,
            {
                "current_password": "wrongpassword",
                "new_password": "newpassword99",
                "new_password_confirm": "newpassword99",
            },
            format="json",
        )
        assert resp.status_code == 400
        assert "current_password" in resp.data

    def test_change_password_mismatch(self, auth_client):
        resp = auth_client.post(
            self.URL,
            {
                "current_password": "password123",
                "new_password": "newpassword99",
                "new_password_confirm": "different",
            },
            format="json",
        )
        assert resp.status_code == 400

    def test_change_password_too_short(self, auth_client):
        resp = auth_client.post(
            self.URL,
            {
                "current_password": "password123",
                "new_password": "abc",
                "new_password_confirm": "abc",
            },
            format="json",
        )
        assert resp.status_code == 400

    def test_change_password_requires_auth(self, api_client):
        resp = api_client.post(self.URL, {}, format="json")
        assert resp.status_code == 401
