import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  adoptDetected,
  applyTriageMoves,
  buildStatus,
  type Config,
  dataDir,
  detectAll,
  getConfig,
  globalOnlyTokenEstimate,
  loadRules,
  openDb,
  planTriage,
  runCheck,
  runDoctor,
  runSync,
  tildeExpand,
} from "@skillkeep/core";
import { DaemonAlreadyRunningError, DEFAULT_PORT, startServer } from "@skillkeep/server";
import { report } from "./output";

type Writer = (line: string) => void;

const SUBCOMMANDS = [
  "status",
  "scan",
  "adopt",
  "sync",
  "triage",
  "check",
  "doctor",
  "daemon",
  "ui",
];

function printHelp(write: Writer): void {
  write("skillkeep — self-hostable agent-skill manager");
  write("");
  write("usage: skillkeep <command> [options]");
  write("");
  write("commands:");
  write("  status              census of the registry and inbox");
  write("  scan                machine-wide skill detection census");
  write("  adopt <name> <scope>  adopt a detected skill into a registry scope");
  write("  sync [--dry-run] [--prune]  sync the registry into every configured surface");
  write("  triage [--apply]    route inbox skills matched by rules.yml");
  write("  check               drift/dangling-link/dead-config diagnostics");
  write("  doctor              environment diagnosis (registry, link mode, clients)");
  write("  daemon              run the HTTP API in the foreground");
  write("  ui                  ensure the daemon is running and open it in a browser");
}

// --- status --------------------------------------------------------------------

export async function runStatusCommand(config: Config, write: Writer = report): Promise<void> {
  const rules = await loadRules(config.registryRoot);
  const status = await buildStatus(config.registryRoot, rules, config.inboxDirs);
  const tokenEstimate = await globalOnlyTokenEstimate(config.registryRoot);

  const totalRegistry = Object.values(status.registryCounts).reduce((a, b) => a + b, 0);
  write(
    `registry: ${totalRegistry} skill(s) across ${Object.keys(status.registryCounts).length} scope(s)`,
  );
  for (const [scope, count] of Object.entries(status.registryCounts)) write(`  ${scope}: ${count}`);
  write(
    `inbox: ${status.inboxCount} skill(s) awaiting triage (~${status.inboxTokenEstimate} tokens)`,
  );
  write(`global-only token estimate: ~${tokenEstimate} tokens`);
  if (status.duplicates.length > 0) {
    write(`duplicates: ${status.duplicates.map((d) => d.name).join(", ")}`);
  }
  if (status.misplacements.length > 0) {
    write(`misplacements: ${status.misplacements.map((m) => m.name).join(", ")}`);
  }
  if (status.invalid.length > 0) write(`invalid: ${status.invalid.map((i) => i.name).join(", ")}`);
}

// --- scan ------------------------------------------------------------------------

export async function runScanCommand(config: Config, write: Writer = report): Promise<void> {
  const detection = await detectAll(config);
  const counts = new Map<string, number>();
  for (const skill of detection.skills) counts.set(skill.state, (counts.get(skill.state) ?? 0) + 1);

  write(
    `scanned ${detection.skills.length} skill install(s) across ${detection.repos.length} repo(s) and ${detection.clientsFound.length} client(s)`,
  );
  for (const [state, count] of counts) write(`  ${state}: ${count}`);
  write(`token estimate — global: ~${detection.tokenEstimate.global}`);
}

// --- adopt -----------------------------------------------------------------------

export async function runAdoptCommand(
  config: Config,
  args: string[],
  write: Writer = report,
): Promise<void> {
  const [name, scope] = args;
  if (!name || !scope) {
    write("usage: skillkeep adopt <name> <scope>");
    process.exitCode = 1;
    return;
  }
  const detection = await detectAll(config);
  const skill = detection.skills.find((s) => s.name === name);
  if (!skill) {
    write(`no detected skill named "${name}" (run 'skillkeep scan' first)`);
    process.exitCode = 1;
    return;
  }
  const result = await adoptDetected(skill, scope, config);
  if (result.ok) {
    write(`adopted ${name} into ${scope}`);
  } else {
    write(`could not adopt ${name}: ${result.error}`);
    process.exitCode = 1;
  }
}

// --- sync ------------------------------------------------------------------------

export async function runSyncCommand(
  config: Config,
  args: string[],
  write: Writer = report,
): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const prune = args.includes("--prune");
  const result = await runSync(config, { dryRun, prune });

  write(dryRun ? "sync (dry run):" : "sync:");
  const sections: [string, string[]][] = [
    ["created", result.created],
    ["fixed", result.fixed],
    ["pruned", result.pruned],
    ["config reminders", result.configReminders],
    ["errors", result.errors],
  ];
  let anything = false;
  for (const [label, items] of sections) {
    if (items.length === 0) continue;
    anything = true;
    write(`  ${label}:`);
    for (const item of items) write(`    ${item}`);
  }
  if (!anything) write("  up to date");
}

// --- triage ----------------------------------------------------------------------

export async function runTriageCommand(
  config: Config,
  args: string[],
  write: Writer = report,
): Promise<void> {
  const apply = args.includes("--apply");
  const rules = await loadRules(config.registryRoot);
  const plan = await planTriage(rules, config.inboxDirs);

  if (plan.length === 0) {
    write("nothing to triage");
    return;
  }
  for (const item of plan) {
    write(
      item.scope
        ? `${item.skill.name} -> ${item.scope}`
        : `${item.skill.name} -> (unmatched, stays queued)`,
    );
  }
  if (!apply) {
    write("dry run — pass --apply to route these");
    return;
  }
  const firstInbox = config.inboxDirs[0];
  if (!firstInbox) {
    write("no inbox directories configured");
    return;
  }
  const { routed, skipped } = await applyTriageMoves(
    config.registryRoot,
    plan,
    tildeExpand(firstInbox),
  );
  write(`routed ${routed.length} skill(s)`);
  for (const skip of skipped) write(`  skipped ${skip.name}: ${skip.reason}`);
}

// --- check -----------------------------------------------------------------------

export async function runCheckCommand(config: Config, write: Writer = report): Promise<void> {
  const findings = await runCheck(config);
  if (findings.length === 0) {
    write("no issues found");
    return;
  }
  for (const finding of findings) write(`${finding.kind}: ${finding.detail}`);
  process.exitCode = 1;
}

// --- doctor ----------------------------------------------------------------------

export async function runDoctorCommand(config: Config, write: Writer = report): Promise<void> {
  const result = await runDoctor(config);
  write(
    `registry: ${result.registryPresent ? "git-tracked" : "not a git repo"}, ${result.registryValid ? "valid" : "MISSING"}`,
  );
  write(
    `link mode: ${result.linkMode} (symlinks ${result.symlinkSupported ? "supported" : "unsupported"} on this machine)`,
  );
  write(
    `clients found: ${result.clientsFound.length > 0 ? result.clientsFound.join(", ") : "none"}`,
  );
  if (process.platform === "darwin") {
    write(
      `launch agent: ${result.plistInstalled ? "installed" : "not installed"}, ${result.plistLoaded ? "loaded" : "not loaded"}`,
    );
  }
}

// --- daemon ----------------------------------------------------------------------

function resolveConfiguredPort(): number | undefined {
  const envPort = process.env.SKILLKEEP_PORT;
  if (!envPort) return undefined;
  const parsed = Number(envPort);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export async function runDaemonCommand(write: Writer = report): Promise<void> {
  try {
    const { port } = await startServer({ mode: "agent", port: resolveConfiguredPort() });
    write(`skillkeep daemon ready on http://127.0.0.1:${port}`);
  } catch (err) {
    if (err instanceof DaemonAlreadyRunningError) {
      write(err.message);
      return;
    }
    throw err;
  }
  // The bound server owns the event loop; block forever so this stays the foreground daemon.
  await new Promise<void>(() => {});
}

// --- ui --------------------------------------------------------------------------

async function probeHealthz(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(1000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
}

async function readDaemonPort(fallback: number): Promise<number> {
  const portFile = path.join(dataDir(), "daemon.port");
  if (!existsSync(portFile)) return fallback;
  const parsed = Number((await fs.readFile(portFile, "utf8")).trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** `[execPath, ...args]` to relaunch this same CLI, working both under `bun run` and a compiled single-file binary. */
function selfInvocation(args: string[]): string[] {
  const scriptArg = process.argv[1];
  const isCompiledBinary = scriptArg?.startsWith("/$bunfs/") ?? false;
  if (isCompiledBinary) return [process.execPath, ...args];
  return [process.execPath, scriptArg ?? import.meta.path, ...args];
}

async function openBrowser(url: string): Promise<boolean> {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    const proc = Bun.spawn({ cmd, stdio: ["ignore", "ignore", "ignore"] });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export async function runUiCommand(write: Writer = report): Promise<void> {
  const guessedPort = resolveConfiguredPort() ?? (await readDaemonPort(DEFAULT_PORT));
  let port: number | null = (await probeHealthz(guessedPort)) ? guessedPort : null;

  if (port === null) {
    write("starting skillkeep daemon...");
    const child = Bun.spawn({
      cmd: selfInvocation(["daemon"]),
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.unref();

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && port === null) {
      const candidate = await readDaemonPort(guessedPort);
      if (await probeHealthz(candidate)) port = candidate;
      else await Bun.sleep(200);
    }
  }

  if (port === null) {
    write(`could not reach the skillkeep daemon on port ${guessedPort}`);
    process.exitCode = 1;
    return;
  }

  let token = "";
  try {
    token = (await fs.readFile(path.join(dataDir(), "daemon.token"), "utf8")).trim();
  } catch {
    // best-effort — the browser tab still loads without a pre-filled token
  }
  const url = `http://127.0.0.1:${port}/${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  if (!(await openBrowser(url))) write(`open this URL in your browser: ${url}`);
}

// --- dispatch --------------------------------------------------------------------

export async function main(
  argv: string[] = process.argv.slice(2),
  write: Writer = report,
): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp(write);
    return;
  }

  if (command === "daemon") {
    await runDaemonCommand(write);
    return;
  }
  if (command === "ui") {
    await runUiCommand(write);
    return;
  }

  if (!SUBCOMMANDS.includes(command)) {
    write(`unknown command: ${command}`);
    printHelp(write);
    process.exitCode = 1;
    return;
  }

  const db = openDb(path.join(dataDir(), "skillkeep.db"));
  const config = getConfig(db);

  switch (command) {
    case "status":
      await runStatusCommand(config, write);
      break;
    case "scan":
      await runScanCommand(config, write);
      break;
    case "adopt":
      await runAdoptCommand(config, rest, write);
      break;
    case "sync":
      await runSyncCommand(config, rest, write);
      break;
    case "triage":
      await runTriageCommand(config, rest, write);
      break;
    case "check":
      await runCheckCommand(config, write);
      break;
    case "doctor":
      await runDoctorCommand(config, write);
      break;
  }
}

if (import.meta.main) {
  main().catch((err) => {
    report(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
