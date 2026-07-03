import { afterEach, describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import { App } from "../src/App";
import type { Detection, RegistryScope, StatusReport } from "../src/types";
import { wait } from "./helpers/wait";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const emptyDetection: Detection = {
  skills: [],
  repos: [],
  clientsFound: [],
  tokenEstimate: { global: 0, perRepo: {} },
};
const emptyRegistry: RegistryScope[] = [];
const emptyStatus: StatusReport = {
  counts: {},
  duplicates: [],
  misplacements: [],
  drift: [],
  globalOnlyTokenEstimate: 0,
};

function installHealthyFetch(): void {
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/healthz"))
      return new Response(JSON.stringify({ ok: true, version: "0.0.0" }), { status: 200 });
    if (url.includes("/api/scan"))
      return new Response(JSON.stringify(emptyDetection), { status: 200 });
    if (url.endsWith("/api/registry"))
      return new Response(JSON.stringify(emptyRegistry), { status: 200 });
    if (url.endsWith("/api/status"))
      return new Response(JSON.stringify(emptyStatus), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("App", () => {
  it("shows the connection target and a healthy dot once /healthz resolves", async () => {
    installHealthyFetch();
    const { lastFrame, unmount } = render(<App url="http://127.0.0.1:4517" token="t" />);
    await wait();

    const frame = lastFrame();
    expect(frame).toContain("http://127.0.0.1:4517");
    expect(frame).toContain("Detect");
    unmount();
  });

  it("switches screens on number keys", async () => {
    installHealthyFetch();
    const { lastFrame, stdin, unmount } = render(<App url="http://127.0.0.1:4517" token="t" />);
    await wait();

    stdin.write("4");
    await wait();

    expect(lastFrame()).toContain("global-only token estimate");
    unmount();
  });

  it("shows a persistent disconnected banner when the daemon is unreachable", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("ECONNREFUSED")),
    ) as unknown as typeof fetch;
    const { lastFrame, unmount } = render(<App url="http://127.0.0.1:4517" token="t" />);
    await wait();

    expect(lastFrame()).toContain("disconnected from http://127.0.0.1:4517");
    unmount();
  });
});
