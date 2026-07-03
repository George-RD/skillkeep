import { afterEach, describe, expect, it } from "bun:test";
import { ApiRequestError, apiFetch, createClient } from "../src/client";

const originalFetch = globalThis.fetch;
let lastInit: RequestInit | undefined;
let lastUrl: string | undefined;

/** Replace globalThis.fetch with a stub that records the call and replies with a fixed status/body. */
function installFetch(status: number, body: string): void {
  lastInit = undefined;
  lastUrl = undefined;
  const stub = ((input: string | URL | Request, init?: RequestInit) => {
    lastUrl = typeof input === "string" ? input : String(input);
    lastInit = init;
    return Promise.resolve(new Response(body, { status }));
  }) as unknown as typeof fetch;
  globalThis.fetch = stub;
}

/** Replace globalThis.fetch with a stub that rejects, as a real network failure would. */
function installThrowingFetch(message: string): void {
  const stub = (() => Promise.reject(new Error(message))) as unknown as typeof fetch;
  globalThis.fetch = stub;
}

describe("apiFetch", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("adds the bearer token and targets the given base url", async () => {
    installFetch(200, '{"ok":true}');
    const result = await apiFetch<{ ok: boolean }>(
      { url: "http://127.0.0.1:9999", token: "abc" },
      "/healthz",
    );
    expect(result.ok).toBe(true);
    expect(lastUrl).toBe("http://127.0.0.1:9999/healthz");
    expect(new Headers(lastInit?.headers).get("Authorization")).toBe("Bearer abc");
  });

  it("omits the Authorization header when the token is empty", async () => {
    installFetch(200, '{"ok":true}');
    await apiFetch<{ ok: boolean }>({ url: "http://127.0.0.1:4517", token: "" }, "/healthz");
    expect(new Headers(lastInit?.headers).get("Authorization")).toBeNull();
  });

  it("parses JSON error bodies into ApiRequestError", async () => {
    installFetch(404, '{"error":"not found"}');
    let caught: unknown = null;
    try {
      await apiFetch({ url: "http://x", token: "t" }, "/api/scan");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).status).toBe(404);
    expect((caught as ApiRequestError).message).toBe("not found");
  });

  it("uses a generic message when the error body has no error field", async () => {
    installFetch(500, "internal oops");
    let caught: unknown = null;
    try {
      await apiFetch({ url: "http://x", token: "t" }, "/api/scan");
    } catch (error) {
      caught = error;
    }
    expect((caught as ApiRequestError).status).toBe(500);
    expect((caught as ApiRequestError).message).toBe("Request failed (500)");
  });

  it("sets Content-Type for request bodies", async () => {
    installFetch(200, '{"ok":true}');
    await apiFetch({ url: "http://x", token: "t" }, "/api/sync", {
      method: "POST",
      body: JSON.stringify({ dryRun: true }),
    });
    const headers = new Headers(lastInit?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer t");
  });

  it("wraps a network failure (e.g. connection refused) as status 0", async () => {
    installThrowingFetch("connect ECONNREFUSED");
    let caught: unknown = null;
    try {
      await apiFetch({ url: "http://127.0.0.1:1", token: "t" }, "/healthz");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).status).toBe(0);
    expect((caught as ApiRequestError).message).toBe("connect ECONNREFUSED");
  });
});

describe("createClient", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("wires each endpoint helper to its contract route", async () => {
    installFetch(200, "{}");
    const client = createClient({ url: "http://x", token: "t" });

    await client.getHealth();
    expect(lastUrl).toBe("http://x/healthz");

    installFetch(200, '{"skills":[]}');
    await client.getScan();
    expect(lastUrl).toBe("http://x/api/scan");

    await client.getScan(true);
    expect(lastUrl).toBe("http://x/api/scan?fresh=1");

    installFetch(200, "[]");
    await client.postAdopt([{ name: "n", path: "/p", scope: "global" }]);
    expect(lastUrl).toBe("http://x/api/adopt");
    expect(lastInit?.method).toBe("POST");
    expect(lastInit?.body).toBe(
      JSON.stringify({ items: [{ name: "n", path: "/p", scope: "global" }] }),
    );

    await client.getRegistry();
    expect(lastUrl).toBe("http://x/api/registry");

    installFetch(200, "{}");
    await client.postSync(true);
    expect(lastUrl).toBe("http://x/api/sync");
    expect(lastInit?.body).toBe(JSON.stringify({ dryRun: true }));

    await client.getStatus();
    expect(lastUrl).toBe("http://x/api/status");
  });
});
