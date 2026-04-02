import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestHealth:
    def test_health_ok(self):
        client = APIClient()
        resp = client.get("/api/health/")
        assert resp.status_code == 200
        assert resp.data["status"] == "ok"

    def test_health_no_auth_required(self):
        client = APIClient()
        resp = client.get("/api/health/")
        assert resp.status_code == 200
