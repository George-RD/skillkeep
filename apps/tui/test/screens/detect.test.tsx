import { afterEach, describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import { createClient } from "../../src/client";
import { DetectScreen } from "../../src/screens/DetectScreen";
import type { AdoptResult, Detection } from "../../src/types";
import { wait } from "../helpers/wait";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sampleDetection: Detection = {
  skills: [
    {
      name: "code-review",
      description: "Reviews code",
      hash: "abc123",
      client: "claude",
      surface: "user",
      path: "/home/user/.claude/skills/code-review",
      state: "unmanaged",
    },
  ],
  repos: [],
  clientsFound: ["claude"],
  tokenEstimate: { global: 42, perRepo: {} },
};

describe("DetectScreen", () => {
  it("renders the fetched skills with their client/surface/state", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(sampleDetection), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createClient({ url: "http://x", token: "t" });

    const { lastFrame, unmount } = render(<DetectScreen client={client} isActive={false} />);
    await wait();

    const frame = lastFrame();
    expect(frame).toContain("Detect");
    expect(frame).toContain("[claude/user] code-review");
    expect(frame).toContain("unmanaged");
    unmount();
  });

  it("adopts the highlighted skill on enter and shows a success status", async () => {
    const adoptResult: AdoptResult[] = [{ name: "code-review", ok: true }];
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/adopt")) {
        return new Response(JSON.stringify(adoptResult), { status: 200 });
      }
      return new Response(JSON.stringify(sampleDetection), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createClient({ url: "http://x", token: "t" });

    const { lastFrame, stdin, unmount } = render(<DetectScreen client={client} isActive={true} />);
    await wait();

    stdin.write("\r");
    await wait();

    expect(lastFrame()).toContain("adopted code-review");
    unmount();
  });

  it("surfaces a scan failure as a status line without crashing", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ error: "scan failed" }), { status: 500 }),
    ) as unknown as typeof fetch;
    const client = createClient({ url: "http://x", token: "t" });

    const { lastFrame, unmount } = render(<DetectScreen client={client} isActive={false} />);
    await wait();

    expect(lastFrame()).toContain("scan failed");
    unmount();
  });
});
