import { describe, expect, it } from "bun:test";
import type { InboxSkill } from "../src/api/types";
import { buildAdoptUndoRequeue, buildBulkKeepUndoAction } from "../src/lib/undo";

const a: InboxSkill = {
  name: "alpha",
  path: "/inbox/alpha",
  dir: "/inbox",
  description: "alpha skill",
};
const b: InboxSkill = {
  name: "beta",
  path: "/inbox/beta",
  dir: "/inbox",
  description: "beta skill",
};
const c: InboxSkill = {
  name: "gamma",
  path: "/inbox/gamma",
  dir: "/inbox",
  description: "failed keep",
};

describe("buildBulkKeepUndoAction", () => {
  it("stores full snapshots of every successfully kept seedling", () => {
    // Production bulk-keep path must call this so undo can re-queue.
    // Deleting seedlings: keptSeedlings from bulkKeepSuggested would fail this.
    const action = buildBulkKeepUndoAction([a, b, c], ["alpha", "beta"]);
    expect(action).not.toBeNull();
    expect(action?.type).toBe("triage_adopt");
    expect(action?.batchPaths).toEqual(["alpha", "beta"]);
    expect(action?.seedlings).toEqual([a, b]);
    expect(action?.name).toBe("beta");
    expect(action?.label).toBe("Kept 2 seedlings");
  });

  it("returns null when nothing was kept", () => {
    expect(buildBulkKeepUndoAction([a], [])).toBeNull();
  });
});

describe("buildAdoptUndoRequeue", () => {
  it("re-queues all bulk seedlings after keep undo", () => {
    const action = buildBulkKeepUndoAction([a, b], ["alpha", "beta"]);
    expect(action).not.toBeNull();
    if (action === null) throw new Error("expected undo action");
    const toRequeue = buildAdoptUndoRequeue(action);
    expect(toRequeue).toEqual([a, b]);
    // Paths that setDismissedSeedlings must clear so seedlings reappear in the queue.
    const dismissed = new Set(["/inbox/alpha", "/inbox/beta", "/inbox/other"]);
    for (const s of toRequeue) dismissed.delete(s.path);
    expect(dismissed.has("/inbox/alpha")).toBe(false);
    expect(dismissed.has("/inbox/beta")).toBe(false);
    expect(dismissed.has("/inbox/other")).toBe(true);
  });

  it("prefers single seedling snapshot over fallback literal", () => {
    const toRequeue = buildAdoptUndoRequeue({
      name: "alpha",
      seedling: a,
      prevScope: "/inbox/alpha",
    });
    expect(toRequeue).toEqual([a]);
  });

  it("falls back to name/path literal with empty description", () => {
    const toRequeue = buildAdoptUndoRequeue({
      name: "gamma",
      prevScope: "/inbox/gamma",
    });
    expect(toRequeue).toEqual([
      {
        name: "gamma",
        path: "/inbox/gamma",
        dir: "/inbox",
        description: "",
      },
    ]);
  });

  it("returns empty when bulk keep stored only names (the pre-fix bug)", () => {
    // Without seedlings snapshots, names alone cannot rebuild the queue.
    const toRequeue = buildAdoptUndoRequeue({
      name: "beta",
    });
    expect(toRequeue).toEqual([]);
  });
});
