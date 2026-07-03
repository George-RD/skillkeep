import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getHealth,
  getRegistry,
  getScan,
  getSettings,
  getSkill,
  getStatus,
  getUsage,
  postAdopt,
  postArchive,
  postMove,
  postSync,
  putSettings,
  putSkill,
} from "../api/client";
import type { AdoptItem, SettingsInput, UsageGroup } from "../api/types";

export const queryKeys = {
  health: ["health"] as const,
  scan: ["scan"] as const,
  registry: ["registry"] as const,
  skill: (name: string) => ["skill", name] as const,
  status: ["status"] as const,
  settings: ["settings"] as const,
  usage: (group: UsageGroup, from: string, to: string) => ["usage", group, from, to] as const,
};

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: getHealth, refetchInterval: 30_000 });
}

export function useScan() {
  return useQuery({ queryKey: queryKeys.scan, queryFn: () => getScan() });
}

export function useRegistry() {
  return useQuery({ queryKey: queryKeys.registry, queryFn: getRegistry });
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
  return useMutation({ mutationFn: (input: SettingsInput) => putSettings(input) });
}
