from django.contrib import admin

from .models import UserAvatar


@admin.register(UserAvatar)
class UserAvatarAdmin(admin.ModelAdmin):
    list_display = ("user", "content_type", "updated_at")
    readonly_fields = ("user", "content_type", "created_at", "updated_at")
    exclude = ("data",)
