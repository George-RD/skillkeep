import { useMemo, useState } from "react";
import { errorMessage } from "../api/client";
import type {
  AdoptItem,
  AiSkillContext,
  DetectedSkill,
  Detection,
  RegistryScope,
} from "../api/types";
import { StateBadge } from "../components/Badge";
import { ErrorCard } from "../components/ErrorCard";
import { useToast } from "../components/Toast";
import {
  useAdoptMutation,
  useAiDedupeMutation,
  useAiStatus,
  useAiTriageMutation,
  useRegistry,
  useScan,
} from "../hooks/api";

/** Placeholder for the missing `body` field: neither a freshly detected skill (read from an arbitrary filesystem path) nor a registry listing entry carries the full SKILL.md markdown here, so both dedupe sides degrade to their `description` -- proposals are advisory only. */
function toAiContext(name: string, description: string | null): AiSkillContext {
  const text = description ?? "";
  return { name, description: text, body: text };
}

/**
 * The other half of a dedupe comparison for `skill`, or `null` when none can
 * be found: for a "duplicate" skill, another detected instance sharing the
 * name; for a "drifted" skill, the registry's current version of it.
 */
export function findDedupeCounterpart(
  skill: DetectedSkill,
  skills: DetectedSkill[],
  registryScopes: RegistryScope[],
): AiSkillContext | null {
  if (skill.state === "duplicate") {
    const other = skills.find(
      (s) => s.state === "duplicate" && s.name === skill.name && s.path !== skill.path,
    );
    return other ? toAiContext(other.name, other.description) : null;
  }
  if (skill.state === "drifted" && skill.registryScope) {
    const scope = registryScopes.find((r) => r.scope === skill.registryScope);
    const regSkill = scope?.skills.find((s) => s.name === skill.name);
    return regSkill ? toAiContext(regSkill.name, regSkill.description) : null;
  }
  return null;
}

export function DetectScreen() {
  const toast = useToast();
  const scan = useScan();
  const registry = useRegistry();
  const adopt = useAdoptMutation();
  const aiStatus = useAiStatus();
  const triage = useAiTriageMutation();
  const dedupe = useAiDedupeMutation();

  const skills = scan.data?.skills ?? [];
  const estimate = scan.data?.tokenEstimate;
  const scopeOptions = [
    ...new Set<string>(["global", ...(registry.data ?? []).map((r) => r.scope)]),
  ];

  const [scopes, setScopes] = useState<Record<string, string>>({});
  function selectedScope(skill: DetectedSkill): string {
    return scopes[skill.path] ?? skill.registryScope ?? "global";
  }

  const aiConfigured = aiStatus.data?.configured === true;

  function suggestScope(skill: DetectedSkill) {
    triage.mutate([skill.name], {
      onSuccess: (suggestions) => {
        const suggestion = suggestions[0];
        if (!suggestion) return;
        setScopes((prev) => ({ ...prev, [skill.path]: suggestion.scope }));
        toast.show(
          `Suggested ${suggestion.scope} for ${skill.name}: ${suggestion.rationale}`,
          "success",
        );
      },
      onError: (e) => toast.show(`Suggestion failed: ${errorMessage(e)}`, "error"),
    });
  }

  function suggestDedupe(skill: DetectedSkill) {
    const counterpart = findDedupeCounterpart(skill, skills, registry.data ?? []);
    if (!counterpart) {
      toast.show(`No counterpart found to compare ${skill.name} against`, "error");
      return;
    }
    dedupe.mutate(
      { a: toAiContext(skill.name, skill.description), b: counterpart },
      {
        onSuccess: (advice) =>
          toast.show(`${skill.name}: ${advice.recommendation} — ${advice.rationale}`, "success"),
        onError: (e) => toast.show(`Dedupe advice failed: ${errorMessage(e)}`, "error"),
      },
    );
  }

  const grouped = useMemo(() => {
    const byClient = new Map<string, Map<"user" | "repo", DetectedSkill[]>>();
    for (const skill of skills) {
      let bySurface = byClient.get(skill.client);
      if (!bySurface) {
        bySurface = new Map();
        byClient.set(skill.client, bySurface);
      }
      const rows = bySurface.get(skill.surface) ?? [];
      rows.push(skill);
      bySurface.set(skill.surface, rows);
    }
    return [...byClient.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [skills]);

  const unmanaged = skills.filter((s) => s.state === "unmanaged");

  function manageOne(skill: DetectedSkill) {
    adopt.mutate([{ name: skill.name, path: skill.path, scope: selectedScope(skill) }], {
      onSuccess: (results) => {
        const result = results[0];
        if (result?.ok) toast.show(`Managing ${skill.name}`, "success");
        else if (result)
          toast.show(`Could not manage ${skill.name}: ${result.error ?? "unknown error"}`, "error");
      },
      onError: (e) => toast.show(`Could not manage ${skill.name}: ${errorMessage(e)}`, "error"),
    });
  }

  function manageAll() {
    const items: AdoptItem[] = unmanaged.map((s) => ({
      name: s.name,
      path: s.path,
      scope: selectedScope(s),
    }));
    if (items.length === 0) {
      toast.show("Nothing unmanaged to take over", "info");
      return;
    }
    adopt.mutate(items, {
      onSuccess: (results) => {
        const ok = results.filter((r) => r.ok).length;
        const failed = results.length - ok;
        if (failed === 0) toast.show(`Managing ${ok} skill${ok === 1 ? "" : "s"}`, "success");
        else toast.show(`Managed ${ok}, ${failed} failed — see rows`, "error");
      },
      onError: (e) => toast.show(`Manage all failed: ${errorMessage(e)}`, "error"),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <TokenChips estimate={estimate} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Detected skills</h2>
        <button
          type="button"
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={adopt.isPending || unmanaged.length === 0}
          onClick={manageAll}
        >
          Manage all unmanaged ({unmanaged.length})
        </button>
      </div>

      {scan.isLoading && <p className="text-sm text-slate-500">Scanning…</p>}
      {scan.isError && <ErrorCard message={`Could not load scan: ${errorMessage(scan.error)}`} />}
      {scan.isSuccess && skills.length === 0 && (
        <p className="text-sm text-slate-500">No skills detected.</p>
      )}

      {grouped.map(([client, bySurface]) => (
        <section key={client} className="overflow-hidden rounded-lg border border-slate-200">
          <header className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {client}
          </header>
          {(["user", "repo"] as const).map((surface) => {
            const rows = bySurface.get(surface);
            if (rows === undefined || rows.length === 0) return null;
            return (
              <div key={surface}>
                <div className="bg-slate-100/60 px-3 py-1 text-xs font-medium text-slate-500">
                  {surface}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((skill) => (
                      <SkillRow
                        key={skill.path}
                        skill={skill}
                        scope={selectedScope(skill)}
                        scopeOptions={scopeOptions}
                        disabled={adopt.isPending}
                        onScopeChange={(s) => setScopes((prev) => ({ ...prev, [skill.path]: s }))}
                        onManage={() => manageOne(skill)}
                        showSuggestScope={
                          aiConfigured && (skill.state === "unmanaged" || skill.state === "invalid")
                        }
                        showDedupe={
                          aiConfigured && (skill.state === "duplicate" || skill.state === "drifted")
                        }
                        aiPending={triage.isPending || dedupe.isPending}
                        onSuggestScope={() => suggestScope(skill)}
                        onDedupe={() => suggestDedupe(skill)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function TokenChips({ estimate }: { estimate?: Detection["tokenEstimate"] }) {
  if (estimate === undefined) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
        Global always-on: ~{estimate.global.toLocaleString("en-GB")} tokens
      </span>
      {Object.entries(estimate.perRepo).map(([repo, tokens]) => (
        <span
          key={repo}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
        >
          {repo}: ~{tokens.toLocaleString("en-GB")}
        </span>
      ))}
    </div>
  );
}

function SkillRow({
  skill,
  scope,
  scopeOptions,
  disabled,
  onScopeChange,
  onManage,
  showSuggestScope,
  showDedupe,
  aiPending,
  onSuggestScope,
  onDedupe,
}: {
  skill: DetectedSkill;
  scope: string;
  scopeOptions: string[];
  disabled: boolean;
  onScopeChange: (scope: string) => void;
  onManage: () => void;
  showSuggestScope: boolean;
  showDedupe: boolean;
  aiPending: boolean;
  onSuggestScope: () => void;
  onDedupe: () => void;
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 align-top">
        <div className="font-medium">{skill.name}</div>
        {skill.description && <div className="text-xs text-slate-500">{skill.description}</div>}
      </td>
      <td className="px-3 py-2 align-top">
        <StateBadge state={skill.state} />
      </td>
      <td className="break-all px-3 py-2 align-top text-xs text-slate-500">{skill.path}</td>
      <td className="px-3 py-2 align-top">
        <select
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          value={scope}
          disabled={disabled}
          onChange={(e) => onScopeChange(e.target.value)}
        >
          {scopeOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-right align-top">
        <div className="flex justify-end gap-2">
          {showSuggestScope && (
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-50"
              disabled={aiPending}
              onClick={onSuggestScope}
            >
              Suggest scope
            </button>
          )}
          {showDedupe && (
            <button
              type="button"
              className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-50"
              disabled={aiPending}
              onClick={onDedupe}
            >
              Dedupe advice
            </button>
          )}
          <button
            type="button"
            className="rounded bg-slate-800 px-3 py-1 text-sm text-white disabled:opacity-50"
            disabled={disabled}
            onClick={onManage}
          >
            Manage
          </button>
        </div>
      </td>
    </tr>
  );
}
