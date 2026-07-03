import { useState } from "react";
import { errorMessage } from "../api/client";
import type { SyncReport } from "../api/types";
import { useToast } from "../components/Toast";
import { useSyncMutation } from "../hooks/api";

export function SyncScreen() {
  const toast = useToast();
  const sync = useSyncMutation();
  const [report, setReport] = useState<SyncReport | null>(null);
  const [previewed, setPreviewed] = useState(false);

  function preview() {
    sync.mutate(
      { dryRun: true },
      {
        onSuccess: (r) => {
          setReport(r);
          setPreviewed(true);
        },
        onError: (e) => toast.show(`Preview failed: ${errorMessage(e)}`, "error"),
      },
    );
  }

  function apply() {
    sync.mutate(
      { dryRun: false },
      {
        onSuccess: (r) => {
          setReport(r);
          setPreviewed(true);
          toast.show("Sync applied", "success");
        },
        onError: (e) => toast.show(`Apply failed: ${errorMessage(e)}`, "error"),
      },
    );
  }

  const upToDate =
    report !== null &&
    report.created.length === 0 &&
    report.fixed.length === 0 &&
    report.pruned.length === 0 &&
    report.configReminders.length === 0 &&
    report.errors.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded bg-slate-800 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={sync.isPending}
          onClick={preview}
        >
          Preview
        </button>
        <button
          type="button"
          className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={!previewed || sync.isPending}
          onClick={apply}
        >
          Apply
        </button>
      </div>

      {sync.isPending && <p className="text-sm text-slate-500">Running sync…</p>}
      {report === null && !sync.isPending && (
        <p className="text-sm text-slate-500">Run a preview to see what sync would change.</p>
      )}
      {report !== null && upToDate && (
        <p className="text-sm text-slate-500">Everything is up to date.</p>
      )}

      {report !== null && (
        <div className="flex flex-col gap-3">
          <SyncList title="Created" items={report.created} />
          <SyncList title="Fixed" items={report.fixed} />
          <SyncList title="Pruned" items={report.pruned} />
          <SyncList title="Config reminders" items={report.configReminders} />
          <SyncList title="Errors" items={report.errors} tone="error" />
        </div>
      )}
    </div>
  );
}

function SyncList({ title, items, tone }: { title: string; items: string[]; tone?: "error" }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {title} ({items.length})
      </div>
      <ul
        className={`mt-1 ml-4 list-disc text-sm ${tone === "error" ? "text-red-700" : "text-slate-700"}`}
      >
        {items.map((item) => (
          <li key={item} className="break-all">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
