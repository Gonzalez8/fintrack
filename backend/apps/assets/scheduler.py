import logging

from apscheduler.schedulers.background import BackgroundScheduler

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _snapshot_job() -> None:
    """Check if a new PortfolioSnapshot is due and create one if so.

    Runs every minute. Wrapped in an atomic transaction with select_for_update
    on the Settings row so that concurrent executions (e.g. two Django worker
    processes or a duplicate scheduler start) are serialized at the DB level:
    only the first one to acquire the lock will create the snapshot; the others
    will find elapsed < freq once they get the lock and skip.
    """
    try:
        from apps.assets.models import PortfolioSnapshot, Settings
        from apps.assets.services import create_portfolio_snapshot_now
        from django.db import transaction
        from django.utils import timezone

        with transaction.atomic():
            settings = Settings.objects.select_for_update().get(pk=1)
            freq = settings.snapshot_frequency
            if freq <= 0:
                return

            last = PortfolioSnapshot.objects.order_by("-captured_at").first()
            if last is not None:
                elapsed_minutes = (timezone.now() - last.captured_at).total_seconds() / 60
                if elapsed_minutes < freq:
                    return

            create_portfolio_snapshot_now()
            logger.info("Portfolio snapshot created by scheduler")
    except Exception:
        logger.exception("Portfolio snapshot job failed")


def start() -> None:
    """Start the background scheduler with a job that checks every minute."""
    global _scheduler

    if _scheduler is not None and _scheduler.running:
        return

    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        _snapshot_job,
        trigger="interval",
        minutes=1,
        id="portfolio_snapshot",
        replace_existing=True,
        misfire_grace_time=30,
    )
    _scheduler.start()
    logger.info("Portfolio snapshot scheduler started (checks every minute)")
