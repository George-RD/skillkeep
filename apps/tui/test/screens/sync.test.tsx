import { afterEach, describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import { createClient } from "../../src/client";
import { SyncScreen } from "../../src/screens/SyncScreen";
import type { SyncReport } from "../../src/types";
import { wait } from "../helpers/wait";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const previewReport: SyncReport = {
  created: ["global/foo"],
  fixed: [],
  pruned: [],
  configReminders: [],
  errors: [],
};

describe("SyncScreen", () => {
  it("renders its header before any sync has run", () => {
    const client = createClient({ url: "http://x", token: "t" });
    const { lastFrame, unmount } = render(<SyncScreen client={client} isActive={false} />);
    expect(lastFrame()).toContain("Sync");
    unmount();
  });

  it("runs a dry-run preview on 's' and prompts to apply", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(previewReport), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createClient({ url: "http://x", token: "t" });

    const { lastFrame, stdin, unmount } = render(<SyncScreen client={client} isActive={true} />);
    await wait();
    stdin.write("s");
    await wait();

    const frame = lastFrame();
    expect(frame).toContain("created (1)");
    expect(frame).toContain("global/foo");
    expect(frame).toContain("Apply?");
    unmount();
  });

  it("applies for real on 'y' after a preview", async () => {
    let dryRunRequested = false;
    globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body;
      dryRunRequested ||= typeof body === "string" && body.includes('"dryRun":true');
      return new Response(JSON.stringify(previewReport), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createClient({ url: "http://x", token: "t" });

    const { lastFrame, stdin, unmount } = render(<SyncScreen client={client} isActive={true} />);
    await wait();
    stdin.write("s");
    await wait();
    stdin.write("y");
    await wait();

    expect(dryRunRequested).toBe(true);
    expect(lastFrame()).toContain("sync applied");
    unmount();
  });

  it("applies for real on enter after a preview, matching the global enter=action contract", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(previewReport), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createClient({ url: "http://x", token: "t" });

    const { lastFrame, stdin, unmount } = render(<SyncScreen client={client} isActive={true} />);
    await wait();
    stdin.write("s");
    await wait();
    stdin.write("\r");
    await wait();

    expect(lastFrame()).toContain("sync applied");
    unmount();
  });
});
