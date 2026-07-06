import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { RegistryScope, Settings } from "../src/api/types";
import { ToastProvider } from "../src/components/Toast";
import { RegistryScreen } from "../src/screens/Registry";

const emptyRegistry: RegistryScope[] = [];

function settingsWith(hub: Settings["hub"], ai: Settings["ai"] = null): Settings {
  return {
    registryRoot: "/reg",
    repoRoots: [],
    globalClients: [],
    repoClients: [],
    linkMode: "symlink",
    inboxDirs: [],
    hub,
    ai,
    maintenanceIntervalHours: 24,
    autoMaintenance: false,
  };
}

function render(hub: Settings["hub"], ai: Settings["ai"] = null): string {
  const qc = new QueryClient();
  qc.setQueryData(["registry"], emptyRegistry);
  qc.setQueryData(["settings"], settingsWith(hub, ai));
  qc.setQueryData(["aiStatus", ai?.provider ?? null], { configured: ai !== null });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RegistryScreen />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("RegistryScreen hub toolbar", () => {
  it("hides Push/Pull when no hub is configured", () => {
    const html = render(null);
    expect(html).not.toContain(">Push<");
    expect(html).not.toContain(">Pull<");
  });

  it("shows Push/Pull when a hub is configured", () => {
    const html = render({ url: "https://hub.example.com", device: "laptop" });
    expect(html).toContain(">Push<");
    expect(html).toContain(">Pull<");
  });
});

// "Suggest description" (and the Move/Archive buttons beside it) only render once a skill is
// `selected` -- local `useState(null)` component state that a pure SSR render (no click
// simulation, no jsdom/RTL per this repo's no-new-DOM-deps convention -- see HubUI's commit for
// the same documented limitation) cannot set. Its `aiConfigured &&` gate is otherwise identical
// to the hub toolbar's pattern above and is covered by direct type-checking plus code review;
// `findDedupeCounterpart`/the Detect screen's per-row AI buttons (unconditional on any selection
// state) get the equivalent SSR coverage instead -- see detect.test.ts and detect.render.test.tsx.
