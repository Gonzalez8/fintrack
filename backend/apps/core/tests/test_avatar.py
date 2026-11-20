"""Profile photo: upload, serve, delete, validation and token access."""

import base64

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.core.models import ApiToken, UserAvatar

User = get_user_model()

AVATAR_URL = "/api/auth/avatar/"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def data_url(content_type, data):
    return f"data:{content_type};base64,{base64.b64encode(data).decode()}"


@pytest.fixture
def user(db):
    return User.objects.create_user(username="avataruser", password="testpass123")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_upload_serve_and_delete(client, user):
    assert client.get(AVATAR_URL).status_code == 404
    assert client.get("/api/auth/me/").json()["avatar_version"] is None

    res = client.put(AVATAR_URL, {"image": data_url("image/png", PNG)}, format="json")
    assert res.status_code == 200
    version = res.json()["avatar_version"]
    assert isinstance(version, int)
    assert client.get("/api/auth/me/").json()["avatar_version"] == version
    assert client.get("/api/auth/profile/").json()["avatar_version"] == version

    img = client.get(AVATAR_URL)
    assert img.status_code == 200
    assert img["Content-Type"] == "image/png"
    assert img["X-Content-Type-Options"] == "nosniff"
    assert img.content == PNG

    # Replacing keeps a single row
    client.put(AVATAR_URL, {"image": data_url("image/jpeg", JPEG)}, format="json")
    assert UserAvatar.objects.filter(user=user).count() == 1
    assert client.get(AVATAR_URL)["Content-Type"] == "image/jpeg"

    assert client.delete(AVATAR_URL).status_code == 204
    assert client.get(AVATAR_URL).status_code == 404


@pytest.mark.parametrize(
    "image",
    [
        data_url("image/svg+xml", b"<svg xmlns='http://www.w3.org/2000/svg'/>"),
        data_url("image/png", JPEG),  # declared type doesn't match the bytes
        data_url("image/png", b"<html>not an image</html>"),
        "not a data url",
    ],
)
def test_rejects_non_images(client, image):
    assert client.put(AVATAR_URL, {"image": image}, format="json").status_code == 400
    assert not UserAvatar.objects.exists()


def test_rejects_too_large(client):
    big = PNG + b"\x00" * UserAvatar.MAX_BYTES
    assert client.put(AVATAR_URL, {"image": data_url("image/png", big)}, format="json").status_code == 400


def test_avatar_is_per_user(client, user, db):
    client.put(AVATAR_URL, {"image": data_url("image/png", PNG)}, format="json")
    other = APIClient()
    other.force_authenticate(User.objects.create_user(username="other", password="testpass123"))
    assert other.get(AVATAR_URL).status_code == 404


def test_requires_auth(db):
    assert APIClient().get(AVATAR_URL).status_code == 401


def test_api_tokens_cannot_reach_avatar(user):
    _, key = ApiToken.issue(user, "mcp", ApiToken.Scope.WRITE)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {key}")
    assert c.get(AVATAR_URL).status_code in (401, 403)
    assert c.put(AVATAR_URL, {"image": data_url("image/png", PNG)}, format="json").status_code in (401, 403)
