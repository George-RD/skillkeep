import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { AiLink, Detection, RegistryScope, Settings } from "../src/api/types";
import { ToastProvider } from "../src/components/Toast";
import { DetectScreen } from "../src/screens/Detect";

// Unlike Registry's "Suggest description" (gated behind local `selected` state a pure SSR render
// can't set — see registry.render.test.tsx), Detect's per-row AI buttons render unconditionally
// for every scanned skill based only on `skill.state` + the AI-configured query, so they ARE
// provably testable via the same SSR-render approach the hub toolbar tests use.

const detection: Detection = {
  skills: [
    {
      name: "unmanaged-skill",
      description: "not yet under management",
      hash: "h1",
      client: "claude",
      surface: "user",
      path: "/skills/unmanaged-skill",
      state: "unmanaged",
    },
    {
      name: "duplicate-skill",
      description: "seen twice",
      hash: "h2",
      client: "claude",
      surface: "user",
      path: "/a/duplicate-skill",
      state: "duplicate",
    },
    {
      name: "managed-skill",
      description: "already under management",
      hash: "h3",
      client: "claude",
      surface: "user",
      path: "/skills/managed-skill",
      state: "managed",
    },
  ],
  repos: [],
  clientsFound: ["claude"],
  tokenEstimate: { global: 0, perRepo: {} },
};

const emptyRegistry: RegistryScope[] = [];

function settingsWith(ai: AiLink | null): Settings {
  return {
    registryRoot: "/reg",
    repoRoots: [],
    globalClients: [],
    repoClients: [],
    linkMode: "symlink",
    inboxDirs: [],
    hub: null,
    ai,
    maintenanceIntervalHours: 24,
    autoMaintenance: false,
  };
}

function render(ai: AiLink | null): string {
  const qc = new QueryClient();
  qc.setQueryData(["scan"], detection);
  qc.setQueryData(["registry"], emptyRegistry);
  qc.setQueryData(["settings"], settingsWith(ai));
  qc.setQueryData(["aiStatus", ai?.provider ?? null], { configured: ai !== null });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DetectScreen />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("DetectScreen AI buttons", () => {
  it("hides Suggest scope and Dedupe advice when AI assist is not configured", () => {
    const html = render(null);
    expect(html).not.toContain(">Suggest scope<");
    expect(html).not.toContain(">Dedupe advice<");
  });

  it("shows Suggest scope only for the unmanaged skill, and Dedupe advice only for the duplicate one, when configured", () => {
    const html = render({ provider: "anthropic", model: "claude-sonnet-4-5" });
    expect(html).toContain(">Suggest scope<");
    expect(html).toContain(">Dedupe advice<");
    // Exactly one row qualifies for each button (unmanaged-skill / duplicate-skill respectively;
    // managed-skill qualifies for neither) — the managed skill's row must still render (via Manage)
    // without either AI button.
    expect(html.match(/>Suggest scope</g)).toHaveLength(1);
    expect(html.match(/>Dedupe advice</g)).toHaveLength(1);
  });
});
