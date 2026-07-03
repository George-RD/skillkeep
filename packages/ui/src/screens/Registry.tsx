import { useEffect, useState } from "react";
import { errorMessage } from "../api/client";
import type { HubPullResult, HubPushResult } from "../api/types";
import { ErrorCard } from "../components/ErrorCard";
import { useToast } from "../components/Toast";
import {
  useArchiveMutation,
  useHubPullMutation,
  useHubPushMutation,
  useMoveMutation,
  usePutSkillMutation,
  useRegistry,
  useSettings,
  useSkill,
} from "../hooks/api";

/** e.g. "Pushed 2 skills; conflict: foo (resolve manually)" — one clearly labelled line per conflict. */
export function formatPushSummary(result: HubPushResult): string {
  const pushed = result.skillsPushed.length;
  const parts = [`Pushed ${pushed} skill${pushed === 1 ? "" : "s"}`];
  for (const name of result.conflicts) {
    parts.push(`conflict: ${name} (resolve manually)`);
  }
  return parts.join("; ");
}

export function formatPullSummary(result: HubPullResult): string {
  const pulled = result.skillsPulled.length;
  return `Pulled ${pulled} skill${pulled === 1 ? "" : "s"}`;
}

export function RegistryScreen() {
  const toast = useToast();
  const registry = useRegistry();
  const [selected, setSelected] = useState<string | null>(null);
  const skill = useSkill(selected);
  const move = useMoveMutation();
  const archive = useArchiveMutation();
  const put = usePutSkillMutation();
  const settings = useSettings();
  const push = useHubPushMutation();
  const pull = useHubPullMutation();

  const [content, setContent] = useState("");
  const [moveScope, setMoveScope] = useState("");

  useEffect(() => {
    setContent(skill.data?.content ?? "");
  }, [skill.data]);

  const allScopes = (registry.data ?? []).map((r) => r.scope);
  const dirty = selected !== null && content !== (skill.data?.content ?? "");

  function save() {
    if (selected === null) return;
    put.mutate(
      { name: selected, content },
      {
        onSuccess: () => toast.show(`Saved ${selected}`, "success"),
        onError: (e) => toast.show(`Could not save: ${errorMessage(e)}`, "error"),
      },
    );
  }

  function doMove() {
    if (selected === null || moveScope === "") return;
    const target = moveScope;
    move.mutate(
      { name: selected, toScope: target },
      {
        onSuccess: (res) => {
          if (res.ok) toast.show(`Moved ${selected} to ${target}`, "success");
          else toast.show(res.error ?? "Move failed", "error");
        },
        onError: (e) => toast.show(`Move failed: ${errorMessage(e)}`, "error"),
      },
    );
    setMoveScope("");
  }

  function doArchive() {
    if (selected === null) return;
    const name = selected;
    if (!window.confirm(`Archive ${name}? It will be moved out of the active registry.`)) return;
    archive.mutate(name, {
      onSuccess: (res) => {
        if (res.ok) {
          toast.show(`Archived ${name}`, "success");
          setSelected(null);
        } else {
          toast.show(res.error ?? "Archive failed", "error");
        }
      },
      onError: (e) => toast.show(`Archive failed: ${errorMessage(e)}`, "error"),
    });
  }

  function doPush() {
    push.mutate(undefined, {
      onSuccess: (res) => {
        toast.show(formatPushSummary(res), res.conflicts.length > 0 ? "error" : "success");
      },
      onError: (e) => toast.show(`Push failed: ${errorMessage(e)}`, "error"),
    });
  }

  function doPull() {
    pull.mutate(undefined, {
      onSuccess: (res) => toast.show(formatPullSummary(res), "success"),
      onError: (e) => toast.show(`Pull failed: ${errorMessage(e)}`, "error"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {settings.data?.hub != null && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={push.isPending}
            onClick={doPush}
          >
            {push.isPending ? "Pushing…" : "Push"}
          </button>
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={pull.isPending}
            onClick={doPull}
          >
            {pull.isPending ? "Pulling…" : "Pull"}
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
        <div className="rounded-lg border border-slate-200">
          {registry.isLoading && <p className="p-3 text-sm text-slate-500">Loading…</p>}
          {registry.isError && (
            <div className="p-3">
              <ErrorCard message={`Could not load registry: ${errorMessage(registry.error)}`} />
            </div>
          )}
          {registry.data?.map((scope) => (
            <div key={scope.scope}>
              <div className="bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {scope.scope}
              </div>
              {scope.skills.map((s) => (
                <button
                  type="button"
                  key={s.name}
                  className={`flex w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
                    selected === s.name ? "bg-indigo-50 font-medium" : ""
                  }`}
                  onClick={() => setSelected(s.name)}
                >
                  {s.name}
                </button>
              ))}
              {scope.skills.length === 0 && (
                <div className="px-3 py-1 text-xs text-slate-400">(empty)</div>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          {selected === null ? (
            <p className="text-sm text-slate-500">
              Select a skill on the left to view or edit its SKILL.md.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{selected}</h3>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded border border-slate-300 px-2 py-1 text-sm"
                    value={moveScope}
                    onChange={(e) => setMoveScope(e.target.value)}
                  >
                    <option value="">Move to…</option>
                    {allScopes.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded bg-slate-800 px-3 py-1 text-sm text-white disabled:opacity-50"
                    disabled={moveScope === "" || move.isPending}
                    onClick={doMove}
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 disabled:opacity-50"
                    disabled={archive.isPending}
                    onClick={doArchive}
                  >
                    Archive
                  </button>
                </div>
              </div>
              {skill.isLoading && <p className="text-sm text-slate-500">Loading SKILL.md…</p>}
              {skill.isError && (
                <ErrorCard message={`Could not load skill: ${errorMessage(skill.error)}`} />
              )}
              <textarea
                className="h-96 w-full rounded border border-slate-300 p-2 font-mono text-sm"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white disabled:opacity-50"
                  disabled={!dirty || put.isPending}
                  onClick={save}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
