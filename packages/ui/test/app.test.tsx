import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/App";
import type { Health } from "../src/api/types";
import { ToastProvider } from "../src/components/Toast";

function renderApp(health: Health | undefined): string {
  const qc = new QueryClient();
  if (health) qc.setQueryData(["health"], health);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("App mode chip", () => {
  it("renders the agent mode chip in agent mode", () => {
    const html = renderApp({ ok: true, version: "0.1.0", mode: "agent" });
    expect(html).toContain("agent");
    // New UI has no Detect/Sync/Devices nav — those screens are gone.
    expect(html).not.toContain(">Detect<");
    expect(html).not.toContain(">Sync<");
    expect(html).not.toContain(">Devices<");
  });

  it("renders the hub mode chip in hub mode", () => {
    const html = renderApp({ ok: true, version: "0.1.0", mode: "hub" });
    expect(html).toContain("hub");
    expect(html).not.toContain(">Detect<");
    expect(html).not.toContain(">Sync<");
  });

  it("defaults the mode chip to agent when health has not loaded", () => {
    const html = renderApp(undefined);
    expect(html).toContain("agent");
  });
});

describe("App chrome", () => {
  it("renders the phone instrument dock with triage/deploy/rot/find", () => {
    const html = renderApp({ ok: true, version: "0.1.0", mode: "agent" });
    expect(html).toContain("Phone instrument dock");
    expect(html).toContain("Deploy");
    expect(html).toContain("Rot");
    expect(html).toContain("Find");
  });
});
