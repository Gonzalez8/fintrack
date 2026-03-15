"""
Per-user cache helpers for expensive computations.

Usage:
    from apps.core.cache import get_user_cache, invalidate_user_cache

    # In views — cache a computation for 60s
    data = get_user_cache(user.pk, "portfolio")
    if data is None:
        data = expensive_computation(user)
        set_user_cache(user.pk, "portfolio", data, timeout=60)

    # After mutations — clear related caches
    invalidate_user_cache(user.pk, "portfolio", "reports")
"""

from django.core.cache import cache

_PREFIX = "ft"


def _key(user_id, namespace):
    return f"{_PREFIX}:{user_id}:{namespace}"


def get_user_cache(user_id, namespace):
    return cache.get(_key(user_id, namespace))


def set_user_cache(user_id, namespace, data, timeout=60):
    cache.set(_key(user_id, namespace), data, timeout)


def invalidate_user_cache(user_id, *namespaces):
    keys = [_key(user_id, ns) for ns in namespaces]
    cache.delete_many(keys)


# All cache namespaces used in the app
NS_PORTFOLIO = "portfolio"
NS_REPORTS_PATRIMONIO = "rpt:patrimonio"
NS_REPORTS_RV = "rpt:rv"
NS_REPORTS_SAVINGS = "rpt:savings"
NS_REPORTS_YEAR = "rpt:year"
NS_REPORTS_ANNUAL_SAVINGS = "rpt:annual_savings"
NS_SETTINGS = "settings"

# Namespaces to invalidate when financial data changes
FINANCIAL_NAMESPACES = (
    NS_PORTFOLIO,
    NS_REPORTS_PATRIMONIO,
    NS_REPORTS_RV,
    NS_REPORTS_SAVINGS,
    NS_REPORTS_YEAR,
    NS_REPORTS_ANNUAL_SAVINGS,
)
