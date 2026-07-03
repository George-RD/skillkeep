import { afterEach, describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import { createClient } from "../../src/client";
import { RegistryScreen } from "../../src/screens/RegistryScreen";
import type { RegistryScope } from "../../src/types";
import { wait } from "../helpers/wait";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sampleRegistry: RegistryScope[] = [
  {
    scope: "global",
    skills: [{ name: "code-review", description: "Reviews code", hash: "abc123" }],
  },
];

describe("RegistryScreen", () => {
  it("renders scopes and skills grouped by scope", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(sampleRegistry), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createClient({ url: "http://x", token: "t" });

    const { lastFrame, unmount } = render(<RegistryScreen client={client} isActive={false} />);
    await wait();

    const frame = lastFrame();
    expect(frame).toContain("Registry");
    expect(frame).toContain("global (1)");
    expect(frame).toContain("code-review");
    unmount();
  });

  it("shows the selected skill's hash and description", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(sampleRegistry), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createClient({ url: "http://x", token: "t" });

    const { lastFrame, unmount } = render(<RegistryScreen client={client} isActive={false} />);
    await wait();

    const frame = lastFrame();
    expect(frame).toContain("hash abc123");
    expect(frame).toContain("Reviews code");
    unmount();
  });
});
