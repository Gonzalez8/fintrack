"""
Tests for Celery tasks: snapshot dispatch, purge old snapshots.
"""

import datetime
import uuid
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.assets.models import PortfolioSnapshot, Settings
from apps.assets.tasks import purge_old_snapshots_task, snapshot_all_users_task

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create_user(username="taskuser", password="testpass123")


@pytest.fixture
def settings_with_freq(user):
    s = Settings.load(user)
    s.snapshot_frequency = 60  # every 60 minutes
    s.save()
    return s


@pytest.mark.django_db
class TestSnapshotAllUsersTask:
    @patch("apps.assets.tasks.snapshot_single_user_task")
    def test_dispatches_for_eligible_user(self, mock_task, user, settings_with_freq):
        snapshot_all_users_task()
        mock_task.delay.assert_called_once_with(user.pk)

    @patch("apps.assets.tasks.snapshot_single_user_task")
    def test_skips_recent_snapshot(self, mock_task, user, settings_with_freq):
        # Create a recent snapshot
        PortfolioSnapshot.objects.create(
            owner=user,
            captured_at=timezone.now(),
            batch_id=uuid.uuid4(),
            total_market_value=Decimal("1000"),
            total_cost=Decimal("800"),
            total_unrealized_pnl=Decimal("200"),
        )
        snapshot_all_users_task()
        mock_task.delay.assert_not_called()

    @patch("apps.assets.tasks.snapshot_single_user_task")
    def test_skips_disabled_user(self, mock_task, user):
        s = Settings.load(user)
        s.snapshot_frequency = 0
        s.save()
        snapshot_all_users_task()
        mock_task.delay.assert_not_called()


@pytest.mark.django_db
class TestPurgeOldSnapshotsTask:
    def test_purges_old_snapshots(self, user):
        s = Settings.load(user)
        s.data_retention_days = 30
        s.purge_portfolio_snapshots = True
        s.save()

        old_batch = uuid.uuid4()
        new_batch = uuid.uuid4()

        # Old snapshot (60 days ago)
        PortfolioSnapshot.objects.create(
            owner=user,
            captured_at=timezone.now() - datetime.timedelta(days=60),
            batch_id=old_batch,
            total_market_value=Decimal("100"),
            total_cost=Decimal("80"),
            total_unrealized_pnl=Decimal("20"),
        )
        # New snapshot (5 days ago)
        PortfolioSnapshot.objects.create(
            owner=user,
            captured_at=timezone.now() - datetime.timedelta(days=5),
            batch_id=new_batch,
            total_market_value=Decimal("200"),
            total_cost=Decimal("160"),
            total_unrealized_pnl=Decimal("40"),
        )

        purge_old_snapshots_task()

        assert PortfolioSnapshot.objects.filter(owner=user).count() == 1
        remaining = PortfolioSnapshot.objects.get(owner=user)
        assert remaining.batch_id == new_batch

    def test_no_purge_when_disabled(self, user):
        s = Settings.load(user)
        s.data_retention_days = 30
        s.purge_portfolio_snapshots = False
        s.save()

        PortfolioSnapshot.objects.create(
            owner=user,
            captured_at=timezone.now() - datetime.timedelta(days=60),
            batch_id=uuid.uuid4(),
            total_market_value=Decimal("100"),
            total_cost=Decimal("80"),
            total_unrealized_pnl=Decimal("20"),
        )

        purge_old_snapshots_task()
        assert PortfolioSnapshot.objects.filter(owner=user).count() == 1
