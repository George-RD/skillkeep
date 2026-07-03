import type { ClientId } from "./client.ts";

/**
 * One normalised token-usage record extracted from a client log.
 *
 * Token counts are non-negative integers. `costMicroUsd` is the model/computed
 * cost in micro-USD (1e-6 USD) when the source records it authoritatively
 * (e.g. opencode `cost`, omp `usage.cost.total`); otherwise `null` and the
 * daemon applies pricing tables later. `null` never means zero — it means
 * "unknown / not reported".
 */
export interface UsageEvent {
  ts: number;
  client: ClientId;
  model: string;
  repo: string | null;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costMicroUsd: number | null;
  sessionId: string;
  messageId: string | null;
}

/**
 * One parsed log record: either a real {@link UsageEvent} or `null` when the
 * record carried no usage data (e.g. a non-assistant line). `nextOffset` is the
 * absolute byte offset in `file` AFTER this record, so a caller can persist the
 * cursor after every yield — supporting crash-safe incremental resume.
 */
export interface ParseYield {
  event: UsageEvent | null;
  nextOffset: number;
}

/**
 * A pluggable source of usage events for one client.
 *
 * `roots()` returns the expanded directory root(s) to scan (tilde and
 * environment variables expanded). It does NOT resolve globs itself — the glob
 * suffix each parser expects is documented in the parser module; the daemon's
 * file walker applies it. `parse(file, fromOffset)` reads `file` starting at
 * byte offset `fromOffset` and yields one {@link ParseYield} per record.
 */
export interface UsageSource {
  readonly id: ClientId;
  roots(): string[];
  parse(file: string, fromOffset: number): AsyncIterable<ParseYield>;
}
