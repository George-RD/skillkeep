import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ClientDirSpec, ClientId } from "./types";

/** Fixed client→dir table every detection/sync surface keys off. Unverified on Windows — confirm each client's real Windows dir at implementation. */
export const CLIENT_DIRS: Record<ClientId, ClientDirSpec> = {
  omp: {
    userDir: "~/.omp/agent/skills",
    repoRelDir: ".omp/skills",
    userDirWin: "~/.omp/agent/skills",
  },
  claude: {
    userDir: "~/.claude/skills",
    repoRelDir: ".claude/skills",
    userDirWin: "~/.claude/skills",
  },
  agents: {
    userDir: "~/.agents/skills",
    repoRelDir: ".agents/skills",
    userDirWin: "~/.agents/skills",
  },
  codex: { userDir: "~/.codex/skills", repoRelDir: ".codex/skills", userDirWin: "~/.codex/skills" },
  opencode: {
    userDir: "~/.config/opencode/skills",
    repoRelDir: ".opencode/skills",
    userDirWin: "~/.config/opencode/skills",
  },
};

/** Root of the OMP config tree (used to derive GLOBAL_OMP_CONFIG and the default managed-skills inbox). */
export const OMP_CONFIG_HOME = "~/.omp";
/** Path to OMP's global (user-level) config.yml. */
export const GLOBAL_OMP_CONFIG = "~/.omp/agent/config.yml";

/** Resolve the platform-specific data directory for skillkeep (never reads from disk). */
export function dataDir(platform?: NodeJS.Platform): string {
  const plat = platform ?? process.platform;
  if (plat === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "skillkeep");
  }
  if (plat === "win32") {
    const appdata = process.env.APPDATA;
    if (!appdata) {
      throw new Error(
        "APPDATA environment variable is not set; cannot resolve Windows data directory",
      );
    }
    return path.join(appdata, "skillkeep");
  }
  // linux and other POSIX: respect XDG_DATA_HOME, fall back to ~/.local/share
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return path.join(xdg, "skillkeep");
  return path.join(os.homedir(), ".local", "share", "skillkeep");
}

/** Expand a leading ~/ to the user's home directory; leave other paths untouched. */
export function tildeExpand(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Collapse the user's home directory back to ~/ for display; leave other paths untouched. */
export function tildeCollapse(p: string): string {
  const home = os.homedir();
  if (p === home) return "~";
  if (p.startsWith(`${home}/`)) return `~${p.slice(home.length)}`;
  return p;
}

/** Resolve a client's user-level skill dir, preferring the Windows override on win32. */
export function clientUserDir(client: ClientId): string {
  const spec = CLIENT_DIRS[client];
  if (process.platform === "win32" && spec.userDirWin) return tildeExpand(spec.userDirWin);
  return tildeExpand(spec.userDir);
}

/** Whether a client's user-level skill dir currently exists on disk. */
export function clientUserDirExists(client: ClientId): boolean {
  return existsSync(clientUserDir(client));
}

/** Absolute path to a registry scope dir, e.g. <registryRoot>/skills/project/foo. */
export function scopeDir(registryRoot: string, scope: string): string {
  return path.join(registryRoot, "skills", scope);
}

/** Absolute path to a named skill within a registry scope. */
export function skillDirInScope(registryRoot: string, scope: string, name: string): string {
  return path.join(scopeDir(registryRoot, scope), name);
}
