"""Personal access tokens: issuing, scopes and the endpoints they can never reach."""

import datetime
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.assets.models import Account, Asset
from apps.core.models import ApiToken
from apps.transactions.models import Transaction

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="tokenuser", password="testpass123")


@pytest.fixture
def session(user):
    """Browser-like session (what the Settings page uses)."""
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def account(user):
    return Account.objects.create(owner=user, name="Broker", type=Account.AccountType.INVERSION, currency="EUR")


@pytest.fixture
def asset(user):
    return Asset.objects.create(owner=user, name="Apple", ticker="AAPL", currency="USD")


def bearer(key):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {key}")
    return c


def tx_payload(asset, account):
    return {
        "date": "2026-11-16",
        "type": "BUY",
        "asset": str(asset.id),
        "account": str(account.id),
        "quantity": "1",
        "price": "100",
    }


@pytest.mark.django_db
class TestIssuing:
    def test_create_returns_the_key_once_and_stores_only_its_hash(self, session, user):
        res = session.post("/api/auth/api-tokens/", {"name": "Claude", "scope": "READ"}, format="json")
        assert res.status_code == 201
        key = res.data["key"]
        assert key.startswith("ft_") and len(key) > 40
        token = ApiToken.objects.get(owner=user)
        assert token.key_hash == ApiToken.hash_key(key) and key not in token.key_hash
        assert res.data["key_prefix"] == key[:10]

        listed = session.get("/api/auth/api-tokens/").data
        rows = listed["results"] if isinstance(listed, dict) else listed
        assert len(rows) == 1 and "key" not in rows[0]

    def test_revoke_hides_and_disables_the_token(self, session, user):
        token, key = ApiToken.issue(user, "Claude", "READ")
        assert session.delete(f"/api/auth/api-tokens/{token.id}/").status_code == 204
        token.refresh_from_db()
        assert token.revoked_at is not None
        assert bearer(key).get("/api/portfolio/").status_code == 401

    def test_cannot_see_or_revoke_other_users_tokens(self, session, db):
        other = User.objects.create_user(username="other", password="x")
        token, _ = ApiToken.issue(other, "theirs", "WRITE")
        assert session.delete(f"/api/auth/api-tokens/{token.id}/").status_code == 404


@pytest.mark.django_db
class TestScopes:
    def test_read_token_reads_but_cannot_write(self, user, asset, account):
        _, key = ApiToken.issue(user, "ro", ApiToken.Scope.READ)
        c = bearer(key)
        assert c.get("/api/portfolio/").status_code == 200
        res = c.post("/api/transactions/", tx_payload(asset, account), format="json")
        assert res.status_code == 403 and "read-only" in str(res.data["detail"])
        assert not Transaction.objects.exists()

    def test_write_token_creates_records(self, user, asset, account):
        _, key = ApiToken.issue(user, "rw", ApiToken.Scope.WRITE)
        res = bearer(key).post("/api/transactions/", tx_payload(asset, account), format="json")
        assert res.status_code == 201
        assert Transaction.objects.get().owner == user

    def test_no_token_can_delete(self, user, asset, account):
        tx = Transaction.objects.create(
            owner=user, asset=asset, account=account, type="BUY", date=datetime.date(2026, 1, 1), quantity=1, price=10
        )
        _, key = ApiToken.issue(user, "rw", ApiToken.Scope.WRITE)
        res = bearer(key).delete(f"/api/transactions/{tx.id}/")
        assert res.status_code == 403
        assert Transaction.objects.filter(pk=tx.pk).exists()

    def test_token_only_sees_its_owners_data(self, user, db):
        other = User.objects.create_user(username="other", password="x")
        Asset.objects.create(owner=other, name="Hidden", ticker="HID", currency="EUR", current_price=Decimal("1"))
        _, key = ApiToken.issue(user, "ro", "READ")
        data = bearer(key).get("/api/assets/").data
        rows = data["results"] if isinstance(data, dict) else data
        assert [r["ticker"] for r in rows] == []


@pytest.mark.django_db
class TestBlockedEndpoints:
    @pytest.mark.parametrize(
        "method,path,body",
        [
            ("get", "/api/auth/me/", None),
            ("get", "/api/auth/api-tokens/", None),
            ("post", "/api/auth/api-tokens/", {"name": "x", "scope": "WRITE"}),
            ("post", "/api/auth/change-password/", {"old_password": "testpass123", "new_password": "Hacked123!x"}),
            ("post", "/api/backup/import/", None),
        ],
    )
    def test_write_token_cannot_reach_account_or_restore_endpoints(self, user, method, path, body):
        _, key = ApiToken.issue(user, "rw", ApiToken.Scope.WRITE)
        res = getattr(bearer(key), method)(path, body, format="json") if body else getattr(bearer(key), method)(path)
        assert res.status_code == 403
        assert ApiToken.objects.filter(owner=user).count() == 1
        user.refresh_from_db()
        assert user.check_password("testpass123")


@pytest.mark.django_db
class TestAuthentication:
    def test_unknown_token_is_rejected(self, db):
        assert bearer("ft_not-a-real-token").get("/api/portfolio/").status_code == 401

    def test_inactive_user_is_rejected(self, user):
        _, key = ApiToken.issue(user, "ro", "READ")
        user.is_active = False
        user.save()
        assert bearer(key).get("/api/portfolio/").status_code == 401

    def test_jwt_bearer_still_works(self, user):
        access = str(RefreshToken.for_user(user).access_token)
        assert bearer(access).get("/api/portfolio/").status_code == 200

    def test_last_used_is_recorded(self, user):
        token, key = ApiToken.issue(user, "ro", "READ")
        assert token.last_used_at is None
        bearer(key).get("/api/portfolio/")
        token.refresh_from_db()
        assert token.last_used_at is not None
