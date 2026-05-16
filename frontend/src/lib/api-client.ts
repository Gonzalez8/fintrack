/**
 * Client-side fetch wrapper.
 * All requests go through the BFF proxy (/api/proxy/*)
 * so cookies are forwarded automatically by the browser.
 */

const BFF_PREFIX = "/api/proxy";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`API error ${status}: ${body.slice(0, 200)}`);
    this.name = "ApiClientError";
  }
}

/**
 * Extract a human-readable message from an API error.
 *
 * Handles the common DRF error shapes:
 *   - `{"detail": "msg"}`           → "msg"
 *   - `{"non_field_errors": ["m"]}` → "m"
 *   - `{"field": ["m"]}`            → "field: m"
 *   - `{"detail": ["m"]}`           → "m"
 *   - plain string body             → that string
 *
 * Falls back to ``fallback`` when the body cannot be parsed or contains
 * nothing recognisable. Use in form ``catch`` blocks so toasts show a
 * clean message instead of the raw JSON.
 */
export function extractApiErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiClientError)) {
    return err instanceof Error ? err.message : fallback;
  }
  try {
    const data: unknown = JSON.parse(err.body);
    if (typeof data === "string") return data;
    if (!data || typeof data !== "object") return fallback;
    const obj = data as Record<string, unknown>;
    const pickFirst = (v: unknown): string | null => {
      if (typeof v === "string") return v;
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0];
      return null;
    };
    const detail = pickFirst(obj.detail);
    if (detail) return detail;
    const nonField = pickFirst(obj.non_field_errors);
    if (nonField) return nonField;
    for (const [field, msgs] of Object.entries(obj)) {
      const msg = pickFirst(msgs);
      if (msg) return field === "non_field_errors" ? msg : `${field}: ${msg}`;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BFF_PREFIX}${path}`;

  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiClientError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T = unknown>(path: string) => request<T>(path),

  post: <T = unknown>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T = unknown>(path: string, data: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  patch: <T = unknown>(path: string, data: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: <T = unknown>(path: string) =>
    request<T>(path, { method: "DELETE" }),

  /** Upload file (multipart/form-data) — no Content-Type header (browser sets boundary) */
  upload: <T = unknown>(path: string, formData: FormData) =>
    fetch(`${BFF_PREFIX}${path}`, {
      method: "POST",
      credentials: "include",
      body: formData,
    }).then(async (res) => {
      if (!res.ok) throw new ApiClientError(res.status, await res.text());
      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    }),
};

/**
 * Auth-specific calls go through /api/auth/* (not /api/proxy/*).
 */
export const authApi = {
  login: (credentials: { username: string; password: string }) =>
    fetch("/api/auth/token/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    }).then(async (res) => {
      if (!res.ok) throw new ApiClientError(res.status, await res.text());
      return res.json();
    }),

  refresh: () =>
    fetch("/api/auth/token/refresh/", {
      method: "POST",
      credentials: "include",
    }).then(async (res) => {
      if (!res.ok) throw new ApiClientError(res.status, await res.text());
      return res.json();
    }),

  logout: () =>
    fetch("/api/auth/logout/", {
      method: "POST",
      credentials: "include",
    }),

  google: (idToken: string) =>
    fetch("/api/auth/google/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_token: idToken }),
    }).then(async (res) => {
      if (!res.ok) throw new ApiClientError(res.status, await res.text());
      return res.json();
    }),

  register: (data: { username: string; email: string; password: string; password2: string }) =>
    fetch("/api/auth/register/", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(async (res) => {
      if (!res.ok) throw new ApiClientError(res.status, await res.text());
      return res.json();
    }),
};

/**
 * Poll a Celery task until it completes.
 */
export async function pollTask(
  taskId: string,
  intervalMs = 2000,
  maxAttempts = 30,
): Promise<{ status: string; result?: unknown; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    let data: { task_id: string; status: string; result?: unknown; error?: string };
    try {
      data = await api.get<{ task_id: string; status: string; result?: unknown; error?: string }>(
        `/tasks/${taskId}/`,
      );
    } catch {
      // Network error during poll — wait and retry
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    if (data.status === "SUCCESS" || data.status === "FAILURE") return data;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Task polling timed out");
}
