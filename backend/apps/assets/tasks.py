import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def update_prices_task(self, user_id: int) -> dict:
    """Fetch latest prices from Yahoo Finance for all AUTO-mode assets of `user_id`.

    Retries up to 3 times with a 30-second delay on transient failures (network errors,
    Yahoo Finance timeouts). Returns the same dict as `update_prices()`.
    """
    from django.contrib.auth import get_user_model
    from apps.assets.services import update_prices

    try:
        user = get_user_model().objects.get(pk=user_id)
        return update_prices(user)
    except Exception as exc:
        logger.warning("update_prices_task failed for user %s: %s", user_id, exc)
        raise self.retry(exc=exc)


@shared_task
def snapshot_all_users_task() -> None:
    """Create a PortfolioSnapshot for every user whose snapshot interval is due.

    Replaces the APScheduler _snapshot_job(). Triggered by Celery Beat every 60 seconds.
    Uses select_for_update per user to prevent duplicate snapshots across concurrent workers.
    """
    from apps.assets.models import PortfolioSnapshot, Settings
    from apps.assets.services import create_portfolio_snapshot_now
    from django.db import transaction
    from django.utils import timezone

    for user_settings in Settings.objects.select_related("user").filter(snapshot_frequency__gt=0):
        with transaction.atomic():
            try:
                settings = Settings.objects.select_for_update().get(pk=user_settings.pk)
            except Settings.DoesNotExist:
                continue

            freq = settings.snapshot_frequency
            if freq <= 0:
                continue

            last = (
                PortfolioSnapshot.objects
                .filter(owner=settings.user)
                .order_by("-captured_at")
                .first()
            )
            if last is not None:
                elapsed_minutes = (timezone.now() - last.captured_at).total_seconds() / 60
                if elapsed_minutes < freq:
                    continue

            create_portfolio_snapshot_now(settings.user)
            logger.info("Portfolio snapshot created for user %s", settings.user)


@shared_task
def purge_old_snapshots_task() -> None:
    """Delete old PortfolioSnapshot / PositionSnapshot records based on per-user retention settings.

    Triggered by Celery Beat once a day.  Skips users with data_retention_days = None.
    Respects the per-user purge_portfolio_snapshots / purge_position_snapshots flags.
    """
    from datetime import timedelta

    from django.db import transaction
    from django.utils import timezone

    from apps.assets.models import PortfolioSnapshot, PositionSnapshot, Settings

    for settings in Settings.objects.select_related("user").exclude(data_retention_days__isnull=True):
        cutoff = timezone.now() - timedelta(days=settings.data_retention_days)
        user = settings.user

        with transaction.atomic():
            if settings.purge_portfolio_snapshots:
                deleted, _ = (
                    PortfolioSnapshot.objects
                    .filter(owner=user, captured_at__lt=cutoff)
                    .delete()
                )
                if deleted:
                    logger.info("Purged %d PortfolioSnapshot(s) for user %s", deleted, user)

            if settings.purge_position_snapshots:
                deleted, _ = (
                    PositionSnapshot.objects
                    .filter(owner=user, captured_at__lt=cutoff)
                    .delete()
                )
                if deleted:
                    logger.info("Purged %d PositionSnapshot(s) for user %s", deleted, user)
