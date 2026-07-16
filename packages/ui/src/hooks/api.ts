import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteInboxItem,
  getAiStatus,
  getDevices,
  getHealth,
  getInbox,
  getRecommendations,
  getRegistry,
  getScan,
  getSettings,
  getSkill,
  getStatus,
  getUsage,
  postAdopt,
  postAiDedupe,
  postAiDescribe,
  postAiTriage,
  postArchive,
  postHubPull,
  postHubPush,
  postMove,
  postSync,
  putSettings,
  putSkill,
} from "../api/client";
import type { AdoptItem, AiLink, AiSkillContext, SettingsInput, UsageGroup } from "../api/types";

export const queryKeys = {
  health: ["health"] as const,
  scan: ["scan"] as const,
  registry: ["registry"] as const,
  skill: (name: string) => ["skill", name] as const,
  status: ["status"] as const,
  settings: ["settings"] as const,
  devices: ["devices"] as const,
  recommendations: ["recommendations"] as const,
  inbox: ["inbox"] as const,
  usage: (group: UsageGroup, from: string, to: string) => ["usage", group, from, to] as const,
  aiStatus: (provider: AiLink["provider"] | null) => ["aiStatus", provider] as const,
};

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: getHealth, refetchInterval: 30_000 });
}

export function useRecommendations() {
  return useQuery({ queryKey: queryKeys.recommendations, queryFn: getRecommendations });
}

export function useScan() {
  return useQuery({ queryKey: queryKeys.scan, queryFn: () => getScan(true) });
}

export function useRegistry() {
  return useQuery({ queryKey: queryKeys.registry, queryFn: getRegistry });
}

export function useInbox() {
  return useQuery({ queryKey: queryKeys.inbox, queryFn: getInbox });
}

export function useSkill(name: string | null) {
  return useQuery({
    queryKey: queryKeys.skill(name ?? "none"),
    queryFn: () => getSkill(name as string),
    enabled: name !== null,
  });
}

export function useStatus() {
  return useQuery({ queryKey: queryKeys.status, queryFn: getStatus });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: getSettings });
}

export function useUsage(group: UsageGroup, from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.usage(group, from, to),
    queryFn: () => getUsage(group, from, to),
  });
}

export function useAdoptMutation() {
  const qc = useQueryClient();
  // onSettled: a failed batch (conflict/network) still needs the scan census refreshed.
  return useMutation({
    mutationFn: (items: AdoptItem[]) => postAdopt(items),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["scan"] });
      qc.invalidateQueries({ queryKey: ["registry"] });
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: queryKeys.inbox });
      qc.invalidateQueries({ queryKey: queryKeys.recommendations });
    },
  });
}

export function useDeleteInboxMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillPath: string) => deleteInboxItem(skillPath),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inbox });
      qc.invalidateQueries({ queryKey: queryKeys.recommendations });
      qc.invalidateQueries({ queryKey: ["scan"] });
    },
  });
}

export function useMoveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; toScope: string }) => postMove(vars.name, vars.toScope),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["registry"] });
      qc.invalidateQueries({ queryKey: ["scan"] });
    },
  });
}

export function useArchiveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => postArchive(name),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["registry"] });
      qc.invalidateQueries({ queryKey: ["scan"] });
      qc.invalidateQueries({ queryKey: queryKeys.recommendations });
    },
  });
}

export function usePutSkillMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; content: string }) => putSkill(vars.name, vars.content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skill"] });
      qc.invalidateQueries({ queryKey: ["registry"] });
    },
  });
}

export function useSyncMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { dryRun: boolean }) => postSync(vars.dryRun),
    onSuccess: (_data, vars) => {
      // A dry-run preview changes nothing on disk — leave caches untouched.
      if (vars.dryRun) return;
      qc.invalidateQueries({ queryKey: ["scan"] });
      qc.invalidateQueries({ queryKey: ["registry"] });
      qc.invalidateQueries({ queryKey: ["status"] });
    },
  });
}

export function usePutSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => putSettings(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

export function useDevices(enabled = true) {
  return useQuery({ queryKey: queryKeys.devices, queryFn: getDevices, enabled });
}

export function useHubPushMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postHubPush(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.registry });
      qc.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

export function useHubPullMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => postHubPull(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.registry });
      qc.invalidateQueries({ queryKey: queryKeys.scan });
      qc.invalidateQueries({ queryKey: queryKeys.status });
    },
  });
}

/** Short `staleTime`: the underlying key can change any time the user edits it in Settings. */
export function useAiStatus() {
  const settings = useSettings();
  const provider = settings.data?.ai?.provider ?? null;
  return useQuery({
    queryKey: queryKeys.aiStatus(provider),
    queryFn: () => getAiStatus(provider),
    staleTime: 5_000,
  });
}

export function useAiTriageMutation() {
  const settings = useSettings();
  const provider = settings.data?.ai?.provider ?? null;
  return useMutation({
    mutationFn: (names: string[]) => postAiTriage(names, provider),
  });
}

export function useAiDescribeMutation() {
  const settings = useSettings();
  const provider = settings.data?.ai?.provider ?? null;
  return useMutation({
    mutationFn: (skill: AiSkillContext) => postAiDescribe(skill, provider),
  });
}

export function useAiDedupeMutation() {
  const settings = useSettings();
  const provider = settings.data?.ai?.provider ?? null;
  return useMutation({
    mutationFn: (vars: { a: AiSkillContext; b: AiSkillContext }) =>
      postAiDedupe(vars.a, vars.b, provider),
  });
}
