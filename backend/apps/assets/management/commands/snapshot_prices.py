from django.core.management.base import BaseCommand
from apps.assets.services import update_prices


class Command(BaseCommand):
    help = "Fetch latest prices from Yahoo Finance and save PriceSnapshots"

    def handle(self, *args, **options):
        results = update_prices()
        self.stdout.write(f"Updated: {results['updated']}")
        for p in results["prices"]:
            self.stdout.write(f"  {p['ticker']}: {p['price']}")
        for e in results["errors"]:
            self.stderr.write(f"  ERROR: {e}")
