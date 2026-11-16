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
