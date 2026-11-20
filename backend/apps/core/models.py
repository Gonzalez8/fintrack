import hashlib
import secrets
import uuid

from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UserOwnedModel(TimeStampedModel):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="%(app_label)s_%(class)s_set",
    )

    class Meta:
        abstract = True


class ApiToken(UserOwnedModel):
    """Personal access token for programmatic clients such as the Fintrack MCP server.

    Only the SHA-256 of the key is stored; the key itself is shown once, when
    issued. Access rules are enforced by ``ApiTokenAuthentication``.
    """

    PREFIX = "ft_"

    class Scope(models.TextChoices):
        READ = "READ", "Read only"
        WRITE = "WRITE", "Read and write"

    name = models.CharField(max_length=100)
    scope = models.CharField(max_length=5, choices=Scope.choices, default=Scope.READ)
    key_prefix = models.CharField(max_length=12, help_text="First characters of the key, to recognise it.")
    key_hash = models.CharField(max_length=64, unique=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.key_prefix}…, {self.scope})"

    @staticmethod
    def hash_key(key: str) -> str:
        return hashlib.sha256(key.encode()).hexdigest()

    @classmethod
    def issue(cls, owner, name: str, scope: str):
        """Create a token and return ``(token, key)``; the key is not stored."""
        key = cls.PREFIX + secrets.token_urlsafe(32)
        token = cls.objects.create(owner=owner, name=name, scope=scope, key_prefix=key[:10], key_hash=cls.hash_key(key))
        return token, key


class UserAvatar(TimeStampedModel):
    """Profile photo, stored in the database so no media volume is needed.

    The browser crops and re-encodes the picture to a small square before
    uploading it (which also drops EXIF/GPS data); the API only accepts
    JPEG, PNG or WebP up to ``MAX_BYTES``.
    """

    MAX_BYTES = 300 * 1024
    CONTENT_TYPES = ("image/jpeg", "image/png", "image/webp")

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="avatar")
    content_type = models.CharField(max_length=20)
    data = models.BinaryField()

    def __str__(self):
        return f"Avatar of {self.user}"

    @property
    def version(self) -> int:
        """Changes on every upload; the web adds it to the image URL to bust the cache."""
        return int(self.updated_at.timestamp())

    @classmethod
    def version_for(cls, user) -> int | None:
        avatar = cls.objects.filter(user=user).only("updated_at").first()
        return avatar.version if avatar else None
