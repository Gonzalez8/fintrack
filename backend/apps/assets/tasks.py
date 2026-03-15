import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def update_prices_task(self, user_id: int) -> dict:
    """Fetch latest prices from Yahoo Finance for all AUTO-mode assets of `user_id`."""
    from django.contrib.auth import get_user_model
    from django.core.exceptions import ObjectDoesNotExist
    from apps.assets.services import update_prices

    try:
        user = get_user_model().objects.get(pk=user_id)
    except ObjectDoesNotExist:
        logger.info("update_prices_task: user %s not found, skipping", user_id)
        return {"updated": 0, "errors": ["User not found"]}

    try:
        result = update_prices(user)
        result["user_id"] = user.pk
        # Invalidate cached portfolio/reports since prices changed
        from apps.core.cache import invalidate_user_cache, FINANCIAL_NAMESPACES
        invalidate_user_cache(user.pk, *FINANCIAL_NAMESPACES)
        return result
    except Exception as exc:
        logger.warning("update_prices_task failed for user %s: %s", user_id, exc)
        raise self.retry(exc=exc)


@shared_task
def snapshot_all_users_task() -> None:
    """Dispatch per-user snapshot tasks for every user whose snapshot interval is due."""
    from apps.assets.models import PortfolioSnapshot, Settings
    from django.utils import timezone

    for user_settings in Settings.objects.select_related("user").filter(snapshot_frequency__gt=0):
        freq = user_settings.snapshot_frequency
        last = (
            PortfolioSnapshot.objects
            .filter(owner=user_settings.user)
            .order_by("-captured_at")
            .first()
        )
        if last is not None:
            elapsed_minutes = (timezone.now() - last.captured_at).total_seconds() / 60
            if elapsed_minutes < freq:
                continue

        snapshot_single_user_task.delay(user_settings.user_id)


@shared_task
def snapshot_single_user_task(user_id: int) -> None:
    """Create a PortfolioSnapshot for a single user."""
    from django.contrib.auth import get_user_model
    from apps.assets.services import create_portfolio_snapshot_now

    try:
        user = get_user_model().objects.get(pk=user_id)
    except get_user_model().DoesNotExist:
        return

    create_portfolio_snapshot_now(user)
    logger.info("Portfolio snapshot created for user %s", user)


@shared_task
def purge_old_snapshots_task() -> None:
    """Delete old snapshots based on per-user retention settings."""
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
