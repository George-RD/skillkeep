import { describe, expect, it } from "bun:test";
import type { Settings, SettingsInput } from "../src/api/types";
import { toInput, withHubEnabled } from "../src/screens/Settings";

const baseSettings: Settings = {
  registryRoot: "/reg",
  repoRoots: ["/repo1"],
  globalClients: ["claude"],
  repoClients: ["codex"],
  linkMode: "symlink",
  inboxDirs: ["/inbox"],
  hub: null,
};

describe("toInput", () => {
  it("maps a null hub to null", () => {
    const input = toInput(baseSettings);
    expect(input.hub).toBeNull();
  });

  it("maps an existing hub to a HubInput with an empty token (the server never returns it)", () => {
    const input = toInput({
      ...baseSettings,
      hub: { url: "https://hub.example.com", device: "laptop" },
    });
    expect(input.hub).toEqual({ url: "https://hub.example.com", token: "", device: "laptop" });
  });
});

describe("withHubEnabled", () => {
  const form: SettingsInput = toInput(baseSettings);

  it("nulls the whole hub object when disabled, leaving other fields untouched", () => {
    const withHub: SettingsInput = {
      ...form,
      hub: { url: "https://hub.example.com", token: "secret", device: "laptop" },
    };
    const result = withHubEnabled(withHub, false);
    expect(result.hub).toBeNull();
    expect(result.registryRoot).toBe(form.registryRoot);
    expect(result.repoRoots).toEqual(form.repoRoots);
  });

  it("seeds an empty HubInput (not all-null) when enabled from null", () => {
    const result = withHubEnabled(form, true);
    expect(result.hub).toEqual({ url: "", token: "", device: "" });
  });

  it("keeps the existing hub input untouched when already enabled", () => {
    const withHub: SettingsInput = {
      ...form,
      hub: { url: "https://hub.example.com", token: "", device: "laptop" },
    };
    const result = withHubEnabled(withHub, true);
    expect(result.hub).toEqual({ url: "https://hub.example.com", token: "", device: "laptop" });
  });
});
