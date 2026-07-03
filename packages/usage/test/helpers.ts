import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ParseYield } from "../src/types.ts";

/** A fresh temp dir for one test, under the OS temp root. */
export function tmpDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "skillkeep-usage-"));
}

/** Write `content` at `dir/rel`, creating parent directories, return the full path. */
export function writeFixture(dir: string, rel: string, content: string): string {
  const full = path.join(dir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

/** Drain an async parse() generator into an array. */
export async function collect(gen: AsyncIterable<ParseYield>): Promise<ParseYield[]> {
  const out: ParseYield[] = [];
  for await (const item of gen) out.push(item);
  return out;
}
