import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { RecommendationsResponse, RegistryScope, Settings } from "../src/api/types";
import { ToastProvider } from "../src/components/Toast";
import { HealthScreen } from "../src/screens/Health";

const emptyRegistry: RegistryScope[] = [];

function settingsWith(ai: Settings["ai"]): Settings {
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

function render(response: RecommendationsResponse, ai: Settings["ai"] = null): string {
  const qc = new QueryClient();
  qc.setQueryData(["recommendations"], response);
  qc.setQueryData(["registry"], emptyRegistry);
  qc.setQueryData(["settings"], settingsWith(ai));
  qc.setQueryData(["aiStatus", ai?.provider ?? null], { configured: ai !== null });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <HealthScreen setScreen={() => {}} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const fixtureResponse: RecommendationsResponse = {
  recommendations: [
    {
      id: "inbox",
      kind: "inbox-triage",
      title: "2 skill(s) awaiting triage",
      detail: "New skills are sitting in the inbox unclassified — run triage to route them.",
      skills: [],
      action: "triage",
    },
    {
      id: "unused:idle-skill",
      kind: "unused-skill",
      title: '"idle-skill" has no usage in the last 60 days',
      detail: "No recorded usage in the last 60 days.",
      skills: ["idle-skill"],
      scope: "global",
      action: "archive",
    },
    {
      id: "dup:deploy+deploy-legacy",
      kind: "duplicate-pair",
      title: '"deploy" and "deploy-legacy" look similar',
      detail: "Name similarity 67% — consider merging or archiving one.",
      skills: ["deploy", "deploy-legacy"],
      action: "dedupe",
    },
    {
      id: "token-cost",
      kind: "token-cost",
      title: "Always-on token cost is high (25000 tokens)",
      detail: "Global-scope skills cost ~25000 tokens every session.",
      skills: [],
      action: "review",
    },
  ],
  findings: [{ kind: "inbox-nonempty", detail: "2 skill(s) awaiting triage" }],
  window: { from: "2026-05-07", to: "2026-07-06", days: 60 },
  lastMaintenance: {
    at: "2026-07-06T09:00:00.000Z",
    syncOk: true,
    findings: [],
    routed: [],
  },
};

const emptyResponse: RecommendationsResponse = {
  recommendations: [],
  findings: [],
  window: { from: "2026-05-07", to: "2026-07-06", days: 60 },
  lastMaintenance: null,
};

describe("HealthScreen", () => {
  it("renders all four recommendation kinds from a fixture response", () => {
    const html = render(fixtureResponse);
    expect(html).toContain("Inbox");
    expect(html).toContain("Unused");
    expect(html).toContain("Duplicate");
    expect(html).toContain("Token cost");
    expect(html).toContain("2 skill(s) awaiting triage");
    expect(html).toContain("&quot;idle-skill&quot; has no usage in the last 60 days");
    expect(html).toContain("&quot;deploy&quot; and &quot;deploy-legacy&quot; look similar");
    expect(html).toContain("Always-on token cost is high");
  });

  it("renders the last-maintenance card with sync status and timestamp", () => {
    const html = render(fixtureResponse);
    expect(html).toContain("sync ok");
    expect(html).not.toContain("never run yet");
  });

  it("renders a 'never run yet' empty state when no maintenance pass has run", () => {
    const html = render(emptyResponse);
    expect(html).toContain("never run yet");
  });

  it("renders the findings list", () => {
    const html = render(fixtureResponse);
    expect(html).toContain("inbox-nonempty");
  });

  it("renders the all-clean empty state when there are no findings and no recommendations", () => {
    const html = render(emptyResponse);
    expect(html).toContain("All clean");
  });

  it("renders an Archive button for the unused-skill recommendation", () => {
    const html = render(fixtureResponse);
    expect(html).toContain(">Archive<");
  });

  it("renders a Go to triage button for the inbox-triage recommendation", () => {
    const html = render(fixtureResponse);
    expect(html).toContain(">Go to triage<");
  });

  it("hides the dedupe button when AI assist is not configured", () => {
    const html = render(fixtureResponse, null);
    expect(html).not.toContain(">Get dedupe advice<");
  });

  it("shows the dedupe button when AI assist is configured", () => {
    const html = render(fixtureResponse, { provider: "anthropic", model: "claude-sonnet-4-5" });
    expect(html).toContain(">Get dedupe advice<");
  });
});
