from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Page-number pagination that honours ``?page_size=``.

    The frontend sizes its pages (25 rows in lists) and fetches whole sets for
    pickers and yearly summaries (``page_size=500/1000``). DRF's default class
    ignores the parameter and always returned 50 rows, so lists showed phantom
    empty pages and summaries silently dropped everything after the 50th row.
    """

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 1000
