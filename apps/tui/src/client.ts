import type {
  AdoptItem,
  AdoptResult,
  Detection,
  Health,
  RegistryScope,
  StatusReport,
  SyncReport,
} from "./types";

/** Where the TUI is pointed and how it authenticates — resolved once from CLI flags in main.ts. */
export interface Connection {
  /** Base URL with no trailing slash, e.g. "http://127.0.0.1:4517". */
  url: string;
  token: string;
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

export async function apiFetch<T>(
  connection: Connection,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (connection.token !== "") headers.set("Authorization", `Bearer ${connection.token}`);
  if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(`${connection.url}${path}`, { ...init, headers });
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

/** Coerce any thrown value into a human-readable message for a status line. */
export function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "Unknown error";
}

/** Typed endpoint helpers bound to one connection — one per contract route the TUI uses. */
export interface Client {
  getHealth(): Promise<Health>;
  getScan(fresh?: boolean): Promise<Detection>;
  postAdopt(items: AdoptItem[]): Promise<AdoptResult[]>;
  getRegistry(): Promise<RegistryScope[]>;
  postSync(dryRun: boolean): Promise<SyncReport>;
  getStatus(): Promise<StatusReport>;
}

export function createClient(connection: Connection): Client {
  return {
    getHealth: () => apiFetch<Health>(connection, "/healthz"),
    getScan: (fresh = false) =>
      apiFetch<Detection>(connection, `/api/scan${fresh ? "?fresh=1" : ""}`),
    postAdopt: (items) =>
      apiFetch<AdoptResult[]>(connection, "/api/adopt", {
        method: "POST",
        body: JSON.stringify({ items }),
      }),
    getRegistry: () => apiFetch<RegistryScope[]>(connection, "/api/registry"),
    postSync: (dryRun) =>
      apiFetch<SyncReport>(connection, "/api/sync", {
        method: "POST",
        body: JSON.stringify({ dryRun }),
      }),
    getStatus: () => apiFetch<StatusReport>(connection, "/api/status"),
  };
}
