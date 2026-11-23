import pytest


@pytest.fixture(autouse=True)
def no_yahoo_pay_dates(monkeypatch):
    """Dividend detection also asks Yahoo for payment dates: offline in tests unless a test patches it."""
    monkeypatch.setattr("apps.transactions.services.primary_ticker", lambda isin: None)
    monkeypatch.setattr("apps.transactions.services._yahoo_next_dividend", lambda ticker: (None, None))
