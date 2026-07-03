import { describe, expect, test } from "bun:test";
import type { AiLink, Config } from "@skillkeep/core";
import type { LanguageModel } from "ai";
import {
  adviseDedupe,
  resolveAiKey,
  resolveModel,
  suggestTriage,
  tuneDescription,
} from "../src/ai";

// Unit-tests suggestTriage/tuneDescription/adviseDedupe directly against a hand-built
// LanguageModelV2-shaped fake (zero network calls), rather than going through the full HTTP route +
// resolveModel path — the less invasive of the two seams the assignment offered, since every route
// handler already takes the resolved `LanguageModel` as a plain function parameter (see ai.ts's
// module contract comment). End-to-end route wiring (gating, body validation, dispatch) is covered
// separately in server.test.ts's "GET/POST /api/ai/*" block against a real `startServer` instance.

function baseConfig(ai: AiLink | null): Config {
  return {
    registryRoot: "/tmp/does-not-matter",
    repoRoots: [],
    globalClients: [],
    repoClients: [],
    linkMode: "symlink",
    inboxDirs: [],
    projects: {},
    hub: null,
    ai,
  };
}

/** Hand-built `LanguageModelV2`-shaped fake — see ai.ts's module contract comment for why this is
 * built directly rather than via `ai/test`'s `MockLanguageModelV2`. Only `doGenerate` is exercised:
 * `generateObject`/`generateText` never call `doStream` for a non-streaming request. */
function textModel(text: string): LanguageModel {
  return {
    specificationVersion: "v2",
    provider: "test",
    modelId: "test-model",
    supportedUrls: {},
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      warnings: [],
    }),
    doStream: async () => {
      throw new Error("doStream is not exercised by this test fake");
    },
  };
}

describe("resolveModel", () => {
  test("returns a non-null model for anthropic", () => {
    const model = resolveModel({ provider: "anthropic", model: "claude-sonnet-4-5" }, "sk-test");
    expect(model).not.toBeNull();
  });

  test("returns a non-null model for openai", () => {
    const model = resolveModel({ provider: "openai", model: "gpt-4o" }, "sk-test");
    expect(model).not.toBeNull();
  });

  test("returns a non-null model for openrouter (rides the OpenAI-compatible client)", () => {
    const model = resolveModel(
      { provider: "openrouter", model: "anthropic/claude-3.5" },
      "sk-test",
    );
    expect(model).not.toBeNull();
  });

  test("throws for a provider string outside the AiLink union (hand-edited config file)", () => {
    const badLink = { provider: "made-up-provider", model: "x" } as unknown as AiLink;
    expect(() => resolveModel(badLink, "sk-test")).toThrow("unsupported AI provider");
  });
});

describe("resolveAiKey", () => {
  const configured = baseConfig({ provider: "anthropic", model: "claude-sonnet-4-5" });
  const savedEnvKey = process.env.SKILLKEEP_AI_KEY;

  function req(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/ai/status", { headers });
  }

  test("header wins over env when both are present", () => {
    process.env.SKILLKEEP_AI_KEY = "env-key";
    try {
      expect(resolveAiKey(req({ "X-Skillkeep-AI-Key": "header-key" }), configured)).toBe(
        "header-key",
      );
    } finally {
      if (savedEnvKey !== undefined) process.env.SKILLKEEP_AI_KEY = savedEnvKey;
      else delete process.env.SKILLKEEP_AI_KEY;
    }
  });

  test("env is used when no header is sent", () => {
    process.env.SKILLKEEP_AI_KEY = "env-key";
    try {
      expect(resolveAiKey(req(), configured)).toBe("env-key");
    } finally {
      if (savedEnvKey !== undefined) process.env.SKILLKEEP_AI_KEY = savedEnvKey;
      else delete process.env.SKILLKEEP_AI_KEY;
    }
  });

  test("null when neither header nor env supplies a key", () => {
    delete process.env.SKILLKEEP_AI_KEY;
    try {
      expect(resolveAiKey(req(), configured)).toBeNull();
    } finally {
      if (savedEnvKey !== undefined) process.env.SKILLKEEP_AI_KEY = savedEnvKey;
    }
  });

  test("null when config.ai is null, even with a key present", () => {
    process.env.SKILLKEEP_AI_KEY = "env-key";
    try {
      expect(
        resolveAiKey(req({ "X-Skillkeep-AI-Key": "header-key" }), baseConfig(null)),
      ).toBeNull();
    } finally {
      if (savedEnvKey !== undefined) process.env.SKILLKEEP_AI_KEY = savedEnvKey;
      else delete process.env.SKILLKEEP_AI_KEY;
    }
  });
});

describe("suggestTriage", () => {
  test("proposes a scope per name", async () => {
    const model = textModel(
      JSON.stringify({
        elements: [{ name: "foo-skill", scope: "global", rationale: "generic helper" }],
      }),
    );
    const result = await suggestTriage(model, ["foo-skill"], ["global", "archive"]);
    expect(result).toEqual([{ name: "foo-skill", scope: "global", rationale: "generic helper" }]);
  });

  test("drops an entry whose scope was hallucinated (not in the caller-supplied scopes list)", async () => {
    const model = textModel(
      JSON.stringify({
        elements: [
          { name: "real-skill", scope: "global", rationale: "fits global" },
          { name: "made-up-skill", scope: "project/nonexistent-repo", rationale: "invented scope" },
        ],
      }),
    );
    const result = await suggestTriage(
      model,
      ["real-skill", "made-up-skill"],
      ["global", "archive"],
    );
    expect(result).toEqual([{ name: "real-skill", scope: "global", rationale: "fits global" }]);
  });
});

describe("tuneDescription", () => {
  test("returns the model's suggested description, trimmed", async () => {
    const model = textModel("  A concise, accurate one-line description.  ");
    const suggestion = await tuneDescription(
      model,
      "my-skill",
      "old description",
      "# my-skill\nbody text",
    );
    expect(suggestion).toBe("A concise, accurate one-line description.");
  });
});

describe("adviseDedupe", () => {
  const a = { name: "skill-a", description: "does thing A", body: "body A" };
  const b = { name: "skill-b", description: "does thing A too", body: "body B" };

  test("returns the model's recommendation and rationale", async () => {
    const model = textModel(
      JSON.stringify({ recommendation: "merge", rationale: "same underlying task" }),
    );
    const advice = await adviseDedupe(model, a, b);
    expect(advice).toEqual({ recommendation: "merge", rationale: "same underlying task" });
  });

  test("falls back to merge when the model hallucinates an out-of-enum recommendation", async () => {
    const model = textModel(
      JSON.stringify({ recommendation: "keep-both", rationale: "not actually a valid choice" }),
    );
    const advice = await adviseDedupe(model, a, b);
    expect(advice.recommendation).toBe("merge");
    expect(advice.rationale).toBe("not actually a valid choice");
  });
});
