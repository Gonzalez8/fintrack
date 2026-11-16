from django.contrib import admin

from .models import Dividend, DividendSuggestion, Interest, StockSplit, Transaction


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("date", "type", "asset", "account", "quantity", "price", "commission", "owner")
    list_filter = ("type", "date")
    search_fields = ("asset__name", "asset__ticker", "notes")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Dividend)
class DividendAdmin(admin.ModelAdmin):
    list_display = ("date", "asset", "gross", "tax", "net", "owner")
    list_filter = ("date",)
    search_fields = ("asset__name", "asset__ticker")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Interest)
class InterestAdmin(admin.ModelAdmin):
    list_display = ("date_start", "date_end", "account", "gross", "net", "owner")
    list_filter = ("date_end",)
    search_fields = ("account__name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(StockSplit)
class StockSplitAdmin(admin.ModelAdmin):
    list_display = ("date", "asset", "ratio_to", "ratio_from", "status", "source", "owner")
    list_filter = ("status", "source", "date")
    search_fields = ("asset__name", "asset__ticker")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(DividendSuggestion)
class DividendSuggestionAdmin(admin.ModelAdmin):
    list_display = ("ex_date", "asset", "shares", "amount_per_share", "gross", "currency", "status", "owner")
    list_filter = ("status", "ex_date")
    search_fields = ("asset__name", "asset__ticker")
    readonly_fields = ("id", "created_at", "updated_at")
