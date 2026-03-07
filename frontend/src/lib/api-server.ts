import { cookies } from "next/headers";
import { DJANGO_INTERNAL_URL, COOKIE_ACCESS, COOKIE_REFRESH, IS_DEMO } from "./constants";

/**
 * Server-side fetch to Django API.
 * In demo mode, returns static data instead of calling Django.
 */
export async function djangoFetch<T = unknown>(
  path: string,
  options: RequestInit & { revalidate?: number | false } = {},
): Promise<T> {
  if (IS_DEMO) {
    const { resolveDemoData } = await import("@/demo/server-data");
    return resolveDemoData<T>(path);
  }

  const cookieStore = await cookies();
  const access = cookieStore.get(COOKIE_ACCESS)?.value;
  const refresh = cookieStore.get(COOKIE_REFRESH)?.value;

  const cookieHeader = [
    access && `${COOKIE_ACCESS}=${access}`,
    refresh && `${COOKIE_REFRESH}=${refresh}`,
  ]
    .filter(Boolean)
    .join("; ");

  const url = `${DJANGO_INTERNAL_URL}${path}`;

  const { revalidate, ...fetchOptions } = options;

  const res = await fetch(url, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader && { Cookie: cookieHeader }),
      ...fetchOptions.headers,
    },
    ...(revalidate !== undefined && { next: { revalidate } }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body, path);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string,
  ) {
    super(`API ${status} on ${path}: ${body.slice(0, 200)}`);
    this.name = "ApiError";
  }
}
