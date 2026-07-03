import { describe, expect, it } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { Device } from "../src/api/types";
import { DevicesScreen, relativeTime } from "../src/screens/Devices";

function render(devices: Device[]): string {
  const qc = new QueryClient();
  qc.setQueryData(["devices"], devices);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <DevicesScreen />
    </QueryClientProvider>,
  );
}

describe("relativeTime", () => {
  it("renders minutes ago", () => {
    expect(relativeTime(Date.now() - 3 * 60_000)).toBe("3m ago");
  });

  it("renders hours ago", () => {
    expect(relativeTime(Date.now() - 2 * 60 * 60_000)).toBe("2h ago");
  });

  it("renders days ago", () => {
    expect(relativeTime(Date.now() - 5 * 24 * 60 * 60_000)).toBe("5d ago");
  });

  it("renders 'just now' for very recent or clock-skewed future timestamps", () => {
    expect(relativeTime(Date.now() - 10_000)).toBe("just now");
    expect(relativeTime(Date.now() + 10_000)).toBe("just now");
  });
});

describe("DevicesScreen", () => {
  it("renders the empty state when no device has pushed", () => {
    const html = render([]);
    expect(html).toContain("No devices have pushed yet.");
  });

  it("renders each device's name and a relative last-seen label", () => {
    const html = render([{ name: "laptop", lastSeen: Date.now() - 3 * 60_000 }]);
    expect(html).toContain("laptop");
    expect(html).toContain("3m ago");
  });
});
