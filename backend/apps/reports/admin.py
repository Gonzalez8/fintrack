from django.contrib import admin

from .models import SavingsGoal


@admin.register(SavingsGoal)
class SavingsGoalAdmin(admin.ModelAdmin):
    list_display = ("name", "target_amount", "base_type", "deadline", "owner", "created_at")
    list_filter = ("owner",)
    search_fields = ("name",)
