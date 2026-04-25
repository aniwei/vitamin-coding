import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { httpGet, httpPost, httpPut, httpDelete } from "../../src/lib/http";

type MockFetch = ReturnType<typeof vi.fn>;
let fetchSpy: MockFetch;
const originalFetch = globalThis.fetch;

function setupFetch(data: unknown) {
  fetchSpy = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(data),
  });
  globalThis.fetch = fetchSpy;
}

beforeEach(() => {
  fetchSpy = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("httpGet", () => {
  it("returns ApiSuccess on 200", async () => {
    const payload = { success: true, data: { id: "1" } };
    setupFetch(payload);

    const result = await httpGet("/api/health");

    expect(result).toEqual(payload);
    expect(fetchSpy).toHaveBeenCalledWith("/api/health", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      body: undefined,
    });
  });

  it("forwards ApiError envelope from server", async () => {
    const errorPayload = {
      success: false,
      error: { code: "NOT_FOUND", message: "not found" },
    };
    setupFetch(errorPayload);

    const result = await httpGet("/api/missing");
    expect(result).toEqual(errorPayload);
  });
});

describe("httpPost", () => {
  it("serialises body as JSON and returns response", async () => {
    const payload = { success: true, data: { ok: true } };
    setupFetch(payload);

    const result = await httpPost("/api/chat", { message: "hello" });

    expect(result).toEqual(payload);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/chat");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ message: "hello" });
  });

  it("sends no body when called without payload", async () => {
    const payload = { success: true, data: {} };
    setupFetch(payload);

    await httpPost("/api/chat/temporary");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
  });
});

describe("httpPut", () => {
  it("uses PUT method and serialises body", async () => {
    const payload = { success: true, data: { updated: true } };
    setupFetch(payload);

    await httpPut("/api/user/preferences", { theme: "dark" });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ theme: "dark" });
  });
});

describe("httpDelete", () => {
  it("uses DELETE method", async () => {
    const payload = { success: true, data: null };
    setupFetch(payload);

    await httpDelete("/api/thread/abc");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
  });
});
