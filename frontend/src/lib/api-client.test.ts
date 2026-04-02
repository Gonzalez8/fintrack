import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, authApi, ApiClientError, pollTask } from "./api-client";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function textResponse(body: string, status: number) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error("not json")),
    text: () => Promise.resolve(body),
  });
}

// ---------------------------------------------------------------------------
// api
// ---------------------------------------------------------------------------
describe("api.get", () => {
  it("calls fetch with correct URL and credentials", async () => {
    mockFetch.mockReturnValue(jsonResponse({ data: 1 }));
    await api.get("/accounts/");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy/accounts/",
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });

  it("returns parsed JSON", async () => {
    mockFetch.mockReturnValue(jsonResponse({ id: 42 }));
    const result = await api.get("/accounts/42/");
    expect(result).toEqual({ id: 42 });
  });

  it("throws ApiClientError on non-ok response", async () => {
    mockFetch.mockReturnValue(textResponse("Not found", 404));
    await expect(api.get("/missing/")).rejects.toThrow(ApiClientError);
    await expect(api.get("/missing/")).rejects.toMatchObject({ status: 404 });
  });

  it("returns undefined for 204 No Content", async () => {
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve("") }),
    );
    const result = await api.get("/empty/");
    expect(result).toBeUndefined();
  });
});

describe("api.post", () => {
  it("sends POST with JSON body and Content-Type header", async () => {
    mockFetch.mockReturnValue(jsonResponse({ ok: true }));
    await api.post("/accounts/", { name: "Test" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy/accounts/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Test" }),
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("sends POST without body when data is undefined", async () => {
    mockFetch.mockReturnValue(jsonResponse({ ok: true }));
    await api.post("/trigger/");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy/trigger/",
      expect.objectContaining({
        method: "POST",
        body: undefined,
      }),
    );
  });
});

describe("api.put", () => {
  it("sends PUT with JSON body", async () => {
    mockFetch.mockReturnValue(jsonResponse({ ok: true }));
    await api.put("/accounts/1/", { name: "Updated" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy/accounts/1/",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "Updated" }),
      }),
    );
  });
});

describe("api.patch", () => {
  it("sends PATCH with JSON body", async () => {
    mockFetch.mockReturnValue(jsonResponse({ ok: true }));
    await api.patch("/accounts/1/", { name: "Patched" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy/accounts/1/",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Patched" }),
      }),
    );
  });
});

describe("api.delete", () => {
  it("sends DELETE request", async () => {
    mockFetch.mockReturnValue(jsonResponse(null, 204));
    await api.delete("/accounts/1/");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy/accounts/1/",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("api.upload", () => {
  it("sends FormData without explicit Content-Type header", async () => {
    mockFetch.mockReturnValue(jsonResponse({ id: 1 }));
    const formData = new FormData();
    formData.append("file", new Blob(["data"]), "file.csv");
    await api.upload("/import/", formData);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy/import/",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: formData,
      }),
    );
    // Should NOT include Content-Type so browser sets multipart boundary
    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// authApi
// ---------------------------------------------------------------------------
describe("authApi.login", () => {
  it("calls /api/auth/token/ with credentials", async () => {
    mockFetch.mockReturnValue(jsonResponse({ access: "tok" }));
    await authApi.login({ username: "user", password: "pass" });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/token/",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ username: "user", password: "pass" }),
      }),
    );
  });
});

describe("authApi.refresh", () => {
  it("calls /api/auth/token/refresh/ POST", async () => {
    mockFetch.mockReturnValue(jsonResponse({ access: "new_tok" }));
    await authApi.refresh();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/token/refresh/",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});

describe("authApi.logout", () => {
  it("calls /api/auth/logout/ POST", async () => {
    mockFetch.mockReturnValue(Promise.resolve({ ok: true, status: 200 }));
    await authApi.logout();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/logout/",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});

describe("authApi.google", () => {
  it("calls /api/auth/google/ with id_token", async () => {
    mockFetch.mockReturnValue(jsonResponse({ access: "g_tok" }));
    await authApi.google("google_id_token_123");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/google/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id_token: "google_id_token_123" }),
      }),
    );
  });
});

describe("authApi.register", () => {
  it("calls /api/auth/register/ with data", async () => {
    mockFetch.mockReturnValue(jsonResponse({ id: 1 }));
    const data = { username: "new", email: "new@test.com", password: "pw", password2: "pw" };
    await authApi.register(data);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/auth/register/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(data),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// ApiClientError
// ---------------------------------------------------------------------------
describe("ApiClientError", () => {
  it("has correct status and body properties", () => {
    const err = new ApiClientError(403, "Forbidden");
    expect(err.status).toBe(403);
    expect(err.body).toBe("Forbidden");
    expect(err.name).toBe("ApiClientError");
    expect(err.message).toContain("403");
  });

  it("is an instance of Error", () => {
    const err = new ApiClientError(500, "Server Error");
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// pollTask
// ---------------------------------------------------------------------------
describe("pollTask", () => {
  it("resolves immediately when task is SUCCESS", async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ task_id: "t1", status: "SUCCESS", result: { ok: true } }),
    );
    const result = await pollTask("t1", 10, 5);
    expect(result.status).toBe("SUCCESS");
    expect(result.result).toEqual({ ok: true });
  });

  it("resolves on FAILURE status", async () => {
    mockFetch.mockReturnValue(
      jsonResponse({ task_id: "t1", status: "FAILURE", error: "boom" }),
    );
    const result = await pollTask("t1", 10, 5);
    expect(result.status).toBe("FAILURE");
    expect(result.error).toBe("boom");
  });

  it("polls multiple times until SUCCESS", async () => {
    mockFetch
      .mockReturnValueOnce(jsonResponse({ task_id: "t1", status: "PENDING" }))
      .mockReturnValueOnce(jsonResponse({ task_id: "t1", status: "PENDING" }))
      .mockReturnValueOnce(jsonResponse({ task_id: "t1", status: "SUCCESS", result: 42 }));
    const result = await pollTask("t1", 10, 10);
    expect(result.status).toBe("SUCCESS");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws on timeout (maxAttempts exceeded)", async () => {
    mockFetch.mockReturnValue(jsonResponse({ task_id: "t1", status: "PENDING" }));
    await expect(pollTask("t1", 10, 2)).rejects.toThrow("Task polling timed out");
  });

  it("calls the correct task URL", async () => {
    mockFetch.mockReturnValue(jsonResponse({ task_id: "abc", status: "SUCCESS" }));
    await pollTask("abc", 10, 1);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/proxy/tasks/abc/",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
