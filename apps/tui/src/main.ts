import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { dataDir } from "@skillkeep/core";
import { render } from "ink";
import React from "react";
import { App } from "./App";
import { FatalError } from "./components/FatalError";

interface Args {
  url: string;
  token: string | null;
}

/** Hand-rolled argv parsing: `--url <value>` and `--token <value>`, no third-party CLI lib. */
function parseArgs(argv: readonly string[]): Args {
  let url = "http://127.0.0.1:4517";
  let token: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error("--url requires a value");
      url = value;
      i++;
    } else if (arg === "--token") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error("--token requires a value");
      token = value;
      i++;
    }
  }

  return { url: url.replace(/\/+$/, ""), token };
}

type TokenResolution = { ok: true; token: string } | { ok: false; message: string };

/** Explicit --token wins; otherwise read the bearer token @skillkeep/core's daemon writes locally. */
function resolveToken(explicit: string | null): TokenResolution {
  if (explicit !== null) return { ok: true, token: explicit };

  let tokenPath: string;
  try {
    tokenPath = path.join(dataDir(), "daemon.token");
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : String(cause) };
  }

  if (!existsSync(tokenPath)) {
    return {
      ok: false,
      message: `no --token given and no local daemon token found at ${tokenPath} — start the local daemon first, or pass --token for a remote hub`,
    };
  }

  try {
    return { ok: true, token: readFileSync(tokenPath, "utf8").trim() };
  } catch (cause) {
    return {
      ok: false,
      message: `failed to read daemon token at ${tokenPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}

function fail(message: string): void {
  const instance = render(React.createElement(FatalError, { message }));
  instance.unmount();
  process.exitCode = 1;
}

function main(): void {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }

  const resolved = resolveToken(args.token);
  if (!resolved.ok) {
    fail(resolved.message);
    return;
  }

  render(React.createElement(App, { url: args.url, token: resolved.token }));
}

main();
