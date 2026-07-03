import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { AiLink, Config } from "@skillkeep/core";
import { generateObject, generateText, jsonSchema, type LanguageModel } from "ai";

/**
 * Purpose: BYOK AI-assist generation — provider resolution, the request-level key/config gate, and
 * the three skillkeep AI operations (triage suggestions, description tuning, duplicate-pair
 * advice). No API key is ever accepted, stored, or logged by this module: {@link resolveAiKey}
 * resolves a key out-of-band per request, and every generation function takes an already-resolved
 * `LanguageModel` as a parameter — so the business logic never touches `process.env` or a request
 * header directly, and is fully unit-testable with a hand-built `LanguageModelV2`-shaped object
 * (see packages/server/test/ai.test.ts), with zero network calls. `ai/test`'s `MockLanguageModelV2`
 * was considered but drags in `@ai-sdk/provider-utils/test`'s `msw` peer dependency just to import
 * the class, so the tests build the fake directly against `LanguageModelV2`'s plain-object shape
 * instead — no new dependency needed.
 *
 * Public interface:
 * - resolveAiKey(req, config): the ordered key-resolution + config gate every AI route applies —
 *   `X-Skillkeep-AI-Key` header, else `SKILLKEEP_AI_KEY` env var, else null; also null whenever
 *   `config.ai` itself is null. Callers respond 503 when this returns null.
 * - resolveModel(link, key): provider switch — builds a `LanguageModel` for anthropic/openai/
 *   openrouter (openrouter rides on the OpenAI-compatible `@ai-sdk/openai` client with a custom
 *   `baseURL`, no separate SDK package). Throws for any other provider string — unreachable via
 *   `AiLink["provider"]`'s type, reachable only from a hand-edited config file.
 * - suggestTriage(model, names, scopes): propose { name, scope, rationale } per name, constrained
 *   to the caller-supplied `scopes` list; drops any entry whose scope isn't in that list.
 * - tuneDescription(model, name, description, body): propose a replacement one-line description.
 * - adviseDedupe(model, a, b): propose keep-a / keep-b / merge for a duplicate skill pair.
 *
 * Invariants:
 * - `AiLink` never carries a key field (packages/core/src/types.ts) and nothing in this module
 *   persists, logs, or echoes a key back to a caller.
 * - suggestTriage NEVER trusts a model-returned scope: any entry whose `scope` is absent from the
 *   `scopes` argument is dropped from the result (not thrown, not silently kept — intentional,
 *   see the filter comment below).
 * - adviseDedupe defends against a hallucinated `recommendation` value the same way: anything
 *   outside the three known literals is coerced to "merge" (the least destructive default).
 * - Structured generation uses `jsonSchema()` (plain JSON Schema) throughout, never zod — this
 *   repo has no zod dependency.
 *
 * Dependencies: `ai` (generateObject/generateText/jsonSchema), `@ai-sdk/anthropic`, `@ai-sdk/openai`
 * (also serves openrouter). `@skillkeep/core` for `Config`/`AiLink`.
 *
 * Tests: packages/server/test/ai.test.ts — resolveModel's provider coverage (including the
 * unknown-provider throw), resolveAiKey's header/env/gate precedence, and all three generation
 * functions exercised against a hand-built `LanguageModelV2` fake (including suggestTriage's
 * hallucinated-scope drop and adviseDedupe's hallucinated-recommendation fallback). Provider
 * correctness against the REAL Anthropic/OpenAI/OpenRouter APIs is UNVERIFIED here — no live key
 * is available in this environment.
 */

/** Header a client sends a per-request AI key on (desktop: OS keychain; never persisted). */
const AI_KEY_HEADER = "X-Skillkeep-AI-Key";

/**
 * Resolve the API key for this request in the documented order — request header, then the
 * `SKILLKEEP_AI_KEY` env var (how the CLI/hub daemon supplies one, since they send no header) —
 * and gate on `config.ai` being configured at all. Returns null whenever either check fails, which
 * every AI route treats as "AI not configured".
 */
export function resolveAiKey(req: Request, config: Config): string | null {
  if (config.ai === null) return null;
  const key = req.headers.get(AI_KEY_HEADER) ?? process.env.SKILLKEEP_AI_KEY ?? null;
  if (key === null || key.trim() === "") return null;
  return key;
}

/**
 * Build a `LanguageModel` for the configured provider/model. OpenRouter has no dedicated AI SDK
 * package — it's OpenAI-API-compatible, so it rides on `@ai-sdk/openai`'s client pointed at
 * OpenRouter's base URL. Throws for any provider string outside the `AiLink["provider"]` union;
 * that's unreachable through the type system but defends against a hand-edited config file.
 */
export function resolveModel(link: AiLink, key: string): LanguageModel {
  const { provider, model } = link;
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey: key }).languageModel(model);
    case "openai":
      return createOpenAI({ apiKey: key }).languageModel(model);
    case "openrouter":
      return createOpenAI({ apiKey: key, baseURL: "https://openrouter.ai/api/v1" }).languageModel(
        model,
      );
    default:
      throw new Error(`unsupported AI provider: ${String(provider)}`);
  }
}

/** One proposed triage decision for a single inbox skill name. */
export interface TriageSuggestion {
  name: string;
  scope: string;
  rationale: string;
}

const TRIAGE_ITEM_SCHEMA = jsonSchema<TriageSuggestion>({
  type: "object",
  properties: {
    name: { type: "string" },
    scope: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["name", "scope", "rationale"],
  additionalProperties: false,
});

/**
 * Propose a registry scope for each of `names` (unclassified inbox skills), constrained to the
 * real scopes currently visible in the registry. Uses `generateObject` with `output: "array"` (an
 * element `jsonSchema()`, not a hand-parsed `generateText` blob) since the shape is a simple flat
 * list and every AI SDK provider already understands array-mode structured output — no need for
 * the manual-JSON fallback.
 *
 * The model is free to hallucinate a scope that doesn't exist (e.g. a stale or invented
 * `project/<name>`); those entries are dropped rather than surfaced, since letting the caller
 * silently create a bogus scope directory is worse than under-suggesting for that one skill.
 */
export async function suggestTriage(
  model: LanguageModel,
  names: string[],
  scopes: string[],
): Promise<TriageSuggestion[]> {
  const { object } = await generateObject({
    model,
    output: "array",
    schema: TRIAGE_ITEM_SCHEMA,
    system:
      "You triage agent-skill directories into a skill registry's scopes. For each given skill " +
      "name, pick the single best-fitting scope and give a one-sentence rationale. You MUST choose " +
      "`scope` verbatim from the provided list of valid scopes — never invent a new one.",
    prompt:
      `Skill names to triage:\n${names.map((n) => `- ${n}`).join("\n")}\n\n` +
      `Valid scopes (choose one per skill, verbatim):\n${scopes.map((s) => `- ${s}`).join("\n")}`,
  });
  // Intentional drop, not a throw: a hallucinated scope must never reach the caller as if it were
  // real (see the module contract comment's Invariants section).
  return object.filter((item) => scopes.includes(item.scope));
}

/**
 * Propose a replacement one-line `description` for a skill, given its current description and full
 * SKILL.md body for context. Plain `generateText` (no schema) — the output is already a single
 * string, so a JSON round-trip would add ceremony without adding safety.
 */
export async function tuneDescription(
  model: LanguageModel,
  name: string,
  description: string,
  body: string,
): Promise<string> {
  const { text } = await generateText({
    model,
    system:
      "You improve the one-line `description` frontmatter field of an agent skill's SKILL.md. " +
      "Reply with ONLY the replacement description text — no quotes, no markdown, no preamble.",
    prompt: `Skill name: ${name}\nCurrent description: ${description}\n\nFull SKILL.md body:\n${body}`,
  });
  return text.trim();
}

/** One side of a duplicate-skill comparison: enough context for the model to judge overlap. */
export interface DedupeCandidate {
  name: string;
  description: string;
  body: string;
}

/** Result of comparing two candidate skills for duplication. */
export interface DedupeAdvice {
  recommendation: "keep-a" | "keep-b" | "merge";
  rationale: string;
}

const DEDUPE_RECOMMENDATIONS: Record<DedupeAdvice["recommendation"], true> = {
  "keep-a": true,
  "keep-b": true,
  merge: true,
};

const DEDUPE_SCHEMA = jsonSchema<DedupeAdvice>({
  type: "object",
  properties: {
    recommendation: { type: "string", enum: ["keep-a", "keep-b", "merge"] },
    rationale: { type: "string" },
  },
  required: ["recommendation", "rationale"],
  additionalProperties: false,
});

/** Propose which of two apparently-duplicate skills to keep, or whether to merge them. */
export async function adviseDedupe(
  model: LanguageModel,
  a: DedupeCandidate,
  b: DedupeCandidate,
): Promise<DedupeAdvice> {
  const { object } = await generateObject({
    model,
    schema: DEDUPE_SCHEMA,
    system:
      "You compare two agent skills that a registry suspects are duplicates. Decide whether to " +
      "keep skill A, keep skill B, or merge them into one, and give a one-sentence rationale.",
    prompt:
      `Skill A: ${a.name}\nDescription: ${a.description}\n\nBody:\n${a.body}\n\n---\n\n` +
      `Skill B: ${b.name}\nDescription: ${b.description}\n\nBody:\n${b.body}`,
  });
  // jsonSchema()'s `enum` hint is not runtime-enforced (no `validate` callback supplied — see the
  // module contract comment's Invariants section), so a hallucinated value is still possible; fall
  // back to "merge" (never silently discards either candidate) rather than trusting it blindly.
  const recommendation = DEDUPE_RECOMMENDATIONS[object.recommendation]
    ? object.recommendation
    : "merge";
  return { recommendation, rationale: object.rationale };
}
