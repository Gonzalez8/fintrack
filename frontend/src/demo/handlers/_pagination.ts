import type { PaginatedResponse } from '@/types'

export function paginate<T>(
  items: T[],
  params: URLSearchParams,
  baseUrl: string,
): PaginatedResponse<T> {
  const page = parseInt(params.get('page') ?? '1')
  const pageSize = parseInt(params.get('page_size') ?? '50')
  const start = (page - 1) * pageSize
  const end = start + pageSize
  const count = items.length
  return {
    count,
    next: end < count ? `${baseUrl}?page=${page + 1}` : null,
    previous: page > 1 ? `${baseUrl}?page=${page - 1}` : null,
    results: items.slice(start, end),
  }
}
