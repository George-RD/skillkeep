import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { baseUrl, getConnection } from "./api/client";
import type { Health } from "./api/types";
import { useHealth } from "./hooks/api";
import { DetectScreen } from "./screens/Detect";
import { DevicesScreen } from "./screens/Devices";
import { HealthScreen } from "./screens/Health";
import { RegistryScreen } from "./screens/Registry";
import { SettingsScreen } from "./screens/Settings";
import { SyncScreen } from "./screens/Sync";
import { UsageScreen } from "./screens/Usage";

export type ScreenId = "health" | "detect" | "registry" | "sync" | "usage" | "settings" | "devices";

interface NavItem {
  id: ScreenId;
  label: string;
  /** Omitted → shown in both modes. "hub" → hub-mode daemon only. "agent" → agent-mode daemon only. */
  restrict?: "hub" | "agent";
}

const ALL_NAV: NavItem[] = [
  { id: "health", label: "Health", restrict: "agent" },
  { id: "detect", label: "Detect", restrict: "agent" },
  { id: "registry", label: "Registry" },
  { id: "devices", label: "Devices", restrict: "hub" },
  { id: "sync", label: "Sync", restrict: "agent" },
  { id: "usage", label: "Usage" },
  { id: "settings", label: "Settings" },
];

/** The nav items relevant to the daemon's current mode. Undefined mode (health not loaded yet,
 * or an older daemon that omits the field) is treated as agent mode. Detect/Sync call routes
 * that 501 in hub mode; Devices only exists on a hub daemon. */
export function visibleNav(mode: Health["mode"] | undefined): NavItem[] {
  const isHub = mode === "hub";
  return ALL_NAV.filter((n) => n.restrict === undefined || (n.restrict === "hub") === isHub);
}

export function App() {
  const [screen, setScreen] = useState<ScreenId>("health");
  const queryClient = useQueryClient();
  const health = useHealth();
  const mode = health.data?.mode;
  const nav = useMemo(() => visibleNav(mode), [mode]);

  // If the daemon's mode flips (or the current screen is invalid for it, e.g. Detect while
  // hub-mode Detect/Sync are hidden), fall back to the first screen still on the nav.
  useEffect(() => {
    if (!nav.some((n) => n.id === screen)) {
      setScreen(nav[0]?.id ?? "registry");
    }
  }, [nav, screen]);

  // SSE from the daemon drives cache invalidation. EventSource can't send
  // headers, so the bearer token rides as a query param (the daemon accepts it
  // there for this route). A failed/absent stream silently retries — the UI
  // still works via manual mutation invalidations.
  useEffect(() => {
    const { token } = getConnection();
    const url = `${baseUrl()}/api/events${token !== "" ? `?token=${encodeURIComponent(token)}` : ""}`;
    const es = new EventSource(url);
    es.addEventListener("scan:progress", () =>
      queryClient.invalidateQueries({ queryKey: ["scan"] }),
    );
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
    });
    return () => {
      es.close();
    };
  }, [queryClient]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="text-lg font-bold">skillkeep</span>
          <HealthDot
            ok={health.data?.ok ?? false}
            version={health.data?.version}
            offline={health.isError}
          />
          <nav className="ml-auto flex gap-1">
            {nav.map((n) => (
              <button
                type="button"
                key={n.id}
                className={`rounded px-3 py-1.5 text-sm ${
                  screen === n.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
                onClick={() => setScreen(n.id)}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {screen === "health" && <HealthScreen setScreen={setScreen} />}
        {screen === "detect" && <DetectScreen />}
        {screen === "registry" && <RegistryScreen />}
        {screen === "sync" && <SyncScreen />}
        {screen === "usage" && <UsageScreen />}
        {screen === "settings" && <SettingsScreen />}
        {screen === "devices" && <DevicesScreen />}
      </main>
    </div>
  );
}

function HealthDot({ ok, version, offline }: { ok: boolean; version?: string; offline: boolean }) {
  const colour = offline ? "bg-slate-300" : ok ? "bg-green-500" : "bg-red-500";
  const label = offline ? "offline" : ok ? (version ? `v${version}` : "connected") : "error";
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className={`inline-block h-2 w-2 rounded-full ${colour}`} />
      {label}
    </span>
  );
}
