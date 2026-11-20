import base64
import binascii
import re

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import ApiToken, UserAvatar

User = get_user_model()


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    password = serializers.CharField(min_length=8, write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Este nombre de usuario ya esta en uso.")
        return value

    def validate_email(self, value):
        if value and User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Este email ya esta registrado.")
        return value

    def validate(self, data):
        if data["password"] != data["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Las contrasenas no coinciden."})
        return data

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        email = validated_data.pop("email", "")
        return User.objects.create_user(
            username=validated_data["username"],
            email=email,
            password=validated_data["password"],
        )


class ProfileSerializer(serializers.ModelSerializer):
    avatar_version = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "date_joined", "avatar_version"]
        read_only_fields = ["id", "date_joined"]

    def get_avatar_version(self, obj):
        return UserAvatar.version_for(obj)

    def validate_username(self, value):
        user = self.context["request"].user
        if User.objects.exclude(pk=user.pk).filter(username=value).exists():
            raise serializers.ValidationError("Este nombre de usuario ya esta en uso.")
        return value

    def validate_email(self, value):
        user = self.context["request"].user
        if value and User.objects.exclude(pk=user.pk).filter(email=value).exists():
            raise serializers.ValidationError("Este email ya esta registrado.")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(min_length=8, write_only=True)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, data):
        if data["new_password"] != data["new_password_confirm"]:
            raise serializers.ValidationError({"new_password_confirm": "Las contrasenas no coinciden."})
        return data


class ApiTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApiToken
        fields = ["id", "name", "scope", "key_prefix", "created_at", "last_used_at"]
        read_only_fields = ["id", "key_prefix", "created_at", "last_used_at"]


_DATA_URL = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$")


def _sniff_image(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


class AvatarSerializer(serializers.Serializer):
    """``image`` is a data URL (``data:image/jpeg;base64,…``) with a JPEG, PNG or WebP picture."""

    image = serializers.CharField(max_length=UserAvatar.MAX_BYTES * 4 // 3 + 64)

    def validate_image(self, value):
        match = _DATA_URL.match(value)
        if not match:
            raise serializers.ValidationError("La foto debe ser JPEG, PNG o WebP.")
        try:
            data = base64.b64decode(match.group(2), validate=False)
        except (binascii.Error, ValueError) as exc:
            raise serializers.ValidationError("La foto no es válida.") from exc
        if len(data) > UserAvatar.MAX_BYTES:
            raise serializers.ValidationError("La foto es demasiado grande.")
        # The declared type must match the bytes, so nothing but a real raster image is ever served back.
        if _sniff_image(data) != match.group(1):
            raise serializers.ValidationError("La foto no es válida.")
        return {"content_type": match.group(1), "data": data}
