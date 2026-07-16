import type { InboxSkill } from "../api/types";

/** Snapshot fields needed to rebuild the session re-queue after a Keep undo. */
export interface AdoptUndoSource {
  /** Single-keep snapshot (preferred when present). */
  seedling?: InboxSkill;
  /** Bulk-keep snapshots — all must be re-queued on undo. */
  seedlings?: InboxSkill[];
  /** Fallback for single undos that only stored a path. */
  name?: string;
  prevScope?: string;
}

/**
 * Build the list of InboxSkill snapshots to re-queue after undoing a Keep.
 * Prefers full snapshots (single or bulk); falls back to a name/path literal
 * only when no snapshot is available.
 */
export function buildAdoptUndoRequeue(action: AdoptUndoSource): InboxSkill[] {
  if (action.seedlings && action.seedlings.length > 0) {
    return [...action.seedlings];
  }
  if (action.seedling) {
    return [action.seedling];
  }
  if (action.prevScope && action.name) {
    return [
      {
        name: action.name,
        path: action.prevScope,
        dir: action.prevScope.replace(/\/[^/]+$/, "") || action.prevScope,
        description: "",
      },
    ];
  }
  return [];
}

/** Shape of the undo action produced after a successful bulk Keep. */
export interface BulkKeepUndoAction {
  type: "triage_adopt";
  name: string;
  label: string;
  /** Skill names for archive-on-undo. */
  batchPaths: string[];
  /** Full inbox snapshots so undo can re-queue every kept seedling. */
  seedlings: InboxSkill[];
}

/**
 * Build the undo action for a bulk Keep. Stores both names (for archive) and
 * full seedling snapshots (for session re-queue). Returns null when nothing
 * was kept.
 */
export function buildBulkKeepUndoAction(
  batch: InboxSkill[],
  okNames: string[],
): BulkKeepUndoAction | null {
  if (okNames.length === 0) return null;
  const last = okNames[okNames.length - 1];
  if (!last) return null;
  const keptSet = new Set(okNames);
  return {
    type: "triage_adopt",
    name: last,
    label: `Kept ${okNames.length} seedlings`,
    batchPaths: okNames,
    seedlings: batch.filter((s) => keptSet.has(s.name)),
  };
}
