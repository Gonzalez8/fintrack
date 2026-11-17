from django.contrib import admin

from .models import Amortization, Lease, Property, RentalExpense


@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display = ("name", "current_value", "outstanding_balance", "currency", "owner")
    list_filter = ("currency",)
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Amortization)
class AmortizationAdmin(admin.ModelAdmin):
    list_display = ("property", "month", "amount", "strategy", "owner")
    list_filter = ("strategy",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Lease)
class LeaseAdmin(admin.ModelAdmin):
    list_display = ("property", "tenant", "start_date", "end_date", "monthly_rent", "reduction", "owner")
    list_filter = ("reduction",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(RentalExpense)
class RentalExpenseAdmin(admin.ModelAdmin):
    list_display = ("property", "date", "category", "amount", "description", "owner")
    list_filter = ("category", "date")
    readonly_fields = ("id", "created_at", "updated_at")
