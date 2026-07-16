import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useRef } from "react";
import { baseUrl, getConnection, errorMessage, getAiKey, hasTauriGlobal, setAiKey } from "./api/client";
import type {
  Health,
  SettingsInput,
  HubInput,
  AiLink,
  DetectedSkill,
  SyncReport,
  Recommendation,
  RegistryScope,
  RegistrySkill,
  StatusReport,
  UsageRow,
  AiSkillContext,
  AdoptItem,
  AdoptResult,
} from "./api/types";
import {
  useHealth,
  useRegistry,
  useRecommendations,
  useStatus,
  useScan,
  useSettings,
  useDevices,
  useAdoptMutation,
  useMoveMutation,
  useArchiveMutation,
  usePutSkillMutation,
  useSyncMutation,
  usePutSettingsMutation,
  useHubPushMutation,
  useHubPullMutation,
  useAiStatus,
  useAiTriageMutation,
  useAiDescribeMutation,
  useAiDedupeMutation,
  useSkill,
} from "./hooks/api";
import { useToast } from "./components/Toast";
import type { Tier, Exposure, Perspective, Mode, GardenSkill } from "./lib/garden";
import {
  saveTier,
  readTier,
  estimateTokens,
  formatTokens,
  formatCost,
  usageWindow,
  buildGardenSkills,
  residentBudget,
  budgetDelta,
  formatBudgetDelta,
  seedlingSkills,
  sortGarden,
  filterGarden,
  usageMap,
} from "./lib/garden";
import { StringListEditor } from "./components/ListEditor";

interface UndoAction {
  type: "tier" | "triage_adopt" | "triage_discard" | "triage_merge" | "archive" | "move";
  name: string;
  prevScope?: string;
  prevTier?: Tier;
}

export function App() {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Queries
  const health = useHealth();
  const registry = useRegistry();
  const recommendations = useRecommendations();
  const status = useStatus();
  const scan = useScan();
  const settings = useSettings();
  const devices = useDevices();

  const windowDates = useMemo(() => usageWindow(), []);
  const usageQuery = useHealth().data?.ok
    ? useQueryClient().getQueryData(["usage", "skill", windowDates.from, windowDates.to]) as { rows: UsageRow[] } | undefined
    : undefined;
  // Fallback to active query
  const activeUsageQuery = useHealth().data?.ok
    ? // eslint-disable-next-line react-hooks/rules-of-hooks
      useQueryClient().getQueryCache().findAll({ queryKey: ["usage"] })[0]?.state?.data as { rows: UsageRow[] } | undefined
    : undefined;
  const usageRows = usageQuery?.rows ?? activeUsageQuery?.rows ?? [];
  const usageBySkill = useMemo(() => usageMap(usageRows), [usageRows]);

  // Mutations
  const adoptMutation = useAdoptMutation();
  const moveMutation = useMoveMutation();
  const archiveMutation = useArchiveMutation();
  const putSkillMutation = usePutSkillMutation();
  const syncMutation = useSyncMutation();
  const putSettingsMutation = usePutSettingsMutation();
  const pushMutation = useHubPushMutation();
  const pullMutation = useHubPullMutation();
  const aiStatus = useAiStatus();
  const triageMutation = useAiTriageMutation();
  const dedupeMutation = useAiDedupeMutation();
  const describeMutation = useAiDescribeMutation();

  // Workbench UI State
  const [activeMode, setActiveMode] = useState<Mode>("garden");
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);
  const [perspective, setPerspective] = useState<Perspective>("garden");
  const [scopeFilter, setScopeFilter] = useState<string | "all">("all");
  const [tierFilter, setTierFilter] = useState<Tier | "all">("all");
  const [sortField, setSortField] = useState<"name" | "cost" | "exposure" | "tier">("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [activeTriageIndex, setActiveTriageIndex] = useState(0);
  const [showSweep, setShowSweep] = useState(false);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [dismissedSeedlings, setDismissedSeedlings] = useState<Set<string>>(new Set());
  const [triageMergeOpen, setTriageMergeOpen] = useState(false);
  const [triageMergeTarget, setTriageMergeTarget] = useState("");
  const [triageDedupeAdvice, setTriageDedupeAdvice] = useState<string | null>(null);

  // Detail / edit state
  const selectedSkillQuery = useSkill(selectedSkillName);
  const [detailContent, setDetailContent] = useState("");
  const [detailScope, setDetailScope] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<SettingsInput | null>(null);
  const [originalSettings, setOriginalSettings] = useState<SettingsInput | null>(null);
  const [aiKeyVal, setAiKeyVal] = useState("");

  // Sync / Deploy review state
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [syncPreviewed, setSyncPreviewed] = useState(false);

  // Refs for tracking layout
  const undoTimeoutRef = useRef<number | null>(null);

  // Live SSE Cache Invalidation
  useEffect(() => {
    if (!health.data?.ok) return;
    const { token } = getConnection();
    const url = `${baseUrl()}/api/events${token !== "" ? `?token=${encodeURIComponent(token)}` : ""}`;
    const es = new EventSource(url);
    es.addEventListener("scan:progress", () => {
      setShowSweep(true);
      setTimeout(() => setShowSweep(false), 1400);
      queryClient.invalidateQueries({ queryKey: ["scan"] });
    });
    es.addEventListener("sync:done", () => {
      queryClient.invalidateQueries({ queryKey: ["scan"] });
      queryClient.invalidateQueries({ queryKey: ["registry"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
    });
    es.addEventListener("usage:updated", () =>
      queryClient.invalidateQueries({ queryKey: ["usage"] }),
    );
    es.addEventListener("maintenance:done", () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
      queryClient.invalidateQueries({ queryKey: ["scan"] });
      queryClient.invalidateQueries({ queryKey: ["registry"] });
    });
    return () => {
      es.close();
    };
  }, [queryClient, health.data?.ok]);

  // Load settings form defaults
  useEffect(() => {
    if (settings.data && settingsForm === null) {
      const snap: SettingsInput = {
        registryRoot: settings.data.registryRoot,
        repoRoots: settings.data.repoRoots,
        globalClients: settings.data.globalClients,
        repoClients: settings.data.repoClients,
        linkMode: settings.data.linkMode,
        inboxDirs: settings.data.inboxDirs,
        hub: settings.data.hub
          ? {
              url: settings.data.hub.url,
              device: settings.data.hub.device,
              token: "",
            }
          : null,
        ai: settings.data.ai,
        maintenanceIntervalHours: settings.data.maintenanceIntervalHours,
        autoMaintenance: settings.data.autoMaintenance,
      };
      setSettingsForm(snap);
      setOriginalSettings(snap);
    }
  }, [settings.data, settingsForm]);

  // AI key loading
  const aiProvider = settingsForm?.ai?.provider ?? null;
  useEffect(() => {
    if (!hasTauriGlobal() || aiProvider === null) {
      setAiKeyVal("");
      return;
    }
    let cancelled = false;
    async function load() {
      const key = await getAiKey(aiProvider);
      if (!cancelled) setAiKeyVal(key ?? "");
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [aiProvider]);

  // Synchronize detail view fields when query returns
  useEffect(() => {
    if (selectedSkillQuery.data) {
      setDetailContent(selectedSkillQuery.data.content);
      setAiSuggestion(null);
    }
  }, [selectedSkillQuery.data]);

  // Master garden list construction
  const rawSkills = useMemo(() => {
    return buildGardenSkills(
      registry.data,
      usageBySkill,
      recommendations.data?.recommendations,
      status.data,
    );
  }, [registry.data, usageBySkill, recommendations.data, status.data]);

  const filteredSkills = useMemo(() => {
    return filterGarden(rawSkills, { scope: scopeFilter, tier: tierFilter, query: searchQuery });
  }, [rawSkills, scopeFilter, tierFilter, searchQuery]);

  const sortedSkills = useMemo(() => {
    return sortGarden(filteredSkills, perspective, sortField);
  }, [filteredSkills, perspective, sortField]);

  // Seedlings and findings census
  const seedlings = useMemo(() => {
    return seedlingSkills(scan.data?.skills).filter((s) => !dismissedSeedlings.has(s.path));
  }, [scan.data, dismissedSeedlings]);
  const rotFindingsCount = recommendations.data?.findings.length ?? 0;
  const currentSeedling = seedlings[activeTriageIndex];
  // Budget calculations
  const totalBudget = useMemo(() => {
    const baseEstimate = status.data?.globalOnlyTokenEstimate ?? 0;
    if (!status.data) {
      return residentBudget(rawSkills);
    }
    let overrideDelta = 0;
    for (const skill of rawSkills) {
      const originalTier = skill.scope === "archive" ? "pruned" : "rooted";
      if (skill.tier !== originalTier) {
        overrideDelta += budgetDelta(originalTier, skill.tier, skill.tokenEstimate);
      }
    }
    return Math.max(0, baseEstimate + overrideDelta);
  }, [status.data, rawSkills]);

  // Undo manager
  const triggerUndoAction = (action: UndoAction) => {
    if (undoTimeoutRef.current) window.clearTimeout(undoTimeoutRef.current);
    setUndoAction(action);
    undoTimeoutRef.current = window.setTimeout(() => setUndoAction(null), 8000);
  };

  const handleUndo = () => {
    if (!undoAction) return;
    const action = undoAction;
    setUndoAction(null);

    if (action.type === "tier") {
      saveTier(action.name, action.prevTier!);
      queryClient.invalidateQueries({ queryKey: ["registry"] });
      toast.show(`Restored ${action.name} to ${action.prevTier}`, "success");
    } else if (action.type === "triage_discard" || action.type === "triage_merge") {
      const path = action.prevScope!;
      setDismissedSeedlings((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      toast.show(`Restored seedling ${action.name}`, "success");
    } else if (action.type === "archive") {
      moveMutation.mutate(
        { name: action.name, toScope: action.prevScope ?? "global" },
        {
          onSuccess: () => toast.show(`Restored ${action.name} from archive`, "success"),
          onError: (e) => toast.show(`Undo failed: ${errorMessage(e)}`, "error"),
        },
      );
    }
  };

  // Triage Handlers
  const [triageScope, setTriageScope] = useState("global");
  const [triageTier, setTriageTier] = useState<Tier>("rooted");

  const runTriageSuggest = () => {
    if (!currentSeedling) return;
    triageMutation.mutate([currentSeedling.name], {
      onSuccess: (suggestions) => {
        const sugg = suggestions[0];
        if (sugg) {
          setTriageScope(sugg.scope);
          toast.show(`AI triage suggestion: scope ${sugg.scope}. ${sugg.rationale}`, "success");
        }
      },
      onError: (e) => toast.show(`AI suggestion failed: ${errorMessage(e)}`, "error"),
    });
  };

  const triageKeep = () => {
    if (!currentSeedling) return;
    const path = currentSeedling.path;
    const name = currentSeedling.name;
    adoptMutation.mutate(
      [{ name: currentSeedling.name, path: currentSeedling.path, scope: triageScope }],
      {
        onSuccess: (results) => {
          const res = results[0];
          if (res?.ok) {
            saveTier(name, triageTier);
            localDismissTriage(path, name, "triage_adopt");
          } else {
            toast.show(`Could not keep: ${res?.error ?? "unknown error"}`, "error");
          }
        },
        onError: (e) => toast.show(`Keep failed: ${errorMessage(e)}`, "error"),
      },
    );
  };

  const localDismissTriage = (path: string, name: string, type: "triage_discard" | "triage_merge" | "triage_adopt") => {
    setDismissedSeedlings((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });

    if (type === "triage_discard") {
      toast.show(`Dismissed seedling ${name}`, "success");
    } else if (type === "triage_merge") {
      toast.show("Marked resolved; no file consolidation performed", "success");
    } else if (type === "triage_adopt") {
      toast.show(`Kept ${name} in scope ${triageScope}`, "success");
    }

    if (type !== "triage_adopt") {
      triggerUndoAction({
        type,
        name,
        prevScope: path,
      });
    }

    const newLength = seedlings.length - 1;
    if (newLength === 0) {
      setActiveTriageIndex(0);
      setActiveMode("garden");
      toast.show("Inbox triage complete", "success");
    } else {
      setActiveTriageIndex((prev) => Math.min(prev, newLength - 1));
    }
  };

  const triageDiscard = () => {
    if (!currentSeedling) return;
    localDismissTriage(currentSeedling.path, currentSeedling.name, "triage_discard");
  };
  const triageMerge = () => {
    if (!currentSeedling) return;
    setTriageMergeOpen(true);
    setTriageDedupeAdvice(null);
    const counterpartName = rawSkills.find((s) => s.name === currentSeedling.name)?.name || "";
    setTriageMergeTarget(counterpartName);

    if (aiStatus.data?.configured) {
      const counterpartObj = registry.data
        ?.flatMap((scope) => scope.skills)
        .find((s) => s.name === counterpartName);
      const counterpartDesc = counterpartObj?.description ?? "";
      dedupeMutation.mutate(
        {
          a: { name: currentSeedling.name, description: currentSeedling.description ?? "", body: "" },
          b: { name: counterpartName, description: counterpartDesc, body: "" },
        },
        {
          onSuccess: (advice) => {
            setTriageDedupeAdvice(`${advice.recommendation}: ${advice.rationale}`);
          },
        }
      );
    }
  };

  const triageConfirmMerge = () => {
    if (!currentSeedling || !triageMergeTarget) return;
    const path = currentSeedling.path;
    const name = currentSeedling.name;
    setTriageMergeOpen(false);
    localDismissTriage(path, name, "triage_merge");
  };
  const advanceTriage = () => {
    if (activeTriageIndex < seedlings.length - 1) {
      setActiveTriageIndex((prev) => prev + 1);
    } else {
      setActiveTriageIndex(0);
      setActiveMode("garden");
      toast.show("Inbox triage complete", "success");
    }
  };

  // Sync Preview & Deploy review
  const runSyncPreview = () => {
    syncMutation.mutate(
      { dryRun: true },
      {
        onSuccess: (rep) => {
          setSyncReport(rep);
          setSyncPreviewed(true);
          setDeployOpen(true);
          toast.show("Sync preview ready", "success");
        },
        onError: (e) => toast.show(`Sync preview failed: ${errorMessage(e)}`, "error"),
      },
    );
  };

  const runSyncApply = () => {
    syncMutation.mutate(
      { dryRun: false },
      {
        onSuccess: (rep) => {
          setSyncReport(rep);
          setSyncPreviewed(false);
          setDeployOpen(false);
          queryClient.invalidateQueries({ queryKey: ["scan"] });
          queryClient.invalidateQueries({ queryKey: ["registry"] });
          queryClient.invalidateQueries({ queryKey: ["status"] });
          toast.show("Sync applied successfully", "success");
        },
        onError: (e) => toast.show(`Sync commit failed: ${errorMessage(e)}`, "error"),
      },
    );
  };

  // Detail Edit Handlers
  const handleSaveDetail = () => {
    if (!selectedSkillName) return;
    putSkillMutation.mutate(
      { name: selectedSkillName, content: detailContent },
      {
        onSuccess: () => toast.show(`Saved ${selectedSkillName}`, "success"),
        onError: (e) => toast.show(`Save failed: ${errorMessage(e)}`, "error"),
      },
    );
  };

  const handleMoveDetail = () => {
    if (!selectedSkillName || !detailScope) return;
    moveMutation.mutate(
      { name: selectedSkillName, toScope: detailScope },
      {
        onSuccess: () => {
          toast.show(`Moved ${selectedSkillName} to ${detailScope}`, "success");
          setDetailScope("");
          setSelectedSkillName(null);
        },
        onError: (e) => toast.show(`Move failed: ${errorMessage(e)}`, "error"),
      },
    );
  };

  const handleArchiveDetail = () => {
    if (!selectedSkillName) return;
    const name = selectedSkillName;
    const currentScope = rawSkills.find((s) => s.name === name)?.scope;
    archiveMutation.mutate(name, {
      onSuccess: () => {
        toast.show(`Archived ${name}`, "success");
        triggerUndoAction({ type: "archive", name, prevScope: currentScope });
        setSelectedSkillName(null);
      },
      onError: (e) => toast.show(`Archive failed: ${errorMessage(e)}`, "error"),
    });
  };

  const handleDescribeDetail = () => {
    if (!selectedSkillName) return;
    const originalDesc = rawSkills.find((s) => s.name === selectedSkillName)?.description ?? "";
    describeMutation.mutate(
      { name: selectedSkillName, description: originalDesc, body: detailContent },
      {
        onSuccess: (sugg) => setAiSuggestion(sugg.suggestion),
        onError: (e) => toast.show(`Suggestion failed: ${errorMessage(e)}`, "error"),
      },
    );
  };

  // Settings Save Handler
  const handleSaveSettings = () => {
    if (!settingsForm) return;
    putSettingsMutation.mutate(settingsForm, {
      onSuccess: () => {
        setOriginalSettings(settingsForm);
        toast.show("Settings saved successfully", "success");
      },
      onError: (e) => toast.show(`Save settings failed: ${errorMessage(e)}`, "error"),
    });
  };

  // Hub Push/Pull
  const handleHubPush = () => {
    pushMutation.mutate(undefined, {
      onSuccess: (res) => {
        const pushed = res.skillsPushed.length;
        if (res.conflicts.length > 0) {
          toast.show(`Pushed ${pushed} skills; conflicts in: ${res.conflicts.join(", ")}`, "error");
        } else {
          toast.show(`Successfully pushed ${pushed} skills to hub`, "success");
        }
      },
      onError: (e) => toast.show(`Push failed: ${errorMessage(e)}`, "error"),
    });
  };

  const handleHubPull = () => {
    pullMutation.mutate(undefined, {
      onSuccess: (res) => toast.show(`Pulled ${res.skillsPulled.length} skills from hub`, "success"),
      onError: (e) => toast.show(`Pull failed: ${errorMessage(e)}`, "error"),
    });
  };

  // Recommendations resolution
  const handleResolveRecommendation = (rec: Recommendation) => {
    if (rec.action === "archive") {
      archiveMutation.mutate(rec.skills[0], {
        onSuccess: () => toast.show(`Archived ${rec.skills[0]}`, "success"),
        onError: (e) => toast.show(`Resolve failed: ${errorMessage(e)}`, "error"),
      });
    } else if (rec.action === "triage") {
      setActiveMode("triage");
      setActiveTriageIndex(0);
    } else if (rec.action === "review") {
      setSelectedSkillName(rec.skills[0]);
      setActiveMode("detail");
    } else if (rec.action === "dedupe") {
      toast.show("Review duplicates in details list", "info");
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-field text-ink relative scroll-quiet">
      {/* Z1 Main Shell Header */}
      <header className="h-[var(--shell-h)] border-b border-rule bg-plate-raised px-4 flex items-center justify-between z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setActiveMode("garden");
              setSelectedSkillName(null);
              setDeployOpen(false);
            }}
            className="text-lg font-serif font-semibold text-ink tracking-tight bg-transparent border-none cursor-pointer"
          >
            skillkeep
          </button>
          <span className="text-[10px] uppercase tracking-wider text-ink-quiet">v0.1.0</span>

          <div className="flex items-center gap-2 border-l border-rule pl-3 ml-2">
            <span
              className={`health-disk ${
                health.isError
                  ? "health-disk--offline"
                  : health.data?.ok
                  ? "health-disk--live"
                  : "health-disk--degraded"
              } ${showSweep ? "health-disk--sweep" : ""}`}
            />
            <span className="text-[11px] font-mono text-ink-secondary">
              {health.isError
                ? "offline"
                : health.data?.ok
                ? `live`
                : "degraded"}
            </span>
          </div>

          <span className="chip uppercase text-[9px] font-bold tracking-widest px-1.5 py-0.5 border border-rule-strong">
            {health.data?.mode ?? "agent"}
          </span>
        </div>

        {/* Center: Context-budget readout */}
        <div className="hidden sm:flex items-center gap-2 ledger-plate-tight px-3 py-1 font-mono text-xs tabular">
          <span className="text-ink-quiet text-[10px] uppercase font-bold tracking-wide">resident set</span>
          <span className="font-semibold text-terracotta">{formatTokens(totalBudget)} tokens</span>
        </div>

        {/* Right Status Signals */}
        <div className="flex items-center gap-3">
          <div
            onClick={() => {
              if (seedlings.length > 0) {
                setActiveMode("triage");
                setActiveTriageIndex(0);
              }
            }}
            data-hot={seedlings.length > 0}
            className="chip chip-signal px-2 py-0.5"
          >
            <span>seedlings</span>
            <span className="ml-1 font-bold">{seedlings.length}</span>
          </div>

          <div
            onClick={() => {
              runSyncPreview();
            }}
            data-hot={status.data && status.data.drift.length > 0}
            className="chip chip-signal px-2 py-0.5"
          >
            <span>deploy</span>
            <span className="ml-1 font-bold">
              {status.data?.drift.length && status.data.drift.length > 0
                ? `drift (${status.data.drift.length})`
                : "ready"}
            </span>
          </div>

          <div
            onClick={() => {
              if (rotFindingsCount > 0) {
                setDeployOpen(false);
                setSelectedSkillName(null);
                setActiveMode("garden");
              }
            }}
            data-hot={rotFindingsCount > 0}
            className="chip chip-signal px-2 py-0.5"
          >
            <span>rot</span>
            <span className="ml-1 font-bold">{rotFindingsCount}</span>
          </div>

          <button
            onClick={() => setSearchOpen(true)}
            className="p-1.5 rounded hover:bg-row-alt text-ink-secondary cursor-pointer"
            title="Search ( / )"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <button
            onClick={() => {
              setActiveMode(activeMode === "settings" ? "garden" : "settings");
              setSelectedSkillName(null);
            }}
            className={`p-1.5 rounded cursor-pointer ${
              activeMode === "settings" ? "bg-row-alt text-terracotta" : "hover:bg-row-alt text-ink-secondary"
            }`}
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Sub budget bar for mobile */}
      <div className="sm:hidden border-b border-rule bg-plate px-4 py-1 text-center font-mono text-xs text-ink-quiet">
        resident set: <span className="font-semibold text-terracotta">{formatTokens(totalBudget)} tokens</span>
      </div>

      {/* Main Workspace Frame */}
      <main className={`flex-1 grid grid-cols-1 md:grid-cols-[1fr_350px] gap-6 p-4 md:p-6 max-w-[1440px] mx-auto w-full overflow-hidden ${activeMode === "triage" ? "workbench-dim" : ""}`}>
        
        {/* LEFT COLUMN: Main workspace */}
        <section className="flex flex-col min-h-0 min-w-0">
          {activeMode === "garden" && (
            <div className="ledger-plate flex flex-col h-full min-h-[500px]">
              {/* Z5 Control Rail */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-rule bg-plate-raised">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Scope filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-ink-quiet uppercase font-bold">scope:</span>
                    <select
                      value={scopeFilter}
                      onChange={(e) => setScopeFilter(e.target.value)}
                      className="bg-transparent border border-rule rounded px-2 py-0.5 text-xs font-medium cursor-pointer"
                    >
                      <option value="all">all scopes</option>
                      {(registry.data ?? []).map((s) => (
                        <option key={s.scope} value={s.scope}>
                          {s.scope}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tier filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-ink-quiet uppercase font-bold">tier:</span>
                    <select
                      value={tierFilter}
                      onChange={(e) => setTierFilter(e.target.value as Tier | "all")}
                      className="bg-transparent border border-rule rounded px-2 py-0.5 text-xs font-medium cursor-pointer"
                    >
                      <option value="all">all tiers</option>
                      <option value="rooted">rooted</option>
                      <option value="climbing">climbing</option>
                      <option value="pruned">pruned</option>
                    </select>
                  </div>
                </div>

                {/* Sort & Perspective Lenses */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPerspective("garden")}
                      data-active={perspective === "garden"}
                      className={`btn btn-ghost text-xs px-2 py-1 ${
                        perspective === "garden" ? "text-terracotta font-semibold" : ""
                      }`}
                    >
                      Garden
                    </button>
                    <button
                      onClick={() => setPerspective("cost")}
                      data-active={perspective === "cost"}
                      className={`btn btn-ghost text-xs px-2 py-1 ${
                        perspective === "cost" ? "text-terracotta font-semibold" : ""
                      }`}
                    >
                      Cost
                    </button>
                    <button
                      onClick={() => setPerspective("exposure")}
                      data-active={perspective === "exposure"}
                      className={`btn btn-ghost text-xs px-2 py-1 ${
                        perspective === "exposure" ? "text-terracotta font-semibold" : ""
                      }`}
                    >
                      Exposure
                    </button>
                  </div>

                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as "name" | "cost" | "exposure" | "tier")}
                    className="bg-transparent border border-rule rounded px-2 py-0.5 text-xs cursor-pointer text-ink-secondary"
                  >
                    <option value="name">sort: name</option>
                    <option value="tier">sort: tier</option>
                    <option value="cost">sort: usage cost</option>
                    <option value="exposure">sort: exposure</option>
                  </select>
                </div>
              </div>

              {/* Z2 Garden list body */}
              <div className="flex-1 overflow-y-auto scroll-quiet">
                {registry.isLoading && (
                  <div className="flex flex-col gap-2 p-4">
                    <div className="skeleton-row" />
                    <div className="skeleton-row" />
                    <div className="skeleton-row" />
                  </div>
                )}

                {registry.isError && (
                  <div className="p-6">
                    <div className="rounded border border-brick-soft bg-brick-soft p-4 flex gap-3 text-brick text-sm">
                      <span className="tier-stem bg-brick" />
                      <div>
                        <h4 className="font-serif font-bold text-base mb-1">Daemon Connection Failure</h4>
                        <p>{errorMessage(registry.error)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {registry.isSuccess && sortedSkills.length === 0 && (
                  <div className="p-8 text-center max-w-md mx-auto flex flex-col items-center gap-3">
                    <h3 className="font-serif text-lg font-medium text-ink-secondary">No skills rooted yet</h3>
                    <p className="text-sm text-ink-quiet">
                      Configure your repositories in settings and run a triage sweep to manage your AI assistant skills.
                    </p>
                    <button
                      onClick={() => {
                        setActiveMode("settings");
                      }}
                      className="btn btn-primary"
                    >
                      Configure Roots
                    </button>
                  </div>
                )}

                {registry.isSuccess && sortedSkills.length > 0 && (
                  <div className="divide-y divide-rule/40">
                    {sortedSkills.map((skill) => {
                      const recede =
                        (perspective === "cost" || perspective === "exposure") &&
                        (skill.exposure === "dormant" || skill.exposure === "stale");
                      const expensive =
                        perspective === "cost" &&
                        skill.costMicroUsd !== null &&
                        skill.costMicroUsd > 100000;

                      return (
                        <div
                          key={skill.name}
                          onClick={() => {
                            setSelectedSkillName(skill.name);
                            setDeployOpen(false);
                          }}
                          className={`flex items-center justify-between gap-4 py-2.5 px-3 hover:bg-row-alt/30 cursor-pointer transition-all duration-150 ${
                            selectedSkillName === skill.name ? "bg-row-alt/65 font-medium" : ""
                          } ${recede ? "row-recede" : ""} ${expensive ? "row-cost-flag" : ""}`}
                        >
                          {/* Left: tier stem + name/meta */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              className={`tier-stem ${
                                skill.tier === "rooted"
                                  ? "tier-stem--rooted"
                                  : skill.tier === "climbing"
                                  ? "tier-stem--climbing"
                                  : "tier-stem--pruned"
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <span className="font-serif text-[15px] font-medium text-ink truncate">
                                  {skill.name}
                                </span>
                                <span className="text-[10px] font-mono text-ink-quiet uppercase bg-row-alt/80 px-1 py-0.2 rounded border border-rule/30">
                                  {skill.scope}
                                </span>
                              </div>
                              <div className="font-mono text-xs text-ink-quiet truncate max-w-lg mt-0.5">
                                {skill.description || "no description"}
                              </div>
                            </div>
                          </div>

                          {/* Center/Right: Data display based on perspective */}
                          <div className="flex items-center gap-4 flex-shrink-0">
                            {/* Inline cost lens exposure badges */}
                            {(perspective === "exposure" || perspective === "cost") && (
                              <span
                                className={`verdict ${
                                  skill.exposure === "active"
                                    ? "verdict--active"
                                    : skill.exposure === "stale"
                                    ? "verdict--stale"
                                    : "verdict--dormant"
                                }`}
                              >
                                {skill.exposure}
                              </span>
                            )}

                            {/* Token usage numbers */}
                            <div className="text-right font-mono text-xs">
                              {perspective === "cost" ? (
                                <div className="font-medium text-ink">
                                  {formatCost(skill.costMicroUsd)}
                                </div>
                              ) : (
                                <div className="text-ink-secondary">
                                  {formatTokens(skill.tokenEstimate)}
                                </div>
                              )}
                              <div className="text-[10px] text-ink-quiet">
                                {skill.usageTokens > 0 ? `${formatTokens(skill.usageTokens)} used` : "unused"}
                              </div>
                            </div>

                            {/* In-situ tier controls (A2) */}
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="flex border border-rule rounded overflow-hidden"
                            >
                              {(["rooted", "climbing", "pruned"] as Tier[]).map((t) => (
                                <button
                                  key={t}
                                  onClick={() => {
                                    const prev = skill.tier;
                                    saveTier(skill.name, t);
                                    queryClient.invalidateQueries({ queryKey: ["registry"] });
                                    toast.show(`Changed ${skill.name} tier to ${t}`, "success");
                                    triggerUndoAction({
                                      type: "tier",
                                      name: skill.name,
                                      prevTier: prev,
                                    });
                                  }}
                                  className={`px-1.5 py-0.5 text-[9px] font-mono cursor-pointer border-none ${
                                    skill.tier === t
                                      ? "bg-forest text-field font-semibold"
                                      : "bg-plate hover:bg-row-alt text-ink-secondary"
                                  }`}
                                  title={`Move to ${t} (budget delta: ${formatBudgetDelta(
                                    budgetDelta(skill.tier, t, skill.tokenEstimate)
                                  )})`}
                                >
                                  {t[0]}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Z10 Settings panel */}
          {activeMode === "settings" && (
            <div className="ledger-plate p-5 flex flex-col h-full overflow-y-auto scroll-quiet">
              <div className="flex items-center justify-between border-b border-rule pb-3 mb-4">
                <h2 className="font-serif text-lg font-semibold text-ink">Configuration Settings</h2>
                <div className="flex gap-2">
                  <button onClick={() => setActiveMode("garden")} className="btn btn-quiet">
                    Back to Garden
                  </button>
                  <button onClick={handleSaveSettings} className="btn btn-primary">
                    Save Changes
                  </button>
                </div>
              </div>

              {settingsForm && (
                <div className="flex flex-col gap-5 max-w-2xl">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-quiet mb-1">
                      Registry Root Directory
                    </label>
                    <input
                      className="w-full rounded border border-rule bg-plate-raised px-3 py-1.5 text-sm"
                      value={settingsForm.registryRoot}
                      onChange={(e) => setSettingsForm({ ...settingsForm, registryRoot: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-quiet mb-1">
                      Repo Roots
                    </label>
                    <StringListEditor
                      values={settingsForm.repoRoots}
                      placeholder="e.g. ~/repos"
                      onChange={(next) => setSettingsForm({ ...settingsForm, repoRoots: next })}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-ink-quiet mb-2">
                        Global Client Folders
                      </label>
                      <div className="flex flex-col gap-1 bg-plate p-3 border border-rule rounded">
                        {["claude", "codex", "opencode", "gemini", "omp", "cursor"].map((c) => {
                          const has = settingsForm.globalClients.includes(c);
                          return (
                            <label key={c} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={has}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...settingsForm.globalClients, c]
                                    : settingsForm.globalClients.filter((x) => x !== c);
                                  setSettingsForm({ ...settingsForm, globalClients: next });
                                }}
                              />
                              {c}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-ink-quiet mb-2">
                        Repo Client Folders
                      </label>
                      <div className="flex flex-col gap-1 bg-plate p-3 border border-rule rounded">
                        {["claude", "codex", "opencode", "gemini", "omp", "cursor"].map((c) => {
                          const has = settingsForm.repoClients.includes(c);
                          return (
                            <label key={c} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={has}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...settingsForm.repoClients, c]
                                    : settingsForm.repoClients.filter((x) => x !== c);
                                  setSettingsForm({ ...settingsForm, repoClients: next });
                                }}
                              />
                              {c}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-quiet mb-1">
                      Link Mode
                    </label>
                    <div className="flex gap-4 bg-plate p-3 border border-rule rounded">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="linkMode"
                          checked={settingsForm.linkMode === "symlink"}
                          onChange={() => setSettingsForm({ ...settingsForm, linkMode: "symlink" })}
                        />
                        Symlink (Default)
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="linkMode"
                          checked={settingsForm.linkMode === "copy"}
                          onChange={() => setSettingsForm({ ...settingsForm, linkMode: "copy" })}
                        />
                        Copy
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-quiet mb-1">
                      Inbox Directories
                    </label>
                    <StringListEditor
                      values={settingsForm.inboxDirs}
                      placeholder="e.g. ~/.omp/agent/managed-skills"
                      onChange={(next) => setSettingsForm({ ...settingsForm, inboxDirs: next })}
                    />
                  </div>

                  <div className="border-t border-rule pt-4 mt-2">
                    <h3 className="font-serif text-[15px] font-medium text-ink mb-3">AI Support (BYOK)</h3>
                    
                    <div className="flex flex-col gap-3 bg-plate p-4 border border-rule rounded">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-semibold select-none cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settingsForm.ai !== null}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? { provider: "anthropic" as const, model: "claude-3-5-sonnet" }
                                : null;
                              setSettingsForm({ ...settingsForm, ai: next });
                            }}
                          />
                          Enable AI Assistant suggestions (triage, descriptions)
                        </label>
                      </div>

                      {settingsForm.ai && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pl-6">
                          <div>
                            <label className="block text-xs font-bold text-ink-quiet mb-1">Provider</label>
                            <select
                              value={settingsForm.ai.provider}
                              onChange={(e) =>
                                setSettingsForm({
                                  ...settingsForm,
                                  ai: {
                                    provider: e.target.value as "anthropic" | "openai" | "openrouter",
                                    model: settingsForm.ai!.model,
                                  },
                                })
                              }
                              className="w-full rounded border border-rule bg-plate-raised px-2 py-1 text-sm"
                            >
                              <option value="anthropic">Anthropic</option>
                              <option value="openai">OpenAI</option>
                              <option value="openrouter">OpenRouter</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-ink-quiet mb-1">Model Name</label>
                            <input
                              className="w-full rounded border border-rule bg-plate-raised px-2 py-1 text-sm"
                              value={settingsForm.ai.model}
                              onChange={(e) =>
                                setSettingsForm({
                                  ...settingsForm,
                                  ai: {
                                    provider: settingsForm.ai!.provider,
                                    model: e.target.value,
                                  },
                                })
                              }
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-ink-quiet mb-1">API Key</label>
                            <input
                              type="password"
                              className="w-full rounded border border-rule bg-plate-raised px-2 py-1 text-sm"
                              placeholder="Key saved securely client-side in keychain"
                              value={aiKeyVal}
                              onChange={(e) => {
                                setAiKeyVal(e.target.value);
                                if (settingsForm.ai) void setAiKey(settingsForm.ai.provider, e.target.value);
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-rule pt-4 mt-2">
                    <h3 className="font-serif text-[15px] font-medium text-ink mb-3">Sync with Hub</h3>
                    <div className="flex flex-col gap-3 bg-plate p-4 border border-rule rounded">
                      <div className="flex gap-2">
                        <button onClick={handleHubPush} className="btn btn-quiet">
                          Push registry to Hub
                        </button>
                        <button onClick={handleHubPull} className="btn btn-forest">
                          Pull registry from Hub
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: Contextual side panel */}
        <aside className="hidden md:flex flex-col min-h-0">
          
          {/* Z9 Selected Skill Detail view */}
          {selectedSkillName && (
            <div className="ledger-plate flex flex-col h-full p-4 overflow-y-auto scroll-quiet">
              <div className="flex items-center justify-between border-b border-rule pb-2 mb-3">
                <h3 className="font-serif text-base font-semibold text-ink truncate max-w-[200px]" title={selectedSkillName}>
                  {selectedSkillName}
                </h3>
                <button
                  onClick={() => setSelectedSkillName(null)}
                  className="p-1 rounded hover:bg-row-alt text-ink-quiet cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {selectedSkillQuery.isLoading && <p className="text-sm text-ink-quiet">Loading details...</p>}
              
              {selectedSkillQuery.data && (
                <div className="flex-1 flex flex-col gap-4">
                  {/* File details */}
                  <div className="text-xs font-mono bg-row-alt/40 p-2 border border-rule/50 rounded flex flex-col gap-1">
                    <div className="text-ink-quiet uppercase font-bold text-[9px]">status:</div>
                    <div className="text-ink">{rawSkills.find((s) => s.name === selectedSkillName)?.tier} set</div>
                  </div>

                  {/* AI Suggestion Area */}
                  {aiSuggestion && (
                    <div className="border border-forest/40 bg-forest-soft p-3 rounded text-sm flex flex-col gap-2">
                      <p className="font-serif italic text-forest-dark">"{aiSuggestion}"</p>
                      <div className="flex justify-end gap-2 text-xs">
                        <button onClick={() => setAiSuggestion(null)} className="btn btn-quiet py-0.5 px-2">
                          Dismiss
                        </button>
                        <button
                          onClick={() => {
                            setDetailContent((prev) => {
                              // Split by frontmatter
                              const split = prev.split("---");
                              if (split.length >= 3) {
                                // Preserving frontmatter, replace description
                                const fm = split[1];
                                const body = split.slice(2).join("---");
                                const updatedFm = fm.replace(/^description:.*$/m, `description: "${aiSuggestion}"`);
                                return `---${updatedFm}---${body}`;
                              }
                              return `description: "${aiSuggestion}"\n${prev}`;
                            });
                            setAiSuggestion(null);
                          }}
                          className="btn btn-primary py-0.5 px-2"
                        >
                          Apply description
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Edit tools */}
                  <div className="flex-1 flex flex-col min-h-[300px]">
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-quiet mb-1">
                      SKILL.md Source File
                    </label>
                    <textarea
                      value={detailContent}
                      onChange={(e) => setDetailContent(e.target.value)}
                      className="w-full flex-1 min-h-[250px] p-2 border border-rule bg-plate-raised font-mono text-xs scroll-quiet rounded resize-none"
                    />
                  </div>

                  {/* Actions footer */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-rule">
                    <button onClick={handleSaveDetail} className="btn btn-primary flex-1">
                      Save Editor
                    </button>
                    {aiStatus.data?.configured && (
                      <button onClick={handleDescribeDetail} className="btn btn-forest flex-1">
                        AI describe
                      </button>
                    )}
                    <button onClick={handleArchiveDetail} className="btn btn-brick flex-1">
                      Archive skill
                    </button>

                    <div className="w-full flex items-center gap-1.5 mt-1">
                      <select
                        value={detailScope}
                        onChange={(e) => setDetailScope(e.target.value)}
                        className="flex-1 bg-transparent border border-rule rounded px-2 py-1 text-xs"
                      >
                        <option value="">Move to...</option>
                        {(registry.data ?? []).map((s) => (
                          <option key={s.scope} value={s.scope}>
                            {s.scope}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleMoveDetail}
                        disabled={!detailScope}
                        className="btn btn-quiet px-3 py-1"
                      >
                        Move
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Z7 Deploy panel */}
          {deployOpen && !selectedSkillName && (
            <div className="ledger-plate flex flex-col h-full p-4 overflow-y-auto scroll-quiet">
              <div className="flex items-center justify-between border-b border-rule pb-2 mb-3">
                <h3 className="font-serif text-base font-semibold text-ink">Deploy Review</h3>
                <button
                  onClick={() => setDeployOpen(false)}
                  className="p-1 rounded hover:bg-row-alt text-ink-quiet cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-4 text-sm">
                {syncMutation.isPending && <p className="text-xs text-ink-quiet">Computing sync preview...</p>}

                {syncReport && (
                  <div className="flex-1 flex flex-col gap-3">
                    <div className="text-xs text-ink-secondary">
                      Showing dry-run preview before committing to active directories.
                    </div>

                    <div className="flex-1 overflow-y-auto scroll-quiet flex flex-col gap-3 pr-1">
                      {syncReport.created.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase font-bold text-forest border-b border-rule/50 mb-1">
                            will deploy ({syncReport.created.length})
                          </div>
                          {syncReport.created.map((s) => (
                            <div key={s} className="font-mono text-[11px] text-ink truncate">
                              + {s}
                            </div>
                          ))}
                        </div>
                      )}

                      {syncReport.pruned.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase font-bold text-brick border-b border-rule/50 mb-1">
                            will prune ({syncReport.pruned.length})
                          </div>
                          {syncReport.pruned.map((s) => (
                            <div key={s} className="font-mono text-[11px] text-ink-quiet truncate">
                              - {s}
                            </div>
                          ))}
                        </div>
                      )}

                      {syncReport.fixed.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase font-bold text-amber border-b border-rule/50 mb-1">
                            will correct ({syncReport.fixed.length})
                          </div>
                          {syncReport.fixed.map((s) => (
                            <div key={s} className="font-mono text-[11px] text-ink truncate">
                              ~ {s}
                            </div>
                          ))}
                        </div>
                      )}

                      {syncReport.errors.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono uppercase font-bold text-brick border-b border-rule/50 mb-1">
                            warnings / errors
                          </div>
                          {syncReport.errors.map((s) => (
                            <div key={s} className="text-xs text-brick font-mono">
                              ! {s}
                            </div>
                          ))}
                        </div>
                      )}

                      {syncReport.created.length === 0 &&
                        syncReport.pruned.length === 0 &&
                        syncReport.fixed.length === 0 && (
                          <div className="text-center py-6 text-ink-quiet text-xs italic">
                            All directories strictly in sync. No changes.
                          </div>
                        )}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-rule flex flex-col gap-2">
                  <button onClick={runSyncApply} className="btn btn-primary w-full">
                    Commit Deploy Sync
                  </button>
                  <button onClick={() => setDeployOpen(false)} className="btn btn-quiet w-full">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Z8 Rot recommendations default occupant */}
          {!selectedSkillName && !deployOpen && (
            <div className="ledger-plate flex flex-col h-full p-4 overflow-y-auto scroll-quiet">
              <h3 className="font-serif text-base font-semibold text-ink border-b border-rule pb-2 mb-3">
                Rot Recommendations
              </h3>

              <div className="flex-1 flex flex-col gap-3">
                {recommendations.isLoading && <p className="text-xs text-ink-quiet">Loading health analysis...</p>}

                {recommendations.isSuccess && (recommendations.data?.recommendations.length ?? 0) === 0 && (
                  <div className="text-center py-8 text-ink-quiet text-xs italic">
                    Garden status healthy. No rot detected.
                  </div>
                )}

                {recommendations.isSuccess &&
                  recommendations.data?.recommendations.map((rec) => (
                    <div key={rec.id} className="ledger-plate-tight p-3 text-xs flex flex-col gap-2 bg-plate-raised">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] uppercase font-bold px-1.5 py-0.2 bg-amber-soft text-amber border border-amber/30 rounded">
                          {rec.kind.replace("-", " ")}
                        </span>
                      </div>
                      <h4 className="font-serif font-medium text-ink text-[13px]">{rec.title}</h4>
                      <p className="text-ink-secondary leading-normal">{rec.detail}</p>
                      
                      <div className="flex justify-end gap-2 pt-1 border-t border-rule/30">
                        <button
                          onClick={() => handleResolveRecommendation(rec)}
                          className="btn btn-forest py-0.5 px-2 text-[11px]"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </main>

      {/* Z4 Focused Triage Mode (Inbox sweep) */}
      {activeMode === "triage" && (
        <div className="fixed inset-0 bg-field/90 z-40 flex items-center justify-center p-4">
          <div className="ledger-plate w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden shadow-2xl relative z-50">
            {/* Left list queue */}
            <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-rule bg-plate flex flex-col min-h-0">
              <div className="p-3 border-b border-rule bg-plate-raised flex justify-between items-center">
                <span className="font-serif font-bold text-sm">Seedlings Triage</span>
                <span className="text-xs text-ink-quiet font-mono">
                  {activeTriageIndex + 1} of {seedlings.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto scroll-quiet divide-y divide-rule/40">
                {seedlings.map((s, idx) => (
                  <div
                    key={s.path}
                    onClick={() => setActiveTriageIndex(idx)}
                    className={`p-2.5 text-xs cursor-pointer truncate ${
                      activeTriageIndex === idx ? "bg-row-alt font-medium text-ink" : "text-ink-secondary hover:bg-row-alt/40"
                    }`}
                  >
                    <div className="font-serif font-medium truncate">{s.name}</div>
                    <div className="font-mono text-[10px] text-ink-quiet truncate mt-0.5">{s.client}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right focused decision plate */}
            <div className="flex-1 p-5 flex flex-col min-h-0 bg-plate-raised">
              {currentSeedling ? (
                <div className="flex-1 flex flex-col gap-4">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-ink leading-tight">
                      {currentSeedling.name}
                    </h3>
                    <div className="text-xs font-mono text-ink-quiet truncate mt-1">
                      {currentSeedling.path}
                    </div>
                  </div>

                  {currentSeedling.description && (
                    <div className="bg-plate border border-rule p-3 rounded text-sm italic text-ink-secondary">
                      "{currentSeedling.description}"
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="block text-ink-quiet uppercase font-bold text-[9px] mb-1">detected via</span>
                      <span className="font-mono text-ink bg-row-alt px-1.5 py-0.5 rounded border border-rule/50">
                        {currentSeedling.client}
                      </span>
                    </div>
                    <div>
                      <span className="block text-ink-quiet uppercase font-bold text-[9px] mb-1">hash signature</span>
                      <span className="font-mono text-ink truncate block">
                        {currentSeedling.hash}
                      </span>
                    </div>
                  </div>

                  {/* Keep settings pane vs Merge pane */}
                  {triageMergeOpen ? (
                    <div className="border border-rule bg-plate p-4 rounded flex flex-col gap-3">
                      <h4 className="font-serif font-medium text-sm text-ink-secondary">Merge Seedling Options</h4>
                      <p className="text-xs text-ink-quiet">
                        Select an existing registry skill to merge this seedling path into.
                      </p>

                      <div>
                        <label className="block text-[10px] font-mono uppercase font-bold text-ink-quiet mb-1">
                          target registry skill
                        </label>
                        <select
                          value={triageMergeTarget}
                          onChange={(e) => setTriageMergeTarget(e.target.value)}
                          className="w-full bg-plate-raised border border-rule rounded px-2.5 py-1 text-xs"
                        >
                          <option value="">Select Target...</option>
                          {(registry.data ?? []).flatMap((scope) => scope.skills).map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name} ({rawSkills.find((rs) => rs.name === s.name)?.scope})
                            </option>
                          ))}
                        </select>
                      </div>

                      {dedupeMutation.isPending && (
                        <div className="text-xs text-ink-quiet font-mono animate-pulse">Running AI duplicate analysis...</div>
                      )}

                      {triageDedupeAdvice && (
                        <div className="text-xs bg-amber-soft border border-amber/30 text-amber p-2.5 rounded">
                          <strong>AI Advice:</strong> {triageDedupeAdvice}
                        </div>
                      )}

                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={triageConfirmMerge}
                          disabled={!triageMergeTarget}
                          className="btn btn-primary flex-1"
                        >
                          Mark merge resolved
                        </button>
                        <button
                          onClick={() => setTriageMergeOpen(false)}
                          className="btn btn-quiet"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="border border-rule bg-plate p-4 rounded flex flex-col gap-3">
                        <h4 className="font-serif font-medium text-sm text-ink-secondary">Keep in Garden options:</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-mono uppercase font-bold text-ink-quiet mb-1">
                              scope location
                            </label>
                            <select
                              value={triageScope}
                              onChange={(e) => setTriageScope(e.target.value)}
                              className="w-full bg-plate-raised border border-rule rounded px-2.5 py-1 text-xs"
                            >
                              <option value="global">global</option>
                              {(registry.data ?? []).map((s) => (
                                <option key={s.scope} value={s.scope}>
                                  {s.scope}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono uppercase font-bold text-ink-quiet mb-1">
                              active tier
                            </label>
                            <select
                              value={triageTier}
                              onChange={(e) => setTriageTier(e.target.value as Tier)}
                              className="w-full bg-plate-raised border border-rule rounded px-2.5 py-1 text-xs"
                            >
                              <option value="rooted">rooted (resident set)</option>
                              <option value="climbing">climbing (search index)</option>
                              <option value="pruned">pruned (archive)</option>
                            </select>
                          </div>
                        </div>

                        <div className="text-xs text-ink-quiet font-mono mt-1">
                          Budget impact:{" "}
                          <span className="font-semibold text-terracotta">
                            {formatBudgetDelta(
                              budgetDelta("pruned", triageTier, estimateTokens(currentSeedling.description))
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Decision triggers */}
                      <div className="mt-auto pt-4 border-t border-rule flex gap-2">
                        <button onClick={triageKeep} className="btn btn-primary flex-1">
                          Keep
                        </button>
                        <button onClick={triageMerge} className="btn btn-forest flex-1">
                          Merge
                        </button>
                        {aiStatus.data?.configured && (
                          <button onClick={runTriageSuggest} className="btn btn-quiet px-3">
                            AI Suggest
                          </button>
                        )}
                        <button onClick={triageDiscard} className="btn btn-brick flex-1">
                          Discard
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <h3 className="font-serif text-lg font-medium text-ink-secondary mb-2">Triage Inbox Clear</h3>
                  <button onClick={() => setActiveMode("garden")} className="btn btn-primary">
                    Return to Garden
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setActiveMode("garden")}
              className="absolute top-3 right-3 text-sm text-ink-quiet hover:underline bg-transparent border-none cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Z6 Search Overlay */}
      {searchOpen && (
        <div className="search-backdrop" onClick={() => setSearchOpen(false)}>
          <div className="ledger-plate search-plate" onClick={(e) => e.stopPropagation()}>
            <div className="p-3 border-b border-rule bg-plate-raised flex items-center gap-3">
              <svg className="w-4 h-4 text-ink-quiet" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                autoFocus
                type="text"
                placeholder="Find skill by name, description, scope or hash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none text-sm outline-none text-ink"
              />
              <button
                onClick={() => {
                  setSearchQuery("");
                  setSearchOpen(false);
                }}
                className="text-xs text-ink-quiet hover:underline bg-transparent border-none cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scroll-quiet divide-y divide-rule/40">
              {filteredSkills.slice(0, 15).map((skill) => (
                <div
                  key={skill.name}
                  onClick={() => {
                    setSelectedSkillName(skill.name);
                    setSearchOpen(false);
                    setActiveMode("garden");
                  }}
                  className="p-3 hover:bg-row-alt/40 cursor-pointer flex justify-between items-center gap-4 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-serif text-[13px] font-semibold text-ink block truncate">
                      {skill.name}
                    </span>
                    <span className="font-mono text-ink-quiet truncate block mt-0.5">
                      {skill.scope} · {skill.description || "no description"}
                    </span>
                  </div>
                  <span className="chip uppercase text-[9px]">{skill.tier}</span>
                </div>
              ))}

              {filteredSkills.length === 0 && (
                <div className="p-8 text-center text-ink-quiet text-xs italic">
                  No matching registry skills found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Undo Toast notification */}
      {undoAction && (
        <div className="undo-toast">
          <span>
            Action completed for <strong className="font-mono">{undoAction.name}</strong>.
          </span>
          <button onClick={handleUndo}>Undo</button>
        </div>
      )}

      {/* Z12 Mobile Panels Adaptive overlay sheets */}
      <div className="md:hidden">
        {selectedSkillName && (
          <div className="sheet-overlay" onClick={() => setSelectedSkillName(null)}>
            <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-rule pb-2 mb-3">
                <h3 className="font-serif text-base font-semibold text-ink">{selectedSkillName}</h3>
                <button onClick={() => setSelectedSkillName(null)} className="btn btn-ghost text-sm">
                  Dismiss
                </button>
              </div>

              {selectedSkillQuery.data && (
                <div className="flex flex-col gap-4 text-xs">
                  <textarea
                    value={detailContent}
                    onChange={(e) => setDetailContent(e.target.value)}
                    className="w-full min-h-[180px] p-2 border border-rule bg-plate-raised font-mono text-xs scroll-quiet rounded"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button onClick={handleSaveDetail} className="btn btn-primary flex-1">
                      Save
                    </button>
                    <button onClick={handleArchiveDetail} className="btn btn-brick flex-1">
                      Archive
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
