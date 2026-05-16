from django.contrib import admin

from .models import Employer, Payroll


@admin.register(Employer)
class EmployerAdmin(admin.ModelAdmin):
    list_display = ("name", "cif", "owner", "created_at")
    search_fields = ("name", "cif", "owner__username")
    list_filter = ("created_at",)


@admin.register(Payroll)
class PayrollAdmin(admin.ModelAdmin):
    list_display = (
        "period_end",
        "period_start",
        "employer",
        "gross",
        "ss_employee",
        "irpf_withholding",
        "net",
        "owner",
    )
    list_filter = ("period_end", "employer")
    search_fields = ("employer__name", "owner__username", "notes")
    autocomplete_fields = ("employer",)
