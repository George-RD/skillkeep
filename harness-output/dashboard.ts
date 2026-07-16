// Design Studio run dashboard — renders harness-output state for a herdr pane.
// Usage: while :; do clear; bun harness-output/dashboard.ts; sleep 2; done
import { existsSync, readFileSync } from "node:fs";

const ROOT = new URL(".", import.meta.url).pathname;
const j = (f: string) => {
  const p = ROOT + f;
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

const B = "\x1b[1m";
const D = "\x1b[2m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const R = "\x1b[31m";
const C = "\x1b[36m";
const X = "\x1b[0m";

const status = j("status.json") ?? {};
const scores = j("scores.json") ?? { iterations: [] };

const PHASES = ["plan", "design", "implement", "evaluate", "decide", "codify", "finalize"];
const cur = String(status.phase ?? "—").toLowerCase();

console.log(`${B}${C}  DESIGN STUDIO — skillkeep UI overhaul${X}`);
console.log(`${D}  ${new Date().toLocaleTimeString()}  ·  mode: ${status.mode ?? "?"}  ·  run: ${status.run ?? "?"}${X}\n`);

const rail = PHASES.map((p) =>
  p === cur ? `${B}${Y}[${p.toUpperCase()}]${X}` : `${D}${p}${X}`,
).join(" → ");
console.log(`  ${rail}\n`);

console.log(`  ${B}iteration${X}  ${status.iteration ?? "—"}`);
console.log(`  ${B}agent${X}      ${status.agent ?? "—"}`);
console.log(`  ${B}note${X}       ${status.note ?? ""}`);
console.log();

const its: Array<{
  iteration: number;
  scores: Record<string, number>;
  weightedAverage: number;
  decision: string;
  gateFailures: string[];
}> = scores.iterations ?? [];

if (its.length > 0) {
  console.log(`  ${B}iter  DQ  OR  CR  FN   wavg  decision   gates${X}`);
  for (const it of its) {
    const s = it.scores ?? {};
    const dec = it.decision ?? "?";
    const col = dec === "SHIP" ? G : dec === "PIVOT" ? R : Y;
    const gates = (it.gateFailures ?? []).length === 0 ? `${G}clean${X}` : `${R}${it.gateFailures.length} fail${X}`;
    console.log(
      `  ${String(it.iteration).padEnd(4)}  ${String(s.designQuality ?? "-").padEnd(2)}  ${String(s.originality ?? "-").padEnd(2)}  ${String(s.craft ?? "-").padEnd(2)}  ${String(s.functionality ?? "-").padEnd(2)}   ${String(it.weightedAverage ?? "-").padEnd(4)}  ${col}${dec.padEnd(8)}${X}  ${gates}`,
    );
  }
  if (scores.bestIteration != null) console.log(`\n  ${B}best iteration:${X} ${G}${scores.bestIteration}${X}`);
} else {
  console.log(`  ${D}no scored iterations yet${X}`);
}

const events: string[] = status.log ?? [];
if (events.length > 0) {
  console.log(`\n  ${B}recent${X}`);
  for (const e of events.slice(-6)) console.log(`  ${D}· ${e}${X}`);
}
