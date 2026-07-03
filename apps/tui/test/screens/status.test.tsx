import { afterEach, describe, expect, it, mock } from "bun:test";
import { render } from "ink-testing-library";
import { createClient } from "../../src/client";
import { StatusScreen } from "../../src/screens/StatusScreen";
import type { StatusReport } from "../../src/types";
import { wait } from "../helpers/wait";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const sampleStatus: StatusReport = {
  counts: { global: 3, "project/foo": 1 },
  duplicates: ["dup-skill"],
  misplacements: [],
  drift: [],
  globalOnlyTokenEstimate: 128,
};

describe("StatusScreen", () => {
  it("renders counts, duplicates, and the token estimate", async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(sampleStatus), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createClient({ url: "http://x", token: "t" });

    const { lastFrame, unmount } = render(<StatusScreen client={client} />);
    await wait();

    const frame = lastFrame();
    expect(frame).toContain("Status");
    expect(frame).toContain("global: 3");
    expect(frame).toContain("dup-skill");
    expect(frame).toContain("~128");
    unmount();
  });
});
