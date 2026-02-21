from django.contrib import admin
from .models import Asset, Account, PortfolioSnapshot, PriceSnapshot, Settings

admin.site.register(Asset)
admin.site.register(Account)
admin.site.register(Settings)
admin.site.register(PriceSnapshot)
admin.site.register(PortfolioSnapshot)
