import { existsSync, type Stats } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { $ } from "bun";
import { clientUserDirExists, dataDir } from "./paths";
import { resolveLinkMode } from "./sync";
import type { ClientId, Config, LinkMode } from "./types";

const PLIST_LABEL = "com.skillkeep.daemon";
const ALL_CLIENTS: ClientId[] = ["omp", "claude", "agents", "codex", "opencode"];

function plistDir(): string {
  return path.join(os.homedir(), "Library", "LaunchAgents");
}

function plistPath(): string {
  return path.join(plistDir(), `${PLIST_LABEL}.plist`);
}

/** Outcome of attempting to install the platform launch agent. */
export interface InstallResult {
  installed: boolean;
  skipped: boolean;
  reason?: string;
}

/** Environment diagnosis: registry health, launchd state, link-mode support, client dirs found. */
export interface DoctorReport {
  registryPresent: boolean;
  registryValid: boolean;
  plistInstalled: boolean;
  plistLoaded: boolean;
  linkMode: LinkMode;
  symlinkSupported: boolean;
  clientsFound: ClientId[];
}

/**
 * Create and immediately delete one throwaway symlink in dir.
 * Returns true if symlinks work (Windows Developer Mode / POSIX), false on any failure — never throws.
 */
export async function symlinkProbe(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true });
    const stamp = Date.now();
    const target = path.join(dir, `.skillkeep-probe-target-${stamp}`);
    const link = path.join(dir, `.skillkeep-probe-${stamp}`);
    await fs.mkdir(target, { recursive: true });
    await fs.symlink(path.basename(target), link, "dir");
    await fs.unlink(link);
    await fs.rm(target, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/** Install the macOS launchd agent to run `scriptPath sync` weekly. No-op on non-darwin (skipped result, never throws). */
export async function installLaunchAgent(scriptPath: string): Promise<InstallResult> {
  if (process.platform !== "darwin") {
    return {
      installed: false,
      skipped: true,
      reason: `launch agent not supported on ${process.platform}`,
    };
  }
  const logDir = path.join(os.homedir(), ".skillkeep", "logs");
  await fs.mkdir(logDir, { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${PLIST_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${scriptPath}</string>
		<string>sync</string>
	</array>
	<key>StartCalendarInterval</key>
	<dict>
		<key>Weekday</key>
		<integer>0</integer>
		<key>Hour</key>
		<integer>10</integer>
		<key>Minute</key>
		<integer>0</integer>
	</dict>
	<key>StandardOutPath</key>
	<string>${path.join(logDir, "skillkeep.log")}</string>
	<key>StandardErrorPath</key>
	<string>${path.join(logDir, "skillkeep.log")}</string>
</dict>
</plist>
`;
  await fs.mkdir(plistDir(), { recursive: true });
  await fs.writeFile(plistPath(), plist, "utf8");
  await $`launchctl bootout gui/${process.getuid?.() ?? 0}/${PLIST_LABEL}`.quiet().nothrow();
  const bootstrap = await $`launchctl bootstrap gui/${process.getuid?.() ?? 0} ${plistPath()}`
    .quiet()
    .nothrow();
  if (bootstrap.exitCode !== 0) throw new Error(`launchctl bootstrap failed: ${bootstrap.text()}`);
  return { installed: true, skipped: false };
}

/** Diagnose environment: registry validity, launchd state (macOS), link-mode probe result, client dirs found. */
export async function runDoctor(config: Config): Promise<DoctorReport> {
  let registryStat: Stats | null;
  try {
    registryStat = await fs.stat(config.registryRoot);
  } catch {
    registryStat = null;
  }
  const registryValid = registryStat?.isDirectory() ?? false;
  const registryPresent = existsSync(path.join(config.registryRoot, ".git"));

  let plistInstalled = false;
  let plistLoaded = false;
  if (process.platform === "darwin") {
    plistInstalled = existsSync(plistPath());
    const list = await $`launchctl print gui/${process.getuid?.() ?? 0}/${PLIST_LABEL}`
      .quiet()
      .nothrow();
    plistLoaded = list.exitCode === 0;
  }

  const probeResult = await symlinkProbe(dataDir());
  const linkMode = await resolveLinkMode(config.linkMode, process.platform, () =>
    Promise.resolve(probeResult),
  );

  const clientsFound: ClientId[] = ALL_CLIENTS.filter((c) => clientUserDirExists(c));

  return {
    registryPresent,
    registryValid,
    plistInstalled,
    plistLoaded,
    linkMode,
    symlinkSupported: probeResult,
    clientsFound,
  };
}
