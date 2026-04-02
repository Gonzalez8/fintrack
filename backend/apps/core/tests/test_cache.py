import pytest
from apps.core.cache import get_user_cache, set_user_cache, invalidate_user_cache, _key


@pytest.mark.django_db
class TestCacheHelpers:
    def test_set_and_get(self):
        set_user_cache(1, "test_ns", {"data": "value"}, timeout=60)
        result = get_user_cache(1, "test_ns")
        assert result == {"data": "value"}

    def test_get_missing_key(self):
        result = get_user_cache(999, "nonexistent")
        assert result is None

    def test_invalidate(self):
        set_user_cache(1, "ns1", "val1")
        set_user_cache(1, "ns2", "val2")
        invalidate_user_cache(1, "ns1", "ns2")
        assert get_user_cache(1, "ns1") is None
        assert get_user_cache(1, "ns2") is None

    def test_key_format(self):
        assert _key(42, "portfolio") == "ft:42:portfolio"

    def test_different_users_isolated(self):
        set_user_cache(1, "ns", "user1_data")
        set_user_cache(2, "ns", "user2_data")
        assert get_user_cache(1, "ns") == "user1_data"
        assert get_user_cache(2, "ns") == "user2_data"
