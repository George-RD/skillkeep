import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useRef } from "react";
import { baseUrl, getConnection, errorMessage, getAiKey, hasTauriGlobal, setAiKey } from "./api/client";
import type {
  Health,
  SettingsInput,
  HubInput,
  AiLink,
  InboxSkill,
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
  useInbox,
  useAdoptMutation,
  useDeleteInboxMutation,
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
  queryKeys,
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
  sortGarden,
  filterGarden,
  usageMap,
} from "./lib/garden";
import { StringListEditor } from "./components/ListEditor";

interface UndoAction {
  type: "tier" | "triage_adopt" | "triage_discard" | "triage_merge" | "archive" | "move";
  name: string;
  label: string;
  /** For triage_discard/merge: inbox path. For archive restore: prior scope. */
  prevScope?: string;
  prevTier?: Tier;
  /** Snapshot of the inbox skill for soft-delete undo re-queue. */
  seedling?: InboxSkill;
  /** Optional multi-path restore for bulk session dismissals. */
  batchPaths?: string[];
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
  const inbox = useInbox();
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
  const deleteInboxMutation = useDeleteInboxMutation();
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
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [activeTriageIndex, setActiveTriageIndex] = useState(0);
  /** Frozen N when triage opens — progress is "k of N remaining". */
  const [triageSessionN, setTriageSessionN] = useState(0);
  const [showSweep, setShowSweep] = useState(false);
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [tierRevision, setTierRevision] = useState(0);
  /** Paths soft-hidden from the queue (pending discard window or post-keep until refetch). */
  const [dismissedSeedlings, setDismissedSeedlings] = useState<Set<string>>(new Set());
  /** Session-only seedlings re-queued after Keep undo (inbox source file already consumed by adopt). */
  const [sessionSeedlings, setSessionSeedlings] = useState<InboxSkill[]>([]);
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
  const undoActionRef = useRef<UndoAction | null>(null);

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
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
    });
    es.addEventListener("sync:done", () => {
      queryClient.invalidateQueries({ queryKey: ["scan"] });
      queryClient.invalidateQueries({ queryKey: ["registry"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
    });
    es.addEventListener("usage:updated", () =>
      queryClient.invalidateQueries({ queryKey: ["usage"] }),
    );
    es.addEventListener("maintenance:done", () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["status"] });
      queryClient.invalidateQueries({ queryKey: ["scan"] });
      queryClient.invalidateQueries({ queryKey: ["registry"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
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
    const provider = aiProvider;
    let cancelled = false;
    async function load() {
      const key = await getAiKey(provider);
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
    // tierRevision forces recompute when localStorage tiers change
  }, [registry.data, usageBySkill, recommendations.data, status.data, tierRevision]);

  const filteredSkills = useMemo(() => {
    return filterGarden(rawSkills, { scope: scopeFilter, tier: tierFilter, query: searchQuery });
  }, [rawSkills, scopeFilter, tierFilter, searchQuery]);

  const sortedSkills = useMemo(() => {
    return sortGarden(filteredSkills, perspective, sortField);
  }, [filteredSkills, perspective, sortField]);

  // Seedlings census — single source: GET /api/inbox (shared shell / rot / triage truth)
  const seedlings = useMemo((): InboxSkill[] => {
    const fromInbox = (inbox.data ?? []).filter((s) => !dismissedSeedlings.has(s.path));
    const inboxPaths = new Set((inbox.data ?? []).map((s) => s.path));
    const fromSession = sessionSeedlings.filter(
      (s) => !dismissedSeedlings.has(s.path) && !inboxPaths.has(s.path),
    );
    return [...fromSession, ...fromInbox];
  }, [inbox.data, dismissedSeedlings, sessionSeedlings]);
  const awaitingCount = seedlings.length;
  const triageLoadState: "loading" | "populated" | "empty" | "failed" = (() => {
    if (inbox.isLoading && !inbox.data) return "loading";
    if (inbox.isError && !inbox.data) return "failed";
    if (seedlings.length > 0) return "populated";
    return "empty";
  })();
  const rotFindingsCount = useMemo(() => {
    const findings = recommendations.data?.findings.length ?? 0;
    const nonInbox =
      recommendations.data?.recommendations.filter((r) => r.kind !== "inbox-triage").length ?? 0;
    return Math.max(findings, nonInbox);
  }, [recommendations.data]);
  /** Rot feed: inject live inbox card; drop stale server inbox-triage so counts never desync. */
  const rotRecommendations = useMemo((): Recommendation[] => {
    const rest = (recommendations.data?.recommendations ?? []).filter(
      (r) => r.kind !== "inbox-triage",
    );
    if (awaitingCount <= 0) return rest;
    const inboxCard: Recommendation = {
      id: "inbox-triage-live",
      kind: "inbox-triage",
      title: `${awaitingCount} skill(s) awaiting triage`,
      detail: "Unreviewed skills in configured inbox directories.",
      skills: seedlings.slice(0, 8).map((s) => s.name),
      action: "triage",
    };
    return [inboxCard, ...rest];
  }, [recommendations.data, awaitingCount, seedlings]);
  const currentSeedling = seedlings[activeTriageIndex] ?? seedlings[0] ?? null;
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

  const [budgetPreviewDelta, setBudgetPreviewDelta] = useState<number | null>(null);
  const [deployError, setDeployError] = useState(false);
  const [deployPreviewAt, setDeployPreviewAt] = useState<string | null>(null);
  const [deployConfirmLine, setDeployConfirmLine] = useState<string | null>(null);
  const [deployJustCommitted, setDeployJustCommitted] = useState(false);

  // Undo manager — discard commits DELETE only after the ~8s ribbon window lapses.
  const commitPendingDiscard = (action: UndoAction) => {
    if (action.type !== "triage_discard" || !action.prevScope) return;
    const path = action.prevScope;
    // Session re-queues have no inbox file — drop locally without DELETE.
    const isSessionOnly = sessionSeedlings.some((s) => s.path === path);
    if (isSessionOnly) {
      setSessionSeedlings((prev) => prev.filter((s) => s.path !== path));
      return;
    }
    deleteInboxMutation.mutate(path, {
      onError: (e) => {
        // Keep shell/rot/triage aligned with server if DELETE fails.
        setDismissedSeedlings((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
        toast.show(`Discard finalize failed: ${errorMessage(e)}`, "error");
      },
    });
  };

  const triggerUndoAction = (action: UndoAction) => {
    if (undoTimeoutRef.current) window.clearTimeout(undoTimeoutRef.current);
    // Lapsing a prior discard ribbon finalizes that soft-delete.
    if (
      undoActionRef.current &&
      undoActionRef.current.type === "triage_discard" &&
      undoActionRef.current.prevScope !== action.prevScope
    ) {
      commitPendingDiscard(undoActionRef.current);
    }
    undoActionRef.current = action;
    setUndoAction(action);
    undoTimeoutRef.current = window.setTimeout(() => {
      if (action.type === "triage_discard") commitPendingDiscard(action);
      if (undoActionRef.current === action) undoActionRef.current = null;
      setUndoAction(null);
    }, 8000);
  };

  const handleUndo = () => {
    if (!undoAction) return;
    const action = undoAction;
    if (undoTimeoutRef.current) window.clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = null;
    undoActionRef.current = null;
    setUndoAction(null);

    if (action.type === "tier") {
      if (action.prevTier) saveTier(action.name, action.prevTier);
      setTierRevision((n) => n + 1);
      toast.show(`Restored ${action.name} to ${action.prevTier}`, "success");
    } else if (action.type === "triage_discard" || action.type === "triage_merge") {
      // Soft-delete / session-local dismiss — re-queue without server delete.
      const paths = action.batchPaths?.length
        ? action.batchPaths
        : action.prevScope
          ? [action.prevScope]
          : [];
      setDismissedSeedlings((prev) => {
        const next = new Set(prev);
        for (const path of paths) next.delete(path);
        return next;
      });
      setActiveMode("triage");
      setActiveTriageIndex(0);
      toast.show(
        paths.length > 1
          ? `Restored ${paths.length} seedlings`
          : `Restored seedling ${action.name}`,
        "success",
      );
    } else if (action.type === "triage_adopt") {
      // Archive the registry entry, then re-queue the seedling in-session (source file is gone).
      const names = action.batchPaths?.length ? action.batchPaths : [action.name];
      void (async () => {
        try {
          for (const name of names) {
            await archiveMutation.mutateAsync(name);
          }
          queryClient.invalidateQueries({ queryKey: ["scan"] });
          queryClient.invalidateQueries({ queryKey: ["registry"] });
          queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
          // Prefer full seedling snapshot; fall back to path/name for single undos.
          const toRequeue: InboxSkill[] = [];
          if (action.seedling) {
            toRequeue.push(action.seedling);
          } else if (action.prevScope) {
            toRequeue.push({
              name: action.name,
              path: action.prevScope,
              dir: action.prevScope.replace(/\/[^/]+$/, "") || action.prevScope,
            });
          }
          if (toRequeue.length > 0) {
            setSessionSeedlings((prev) => {
              const paths = new Set(prev.map((s) => s.path));
              const next = [...prev];
              for (const s of toRequeue) {
                if (!paths.has(s.path)) next.push(s);
              }
              return next;
            });
            setDismissedSeedlings((prev) => {
              const next = new Set(prev);
              for (const s of toRequeue) next.delete(s.path);
              return next;
            });
            setActiveMode("triage");
            setActiveTriageIndex(0);
          }
          toast.show(
            names.length > 1
              ? `Undid keep of ${names.length} skills (archived; re-queued in session)`
              : `Undid keep of ${action.name} (archived; re-queued in session — inbox file not on disk)`,
            "success",
          );
        } catch (e) {
          toast.show(`Undo failed: ${errorMessage(e)}`, "error");
        }
      })();
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

  const openTriage = () => {
    setDeployOpen(false);
    setSelectedSkillName(null);
    setActiveMode("triage");
    setActiveTriageIndex(0);
    setTriageSessionN(awaitingCount > 0 ? awaitingCount : seedlings.length);
    setTriageMergeOpen(false);
    void queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
  };

  const openRot = () => {
    setDeployOpen(false);
    setSelectedSkillName(null);
    setSearchOpen(false);
    setFilterSheetOpen(false);
    setActiveMode("rot");
  };

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

  const localDismissTriage = (
    seedling: InboxSkill,
    type: "triage_discard" | "triage_merge" | "triage_adopt",
  ) => {
    const { path, name } = seedling;
    setDismissedSeedlings((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });

    if (type === "triage_discard") {
      toast.show(`Discarded ${name}`, "success");
      triggerUndoAction({
        type,
        name,
        label: `Discarded ${name}`,
        prevScope: path,
        seedling,
      });
    } else if (type === "triage_merge") {
      toast.show("Marked resolved; no file consolidation performed", "success");
      triggerUndoAction({
        type,
        name,
        label: `Merged ${name}`,
        prevScope: path,
        seedling,
      });
    } else if (type === "triage_adopt") {
      toast.show(`Kept ${name} in scope ${triageScope}`, "success");
      // DESIGN-FLAG: Keep undoes via archive (source file already consumed by adopt).
      triggerUndoAction({
        type,
        name,
        label: `Kept ${name}`,
        prevScope: path,
        seedling,
      });
    }

    setActiveTriageIndex((prev) => {
      const nextLen = Math.max(0, seedlings.length - 1);
      if (nextLen <= 0) return 0;
      return Math.min(prev, nextLen - 1);
    });
  };

  const triageKeep = () => {
    if (!currentSeedling) return;
    const seedling = currentSeedling;
    const isSessionOnly = sessionSeedlings.some((s) => s.path === seedling.path);

    const onKept = () => {
      saveTier(seedling.name, triageTier);
      setTierRevision((n) => n + 1);
      localDismissTriage(seedling, "triage_adopt");
      // Drop any session re-queue copy if this path was restored earlier.
      setSessionSeedlings((prev) => prev.filter((s) => s.path !== seedling.path));
    };

    // Session re-queue after Keep-undo: registry entry was archived; unarchive via move.
    if (isSessionOnly) {
      moveMutation.mutate(
        { name: seedling.name, toScope: triageScope },
        {
          onSuccess: (res) => {
            if (res?.ok === false) {
              toast.show(`Could not keep: ${res?.error ?? "move failed"}`, "error");
              return;
            }
            onKept();
          },
          onError: (e) => toast.show(`Keep failed: ${errorMessage(e)}`, "error"),
        },
      );
      return;
    }

    adoptMutation.mutate(
      [{ name: seedling.name, path: seedling.path, scope: triageScope }],
      {
        onSuccess: (results) => {
          const res = results[0];
          if (res?.ok) {
            onKept();
          } else {
            toast.show(`Could not keep: ${res?.error ?? "unknown error"}`, "error");
          }
        },
        onError: (e) => toast.show(`Keep failed: ${errorMessage(e)}`, "error"),
      },
    );
  };

  const triageDiscard = () => {
    if (!currentSeedling) return;
    // Soft-hide immediately; DELETE /api/inbox when the undo window lapses.
    localDismissTriage(currentSeedling, "triage_discard");
  };

  const triageMerge = () => {
    if (!currentSeedling) return;
    setTriageMergeOpen(true);
    setTriageDedupeAdvice(null);
    const counterpartName = rawSkills.find((s) => s.name === currentSeedling.name)?.name || "";
    setTriageMergeTarget(counterpartName);

    if (aiStatus.data?.configured && counterpartName) {
      const counterpartObj = registry.data
        ?.flatMap((scope) => scope.skills)
        .find((s) => s.name === counterpartName);
      const counterpartDesc = counterpartObj?.description ?? "";
      dedupeMutation.mutate(
        {
          a: {
            name: currentSeedling.name,
            description: currentSeedling.description ?? "",
            body: "",
          },
          b: { name: counterpartName, description: counterpartDesc, body: "" },
        },
        {
          onSuccess: (advice) => {
            setTriageDedupeAdvice(`${advice.recommendation}: ${advice.rationale}`);
          },
        },
      );
    }
  };

  const triageConfirmMerge = () => {
    if (!currentSeedling || !triageMergeTarget) return;
    const seedling = currentSeedling;
    setTriageMergeOpen(false);
    localDismissTriage(seedling, "triage_merge");
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

  /** Secondary bulk: adopt remaining queue into global / climbing; ribbon undoes via archive. */
  const bulkKeepSuggested = () => {
    const batch = [...seedlings];
    const items = batch.map((s) => ({ name: s.name, path: s.path, scope: "global" as const }));
    if (items.length === 0) return;
    adoptMutation.mutate(items, {
      onSuccess: (results) => {
        const okNames = results.filter((r) => r.ok).map((r) => r.name);
        const fail = results.length - okNames.length;
        const keptSet = new Set(okNames);
        setDismissedSeedlings((prev) => {
          const next = new Set(prev);
          for (const s of batch) if (keptSet.has(s.name)) next.add(s.path);
          return next;
        });
        for (const name of okNames) saveTier(name, "climbing");
        setTierRevision((n) => n + 1);
        toast.show(
          fail > 0 ? `Kept ${okNames.length}; ${fail} failed` : `Kept ${okNames.length} seedlings (global · climbing)`,
          fail > 0 ? "error" : "success",
        );
        if (okNames.length > 0) {
          const last = okNames[okNames.length - 1]!;
          triggerUndoAction({
            type: "triage_adopt",
            name: last,
            label: `Kept ${okNames.length} seedlings`,
            batchPaths: okNames, // names for archive undo
          });
        }
      },
      onError: (e) => toast.show(`Bulk keep failed: ${errorMessage(e)}`, "error"),
    });
  };

  /**
   * Secondary bulk: only soft-dismiss seedlings whose names already appear in the registry
   * (true "obvious duplicates"). Session-local only — no DELETE batch (undo restores all).
   */
  const bulkDiscardObvious = () => {
    const registryNames = new Set(
      (registry.data ?? []).flatMap((scope) => scope.skills.map((s) => s.name)),
    );
    const dups = seedlings.filter((s) => registryNames.has(s.name));
    if (dups.length === 0) {
      toast.show("No obvious duplicates in this queue (no names already in the registry)", "info");
      return;
    }
    setDismissedSeedlings((prev) => {
      const next = new Set(prev);
      for (const s of dups) next.add(s.path);
      return next;
    });
    toast.show(`Dismissed ${dups.length} obvious duplicate(s) (session-local)`, "success");
    const last = dups[dups.length - 1]!;
    triggerUndoAction({
      type: "triage_merge",
      name: last.name,
      label: `Dismissed ${dups.length} duplicate(s)`,
      prevScope: last.path,
      seedling: last,
      batchPaths: dups.map((s) => s.path),
    });
  };

  // Sync Preview & Deploy review
  const openDeployReview = () => {
    setSelectedSkillName(null);
    setDeployOpen(true);
    setDeployError(false);
    setSyncReport(null);
    setSyncPreviewed(false);
    setDeployConfirmLine(null);
    setDeployJustCommitted(false);
    setActiveMode("garden");
    syncMutation.mutate(
      { dryRun: true },
      {
        onSuccess: (rep) => {
          setSyncReport(rep);
          setSyncPreviewed(true);
          setDeployPreviewAt(new Date().toLocaleTimeString());
          setDeployError(false);
        },
        onError: (e) => {
          setDeployError(true);
          toast.show(`Sync preview failed: ${errorMessage(e)}`, "error");
        },
      },
    );
  };

  const runSyncApply = () => {
    syncMutation.mutate(
      { dryRun: false },
      {
        onSuccess: (rep) => {
          setDeployConfirmLine(
            `Deployed · ${rep.created.length} rooted · ${rep.pruned.length} pruned`,
          );
          setDeployJustCommitted(true);
          // Idle after commit: clear actionable preview so shell/dock return to idle.
          setSyncReport({
            created: [],
            pruned: [],
            fixed: [],
            errors: rep.errors ?? [],
          });
          setSyncPreviewed(true);
          setDeployError(false);
          queryClient.invalidateQueries({ queryKey: ["scan"] });
          queryClient.invalidateQueries({ queryKey: ["registry"] });
          queryClient.invalidateQueries({ queryKey: ["status"] });
          toast.show(
            `Deployed ${rep.created.length} root / ${rep.pruned.length} prune — restore via reverse tier/sync if needed`,
            "success",
          );
        },
        onError: (e) => {
          setDeployError(true);
          toast.show(`Sync commit failed: ${errorMessage(e)}`, "error");
        },
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
        triggerUndoAction({
          type: "archive",
          name,
          label: `Archived ${name}`,
          prevScope: currentScope,
        });
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
      const skillName = rec.skills[0];
      if (!skillName) return;
      const currentScope = rawSkills.find((s) => s.name === skillName)?.scope;
      archiveMutation.mutate(skillName, {
        onSuccess: () => {
          toast.show(`Archived ${skillName}`, "success");
          triggerUndoAction({
            type: "archive",
            name: skillName,
            label: `Archived ${skillName}`,
            prevScope: currentScope,
          });
        },
        onError: (e) => toast.show(`Resolve failed: ${errorMessage(e)}`, "error"),
      });
    } else if (rec.action === "triage") {
      openTriage();
    } else if (rec.action === "review") {
      const skillName = rec.skills[0];
      if (!skillName) return;
      setSelectedSkillName(skillName);
      setActiveMode("detail");
    } else if (rec.action === "dedupe") {
      toast.show("Review duplicates in details list", "info");
    }
  };

  const deployLabel = (() => {
    if (deployError) return "Deploy · error";
    if (deployJustCommitted) return "Deploy · idle";
    const driftN = status.data?.drift.length ?? 0;
    if (driftN > 0) return `Deploy · drift ${driftN}`;
    if (syncReport && (syncReport.created.length > 0 || syncReport.pruned.length > 0 || syncReport.fixed.length > 0)) {
      return "Review deploy";
    }
    if (deployOpen && syncPreviewed) return "Deploy · idle";
    return "Review deploy";
  })();
  const deployHasWork =
    !deployJustCommitted &&
    ((status.data?.drift.length ?? 0) > 0 ||
      (syncReport != null &&
        (syncReport.created.length > 0 ||
          syncReport.pruned.length > 0 ||
          syncReport.fixed.length > 0)));

  const rotConsequenceWhisper = (rec: Recommendation): string => {
    if (rec.action === "archive") return "Archive unused skill · reversible via undo";
    if (rec.action === "triage") return "Opens seedling queue · no change until you decide";
    if (rec.action === "review") return "Opens skill detail · no mutation until you save";
    if (rec.action === "dedupe") return "Review duplicates · merge is session-local until discard";
    return "Resolve · reversible while undo ribbon is open";
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-field text-ink relative scroll-quiet overflow-x-hidden max-w-[100vw]">
      {/* Z1 Main Shell Header — phone: status only */}
      <header className="h-[var(--shell-h)] border-b border-rule bg-plate-raised px-3 sm:px-4 flex items-center justify-between z-30 shadow-sm max-w-[100vw] overflow-hidden">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              setActiveMode("garden");
              setSelectedSkillName(null);
              setDeployOpen(false);
            }}
            className="text-lg font-serif font-semibold text-ink tracking-tight bg-transparent border-none cursor-pointer flex-shrink-0"
          >
            skillkeep
          </button>
          <span className="shell-version text-[10px] uppercase tracking-wider text-ink-quiet">v0.1.0</span>

          <div className="flex items-center gap-2 border-l border-rule pl-2 sm:pl-3 ml-1 sm:ml-2 min-w-0">
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
              {health.isError ? "offline" : health.data?.ok ? "live" : "degraded"}
            </span>
          </div>

          <span className="chip uppercase text-[9px] font-bold tracking-widest px-1.5 border border-rule-strong flex-shrink-0">
            {health.data?.mode ?? "agent"}
          </span>
        </div>

        {/* Center: Context-budget readout (desktop) */}
        <div className="shell-budget-desktop hidden md:flex items-center gap-2 ledger-plate-tight px-3 py-1 font-mono text-xs tabular">
          <span className="text-ink-quiet text-[10px] uppercase font-bold tracking-wide">resident set</span>
          <span className="font-semibold text-terracotta">{formatTokens(totalBudget)} tokens</span>
          {budgetPreviewDelta != null && budgetPreviewDelta !== 0 && (
            <span className="text-[11px] text-ink-secondary">
              {budgetPreviewDelta > 0 ? "+" : "−"}
              {formatTokens(Math.abs(budgetPreviewDelta))}
            </span>
          )}
        </div>

        {/* Right action signals — desktop; phone uses thumb dock */}
        <div className="shell-actions-desktop flex items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={openTriage}
            data-hot={awaitingCount > 0}
            className="chip chip-signal chip-action"
          >
            {inbox.isLoading && !inbox.data ? (
              <span className="text-ink-quiet">Loading inbox…</span>
            ) : inbox.isError && !inbox.data ? (
              <>
                <span className="action-stem action-stem--brick" />
                <span>Inbox error</span>
              </>
            ) : awaitingCount > 0 ? (
              <>
                <span className="action-stem action-stem--terracotta" />
                <span>Triage {awaitingCount}</span>
              </>
            ) : (
              <span className="text-ink-quiet">Inbox clear</span>
            )}
          </button>

          <button
            type="button"
            onClick={openDeployReview}
            data-hot={deployHasWork || deployError}
            className="chip chip-signal chip-action"
          >
            <span className="action-stem action-stem--forest" />
            <span>{deployLabel}</span>
          </button>

          <button
            type="button"
            onClick={openRot}
            data-hot={rotFindingsCount > 0}
            className="chip chip-signal chip-action"
          >
            {rotFindingsCount > 0 && <span className="action-stem action-stem--amber" />}
            <span>Rot{rotFindingsCount > 0 ? ` ${rotFindingsCount}` : ""}</span>
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="press-icon"
            title="Search ( / )"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMode(activeMode === "settings" ? "garden" : "settings");
              setSelectedSkillName(null);
              setDeployOpen(false);
            }}
            className="press-icon"
            data-active={activeMode === "settings"}
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Phone status-row settings only */}
        <button
          type="button"
          onClick={() => {
            setActiveMode(activeMode === "settings" ? "garden" : "settings");
            setSelectedSkillName(null);
            setDeployOpen(false);
          }}
          className="press-icon md:hidden flex-shrink-0"
          data-active={activeMode === "settings"}
          title="Settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      {/* Phone budget strip — full width under status */}
      <div className="budget-strip">
        <span className="budget-strip__label">resident set</span>
        <span className="budget-strip__value tabular">{formatTokens(totalBudget)} tokens</span>
        {budgetPreviewDelta != null && budgetPreviewDelta !== 0 && (
          <span className="budget-strip__delta tabular">
            {budgetPreviewDelta > 0 ? "+" : "−"}
            {formatTokens(Math.abs(budgetPreviewDelta))}
          </span>
        )}
      </div>

      {/* Main Workspace Frame */}
      <main
        className={`workbench-main flex-1 grid grid-cols-1 md:grid-cols-[1fr_350px] gap-6 p-4 md:p-6 max-w-[1440px] mx-auto w-full overflow-hidden ${
          activeMode === "triage" ? "workbench-dim" : ""
        }`}
      >
        {/* LEFT COLUMN: Main workspace */}
        <section className="flex flex-col min-h-0 min-w-0">
          {(activeMode === "garden" || activeMode === "rot") && (
            <div className="ledger-plate flex flex-col h-full min-h-[500px]">
              {/* Z5 Control Rail — desktop full; phone Filter · Lens */}
              <div className="control-rail-desktop flex-wrap items-center justify-between gap-3 p-3 border-b border-rule bg-plate-raised">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-ink-quiet uppercase font-bold">scope:</span>
                    <select
                      value={scopeFilter}
                      onChange={(e) => setScopeFilter(e.target.value)}
                      className="bg-transparent border border-rule rounded px-2 py-0.5 text-xs font-medium cursor-pointer min-h-[44px]"
                    >
                      <option value="all">all scopes</option>
                      {(registry.data ?? []).map((s) => (
                        <option key={s.scope} value={s.scope}>
                          {s.scope}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-mono text-ink-quiet uppercase font-bold">tier:</span>
                    <select
                      value={tierFilter}
                      onChange={(e) => setTierFilter(e.target.value as Tier | "all")}
                      className="bg-transparent border border-rule rounded px-2 py-0.5 text-xs font-medium cursor-pointer min-h-[44px]"
                    >
                      <option value="all">all tiers</option>
                      <option value="rooted">rooted</option>
                      <option value="climbing">climbing</option>
                      <option value="pruned">pruned</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPerspective("garden")}
                      data-active={perspective === "garden"}
                      className={`btn btn-ghost text-xs ${
                        perspective === "garden" ? "text-terracotta font-semibold" : ""
                      }`}
                    >
                      Garden
                    </button>
                    <button
                      type="button"
                      onClick={() => setPerspective("cost")}
                      data-active={perspective === "cost"}
                      className={`btn btn-ghost text-xs ${
                        perspective === "cost" ? "text-terracotta font-semibold" : ""
                      }`}
                    >
                      Cost
                    </button>
                    <button
                      type="button"
                      onClick={() => setPerspective("exposure")}
                      data-active={perspective === "exposure"}
                      className={`btn btn-ghost text-xs ${
                        perspective === "exposure" ? "text-terracotta font-semibold" : ""
                      }`}
                    >
                      Exposure
                    </button>
                  </div>
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as "name" | "cost" | "exposure" | "tier")}
                    className="bg-transparent border border-rule rounded px-2 py-0.5 text-xs cursor-pointer text-ink-secondary min-h-[44px]"
                  >
                    <option value="name">sort: name</option>
                    <option value="tier">sort: tier</option>
                    <option value="cost">sort: usage cost</option>
                    <option value="exposure">sort: exposure</option>
                  </select>
                </div>
              </div>
              <div className="control-rail-phone">
                <button
                  type="button"
                  className="chip chip-signal chip-action"
                  data-hot={perspective !== "garden" || scopeFilter !== "all" || tierFilter !== "all"}
                  onClick={() => setFilterSheetOpen(true)}
                >
                  {(perspective !== "garden" || scopeFilter !== "all" || tierFilter !== "all") && (
                    <span className="action-stem action-stem--forest" />
                  )}
                  <span>Filter · Lens</span>
                </button>
                <span className="text-[11px] font-mono text-ink-quiet tabular">
                  {sortedSkills.length} skills
                </span>
              </div>

              {/* Z2 Garden list body */}
              <div className="flex-1 overflow-y-auto scroll-quiet overflow-x-hidden">
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
                      type="button"
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

                      const applyTier = (t: Tier) => {
                        const prev = skill.tier;
                        if (prev === t) return;
                        saveTier(skill.name, t);
                        setTierRevision((n) => n + 1);
                        setBudgetPreviewDelta(null);
                        triggerUndoAction({
                          type: "tier",
                          name: skill.name,
                          label: `Tier → ${t} on ${skill.name}`,
                          prevTier: prev,
                        });
                      };

                      const makeTierSeg = () => (
                        <div
                          className="tier-seg"
                          onClick={(e) => e.stopPropagation()}
                          onMouseLeave={() => setBudgetPreviewDelta(null)}
                        >
                          {(["rooted", "climbing", "pruned"] as Tier[]).map((t) => (
                            <button
                              key={t}
                              type="button"
                              data-active={skill.tier === t}
                              className="tier-seg__btn"
                              onMouseEnter={() =>
                                setBudgetPreviewDelta(budgetDelta(skill.tier, t, skill.tokenEstimate))
                              }
                              onFocus={() =>
                                setBudgetPreviewDelta(budgetDelta(skill.tier, t, skill.tokenEstimate))
                              }
                              onClick={() => applyTier(t)}
                              title={`Move to ${t} (${formatBudgetDelta(
                                budgetDelta(skill.tier, t, skill.tokenEstimate),
                              )})`}
                            >
                              {t[0]}
                            </button>
                          ))}
                        </div>
                      );

                      return (
                        <div
                          key={skill.name}
                          onClick={() => {
                            setSelectedSkillName(skill.name);
                            setDeployOpen(false);
                          }}
                          className={`hover:bg-row-alt/30 cursor-pointer transition-all duration-150 ${
                            selectedSkillName === skill.name ? "bg-row-alt/65 font-medium" : ""
                          } ${recede ? "row-recede" : ""} ${expensive ? "row-cost-flag" : ""}`}
                        >
                          {/* Desktop multi-column row */}
                          <div className="garden-row-desktop items-center justify-between gap-4 py-2.5 px-3">
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
                                <div className="flex items-start gap-2">
                                  <span className="skill-name min-w-0 flex-1">{skill.name}</span>
                                  <span className="text-[10px] font-mono text-ink-quiet uppercase bg-row-alt/80 px-1 py-0.2 rounded border border-rule/30 flex-shrink-0">
                                    {skill.scope}
                                  </span>
                                </div>
                                <div
                                  className="skill-path max-w-lg mt-0.5"
                                  title={skill.description || undefined}
                                >
                                  {skill.description || "no description"}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
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
                              <div className="text-right font-mono text-xs">
                                {perspective === "cost" ? (
                                  <div className="font-medium text-ink">{formatCost(skill.costMicroUsd)}</div>
                                ) : (
                                  <div className="text-ink-secondary">
                                    {formatTokens(skill.tokenEstimate)}
                                  </div>
                                )}
                                <div className="text-[10px] text-ink-quiet">
                                  {skill.usageTokens > 0
                                    ? `${formatTokens(skill.usageTokens)} used`
                                    : "unused"}
                                </div>
                              </div>
                              {makeTierSeg()}
                            </div>
                          </div>

                          {/* Phone stacked ledger cell — path hidden */}
                          <div className="garden-row-phone">
                            <div className="garden-row-phone__primary">
                              <span
                                className={`tier-stem ${
                                  skill.tier === "rooted"
                                    ? "tier-stem--rooted"
                                    : skill.tier === "climbing"
                                      ? "tier-stem--climbing"
                                      : "tier-stem--pruned"
                                }`}
                              />
                              <span className="skill-name min-w-0 flex-1">{skill.name}</span>
                            </div>
                            <div className="garden-row-phone__secondary">
                              <div className="garden-row-phone__meta">
                                <span className="text-[10px] font-mono text-ink-quiet uppercase bg-row-alt/80 px-1 py-0.2 rounded border border-rule/30 flex-shrink-0">
                                  {skill.scope}
                                </span>
                                <span className="font-mono text-xs text-ink-secondary tabular">
                                  {formatCost(skill.costMicroUsd)}
                                </span>
                                <span className="font-mono text-[10px] text-ink-quiet tabular">
                                  {formatTokens(skill.tokenEstimate)}
                                </span>
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
                              </div>
                              {makeTierSeg()}
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
            <div className="settings-plate ledger-plate p-5 flex flex-col h-full overflow-y-auto scroll-quiet">
              <div className="flex items-center justify-between border-b border-rule pb-3 mb-4 settings-plate__header">
                <h2 className="font-serif text-lg font-semibold text-ink">Configuration Settings</h2>
                <div className="flex gap-2 settings-plate__actions">
                  <button type="button" onClick={() => setActiveMode("garden")} className="btn btn-quiet">
                    Back to Garden
                  </button>
                  <button type="button" onClick={handleSaveSettings} className="btn btn-primary">
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
                                const fm = split[1] ?? "";
                                const body = split.slice(2).join("---");
                                const updatedFm = fm.replace(
                                  /^description:.*$/m,
                                  `description: "${aiSuggestion}"`,
                                );
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
                <div>
                  <h3 className="font-serif text-base font-semibold text-ink">Deploy review</h3>
                  <p className="text-[11px] font-mono text-ink-quiet mt-0.5">
                    {deployPreviewAt ? `Preview as of ${deployPreviewAt}` : "Dry-run preview"}
                  </p>
                </div>
                <button
                  onClick={() => setDeployOpen(false)}
                  className="p-1 rounded hover:bg-row-alt text-ink-quiet cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 flex flex-col gap-4 text-sm min-h-0">
                {syncMutation.isPending && !syncReport && (
                  <div className="flex flex-col gap-2">
                    <div className="skeleton-row" />
                    <div className="skeleton-row" />
                    <div className="skeleton-row" />
                  </div>
                )}

                {deployError && !syncReport && (
                  <div className="rounded border border-brick/30 bg-brick-soft p-3 flex gap-2 text-brick text-xs">
                    <span className="action-stem action-stem--brick mt-1" />
                    <div className="flex-1">
                      <h4 className="font-serif font-semibold text-sm mb-1">Couldn't load deploy preview</h4>
                      <p className="text-ink-secondary mb-2">The dry-run failed. Retry to try again.</p>
                      <button type="button" className="btn btn-primary py-1 px-3" onClick={openDeployReview}>
                        Retry
                      </button>
                    </div>
                  </div>
                )}

                {syncReport && (
                  <>
                    <div className="deploy-summary">
                      <div className="deploy-summary__cell">
                        <div className="deploy-summary__n">{syncReport.created.length}</div>
                        <div className="deploy-summary__label">Will root</div>
                      </div>
                      <div className="deploy-summary__cell">
                        <div className="deploy-summary__n">{syncReport.pruned.length}</div>
                        <div className="deploy-summary__label">Will prune</div>
                      </div>
                      <div className="deploy-summary__cell">
                        <div className="deploy-summary__n">{syncReport.fixed.length}</div>
                        <div className="deploy-summary__label">Drift</div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto scroll-quiet flex flex-col gap-3 pr-1 min-h-0">
                      <div>
                        <div className="text-[10px] font-mono uppercase font-bold text-forest border-b border-rule/50 mb-1">
                          Will root
                        </div>
                        {syncReport.created.length === 0 ? (
                          <div className="text-xs text-ink-quiet py-1">None</div>
                        ) : (
                          syncReport.created.map((s) => (
                            <div key={s} className="deploy-line">
                              <span className="skill-name text-[12px]">{s.split("/").pop() ?? s}</span>
                              <div className="deploy-line__meta">
                                <span className="skill-path" title={s}>
                                  {s}
                                </span>
                                <span className="font-mono text-forest flex-shrink-0">root</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div>
                        <div className="text-[10px] font-mono uppercase font-bold text-brick border-b border-rule/50 mb-1">
                          Will prune from harness
                        </div>
                        {syncReport.pruned.length === 0 ? (
                          <div className="text-xs text-ink-quiet py-1">None</div>
                        ) : (
                          syncReport.pruned.map((s) => (
                            <div key={s} className="deploy-line">
                              <span className="skill-name text-[12px]">{s.split("/").pop() ?? s}</span>
                              <div className="deploy-line__meta">
                                <span className="skill-path" title={s}>
                                  {s}
                                </span>
                                <span className="font-mono text-brick flex-shrink-0">prune</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div>
                        <div className="text-[10px] font-mono uppercase font-bold text-amber border-b border-rule/50 mb-1">
                          Drift
                        </div>
                        {syncReport.fixed.length === 0 && (status.data?.drift.length ?? 0) === 0 ? (
                          <div className="text-xs text-ink-quiet py-1">None</div>
                        ) : (
                          <>
                            {syncReport.fixed.map((s) => (
                              <div key={`fix-${s}`} className="deploy-line">
                                <span className="skill-name text-[12px]">{s.split("/").pop() ?? s}</span>
                                <div className="text-ink-quiet font-mono text-[10px]" title={s}>
                                  dry-run correction · {s}
                                </div>
                              </div>
                            ))}
                            {(status.data?.drift ?? []).map((s) => (
                              <div key={`status-drift-${s}`} className="deploy-line">
                                <span className="skill-name text-[12px]">{s}</span>
                                <div className="text-ink-quiet font-mono text-[10px]">
                                  status: origin vs override
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>

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
                        syncReport.fixed.length === 0 &&
                        (status.data?.drift.length ?? 0) === 0 && (
                          <div className="text-center py-4 text-ink-quiet text-xs">
                            Nothing to deploy — registry matches harness
                          </div>
                        )}
                    </div>
                  </>
                )}

                <div className="pt-2 border-t border-rule flex flex-col gap-2">
                  {deployConfirmLine && <div className="deploy-confirm">{deployConfirmLine}</div>}
                  <button
                    type="button"
                    onClick={runSyncApply}
                    disabled={
                      !syncReport ||
                      (syncReport.created.length === 0 &&
                        syncReport.pruned.length === 0 &&
                        syncReport.fixed.length === 0)
                    }
                    className="btn btn-primary w-full"
                  >
                    Commit sync
                  </button>
                  {!syncReport ||
                  (syncReport.created.length === 0 &&
                    syncReport.pruned.length === 0 &&
                    syncReport.fixed.length === 0) ? (
                    <p className="text-[10px] text-ink-quiet text-center">Nothing to deploy</p>
                  ) : null}
                  <button type="button" onClick={() => setDeployOpen(false)} className="btn btn-quiet w-full">
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

                {recommendations.isSuccess && rotRecommendations.length === 0 && (
                  <div className="text-center py-8 text-ink-quiet text-xs italic">
                    Garden status healthy. No rot detected.
                  </div>
                )}

                {(recommendations.isSuccess || awaitingCount > 0) &&
                  rotRecommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className="ledger-plate-tight p-3 text-xs flex flex-col gap-2 bg-plate-raised"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] uppercase font-bold px-1.5 py-0.2 bg-amber-soft text-amber border border-amber/30 rounded">
                          {rec.kind === "inbox-triage" ? "INBOX TRIAGE" : rec.kind.replace("-", " ")}
                        </span>
                      </div>
                      <h4 className="font-serif font-medium text-ink text-[13px] skill-name">{rec.title}</h4>
                      <p className="text-ink-secondary leading-normal">{rec.detail}</p>
                      <p className="rot-whisper">{rotConsequenceWhisper(rec)}</p>
                      <div className="flex justify-end gap-2 pt-1 border-t border-rule/30">
                        <button
                          type="button"
                          onClick={() => handleResolveRecommendation(rec)}
                          className="btn btn-forest"
                        >
                          {rec.action === "triage" ? "Open triage" : "Resolve"}
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
        <div className="triage-overlay fixed inset-0 bg-field/90 z-40 flex items-center justify-center p-4">
          <div className="triage-plate ledger-plate w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden shadow-2xl relative z-50">
            <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-rule bg-plate flex flex-col min-h-0">
              <div className="p-3 border-b border-rule bg-plate-raised flex justify-between items-center">
                <span className="font-serif font-bold text-sm">Seedlings</span>
                <span className="text-xs text-ink-quiet font-mono">
                  {triageLoadState === "loading"
                    ? "Loading seedlings…"
                    : triageLoadState === "populated"
                      ? `${Math.max(1, Math.max(triageSessionN, awaitingCount) - seedlings.length + 1)} of ${Math.max(triageSessionN, awaitingCount)} remaining`
                      : triageLoadState === "failed"
                        ? `${awaitingCount > 0 ? awaitingCount + " awaiting" : "load failed"}`
                        : "0 remaining"}
                </span>
              </div>
              {triageLoadState === "populated" && seedlings.length > 0 && (
                <div className="px-3 py-2 border-b border-rule flex flex-wrap gap-2 bg-plate-raised">
                  <button type="button" className="btn btn-quiet text-[11px]" onClick={bulkKeepSuggested}>
                    Keep all suggested
                  </button>
                  <button type="button" className="btn btn-quiet text-[11px]" onClick={bulkDiscardObvious}>
                    Discard obvious duplicates
                  </button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto scroll-quiet divide-y divide-rule/40">
                {triageLoadState === "loading" && (
                  <div className="p-3 flex flex-col gap-2">
                    <div className="skeleton-row" />
                    <div className="skeleton-row" />
                    <div className="skeleton-row" />
                  </div>
                )}
                {seedlings.map((s, idx) => (
                  <div
                    key={s.path}
                    onClick={() => setActiveTriageIndex(idx)}
                    className={`p-2.5 text-xs cursor-pointer ${
                      activeTriageIndex === idx
                        ? "bg-row-alt font-medium text-ink"
                        : "text-ink-secondary hover:bg-row-alt/40"
                    }`}
                  >
                    <div className="skill-name text-[13px]">{s.name}</div>
                    <div className="skill-path mt-0.5" title={s.path}>
                      {s.path}
                    </div>
                    <div className="font-mono text-[10px] text-ink-quiet truncate" title={s.dir}>
                      {s.dir}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 p-5 flex flex-col min-h-0 bg-plate-raised overflow-y-auto">
              {triageLoadState === "loading" && (
                <div className="flex-1 flex flex-col gap-3">
                  <div className="skeleton-row" />
                  <div className="skeleton-row" />
                  <p className="text-xs font-mono text-ink-quiet">Loading seedlings…</p>
                </div>
              )}

              {triageLoadState === "failed" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
                  <span className="action-stem action-stem--brick" />
                  <h3 className="font-serif text-lg font-medium text-ink">Couldn't load seedlings</h3>
                  <p className="text-sm text-ink-secondary max-w-sm">
                    The inbox may still have work. Retry loading seedlings, or return to the Garden.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        void queryClient.invalidateQueries({ queryKey: queryKeys.inbox });
                      }}
                    >
                      Retry
                    </button>
                    <button type="button" className="btn btn-quiet" onClick={() => setActiveMode("garden")}>
                      Back to Garden
                    </button>
                  </div>
                </div>
              )}

              {triageLoadState === "empty" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
                  <span className="action-stem action-stem--forest" />
                  <h3 className="font-serif text-lg font-medium text-ink">Triage inbox clear</h3>
                  <p className="text-sm text-ink-quiet">Nothing waiting — the garden is ready.</p>
                  <button type="button" onClick={() => setActiveMode("garden")} className="btn btn-primary">
                    Back to Garden
                  </button>
                </div>
              )}

              {triageLoadState === "populated" && currentSeedling && (
                <div className="flex-1 flex flex-col gap-4 min-h-0">
                  <div>
                    <h3 className="skill-name text-lg font-bold">{currentSeedling.name}</h3>
                    <div className="skill-path mt-1" title={currentSeedling.path}>
                      {currentSeedling.path}
                    </div>
                    <div className="font-mono text-[11px] text-ink-quiet mt-1" title={currentSeedling.dir}>
                      dir · {currentSeedling.dir}
                    </div>
                  </div>

                  {currentSeedling.description && (
                    <div className="bg-plate border border-rule p-3 rounded text-sm italic text-ink-secondary">
                      "{currentSeedling.description}"
                    </div>
                  )}

                  {triageMergeOpen ? (
                    <div className="border border-rule bg-plate p-4 rounded flex flex-col gap-3">
                      <h4 className="font-serif font-medium text-sm text-ink-secondary">
                        Merge Seedling Options
                      </h4>
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
                          className="w-full bg-plate-raised border border-rule rounded px-2.5 py-1 text-xs min-h-[44px]"
                        >
                          <option value="">Select Target...</option>
                          {(registry.data ?? [])
                            .flatMap((scope) => scope.skills)
                            .map((s) => (
                              <option key={s.name} value={s.name}>
                                {s.name} ({rawSkills.find((rs) => rs.name === s.name)?.scope})
                              </option>
                            ))}
                        </select>
                      </div>
                      {triageDedupeAdvice && (
                        <div className="text-xs bg-amber-soft border border-amber/30 text-amber p-2.5 rounded">
                          <strong>AI Advice:</strong> {triageDedupeAdvice}
                        </div>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button
                          type="button"
                          onClick={triageConfirmMerge}
                          disabled={!triageMergeTarget}
                          className="btn btn-primary flex-1"
                        >
                          Mark merge resolved
                        </button>
                        <button type="button" onClick={() => setTriageMergeOpen(false)} className="btn btn-quiet">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="border border-rule bg-plate p-4 rounded flex flex-col gap-3">
                        <h4 className="font-serif font-medium text-sm text-ink-secondary">
                          Keep in Garden options
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-mono uppercase font-bold text-ink-quiet mb-1">
                              scope location
                            </label>
                            <select
                              value={triageScope}
                              onChange={(e) => setTriageScope(e.target.value)}
                              className="w-full bg-plate-raised border border-rule rounded px-2.5 py-1 text-xs min-h-[44px]"
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
                              className="w-full bg-plate-raised border border-rule rounded px-2.5 py-1 text-xs min-h-[44px]"
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
                              budgetDelta(
                                "pruned",
                                triageTier,
                                estimateTokens(currentSeedling.description),
                              ),
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="triage-actions mt-auto pt-4 border-t border-rule flex flex-wrap gap-2">
                        <button type="button" onClick={triageKeep} className="btn btn-primary flex-1">
                          Keep
                        </button>
                        <button type="button" onClick={triageMerge} className="btn btn-forest flex-1">
                          Merge
                        </button>
                        {aiStatus.data?.configured && (
                          <button type="button" onClick={runTriageSuggest} className="btn btn-quiet px-3">
                            AI Suggest
                          </button>
                        )}
                        <button type="button" onClick={triageDiscard} className="btn btn-brick flex-1">
                          Discard
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveMode("garden")}
              className="absolute top-3 right-3 press-icon text-sm text-ink-quiet"
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
              <svg className="w-4 h-4 text-ink-quiet flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                autoFocus
                type="text"
                placeholder="Find skill by name, description, scope or hash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none text-sm outline-none text-ink min-h-[44px]"
              />
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSearchOpen(false);
                }}
                className="press-icon text-xs text-ink-quiet"
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
                  className="p-3 hover:bg-row-alt/40 cursor-pointer flex justify-between items-start gap-4 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="skill-name text-[13px] font-semibold">{skill.name}</span>
                    <span className="font-mono text-ink-quiet block mt-0.5 truncate">
                      {skill.scope} · {skill.description || "no description"}
                    </span>
                  </div>
                  <span className="chip uppercase text-[9px] flex-shrink-0">{skill.tier}</span>
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

      {/* Filter · Lens half-height bottom sheet (phone) */}
      {filterSheetOpen && (
        <div className="sheet-overlay md:hidden" onClick={() => setFilterSheetOpen(false)}>
          <div className="sheet-panel sheet-panel--half" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-header">
              <h3 className="font-serif text-base font-semibold">Filter · Lens</h3>
              <button type="button" className="press-icon" onClick={() => setFilterSheetOpen(false)}>
                Close
              </button>
            </div>
            <div className="sheet-body flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-ink-quiet mb-1">scope</label>
                <select
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value)}
                  className="w-full bg-plate-raised border border-rule rounded px-2.5 py-2 text-xs min-h-[44px]"
                >
                  <option value="all">all scopes</option>
                  {(registry.data ?? []).map((s) => (
                    <option key={s.scope} value={s.scope}>
                      {s.scope}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-ink-quiet mb-1">tier</label>
                <select
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value as Tier | "all")}
                  className="w-full bg-plate-raised border border-rule rounded px-2.5 py-2 text-xs min-h-[44px]"
                >
                  <option value="all">all tiers</option>
                  <option value="rooted">rooted</option>
                  <option value="climbing">climbing</option>
                  <option value="pruned">pruned</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-ink-quiet mb-1">sort</label>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as "name" | "cost" | "exposure" | "tier")}
                  className="w-full bg-plate-raised border border-rule rounded px-2.5 py-2 text-xs min-h-[44px]"
                >
                  <option value="name">name</option>
                  <option value="tier">tier</option>
                  <option value="cost">usage cost</option>
                  <option value="exposure">exposure</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase font-bold text-ink-quiet mb-2">
                  perspective
                </label>
                <div className="flex gap-2">
                  {(["garden", "cost", "exposure"] as Perspective[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`btn flex-1 ${perspective === p ? "btn-primary" : "btn-quiet"}`}
                      onClick={() => setPerspective(p)}
                    >
                      {p[0]!.toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="sheet-sticky-actions">
              <button type="button" className="btn btn-primary w-full" onClick={() => setFilterSheetOpen(false)}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo ribbon — bottom-docked recovery instrument */}
      {undoAction && (
        <div className="undo-ribbon" role="status">
          <div className="undo-ribbon__label">
            {undoAction.label} · <span className="undo-ribbon__name">{undoAction.name}</span>
          </div>
          <div className="undo-ribbon__actions">
            <button type="button" className="undo-ribbon__undo" onClick={handleUndo}>
              Undo
            </button>
            <button
              type="button"
              className="undo-ribbon__dismiss"
              onClick={() => {
                if (undoTimeoutRef.current) window.clearTimeout(undoTimeoutRef.current);
                undoTimeoutRef.current = null;
                const action = undoActionRef.current;
                undoActionRef.current = null;
                setUndoAction(null);
                if (action?.type === "triage_discard") commitPendingDiscard(action);
              }}
              aria-label="Dismiss undo"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Phone thumb dock — four jobs */}
      <nav className="thumb-dock" aria-label="Phone instrument dock">
        <button
          type="button"
          className="thumb-dock__slot"
          data-hot={awaitingCount > 0}
          data-active={activeMode === "triage"}
          onClick={openTriage}
        >
          <span className="thumb-dock__label">
            {awaitingCount > 0 && <span className="action-stem action-stem--terracotta" />}
            {awaitingCount > 0 ? `Triage ${awaitingCount}` : "Inbox"}
          </span>
        </button>
        <button
          type="button"
          className="thumb-dock__slot"
          data-hot={deployHasWork || deployError}
          data-active={deployOpen}
          onClick={openDeployReview}
        >
          <span className="thumb-dock__label">
            <span className="action-stem action-stem--forest" />
            Deploy
          </span>
        </button>
        <button
          type="button"
          className="thumb-dock__slot"
          data-hot={rotFindingsCount > 0}
          data-active={activeMode === "rot"}
          onClick={openRot}
        >
          <span className="thumb-dock__label">
            {rotFindingsCount > 0 && <span className="action-stem action-stem--amber" />}
            {rotFindingsCount > 0 ? `Rot ${rotFindingsCount}` : "Rot"}
          </span>
        </button>
        <button
          type="button"
          className="thumb-dock__slot"
          data-active={searchOpen}
          onClick={() => setSearchOpen(true)}
        >
          <span className="thumb-dock__label">Find</span>
        </button>
      </nav>

      {/* Z12 Mobile full sheets: detail, deploy, rot */}
      <div className="md:hidden">
        {selectedSkillName && !deployOpen && (
          <div className="sheet-overlay" onClick={() => setSelectedSkillName(null)}>
            <div className="sheet-panel sheet-panel--full" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-header">
                <h3 className="skill-name font-serif text-base font-semibold text-ink min-w-0 flex-1">
                  {selectedSkillName}
                </h3>
                <button type="button" onClick={() => setSelectedSkillName(null)} className="press-icon">
                  Close
                </button>
              </div>
              <div className="sheet-body">
                {selectedSkillQuery.data && (
                  <div className="flex flex-col gap-4 text-xs">
                    <textarea
                      value={detailContent}
                      onChange={(e) => setDetailContent(e.target.value)}
                      className="w-full min-h-[180px] p-2 border border-rule bg-plate-raised font-mono text-xs scroll-quiet rounded"
                    />
                  </div>
                )}
              </div>
              {selectedSkillQuery.data && (
                <div className="sheet-sticky-actions">
                  <button type="button" onClick={handleSaveDetail} className="btn btn-primary flex-1">
                    Save
                  </button>
                  <button type="button" onClick={() => setSelectedSkillName(null)} className="btn btn-quiet flex-1">
                    Cancel
                  </button>
                  <button type="button" onClick={handleArchiveDetail} className="btn btn-brick flex-1">
                    Archive
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {deployOpen && (
          <div className="sheet-overlay" onClick={() => setDeployOpen(false)}>
            <div className="sheet-panel sheet-panel--full" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-header">
                <div className="min-w-0">
                  <h3 className="font-serif text-base font-semibold text-ink">Deploy review</h3>
                  <p className="text-[11px] font-mono text-ink-quiet mt-0.5">
                    {deployPreviewAt ? `Preview as of ${deployPreviewAt}` : "Dry-run preview"}
                  </p>
                </div>
                <button type="button" onClick={() => setDeployOpen(false)} className="press-icon">
                  Close
                </button>
              </div>
              <div className="sheet-body flex flex-col gap-4">
                {syncMutation.isPending && !syncReport && (
                  <div className="flex flex-col gap-2">
                    <div className="skeleton-row" />
                    <div className="skeleton-row" />
                  </div>
                )}
                {deployError && !syncReport && (
                  <div className="rounded border border-brick/30 bg-brick-soft p-3 text-brick text-xs">
                    <h4 className="font-serif font-semibold text-sm mb-1">Couldn't load deploy preview</h4>
                    <button type="button" className="btn btn-primary" onClick={openDeployReview}>
                      Retry
                    </button>
                  </div>
                )}
                {syncReport && (
                  <>
                    <div className="deploy-summary">
                      <div className="deploy-summary__cell">
                        <div className="deploy-summary__n">{syncReport.created.length}</div>
                        <div className="deploy-summary__label">Will root</div>
                      </div>
                      <div className="deploy-summary__cell">
                        <div className="deploy-summary__n">{syncReport.pruned.length}</div>
                        <div className="deploy-summary__label">Will prune</div>
                      </div>
                      <div className="deploy-summary__cell">
                        <div className="deploy-summary__n">{syncReport.fixed.length}</div>
                        <div className="deploy-summary__label">Drift</div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="text-[10px] font-mono uppercase font-bold text-forest border-b border-rule/50 mb-1">
                          Will root
                        </div>
                        {syncReport.created.length === 0 ? (
                          <div className="text-xs text-ink-quiet py-1">None</div>
                        ) : (
                          syncReport.created.map((s) => (
                            <div key={s} className="deploy-line">
                              <span className="skill-name text-[12px]">{s.split("/").pop() ?? s}</span>
                              <span className="skill-path" title={s}>
                                {s}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] font-mono uppercase font-bold text-brick border-b border-rule/50 mb-1">
                          Will prune
                        </div>
                        {syncReport.pruned.length === 0 ? (
                          <div className="text-xs text-ink-quiet py-1">None</div>
                        ) : (
                          syncReport.pruned.map((s) => (
                            <div key={s} className="deploy-line">
                              <span className="skill-name text-[12px]">{s.split("/").pop() ?? s}</span>
                              <span className="skill-path" title={s}>
                                {s}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="sheet-sticky-actions flex-col">
                {deployConfirmLine && <div className="deploy-confirm w-full">{deployConfirmLine}</div>}
                <button
                  type="button"
                  onClick={runSyncApply}
                  disabled={
                    !syncReport ||
                    (syncReport.created.length === 0 &&
                      syncReport.pruned.length === 0 &&
                      syncReport.fixed.length === 0)
                  }
                  className="btn btn-primary w-full"
                >
                  Commit sync
                </button>
                <button type="button" onClick={() => setDeployOpen(false)} className="btn btn-quiet w-full">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {activeMode === "rot" && !deployOpen && !selectedSkillName && (
          <div className="sheet-overlay" onClick={() => setActiveMode("garden")}>
            <div className="sheet-panel sheet-panel--full" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-header">
                <h3 className="font-serif text-base font-semibold text-ink">Rot Recommendations</h3>
                <button type="button" onClick={() => setActiveMode("garden")} className="press-icon">
                  Close
                </button>
              </div>
              <div className="sheet-body flex flex-col gap-3">
                {recommendations.isLoading && <p className="text-xs text-ink-quiet">Loading health analysis...</p>}
                {recommendations.isSuccess && rotRecommendations.length === 0 && (
                  <div className="text-center py-8 text-ink-quiet text-xs italic">
                    Garden status healthy. No rot detected.
                  </div>
                )}
                {(recommendations.isSuccess || awaitingCount > 0) &&
                  rotRecommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className="ledger-plate-tight p-3 text-xs flex flex-col gap-2 bg-plate-raised"
                    >
                      <span className="font-mono text-[9px] uppercase font-bold px-1.5 py-0.2 bg-amber-soft text-amber border border-amber/30 rounded self-start">
                        {rec.kind === "inbox-triage" ? "INBOX TRIAGE" : rec.kind.replace("-", " ")}
                      </span>
                      <h4 className="font-serif font-medium text-ink text-[13px] skill-name">{rec.title}</h4>
                      <p className="text-ink-secondary leading-normal">{rec.detail}</p>
                      <p className="rot-whisper">{rotConsequenceWhisper(rec)}</p>
                      <button
                        type="button"
                        onClick={() => handleResolveRecommendation(rec)}
                        className="btn btn-forest self-end"
                      >
                        {rec.action === "triage" ? "Open triage" : "Resolve"}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
