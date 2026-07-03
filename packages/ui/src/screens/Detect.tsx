import { useMemo, useState } from "react";
import { errorMessage } from "../api/client";
import type { AdoptItem, DetectedSkill, Detection } from "../api/types";
import { StateBadge } from "../components/Badge";
import { ErrorCard } from "../components/ErrorCard";
import { useToast } from "../components/Toast";
import { useAdoptMutation, useRegistry, useScan } from "../hooks/api";

export function DetectScreen() {
  const toast = useToast();
  const scan = useScan();
  const registry = useRegistry();
  const adopt = useAdoptMutation();

  const skills = scan.data?.skills ?? [];
  const estimate = scan.data?.tokenEstimate;
  const scopeOptions = [
    ...new Set<string>(["global", ...(registry.data ?? []).map((r) => r.scope)]),
  ];

  const [scopes, setScopes] = useState<Record<string, string>>({});
  function selectedScope(skill: DetectedSkill): string {
    return scopes[skill.path] ?? skill.registryScope ?? "global";
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
}: {
  skill: DetectedSkill;
  scope: string;
  scopeOptions: string[];
  disabled: boolean;
  onScopeChange: (scope: string) => void;
  onManage: () => void;
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
        <button
          type="button"
          className="rounded bg-slate-800 px-3 py-1 text-sm text-white disabled:opacity-50"
          disabled={disabled}
          onClick={onManage}
        >
          Manage
        </button>
      </td>
    </tr>
  );
}
