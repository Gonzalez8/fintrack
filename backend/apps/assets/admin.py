from django.contrib import admin

from .models import (
    Account,
    AccountSnapshot,
    Asset,
    PortfolioSnapshot,
    Settings,
)


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ("name", "ticker", "type", "currency", "current_price", "price_mode", "owner")
    list_filter = ("type", "currency", "price_mode", "price_source")
    search_fields = ("name", "ticker", "isin")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "currency", "balance", "owner")
    list_filter = ("type", "currency")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(AccountSnapshot)
class AccountSnapshotAdmin(admin.ModelAdmin):
    list_display = ("account", "date", "balance", "owner")
    list_filter = ("date",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(PortfolioSnapshot)
class PortfolioSnapshotAdmin(admin.ModelAdmin):
    list_display = ("owner", "captured_at", "total_market_value", "total_cost", "total_unrealized_pnl")
    list_filter = ("captured_at",)
    readonly_fields = ("id",)


@admin.register(Settings)
class SettingsAdmin(admin.ModelAdmin):
    list_display = ("user", "base_currency", "cost_basis_method", "fiscal_cost_method")
    readonly_fields = ("user",)
