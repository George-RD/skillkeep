import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  ApiRequestError,
  aiKeyHeaders,
  apiFetch,
  baseUrl,
  getConnection,
  resolveAiKey,
} from "../src/api/client";

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
  }) as typeof fetch; // Bun's fetch type also carries a `preconnect` static our stub doesn't need
  globalThis.fetch = stub;
}

describe("api client", () => {
  beforeEach(() => {
    globalThis.__SKILLKEEP__ = { port: 9999, token: "abc" };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.__SKILLKEEP__ = undefined;
  });

  it("adds the bearer token and targets the injected port", async () => {
    installFetch(200, '{"ok":true}');
    const result = await apiFetch<{ ok: boolean }>("/healthz");
    expect(result.ok).toBe(true);
    expect(lastUrl).toContain("127.0.0.1:9999");
    expect(lastUrl).toContain("/healthz");
    expect(new Headers(lastInit?.headers).get("Authorization")).toBe("Bearer abc");
  });

  it("falls back to port 4517 with no token when nothing is injected", async () => {
    globalThis.__SKILLKEEP__ = undefined;
    installFetch(200, '{"ok":true}');
    await apiFetch<{ ok: boolean }>("/healthz");
    expect(getConnection()).toEqual({ port: 4517, token: "" });
    expect(baseUrl()).toBe("http://127.0.0.1:4517");
    expect(new Headers(lastInit?.headers).get("Authorization")).toBeNull();
  });

  it("parses JSON error bodies into ApiRequestError", async () => {
    installFetch(404, '{"error":"not found"}');
    let caught: unknown = null;
    try {
      await apiFetch("/api/scan");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiRequestError);
    expect((caught as ApiRequestError).status).toBe(404);
    expect((caught as ApiRequestError).message).toBe("not found");
  });

  it("uses a generic message when the error body has no error field", async () => {
    installFetch(500, "internal oops");
    let caught: unknown = null;
    try {
      await apiFetch("/api/scan");
    } catch (e) {
      caught = e;
    }
    expect((caught as ApiRequestError).status).toBe(500);
    expect((caught as ApiRequestError).message).toBe("Request failed (500)");
  });

  it("sets Content-Type for request bodies", async () => {
    installFetch(200, '{"ok":true}');
    await apiFetch("/api/skill", {
      method: "PUT",
      body: JSON.stringify({ name: "x", content: "y" }),
    });
    const headers = new Headers(lastInit?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer abc");
  });
});

describe("resolveAiKey", () => {
  it("resolves null without invoking anything when there is no Tauri bridge", async () => {
    let called = false;
    const invoke = async () => {
      called = true;
      return "should-not-be-used";
    };
    const key = await resolveAiKey("anthropic", false, invoke);
    expect(key).toBeNull();
    expect(called).toBe(false);
  });

  it("delegates to the injected invoker, passing the provider through, when a Tauri bridge is present", async () => {
    let seenProvider: string | null = null;
    const invoke = async (provider: "anthropic" | "openai" | "openrouter") => {
      seenProvider = provider;
      return "sk-test-key";
    };
    const key = await resolveAiKey("openai", true, invoke);
    expect(key).toBe("sk-test-key");
    expect(seenProvider).toBe("openai");
  });

  it("passes through a null result from the invoker (no key stored yet)", async () => {
    const key = await resolveAiKey("openrouter", true, async () => null);
    expect(key).toBeNull();
  });
});

describe("aiKeyHeaders", () => {
  it("attaches the X-Skillkeep-AI-Key header when a key is present", () => {
    expect(aiKeyHeaders("sk-test")).toEqual({ "X-Skillkeep-AI-Key": "sk-test" });
  });

  it("sends no header at all when there is no key", () => {
    expect(aiKeyHeaders(null)).toEqual({});
  });
});
