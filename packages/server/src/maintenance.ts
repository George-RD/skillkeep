import type { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  applyTriageMoves,
  buildCronLogLine,
  type CheckFinding,
  type Config,
  dataDir,
  getConfig,
  gitPullFf,
  gitPush,
  loadRules,
  planTriage,
  runCheck,
  runSync,
  type SyncReport,
  setJsonSetting,
  tildeExpand,
} from "@skillkeep/core";
import { pullFromHub, pushToHub } from "./hub-link";

export type NotifyExec = (cmd: string[]) => Promise<{ exitCode: number; stderr?: string }>;

async function defaultNotifyExec(cmd: string[]): Promise<{ exitCode: number; stderr?: string }> {
  try {
    const proc = Bun.spawn({ cmd, stdio: ["ignore", "ignore", "ignore"] });
    await proc.exited;
    return { exitCode: proc.exitCode ?? 0 };
  } catch {
    return { exitCode: -1 };
  }
}

/** Fire a native notification for `message` (macOS only — a silent no-op elsewhere). Errors from
 * the notifier itself are swallowed; a missing/failing `osascript` must never fail the pass it's
 * reporting on. */
export async function sendMacNotification(
  message: string,
  exec: NotifyExec = defaultNotifyExec,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  if (platform !== "darwin") return;
  const title = "skillkeep";
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
  try {
    await exec(["osascript", "-e", script]);
  } catch {
    // swallow all notification errors
  }
}

export interface MaintenanceDeps {
  dataDir?: string;
  exec?: NotifyExec;
  platform?: NodeJS.Platform;
  /** Also git-pull, auto-triage rule-matched inbox skills, and push what this run committed —
   * mirrors the CLI's `cron --auto`. */
  auto?: boolean;
}

/** Outcome of an agent→hub sync performed as the last step of a maintenance pass. */
export interface MaintenanceHubResult {
  pushed: string[];
  pulled: string[];
  conflicts: string[];
  error?: string;
}

export interface MaintenanceResult {
  /** ISO timestamp the pass completed at. */
  at: string;
  syncOk: boolean;
  syncError?: string;
  findings: CheckFinding[];
  routed: string[];
  /** Only set when `auto` and at least one skill was routed. */
  pushed?: boolean;
  hub?: MaintenanceHubResult;
}

/**
 * Run one full maintenance pass: sync, auto-triage (when `auto`), self-check, and (when `auto` and
 * something was routed) publish. Identical step order to the CLI's `cron`/`cron --auto` — this is
 * the single implementation both the CLI wrapper and the agent-mode daemon scheduler call. Never
 * throws for a step failure: each failure lands in `syncError` or `findings`-adjacent fields, same
 * as before extraction. Persists the result under the "lastMaintenance" settings key so the
 * dashboard can show it without re-running anything.
 */
export async function runMaintenancePass(
  db: Database,
  config: Config,
  deps?: MaintenanceDeps,
): Promise<MaintenanceResult> {
  const auto = deps?.auto ?? false;

  // --auto: fast-forward the registry first (best-effort). A diverged history is not overwritten
  // here — the non-force push below fails loudly instead.
  if (auto) await gitPullFf(config.registryRoot);

  let syncResult: SyncReport;
  try {
    syncResult = await runSync(config, { dryRun: false, prune: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    syncResult = { created: [], fixed: [], pruned: [], configReminders: [], errors: [message] };
  }

  const firstInbox = config.inboxDirs[0];
  let routed: string[] = [];
  if (auto && syncResult.errors.length === 0 && firstInbox) {
    try {
      const rules = await loadRules(config.registryRoot);
      const plan = await planTriage(rules, config.inboxDirs);
      const result = await applyTriageMoves(
        config.registryRoot,
        plan.filter((item) => item.scope),
        tildeExpand(firstInbox),
      );
      routed = result.routed;
    } catch (err) {
      syncResult.errors.push(`triage failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let findings: CheckFinding[] = [];
  try {
    findings = await runCheck(config);
  } catch (err) {
    syncResult.errors.push(`check failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Publish only when this run routed something (routed > 0); the push advances the branch like
  // skillctl's weekly job (any unrelated local commits ride along too), never force. Push the
  // registry first and advance the inbox remote only if that succeeded — otherwise the inbox remote
  // would publish the skill's *deletion* while the registry never received the routed skill, losing
  // it for any other machine. Both advance together, or neither does; local commits survive the next
  // run. A rejected non-ff push is recorded as a failure (logged + notified).
  let pushed: boolean | undefined;
  if (auto && routed.length > 0) {
    const registryPush = await gitPush(config.registryRoot);
    const inboxPush =
      registryPush.ok && firstInbox
        ? await gitPush(tildeExpand(firstInbox))
        : { ok: true, message: "" };
    pushed = registryPush.ok && inboxPush.ok;
    if (!registryPush.ok) {
      syncResult.errors.push(`registry push failed: ${registryPush.message.trim() || "rejected"}`);
    } else if (!inboxPush.ok) {
      syncResult.errors.push(`inbox push failed: ${inboxPush.message.trim() || "rejected"}`);
    }
  }

  // Hub sync: pull then push once a hub is configured (see the `connect` command). Errors are
  // caught into `hub.error` rather than thrown -- a hub outage must never fail the whole pass or
  // block the sync/check/triage work above, which already completed by this point. Conflicts
  // (a skill changed on the hub since the last sync) are surfaced for the user to resolve
  // manually, never auto-resolved.
  let hub: MaintenanceHubResult | undefined;
  if (config.hub) {
    try {
      const pullResult = await pullFromHub(config);
      const pushResult = await pushToHub(db, config);
      hub = {
        pushed: pushResult.skillsPushed,
        pulled: pullResult.skillsPulled,
        conflicts: pushResult.conflicts,
      };
    } catch (err) {
      hub = {
        pushed: [],
        pulled: [],
        conflicts: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const syncFailed = syncResult.errors.length > 0;
  const logLine = buildCronLogLine({
    timestamp: new Date().toISOString(),
    syncOk: !syncFailed,
    syncError: syncResult.errors[0],
    findings: findings.length,
    routed: auto ? routed.length : undefined,
    pushed: auto ? pushed : undefined,
  });

  const baseDir = deps?.dataDir ?? dataDir();
  const logDir = path.join(baseDir, "logs");
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(path.join(logDir, "cron.log"), `${logLine}\n`, "utf8");

  const platform = deps?.platform ?? process.platform;
  if (platform === "darwin" && (syncFailed || findings.length > 0)) {
    await sendMacNotification(logLine, deps?.exec, platform);
  }

  const result: MaintenanceResult = {
    at: new Date().toISOString(),
    syncOk: !syncFailed,
    syncError: syncResult.errors[0],
    findings,
    routed,
    pushed: auto && routed.length > 0 ? pushed : undefined,
    hub,
  };
  setJsonSetting(db, "lastMaintenance", result);
  return result;
}

/** One millisecond per hour, named so `maintenanceIntervalHours * MS_PER_HOUR` reads as intended
 * at both call sites (the scheduler's interval and its tests). */
const MS_PER_HOUR = 3_600_000;

export interface MaintenanceSchedulerDeps {
  /** Injectable for tests: defaults to the real runMaintenancePass. */
  runPass?: (db: Database, config: Config, deps?: MaintenanceDeps) => Promise<MaintenanceResult>;
  /** Forwarded as-is to every pass (dataDir/exec/platform overrides for tests). `auto` is always
   * taken from the freshly-read config instead, since Settings can flip it without a restart. */
  passDeps?: Omit<MaintenanceDeps, "auto">;
  /** Called after each completed pass (used to broadcast the `maintenance` SSE event). */
  onTick?: (result: MaintenanceResult) => void;
}

export interface MaintenanceScheduler {
  /** Run one pass immediately, skipped if a previous tick is still in flight. Exposed for tests;
   * the running interval calls this on the same cadence. */
  tick: () => Promise<void>;
  /** Stop the interval. Any in-flight tick is left to run -- await `waitForIdle()` afterward
   * before tearing down anything the tick depends on (e.g. the db handle). */
  stop: () => void;
  /** Resolves once any currently in-flight tick finishes; already resolved if none is running.
   * Callers (startServer's close()) must await this after `stop()` and before closing the db --
   * otherwise a tick still inside runMaintenancePass can have its db handle closed out from under
   * it mid-write (the same shutdown race `inFlightRescan` guards against for the usage rescan). */
  waitForIdle: () => Promise<void>;
}

/**
 * Agent-mode-only daemon scheduler: re-reads Config on every tick (so a Settings change to
 * `autoMaintenance` takes effect on the next tick without a restart) and runs one maintenance
 * pass, skipping the tick entirely if the previous one hasn't finished yet. No pass runs at
 * startup — the first one fires after one full `intervalMs`.
 */
export function startMaintenanceScheduler(
  db: Database,
  intervalMs: number,
  deps: MaintenanceSchedulerDeps = {},
): MaintenanceScheduler {
  const runPass = deps.runPass ?? runMaintenancePass;
  let running = false;
  let inFlight: Promise<void> = Promise.resolve();

  function tick(): Promise<void> {
    if (running) return Promise.resolve();
    running = true;
    inFlight = (async () => {
      try {
        const config = getConfig(db);
        const result = await runPass(db, config, {
          ...deps.passDeps,
          auto: config.autoMaintenance,
        });
        deps.onTick?.(result);
      } finally {
        running = false;
      }
    })();
    return inFlight;
  }

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    tick,
    stop: () => clearInterval(timer),
    waitForIdle: () => inFlight,
  };
}

/** Hours-to-milliseconds conversion for `Config.maintenanceIntervalHours`, named so the scheduler
 * wiring and its tests share one source of truth for the unit. */
export function maintenanceIntervalMs(hours: number): number {
  return hours * MS_PER_HOUR;
}
