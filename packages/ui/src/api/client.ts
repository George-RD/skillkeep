import type {
  AdoptItem,
  AdoptResult,
  AiLink,
  AiSkillContext,
  AiStatus,
  DedupeAdvice,
  DescribeSuggestion,
  Detection,
  Device,
  Health,
  HubPullResult,
  HubPushResult,
  OpResult,
  RecommendationsResponse,
  RegistryScope,
  Settings,
  SettingsInput,
  SkillContent,
  StatusReport,
  SyncReport,
  TriageSuggestion,
  UsageGroup,
  UsageSummary,
} from "./types";

/** Resolve the connection the shell injected, falling back to local dev defaults. */
export function getConnection(): { port: number; token: string } {
  const g = globalThis.__SKILLKEEP__;
  if (g && typeof g.port === "number") {
    return { port: g.port, token: typeof g.token === "string" ? g.token : "" };
  }
  return { port: 4517, token: "" };
}

export function baseUrl(): string {
  return `http://127.0.0.1:${getConnection().port}`;
}

/** Error carrying the HTTP status and the parsed response body (if any). */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

/** Read an `error` string from a JSON body using a checked narrowing guard. */
function readErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "error" in body) {
    const value = body.error;
    if (typeof value === "string") return value;
  }
  return `Request failed (${status})`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = getConnection();
  const headers = new Headers(init.headers);
  if (token !== "") headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, { ...init, headers });
  } catch (cause) {
    throw new ApiRequestError(
      0,
      cause instanceof Error ? cause.message : "Network request failed",
      null,
    );
  }

  const text = await res.text();
  let body: unknown;
  if (text !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    throw new ApiRequestError(res.status, readErrorMessage(body, res.status), body);
  }
  return body as T;
}

/** Coerce any thrown value into a human-readable message for toasts. */
export function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "Unknown error";
}

// --- Typed endpoint helpers (one per contract route) -----------------------

export const getHealth = (): Promise<Health> => apiFetch<Health>("/healthz");

export const getScan = (fresh = false): Promise<Detection> =>
  apiFetch<Detection>(`/api/scan${fresh ? "?fresh=1" : ""}`);

export const postAdopt = (items: AdoptItem[]): Promise<AdoptResult[]> =>
  apiFetch<AdoptResult[]>("/api/adopt", { method: "POST", body: JSON.stringify({ items }) });

export const getRegistry = (): Promise<RegistryScope[]> =>
  apiFetch<RegistryScope[]>("/api/registry");

export const postMove = (name: string, toScope: string): Promise<OpResult> =>
  apiFetch<OpResult>("/api/registry/move", {
    method: "POST",
    body: JSON.stringify({ name, toScope }),
  });

export const postArchive = (name: string): Promise<OpResult> =>
  apiFetch<OpResult>("/api/registry/archive", { method: "POST", body: JSON.stringify({ name }) });

export const getSkill = (name: string): Promise<SkillContent> =>
  apiFetch<SkillContent>(`/api/skill?name=${encodeURIComponent(name)}`);

export const putSkill = (name: string, content: string): Promise<{ ok: true }> =>
  apiFetch<{ ok: true }>("/api/skill", { method: "PUT", body: JSON.stringify({ name, content }) });

export const postSync = (dryRun: boolean): Promise<SyncReport> =>
  apiFetch<SyncReport>("/api/sync", { method: "POST", body: JSON.stringify({ dryRun }) });

export const getStatus = (): Promise<StatusReport> => apiFetch<StatusReport>("/api/status");

export const getRecommendations = (): Promise<RecommendationsResponse> =>
  apiFetch<RecommendationsResponse>("/api/recommendations");

export const getUsage = (group: UsageGroup, from: string, to: string): Promise<UsageSummary> =>
  apiFetch<UsageSummary>(`/api/usage/summary?group=${group}&from=${from}&to=${to}`);

export const getSettings = (): Promise<Settings> => apiFetch<Settings>("/api/settings");

export const putSettings = (input: SettingsInput): Promise<{ ok: true }> =>
  apiFetch<{ ok: true }>("/api/settings", { method: "PUT", body: JSON.stringify(input) });

export const getDevices = (): Promise<Device[]> => apiFetch<Device[]>("/api/v1/devices");

export const postHubPush = (): Promise<HubPushResult> =>
  apiFetch<HubPushResult>("/api/hub/push", { method: "POST" });

export const postHubPull = (): Promise<HubPullResult> =>
  apiFetch<HubPullResult>("/api/hub/pull", { method: "POST" });

// --- BYOK AI key resolution --------------------------------------------------
//
// The API key is never persisted server-side, so every AI request resolves it
// fresh, client-side, and attaches it as `X-Skillkeep-AI-Key`. Under the Tauri
// desktop shell it comes from the OS keychain via `get_ai_key`/`set_ai_key`
// (see `apps/desktop/src-tauri/src/main.rs`); in a plain browser build (or the
// CLI-served `skillkeep ui`) there is no client-side key source at all, so no
// header is sent and the daemon falls back to its own `SKILLKEEP_AI_KEY` env
// var server-side.
/** `true` iff the Tauri shell's `window.__TAURI__` bridge is present. Guards on `typeof window` first since this package must stay import-safe for SSR/test environments that have no `window` at all. Shared by `getAiKey`, `setAiKey`, and the Settings screen's key-input feature detection. */
export function hasTauriGlobal(): boolean {
  return typeof window !== "undefined" && window.__TAURI__ !== undefined;
}

/** Real `get_ai_key` invocation via the Tauri global; guards `window.__TAURI__` itself so `resolveAiKey` only needs to know whether it's callable. */
async function tauriInvokeGetAiKey(provider: AiLink["provider"]): Promise<string | null> {
  const tauri = window.__TAURI__;
  if (!tauri) return null;
  const result = await tauri.core.invoke("get_ai_key", { provider });
  return typeof result === "string" ? result : null;
}

/**
 * Decides where (if anywhere) the BYOK key comes from. `hasTauri` and
 * `invokeGetAiKey` are parameters rather than read from `window` inside this
 * function, so the branch logic is unit-testable without mocking any global.
 */
export async function resolveAiKey(
  provider: AiLink["provider"],
  hasTauri: boolean,
  invokeGetAiKey: (provider: AiLink["provider"]) => Promise<string | null> = tauriInvokeGetAiKey,
): Promise<string | null> {
  if (!hasTauri) return null;
  return invokeGetAiKey(provider);
}

/** Resolve the current provider's key from the keychain bridge, or `null` when there is none (browser build, or nothing stored yet). Also used by the Settings screen to prefill the key input. */
export const getAiKey = (provider: AiLink["provider"]): Promise<string | null> =>
  resolveAiKey(provider, hasTauriGlobal());

/** Store (or, given an empty string, clear) `provider`'s key in the OS keychain. A no-op outside Tauri. */
export async function setAiKey(provider: AiLink["provider"], key: string): Promise<void> {
  if (!hasTauriGlobal() || !window.__TAURI__) return;
  await window.__TAURI__.core.invoke("set_ai_key", { provider, key });
}

/** Pure: the header set to attach for a resolved key, or none at all. */
export function aiKeyHeaders(key: string | null): HeadersInit {
  return key ? { "X-Skillkeep-AI-Key": key } : {};
}

export const getAiStatus = async (provider: AiLink["provider"] | null): Promise<AiStatus> => {
  const key = provider ? await getAiKey(provider) : null;
  return apiFetch<AiStatus>("/api/ai/status", { headers: aiKeyHeaders(key) });
};

export const postAiTriage = async (
  names: string[],
  provider: AiLink["provider"] | null,
): Promise<TriageSuggestion[]> => {
  const key = provider ? await getAiKey(provider) : null;
  return apiFetch<TriageSuggestion[]>("/api/ai/triage", {
    method: "POST",
    headers: aiKeyHeaders(key),
    body: JSON.stringify({ names }),
  });
};

export const postAiDescribe = async (
  skill: AiSkillContext,
  provider: AiLink["provider"] | null,
): Promise<DescribeSuggestion> => {
  const key = provider ? await getAiKey(provider) : null;
  return apiFetch<DescribeSuggestion>("/api/ai/describe", {
    method: "POST",
    headers: aiKeyHeaders(key),
    body: JSON.stringify(skill),
  });
};

export const postAiDedupe = async (
  a: AiSkillContext,
  b: AiSkillContext,
  provider: AiLink["provider"] | null,
): Promise<DedupeAdvice> => {
  const key = provider ? await getAiKey(provider) : null;
  return apiFetch<DedupeAdvice>("/api/ai/dedupe", {
    method: "POST",
    headers: aiKeyHeaders(key),
    body: JSON.stringify({ a, b }),
  });
};
