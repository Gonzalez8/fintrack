export interface TransactionsQueryParams {
  page: number;
  pageSize: number;
  search?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
}

/**
 * Query string for GET /transactions/. Parameter names must match the
 * backend TransactionFilter (from_date, to_date, account_id); unknown ones
 * are silently ignored by django-filter.
 */
export function buildTransactionsQuery({
  page,
  pageSize,
  search,
  type,
  dateFrom,
  dateTo,
  accountId,
}: TransactionsQueryParams) {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("page_size", String(pageSize));
  if (search) p.set("search", search);
  if (type) p.set("type", type);
  if (dateFrom) p.set("from_date", dateFrom);
  if (dateTo) p.set("to_date", dateTo);
  if (accountId) p.set("account_id", accountId);
  return p.toString();
}
