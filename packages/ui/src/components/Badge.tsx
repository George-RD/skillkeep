import type { DetectedSkill } from "../api/types";

const STATE_CLASS: Record<DetectedSkill["state"], string> = {
  managed: "border-green-300 bg-green-100 text-green-800",
  unmanaged: "border-amber-300 bg-amber-100 text-amber-800",
  duplicate: "border-orange-300 bg-orange-100 text-orange-800",
  drifted: "border-yellow-300 bg-yellow-100 text-yellow-800",
  invalid: "border-red-300 bg-red-100 text-red-800",
};

export function StateBadge({ state }: { state: DetectedSkill["state"] }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATE_CLASS[state]}`}
    >
      {state}
    </span>
  );
}
