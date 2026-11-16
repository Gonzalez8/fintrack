import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task
def detect_splits_all_users_task() -> None:
    """Look up Yahoo Finance splits for every user's tracked assets (daily)."""
    from django.contrib.auth import get_user_model

    from apps.transactions.services import detect_splits

    for user in get_user_model().objects.filter(is_active=True):
        try:
            created = detect_splits(user)
            if created:
                logger.info("Detected %d new split(s) for user %s", len(created), user)
        except Exception as exc:
            logger.warning("Split detection failed for user %s: %s", user, exc)
