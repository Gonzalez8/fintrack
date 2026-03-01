from django.contrib import admin
from .models import Asset, Account, AccountSnapshot, PortfolioSnapshot, PositionSnapshot, Settings

admin.site.register(Asset)
admin.site.register(Account)
admin.site.register(AccountSnapshot)
admin.site.register(Settings)
admin.site.register(PortfolioSnapshot)
admin.site.register(PositionSnapshot)
