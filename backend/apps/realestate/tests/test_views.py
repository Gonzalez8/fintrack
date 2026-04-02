import pytest
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

from apps.realestate.models import Amortization, Property

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="alice", password="testpass123")


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username="bob", password="testpass456")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def other_client(other_user):
    c = APIClient()
    c.force_authenticate(user=other_user)
    return c


@pytest.fixture
def property_no_mortgage(user):
    return Property.objects.create(
        owner=user,
        name="Beach House",
        current_value=Decimal("500000.00"),
        currency="EUR",
    )


@pytest.fixture
def property_with_mortgage(user):
    return Property.objects.create(
        owner=user,
        name="City Apartment",
        current_value=Decimal("300000.00"),
        purchase_price=Decimal("250000.00"),
        currency="EUR",
        original_loan_amount=Decimal("200000.00"),
        outstanding_balance=Decimal("150000.00"),
        annual_interest_rate=Decimal("3.0000"),
        total_term_months=360,
        months_paid=60,
        monthly_payment=Decimal("843.21"),
    )


# ---------------------------------------------------------------------------
# TestPropertyCRUD
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestPropertyCRUD:
    def test_create_property(self, client):
        data = {
            "name": "Country House",
            "current_value": "400000.00",
            "currency": "EUR",
        }
        resp = client.post("/api/properties/", data, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        body = resp.json()
        assert body["name"] == "Country House"
        assert body["current_value"] == "400000.00"
        assert body["has_mortgage"] is False
        assert body["original_loan_amount"] is None

    def test_create_property_with_mortgage(self, client):
        data = {
            "name": "City Flat",
            "current_value": "300000.00",
            "purchase_price": "250000.00",
            "currency": "EUR",
            "original_loan_amount": "200000.00",
            "outstanding_balance": "180000.00",
            "annual_interest_rate": "2.5000",
            "total_term_months": 300,
            "months_paid": 24,
            "monthly_payment": "800.00",
        }
        resp = client.post("/api/properties/", data, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        body = resp.json()
        assert body["has_mortgage"] is True
        assert body["original_loan_amount"] == "200000.00"
        assert body["outstanding_balance"] == "180000.00"

    def test_list_properties(self, client, property_no_mortgage, property_with_mortgage):
        resp = client.get("/api/properties/")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        # Could be paginated or plain list
        results = data if isinstance(data, list) else data.get("results", data)
        assert len(results) == 2

    def test_retrieve_property(self, client, property_with_mortgage):
        resp = client.get(f"/api/properties/{property_with_mortgage.id}/")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["name"] == "City Apartment"

    def test_update_property(self, client, property_no_mortgage):
        data = {
            "name": "Updated Beach House",
            "current_value": "550000.00",
            "currency": "EUR",
        }
        resp = client.put(
            f"/api/properties/{property_no_mortgage.id}/", data, format="json"
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["name"] == "Updated Beach House"
        assert resp.json()["current_value"] == "550000.00"

    def test_delete_property(self, client, property_no_mortgage):
        resp = client.delete(f"/api/properties/{property_no_mortgage.id}/")
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not Property.objects.filter(id=property_no_mortgage.id).exists()

    def test_multi_tenancy_isolation(
        self, client, other_client, property_with_mortgage, other_user
    ):
        # Other user cannot see alice's property
        resp = other_client.get(f"/api/properties/{property_with_mortgage.id}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND

        # Other user's list is empty
        resp = other_client.get("/api/properties/")
        results = resp.json() if isinstance(resp.json(), list) else resp.json().get("results", resp.json())
        assert len(results) == 0

    def test_computed_net_equity(self, client, property_with_mortgage):
        resp = client.get(f"/api/properties/{property_with_mortgage.id}/")
        body = resp.json()
        # current_value=300000, outstanding_balance=150000 -> net_equity=150000
        assert body["net_equity"] == "150000.00"

    def test_computed_amortized_capital(self, client, property_with_mortgage):
        resp = client.get(f"/api/properties/{property_with_mortgage.id}/")
        body = resp.json()
        # original_loan=200000, outstanding=150000 -> amortized_capital=50000
        assert body["amortized_capital"] == "50000.00"

    def test_computed_has_mortgage_true(self, client, property_with_mortgage):
        resp = client.get(f"/api/properties/{property_with_mortgage.id}/")
        assert resp.json()["has_mortgage"] is True

    def test_computed_has_mortgage_false(self, client, property_no_mortgage):
        resp = client.get(f"/api/properties/{property_no_mortgage.id}/")
        assert resp.json()["has_mortgage"] is False

    def test_net_equity_no_outstanding(self, client, property_no_mortgage):
        # outstanding_balance is None -> net_equity = current_value
        resp = client.get(f"/api/properties/{property_no_mortgage.id}/")
        assert resp.json()["net_equity"] == "500000.00"


# ---------------------------------------------------------------------------
# TestAmortizationCRUD
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestAmortizationCRUD:
    def test_create_amortization(self, client, property_with_mortgage):
        data = {
            "property": str(property_with_mortgage.id),
            "month": 12,
            "amount": "10000.00",
            "strategy": "REDUCE_PAYMENT",
        }
        resp = client.post("/api/amortizations/", data, format="json")
        assert resp.status_code == status.HTTP_201_CREATED
        body = resp.json()
        assert body["month"] == 12
        assert body["amount"] == "10000.00"
        assert body["strategy"] == "REDUCE_PAYMENT"

    def test_list_amortizations_filtered_by_property(
        self, client, user, property_with_mortgage
    ):
        # Create a second property
        other_prop = Property.objects.create(
            owner=user,
            name="Other",
            current_value=Decimal("100000.00"),
            original_loan_amount=Decimal("80000.00"),
            outstanding_balance=Decimal("70000.00"),
        )
        Amortization.objects.create(
            owner=user,
            property=property_with_mortgage,
            month=6,
            amount=Decimal("5000.00"),
            strategy="REDUCE_PAYMENT",
        )
        Amortization.objects.create(
            owner=user,
            property=other_prop,
            month=3,
            amount=Decimal("2000.00"),
            strategy="REDUCE_TERM",
        )

        # Filter by property_with_mortgage
        resp = client.get(
            f"/api/amortizations/?property={property_with_mortgage.id}"
        )
        assert resp.status_code == status.HTTP_200_OK
        results = resp.json() if isinstance(resp.json(), list) else resp.json().get("results", resp.json())
        assert len(results) == 1
        assert results[0]["month"] == 6

    def test_update_amortization(self, client, user, property_with_mortgage):
        amort = Amortization.objects.create(
            owner=user,
            property=property_with_mortgage,
            month=10,
            amount=Decimal("8000.00"),
            strategy="REDUCE_PAYMENT",
        )
        data = {
            "property": str(property_with_mortgage.id),
            "month": 10,
            "amount": "12000.00",
            "strategy": "REDUCE_TERM",
        }
        resp = client.put(f"/api/amortizations/{amort.id}/", data, format="json")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["amount"] == "12000.00"
        assert resp.json()["strategy"] == "REDUCE_TERM"

    def test_delete_amortization(self, client, user, property_with_mortgage):
        amort = Amortization.objects.create(
            owner=user,
            property=property_with_mortgage,
            month=5,
            amount=Decimal("3000.00"),
            strategy="REDUCE_TERM",
        )
        resp = client.delete(f"/api/amortizations/{amort.id}/")
        assert resp.status_code == status.HTTP_204_NO_CONTENT
        assert not Amortization.objects.filter(id=amort.id).exists()

    def test_unique_month_per_property(self, client, user, property_with_mortgage):
        Amortization.objects.create(
            owner=user,
            property=property_with_mortgage,
            month=7,
            amount=Decimal("5000.00"),
            strategy="REDUCE_PAYMENT",
        )
        data = {
            "property": str(property_with_mortgage.id),
            "month": 7,
            "amount": "3000.00",
            "strategy": "REDUCE_TERM",
        }
        resp = client.post("/api/amortizations/", data, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_multi_tenancy_isolation(
        self, client, other_client, user, property_with_mortgage
    ):
        amort = Amortization.objects.create(
            owner=user,
            property=property_with_mortgage,
            month=4,
            amount=Decimal("6000.00"),
            strategy="REDUCE_PAYMENT",
        )
        # Other user cannot retrieve alice's amortization
        resp = other_client.get(f"/api/amortizations/{amort.id}/")
        assert resp.status_code == status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# TestMortgageSimulation
# ---------------------------------------------------------------------------
@pytest.mark.django_db
class TestMortgageSimulation:
    def test_simulate_reduce_payment(self, client):
        data = {
            "outstanding_balance": "150000.00",
            "annual_interest_rate": "3.0000",
            "remaining_months": 300,
            "monthly_payment": "843.21",
            "extra_payment": "20000.00",
            "strategy": "REDUCE_PAYMENT",
        }
        resp = client.post("/api/properties/simulate/", data, format="json")
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["strategy"] == "REDUCE_PAYMENT"
        assert "current" in body
        assert "new" in body
        assert "difference" in body
        # New payment should be less than current
        assert Decimal(body["new"]["monthly_payment"]) < Decimal(
            body["current"]["monthly_payment"]
        )
        # Remaining installments stay the same for reduce payment
        assert body["new"]["remaining_installments"] == body["current"]["remaining_installments"]

    def test_simulate_reduce_term(self, client):
        data = {
            "outstanding_balance": "150000.00",
            "annual_interest_rate": "3.0000",
            "remaining_months": 300,
            "monthly_payment": "843.21",
            "extra_payment": "20000.00",
            "strategy": "REDUCE_TERM",
        }
        resp = client.post("/api/properties/simulate/", data, format="json")
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["strategy"] == "REDUCE_TERM"
        # Monthly payment stays the same
        assert body["new"]["monthly_payment"] == body["current"]["monthly_payment"]
        # Remaining installments should be fewer
        assert (
            body["new"]["remaining_installments"]
            < body["current"]["remaining_installments"]
        )

    def test_simulate_full_payoff(self, client):
        data = {
            "outstanding_balance": "50000.00",
            "annual_interest_rate": "2.5000",
            "remaining_months": 120,
            "monthly_payment": "500.00",
            "extra_payment": "60000.00",  # more than outstanding
            "strategy": "REDUCE_PAYMENT",
        }
        resp = client.post("/api/properties/simulate/", data, format="json")
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["new"]["monthly_payment"] == "0.00"
        assert body["new"]["remaining_installments"] == 0
        assert body["new"]["total_interest"] == "0.00"

    def test_simulate_validation_errors(self, client):
        # Missing required fields
        resp = client.post("/api/properties/simulate/", {}, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

        # Negative outstanding_balance
        data = {
            "outstanding_balance": "-100.00",
            "annual_interest_rate": "3.0000",
            "remaining_months": 120,
            "monthly_payment": "500.00",
            "extra_payment": "1000.00",
            "strategy": "REDUCE_PAYMENT",
        }
        resp = client.post("/api/properties/simulate/", data, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

        # remaining_months = 0 (min is 1)
        data2 = {
            "outstanding_balance": "100000.00",
            "annual_interest_rate": "3.0000",
            "remaining_months": 0,
            "monthly_payment": "500.00",
            "extra_payment": "1000.00",
            "strategy": "REDUCE_PAYMENT",
        }
        resp = client.post("/api/properties/simulate/", data2, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

        # Invalid strategy
        data3 = {
            "outstanding_balance": "100000.00",
            "annual_interest_rate": "3.0000",
            "remaining_months": 120,
            "monthly_payment": "500.00",
            "extra_payment": "1000.00",
            "strategy": "INVALID",
        }
        resp = client.post("/api/properties/simulate/", data3, format="json")
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
