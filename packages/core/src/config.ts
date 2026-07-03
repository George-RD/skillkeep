import * as fs from "node:fs/promises";
import * as path from "node:path";
import YAML from "yaml";
import type { Rules } from "./types";

/** Read rules.yml (scope name -> glob patterns) from the registry root. Returns {} if the file is absent. */
export async function loadRules(registryRoot: string): Promise<Rules> {
  try {
    const raw = await fs.readFile(path.join(registryRoot, "rules.yml"), "utf8");
    return (YAML.parse(raw) as Rules) ?? {};
  } catch {
    return {};
  }
}

/** Read a YAML file as an editable YAML Document (preserves comments/keys), or null if absent. */
export async function readYamlDocument(filePath: string): Promise<YAML.Document | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return YAML.parseDocument(raw);
  } catch {
    return null;
  }
}

/** Write a YAML Document to disk, creating parent directories as needed. */
export async function writeYamlDocument(filePath: string, doc: YAML.Document): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, doc.toString(), "utf8");
}
