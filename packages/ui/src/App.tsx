import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { baseUrl, getConnection } from "./api/client";
import { useHealth } from "./hooks/api";
import { DetectScreen } from "./screens/Detect";
import { RegistryScreen } from "./screens/Registry";
import { SettingsScreen } from "./screens/Settings";
import { SyncScreen } from "./screens/Sync";
import { UsageScreen } from "./screens/Usage";

type ScreenId = "detect" | "registry" | "sync" | "usage" | "settings";

const NAV: { id: ScreenId; label: string }[] = [
  { id: "detect", label: "Detect" },
  { id: "registry", label: "Registry" },
  { id: "sync", label: "Sync" },
  { id: "usage", label: "Usage" },
  { id: "settings", label: "Settings" },
];

export function App() {
  const [screen, setScreen] = useState<ScreenId>("detect");
  const queryClient = useQueryClient();
  const health = useHealth();

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
            {NAV.map((n) => (
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
        {screen === "detect" && <DetectScreen />}
        {screen === "registry" && <RegistryScreen />}
        {screen === "sync" && <SyncScreen />}
        {screen === "usage" && <UsageScreen />}
        {screen === "settings" && <SettingsScreen />}
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
