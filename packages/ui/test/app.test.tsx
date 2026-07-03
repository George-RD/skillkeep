import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { App, visibleNav } from "../src/App";
import type { Health } from "../src/api/types";
import { ToastProvider } from "../src/components/Toast";

describe("visibleNav", () => {
  it("shows Detect/Sync and hides Devices in agent mode", () => {
    const ids = visibleNav("agent").map((n) => n.id);
    expect(ids).toContain("detect");
    expect(ids).toContain("sync");
    expect(ids).not.toContain("devices");
  });

  it("hides Detect/Sync and shows Devices in hub mode", () => {
    const ids = visibleNav("hub").map((n) => n.id);
    expect(ids).not.toContain("detect");
    expect(ids).not.toContain("sync");
    expect(ids).toContain("devices");
  });

  it("treats an undefined mode (health not loaded yet, or an older daemon) as agent mode", () => {
    const ids = visibleNav(undefined).map((n) => n.id);
    expect(ids).toContain("detect");
    expect(ids).toContain("sync");
    expect(ids).not.toContain("devices");
  });
});

function renderApp(health: Health): string {
  const qc = new QueryClient();
  qc.setQueryData(["health"], health);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("App nav", () => {
  it("shows Detect and Sync, hides Devices, in agent mode", () => {
    const html = renderApp({ ok: true, version: "0.1.0", mode: "agent" });
    expect(html).toContain(">Detect<");
    expect(html).toContain(">Sync<");
    expect(html).not.toContain(">Devices<");
  });

  it("hides Detect and Sync, shows Devices, in hub mode", () => {
    const html = renderApp({ ok: true, version: "0.1.0", mode: "hub" });
    expect(html).not.toContain(">Detect<");
    expect(html).not.toContain(">Sync<");
    expect(html).toContain(">Devices<");
  });
});
