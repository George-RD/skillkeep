import { useState } from "react";
import { errorMessage, getSkill } from "../api/client";
import type {
  AiSkillContext,
  DedupeAdvice,
  MaintenanceResult,
  Recommendation,
  RegistryScope,
} from "../api/types";
import { ErrorCard } from "../components/ErrorCard";
import { useToast } from "../components/Toast";
import {
  useAiDedupeMutation,
  useAiStatus,
  useArchiveMutation,
  useRecommendations,
  useRegistry,
} from "../hooks/api";

const KIND_LABEL: Record<Recommendation["kind"], string> = {
  "inbox-triage": "Inbox",
  "unused-skill": "Unused",
  "duplicate-pair": "Duplicate",
  "token-cost": "Token cost",
};

function descriptionFor(registry: RegistryScope[], name: string): string {
  for (const scope of registry) {
    const found = scope.skills.find((s) => s.name === name);
    if (found) return found.description ?? "";
  }
  return "";
}

function MaintenanceCard({ lastMaintenance }: { lastMaintenance: MaintenanceResult | null }) {
  if (!lastMaintenance) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Last maintenance: never run yet.
      </div>
    );
  }
  const ok = lastMaintenance.syncOk;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
            ok
              ? "border-green-300 bg-green-100 text-green-800"
              : "border-red-300 bg-red-100 text-red-800"
          }`}
        >
          {ok ? "sync ok" : "sync failed"}
        </span>
        <span className="text-sm text-slate-500">
          {new Date(lastMaintenance.at).toLocaleString()}
        </span>
      </div>
      <div className="mt-2 text-sm text-slate-600">
        {lastMaintenance.findings.length} finding(s)
        {lastMaintenance.routed.length > 0 && `, routed ${lastMaintenance.routed.length}`}
        {lastMaintenance.pushed !== undefined &&
          `, push ${lastMaintenance.pushed ? "ok" : "failed"}`}
      </div>
      {lastMaintenance.hub && (
        <div className="mt-1 text-sm text-slate-600">
          hub: pushed {lastMaintenance.hub.pushed.length}, pulled{" "}
          {lastMaintenance.hub.pulled.length}
          {lastMaintenance.hub.conflicts.length > 0 &&
            `, ${lastMaintenance.hub.conflicts.length} conflict(s)`}
          {lastMaintenance.hub.error && ` — error: ${lastMaintenance.hub.error}`}
        </div>
      )}
    </div>
  );
}

function RecommendationCard({
  rec,
  onTriage,
  onArchive,
  archivePending,
  onDedupe,
  dedupePending,
  dedupeGated,
  advice,
}: {
  rec: Recommendation;
  onTriage: () => void;
  onArchive: () => void;
  archivePending: boolean;
  onDedupe: () => void;
  dedupePending: boolean;
  dedupeGated: boolean;
  advice?: DedupeAdvice;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full border border-indigo-300 bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
              {KIND_LABEL[rec.kind]}
            </span>
            <span className="font-medium">{rec.title}</span>
          </div>
          <p className="text-sm text-slate-600">{rec.detail}</p>
        </div>
        {rec.action === "archive" && (
          <button
            type="button"
            disabled={archivePending}
            onClick={onArchive}
            className="shrink-0 rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Archive
          </button>
        )}
        {rec.action === "dedupe" && dedupeGated && (
          <button
            type="button"
            disabled={dedupePending}
            onClick={onDedupe}
            className="shrink-0 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Get dedupe advice
          </button>
        )}
        {rec.action === "triage" && (
          <button
            type="button"
            onClick={onTriage}
            className="shrink-0 rounded bg-indigo-600 px-3 py-1.5 text-sm text-white"
          >
            Go to triage
          </button>
        )}
      </div>
      {advice && (
        <div className="mt-3 rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          <strong>{advice.recommendation}</strong> — {advice.rationale}
        </div>
      )}
    </div>
  );
}

export function HealthScreen({ setScreen }: { setScreen: (screen: "detect") => void }) {
  const toast = useToast();
  const data = useRecommendations();
  const registry = useRegistry();
  const archive = useArchiveMutation();
  const aiStatus = useAiStatus();
  const dedupe = useAiDedupeMutation();
  const aiConfigured = aiStatus.data?.configured === true;
  const [dedupeAdvice, setDedupeAdvice] = useState<Record<string, DedupeAdvice>>({});
  const [dedupePendingId, setDedupePendingId] = useState<string | null>(null);

  if (data.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (data.isError) {
    return <ErrorCard message={`Could not load recommendations: ${errorMessage(data.error)}`} />;
  }
  if (!data.data) return null;

  const { recommendations, findings, lastMaintenance } = data.data;

  function doArchive(rec: Recommendation) {
    const name = rec.skills[0];
    if (!name) return;
    archive.mutate(name, {
      onSuccess: (res) => {
        if (res.ok) toast.show(`Archived ${name}`, "success");
        else toast.show(res.error ?? "Archive failed", "error");
      },
      onError: (e) => toast.show(`Archive failed: ${errorMessage(e)}`, "error"),
    });
  }

  async function doDedupe(rec: Recommendation) {
    const [a, b] = rec.skills;
    if (!a || !b) return;
    setDedupePendingId(rec.id);
    try {
      const [contentA, contentB] = await Promise.all([getSkill(a), getSkill(b)]);
      const contextA: AiSkillContext = {
        name: a,
        description: descriptionFor(registry.data ?? [], a),
        body: contentA.content,
      };
      const contextB: AiSkillContext = {
        name: b,
        description: descriptionFor(registry.data ?? [], b),
        body: contentB.content,
      };
      dedupe.mutate(
        { a: contextA, b: contextB },
        {
          onSuccess: (advice) => setDedupeAdvice((prev) => ({ ...prev, [rec.id]: advice })),
          onError: (e) => toast.show(`Dedupe advice failed: ${errorMessage(e)}`, "error"),
        },
      );
    } catch (e) {
      toast.show(`Could not load skill content: ${errorMessage(e)}`, "error");
    } finally {
      setDedupePendingId(null);
    }
  }

  const allClean = findings.length === 0 && recommendations.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-2 text-lg font-semibold">Last maintenance</h2>
        <MaintenanceCard lastMaintenance={lastMaintenance} />
      </div>

      {allClean && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-6 text-center text-sm text-green-800">
          All clean — no findings, no recommendations.
        </div>
      )}

      {findings.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Findings</h2>
          <ul className="flex flex-col gap-2">
            {findings.map((f, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: findings carry no stable id of their own
                key={`${f.kind}-${i}`}
                className="flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
              >
                <span className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {f.kind}
                </span>
                <span>{f.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Recommendations</h2>
          {recommendations.map((rec) => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              onTriage={() => setScreen("detect")}
              onArchive={() => doArchive(rec)}
              archivePending={archive.isPending}
              onDedupe={() => doDedupe(rec)}
              dedupePending={dedupePendingId === rec.id}
              dedupeGated={aiConfigured}
              advice={dedupeAdvice[rec.id]}
            />
          ))}
        </section>
      )}
    </div>
  );
}
