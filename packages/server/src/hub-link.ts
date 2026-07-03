import type { Database } from "bun:sqlite";
import {
  type Config,
  detectAll,
  hashSkillDir,
  listSkillUsage,
  listUsageFacts,
  type SkillUsageRow,
  scanRegistry,
  skillDirInScope,
  type UsageFactRow,
} from "@skillkeep/core";
import { createSkillTar, extractSkillTar, type ManifestEntry } from "./registry-sync";

/** Result of an agent→hub push: what was sent and any per-skill conflicts. */
export interface PushResult {
  device: string;
  usageRows: number;
  skillUsageRows: number;
  skillsPushed: string[];
  conflicts: string[];
}

/** Result of a hub→agent pull: which skills were fetched. */
export interface PullResult {
  skillsPulled: string[];
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Push this agent's full state to its configured hub: the current Detection snapshot, every local
 * usage_facts/skill_usage row, and every registry skill whose hash differs from (or is absent from)
 * the hub's manifest. Usage is applied as an idempotent SET on the hub side (not additive), so
 * re-pushing the same data is safe. A 409 on a skill PUT means the hub's rev moved since the
 * manifest was fetched — we surface it as a conflict and skip (the user resolves manually).
 *
 * Throws if `config.hub` is null (not configured).
 */
export async function pushToHub(db: Database, config: Config): Promise<PushResult> {
  const hub = config.hub;
  if (!hub) throw new Error("hub is not configured (set hub url/token/device in settings)");

  const snapshot = await detectAll(config);
  const usage: UsageFactRow[] = listUsageFacts(db);
  const skillUsage: SkillUsageRow[] = listSkillUsage(db);

  const ingestRes = await fetch(`${hub.url}/api/v1/ingest`, {
    method: "POST",
    headers: { ...authHeaders(hub.token), "Content-Type": "application/json" },
    body: JSON.stringify({ device: hub.device, snapshot, usage, skillUsage }),
  });
  if (!ingestRes.ok) {
    throw new Error(`hub ingest failed (${ingestRes.status})`);
  }

  const manifestRes = await fetch(`${hub.url}/api/v1/registry/manifest`, {
    headers: authHeaders(hub.token),
  });
  if (!manifestRes.ok) {
    throw new Error(`hub manifest fetch failed (${manifestRes.status})`);
  }
  const manifest = (await manifestRes.json()) as ManifestEntry[];

  const localEntries = await scanRegistry(config.registryRoot);
  const skillsPushed: string[] = [];
  const conflicts: string[] = [];

  for (const entry of localEntries) {
    const localHash = await hashSkillDir(entry.skill.dir);
    const hubEntry = manifest.find((m) => m.scope === entry.scope && m.name === entry.skill.name);
    if (hubEntry && hubEntry.hash === localHash) continue; // already in sync

    const parentRev = hubEntry?.rev ?? 0;
    const tarBytes = await createSkillTar(entry.skill.dir);
    const scope = encodeURIComponent(entry.scope);
    const name = encodeURIComponent(entry.skill.name);
    const putRes = await fetch(
      `${hub.url}/api/v1/registry/skill?scope=${scope}&name=${name}&parentRev=${parentRev}`,
      {
        method: "PUT",
        headers: { ...authHeaders(hub.token), "Content-Type": "application/x-tar" },
        body: tarBytes,
      },
    );
    if (putRes.status === 409) {
      conflicts.push(entry.skill.name);
      continue;
    }
    if (!putRes.ok) {
      throw new Error(`hub skill push failed for ${entry.skill.name} (${putRes.status})`);
    }
    skillsPushed.push(entry.skill.name);
  }

  return {
    device: hub.device,
    usageRows: usage.length,
    skillUsageRows: skillUsage.length,
    skillsPushed,
    conflicts,
  };
}

/**
 * Pull registry skills from the hub that differ from (or are absent from) the local registry.
 * For each manifest entry whose hash doesn't match the local skill (or that doesn't exist locally),
 * fetch its tar and extract it into the local registry at the hub-reported scope.
 *
 * Throws if `config.hub` is null (not configured).
 */
export async function pullFromHub(config: Config): Promise<PullResult> {
  const hub = config.hub;
  if (!hub) throw new Error("hub is not configured (set hub url/token/device in settings)");

  const manifestRes = await fetch(`${hub.url}/api/v1/registry/manifest`, {
    headers: authHeaders(hub.token),
  });
  if (!manifestRes.ok) {
    throw new Error(`hub manifest fetch failed (${manifestRes.status})`);
  }
  const manifest = (await manifestRes.json()) as ManifestEntry[];

  const localEntries = await scanRegistry(config.registryRoot);
  const localHashes = new Map<string, string>();
  for (const entry of localEntries) {
    localHashes.set(`${entry.scope}/${entry.skill.name}`, await hashSkillDir(entry.skill.dir));
  }

  const skillsPulled: string[] = [];
  for (const entry of manifest) {
    const localHash = localHashes.get(`${entry.scope}/${entry.name}`);
    if (localHash === entry.hash) continue; // already in sync

    const scope = encodeURIComponent(entry.scope);
    const name = encodeURIComponent(entry.name);
    const tarRes = await fetch(`${hub.url}/api/v1/registry/skill?scope=${scope}&name=${name}`, {
      headers: authHeaders(hub.token),
    });
    if (!tarRes.ok) {
      throw new Error(`hub skill pull failed for ${entry.name} (${tarRes.status})`);
    }
    const tarBytes = await tarRes.arrayBuffer();
    const destDir = skillDirInScope(config.registryRoot, entry.scope, entry.name);
    await extractSkillTar(destDir, tarBytes);
    skillsPulled.push(entry.name);
  }

  return { skillsPulled };
}
