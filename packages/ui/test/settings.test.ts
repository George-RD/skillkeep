import { describe, expect, it } from "bun:test";
import type { Settings, SettingsInput } from "../src/api/types";
import { toInput, withAiEnabled, withHubEnabled } from "../src/screens/Settings";

const baseSettings: Settings = {
  registryRoot: "/reg",
  repoRoots: ["/repo1"],
  globalClients: ["claude"],
  repoClients: ["codex"],
  linkMode: "symlink",
  inboxDirs: ["/inbox"],
  hub: null,
  ai: null,
  maintenanceIntervalHours: 24,
  autoMaintenance: false,
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

  it("maps a null ai link to null", () => {
    const input = toInput(baseSettings);
    expect(input.ai).toBeNull();
  });

  it("maps an existing ai link through unchanged (there is no secret to strip)", () => {
    const input = toInput({
      ...baseSettings,
      ai: { provider: "anthropic", model: "claude-sonnet-4-5" },
    });
    expect(input.ai).toEqual({ provider: "anthropic", model: "claude-sonnet-4-5" });
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

describe("withAiEnabled", () => {
  const form: SettingsInput = toInput(baseSettings);

  it("nulls the whole ai object when disabled, leaving other fields untouched", () => {
    const withAi: SettingsInput = { ...form, ai: { provider: "openai", model: "gpt-5" } };
    const result = withAiEnabled(withAi, false);
    expect(result.ai).toBeNull();
    expect(result.registryRoot).toBe(form.registryRoot);
  });

  it("seeds a default anthropic provider with a blank model when enabled from null", () => {
    const result = withAiEnabled(form, true);
    expect(result.ai).toEqual({ provider: "anthropic", model: "" });
  });

  it("keeps the existing ai link untouched when already enabled", () => {
    const withAi: SettingsInput = { ...form, ai: { provider: "openrouter", model: "x-ai/grok" } };
    const result = withAiEnabled(withAi, true);
    expect(result.ai).toEqual({ provider: "openrouter", model: "x-ai/grok" });
  });
});
