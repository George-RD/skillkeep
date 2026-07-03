import type {
  AdoptItem,
  AdoptResult,
  Detection,
  Health,
  OpResult,
  RegistryScope,
  Settings,
  SettingsInput,
  SkillContent,
  StatusReport,
  SyncReport,
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

export const getUsage = (group: UsageGroup, from: string, to: string): Promise<UsageSummary> =>
  apiFetch<UsageSummary>(`/api/usage/summary?group=${group}&from=${from}&to=${to}`);

export const getSettings = (): Promise<Settings> => apiFetch<Settings>("/api/settings");

export const putSettings = (input: SettingsInput): Promise<{ ok: true }> =>
  apiFetch<{ ok: true }>("/api/settings", { method: "PUT", body: JSON.stringify(input) });
