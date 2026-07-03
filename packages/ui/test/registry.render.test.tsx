import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { RegistryScope, Settings } from "../src/api/types";
import { ToastProvider } from "../src/components/Toast";
import { RegistryScreen } from "../src/screens/Registry";

const emptyRegistry: RegistryScope[] = [];

function settingsWith(hub: Settings["hub"]): Settings {
  return {
    registryRoot: "/reg",
    repoRoots: [],
    globalClients: [],
    repoClients: [],
    linkMode: "symlink",
    inboxDirs: [],
    hub,
  };
}

function render(hub: Settings["hub"]): string {
  const qc = new QueryClient();
  qc.setQueryData(["registry"], emptyRegistry);
  qc.setQueryData(["settings"], settingsWith(hub));
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
