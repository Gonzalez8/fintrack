"""Comprehensive JWT authentication tests for Fintrack 2.0.

Covers: login, refresh, logout, me, register, profile, change-password.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()

# ---------------------------------------------------------------------------
# URLs
# ---------------------------------------------------------------------------
LOGIN_URL = "/api/auth/token/"
REFRESH_URL = "/api/auth/token/refresh/"
LOGOUT_URL = "/api/auth/logout/"
ME_URL = "/api/auth/me/"
REGISTER_URL = "/api/auth/register/"
PROFILE_URL = "/api/auth/profile/"
CHANGE_PASSWORD_URL = "/api/auth/change-password/"

# Cookie names (must match settings)
ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username="testuser",
        password="securepass123",
        email="test@example.com",
    )


@pytest.fixture
def auth_response(api_client, user):
    """Login and return the response (handy for tests that need tokens)."""
    return api_client.post(LOGIN_URL, {"username": "testuser", "password": "securepass123"})


@pytest.fixture
def auth_client(api_client, auth_response):
    """An APIClient that already carries the auth cookies from a successful login."""
    access = auth_response.cookies.get(ACCESS_COOKIE)
    refresh = auth_response.cookies.get(REFRESH_COOKIE)
    if access:
        api_client.cookies[ACCESS_COOKIE] = access.value
    if refresh:
        api_client.cookies[REFRESH_COOKIE] = refresh.value
    # Also set the Authorization header so DRF's JWTAuthentication picks it up
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {auth_response.data['access']}")
    return api_client


# ===========================================================================
# Login (JWTLoginView)
# ===========================================================================

class TestLogin:
    def test_login_success(self, api_client, user):
        resp = api_client.post(LOGIN_URL, {"username": "testuser", "password": "securepass123"})
        assert resp.status_code == 200
        # Body contains access token and user payload
        assert "access" in resp.data
        assert resp.data["user"]["username"] == "testuser"
        assert resp.data["user"]["id"] == user.pk
        # Cookies are set
        assert ACCESS_COOKIE in resp.cookies
        assert REFRESH_COOKIE in resp.cookies
        # Cookies are httpOnly
        assert resp.cookies[ACCESS_COOKIE]["httponly"]
        assert resp.cookies[REFRESH_COOKIE]["httponly"]

    def test_login_invalid_password(self, api_client, user):
        resp = api_client.post(LOGIN_URL, {"username": "testuser", "password": "wrongpass"})
        assert resp.status_code == 401
        assert ACCESS_COOKIE not in resp.cookies or resp.cookies[ACCESS_COOKIE].value == ""

    def test_login_nonexistent_user(self, api_client, db):
        resp = api_client.post(LOGIN_URL, {"username": "ghost", "password": "whatever"})
        assert resp.status_code == 401

    def test_login_missing_fields(self, api_client, user):
        # Missing password
        resp = api_client.post(LOGIN_URL, {"username": "testuser"})
        assert resp.status_code == 401

        # Missing username
        resp = api_client.post(LOGIN_URL, {"password": "securepass123"})
        assert resp.status_code == 401

        # Empty body
        resp = api_client.post(LOGIN_URL, {})
        assert resp.status_code == 401

    def test_login_returns_different_tokens_per_call(self, api_client, user):
        """Each login should produce a fresh token pair."""
        r1 = api_client.post(LOGIN_URL, {"username": "testuser", "password": "securepass123"})
        r2 = api_client.post(LOGIN_URL, {"username": "testuser", "password": "securepass123"})
        assert r1.data["access"] != r2.data["access"]


# ===========================================================================
# Refresh (JWTRefreshView)
# ===========================================================================

class TestRefresh:
    def test_refresh_success(self, api_client, auth_response):
        # Set the refresh cookie from the login response
        refresh_cookie = auth_response.cookies.get(REFRESH_COOKIE)
        assert refresh_cookie is not None
        api_client.cookies[REFRESH_COOKIE] = refresh_cookie.value

        resp = api_client.post(REFRESH_URL)
        assert resp.status_code == 200
        assert "access" in resp.data
        # A new access cookie should be set
        assert ACCESS_COOKIE in resp.cookies

    def test_refresh_no_cookie(self, api_client, db):
        """Without a refresh cookie the endpoint should return 401."""
        resp = api_client.post(REFRESH_URL)
        assert resp.status_code == 401

    def test_refresh_invalid_cookie(self, api_client, db):
        """A garbage token should be rejected."""
        api_client.cookies[REFRESH_COOKIE] = "not-a-valid-jwt"
        resp = api_client.post(REFRESH_URL)
        assert resp.status_code == 401

    def test_refresh_returns_new_access_token(self, api_client, auth_response):
        """The new access token should differ from the original one."""
        original_access = auth_response.data["access"]
        api_client.cookies[REFRESH_COOKIE] = auth_response.cookies[REFRESH_COOKIE].value

        resp = api_client.post(REFRESH_URL)
        assert resp.status_code == 200
        assert resp.data["access"] != original_access


# ===========================================================================
# Logout (JWTLogoutView)
# ===========================================================================

class TestLogout:
    def test_logout_success(self, auth_client):
        resp = auth_client.post(LOGOUT_URL)
        assert resp.status_code == 200
        # Cookies should be deleted (max-age=0 or empty value)
        if ACCESS_COOKIE in resp.cookies:
            c = resp.cookies[ACCESS_COOKIE]
            assert c["max-age"] == 0 or c.value == ""
        if REFRESH_COOKIE in resp.cookies:
            c = resp.cookies[REFRESH_COOKIE]
            assert c["max-age"] == 0 or c.value == ""

    def test_logout_blacklists_refresh_token(self, api_client, auth_response):
        """After logout the refresh token should be blacklisted and unusable."""
        refresh_value = auth_response.cookies[REFRESH_COOKIE].value
        api_client.cookies[REFRESH_COOKIE] = refresh_value
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {auth_response.data['access']}")

        # Logout
        api_client.post(LOGOUT_URL)

        # Try to refresh with the now-blacklisted token
        api_client.cookies[REFRESH_COOKIE] = refresh_value
        resp = api_client.post(REFRESH_URL)
        assert resp.status_code == 401

    def test_logout_without_cookie_still_200(self, auth_client):
        """Logout is idempotent — even without a refresh cookie it succeeds."""
        auth_client.cookies.pop(REFRESH_COOKIE, None)
        resp = auth_client.post(LOGOUT_URL)
        assert resp.status_code == 200


# ===========================================================================
# Me (MeView)
# ===========================================================================

class TestMe:
    def test_me_authenticated(self, auth_client, user):
        resp = auth_client.get(ME_URL)
        assert resp.status_code == 200
        assert resp.data["username"] == "testuser"
        assert resp.data["id"] == user.pk

    def test_me_unauthenticated(self, api_client, db):
        resp = api_client.get(ME_URL)
        assert resp.status_code == 401

    def test_me_with_invalid_token(self, api_client, db):
        api_client.credentials(HTTP_AUTHORIZATION="Bearer garbage-token")
        resp = api_client.get(ME_URL)
        assert resp.status_code == 401


# ===========================================================================
# Register (RegisterView)
# ===========================================================================

class TestRegister:
    def test_register_success(self, api_client, db, settings):
        settings.ALLOW_REGISTRATION = True
        data = {
            "username": "newuser",
            "email": "new@example.com",
            "password": "strongpass99",
            "password_confirm": "strongpass99",
        }
        resp = api_client.post(REGISTER_URL, data)
        assert resp.status_code == 201
        assert "access" in resp.data
        assert resp.data["user"]["username"] == "newuser"
        # Cookies are set
        assert ACCESS_COOKIE in resp.cookies
        assert REFRESH_COOKIE in resp.cookies
        # User actually exists
        assert User.objects.filter(username="newuser").exists()

    def test_register_disabled(self, api_client, db, settings):
        settings.ALLOW_REGISTRATION = False
        data = {
            "username": "blocked",
            "password": "strongpass99",
            "password_confirm": "strongpass99",
        }
        resp = api_client.post(REGISTER_URL, data)
        assert resp.status_code == 403
        assert not User.objects.filter(username="blocked").exists()

    def test_register_duplicate_username(self, api_client, user, settings):
        settings.ALLOW_REGISTRATION = True
        data = {
            "username": "testuser",  # already exists
            "password": "strongpass99",
            "password_confirm": "strongpass99",
        }
        resp = api_client.post(REGISTER_URL, data)
        assert resp.status_code == 400

    def test_register_password_mismatch(self, api_client, db, settings):
        settings.ALLOW_REGISTRATION = True
        data = {
            "username": "mismatch",
            "password": "strongpass99",
            "password_confirm": "differentpass",
        }
        resp = api_client.post(REGISTER_URL, data)
        assert resp.status_code == 400

    def test_register_password_too_short(self, api_client, db, settings):
        settings.ALLOW_REGISTRATION = True
        data = {
            "username": "shortpw",
            "password": "abc",
            "password_confirm": "abc",
        }
        resp = api_client.post(REGISTER_URL, data)
        assert resp.status_code == 400

    def test_register_duplicate_email(self, api_client, user, settings):
        settings.ALLOW_REGISTRATION = True
        data = {
            "username": "another",
            "email": "test@example.com",  # already belongs to user fixture
            "password": "strongpass99",
            "password_confirm": "strongpass99",
        }
        resp = api_client.post(REGISTER_URL, data)
        assert resp.status_code == 400

    def test_register_without_email(self, api_client, db, settings):
        """Email is optional; registration should succeed without it."""
        settings.ALLOW_REGISTRATION = True
        data = {
            "username": "noemail",
            "password": "strongpass99",
            "password_confirm": "strongpass99",
        }
        resp = api_client.post(REGISTER_URL, data)
        assert resp.status_code == 201


# ===========================================================================
# Profile (ProfileView)
# ===========================================================================

class TestProfile:
    def test_profile_get(self, auth_client, user):
        resp = auth_client.get(PROFILE_URL)
        assert resp.status_code == 200
        assert resp.data["username"] == "testuser"
        assert resp.data["email"] == "test@example.com"
        assert "id" in resp.data
        assert "date_joined" in resp.data

    def test_profile_update_username(self, auth_client, user):
        resp = auth_client.put(PROFILE_URL, {"username": "renamed"}, format="json")
        assert resp.status_code == 200
        assert resp.data["username"] == "renamed"
        user.refresh_from_db()
        assert user.username == "renamed"

    def test_profile_update_email(self, auth_client, user):
        resp = auth_client.put(PROFILE_URL, {"email": "updated@example.com"}, format="json")
        assert resp.status_code == 200
        assert resp.data["email"] == "updated@example.com"

    def test_profile_unauthenticated(self, api_client, db):
        resp = api_client.get(PROFILE_URL)
        assert resp.status_code == 401

    def test_profile_duplicate_username(self, auth_client, db):
        """Cannot change username to one that already exists."""
        User.objects.create_user(username="taken", password="irrelevant1")
        resp = auth_client.put(PROFILE_URL, {"username": "taken"}, format="json")
        assert resp.status_code == 400


# ===========================================================================
# Change Password (ChangePasswordView)
# ===========================================================================

class TestChangePassword:
    def test_change_password_success(self, auth_client, user):
        data = {
            "current_password": "securepass123",
            "new_password": "newstrongpass456",
            "new_password_confirm": "newstrongpass456",
        }
        resp = auth_client.post(CHANGE_PASSWORD_URL, data)
        assert resp.status_code == 200
        assert "access" in resp.data
        # New cookies are issued
        assert ACCESS_COOKIE in resp.cookies
        assert REFRESH_COOKIE in resp.cookies
        # Old password no longer works
        user.refresh_from_db()
        assert user.check_password("newstrongpass456")
        assert not user.check_password("securepass123")

    def test_change_password_wrong_current(self, auth_client, user):
        data = {
            "current_password": "wrongcurrent",
            "new_password": "newstrongpass456",
            "new_password_confirm": "newstrongpass456",
        }
        resp = auth_client.post(CHANGE_PASSWORD_URL, data)
        assert resp.status_code == 400
        assert "current_password" in resp.data

    def test_change_password_mismatch(self, auth_client, user):
        data = {
            "current_password": "securepass123",
            "new_password": "newstrongpass456",
            "new_password_confirm": "doesnotmatch",
        }
        resp = auth_client.post(CHANGE_PASSWORD_URL, data)
        assert resp.status_code == 400

    def test_change_password_too_short(self, auth_client, user):
        data = {
            "current_password": "securepass123",
            "new_password": "short",
            "new_password_confirm": "short",
        }
        resp = auth_client.post(CHANGE_PASSWORD_URL, data)
        assert resp.status_code == 400

    def test_change_password_unauthenticated(self, api_client, db):
        data = {
            "current_password": "irrelevant",
            "new_password": "newstrongpass456",
            "new_password_confirm": "newstrongpass456",
        }
        resp = api_client.post(CHANGE_PASSWORD_URL, data)
        assert resp.status_code == 401

    def test_change_password_blacklists_old_refresh(self, api_client, auth_response, user):
        """After changing password the old refresh token should be blacklisted."""
        old_refresh = auth_response.cookies[REFRESH_COOKIE].value
        api_client.cookies[REFRESH_COOKIE] = old_refresh
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {auth_response.data['access']}")

        data = {
            "current_password": "securepass123",
            "new_password": "newstrongpass456",
            "new_password_confirm": "newstrongpass456",
        }
        resp = api_client.post(CHANGE_PASSWORD_URL, data)
        assert resp.status_code == 200

        # Old refresh should now be rejected
        api_client.cookies[REFRESH_COOKIE] = old_refresh
        resp = api_client.post(REFRESH_URL)
        assert resp.status_code == 401


# ===========================================================================
# End-to-end flow
# ===========================================================================

class TestEndToEndFlow:
    """Full lifecycle: register -> login -> me -> change password -> logout."""

    def test_full_lifecycle(self, api_client, db, settings):
        settings.ALLOW_REGISTRATION = True

        # 1. Register
        resp = api_client.post(REGISTER_URL, {
            "username": "lifecycle",
            "password": "password123x",
            "password_confirm": "password123x",
        })
        assert resp.status_code == 201
        access = resp.data["access"]
        refresh_value = resp.cookies[REFRESH_COOKIE].value

        # 2. Access /me/ with the token
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = api_client.get(ME_URL)
        assert resp.status_code == 200
        assert resp.data["username"] == "lifecycle"

        # 3. Refresh
        api_client.cookies[REFRESH_COOKIE] = refresh_value
        resp = api_client.post(REFRESH_URL)
        assert resp.status_code == 200
        new_access = resp.data["access"]
        assert new_access != access

        # 4. Change password
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {new_access}")
        resp = api_client.post(CHANGE_PASSWORD_URL, {
            "current_password": "password123x",
            "new_password": "updatedpass456",
            "new_password_confirm": "updatedpass456",
        })
        assert resp.status_code == 200
        final_access = resp.data["access"]
        final_refresh = resp.cookies[REFRESH_COOKIE].value

        # 5. Login with new password
        api_client.credentials()  # clear auth
        resp = api_client.post(LOGIN_URL, {
            "username": "lifecycle",
            "password": "updatedpass456",
        })
        assert resp.status_code == 200

        # 6. Logout
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {resp.data['access']}")
        api_client.cookies[REFRESH_COOKIE] = resp.cookies[REFRESH_COOKIE].value
        resp = api_client.post(LOGOUT_URL)
        assert resp.status_code == 200

        # 7. /me/ should now fail
        api_client.credentials()
        resp = api_client.get(ME_URL)
        assert resp.status_code == 401
