/**
 * The set of coding-agent clients whose token/usage logs this package can parse.
 *
 * This type is defined LOCALLY in @skillkeep/usage so the package builds
 * standalone today. A later integration pass will unify it with the broader
 * ClientId in @skillkeep/core (which covers more clients, e.g. cursor).
 */
export type ClientId = "claude" | "codex" | "opencode" | "gemini" | "omp";
