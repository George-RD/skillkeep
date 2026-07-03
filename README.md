# skillkeep

A self-hostable, cross-platform manager for AI coding-agent skills (Claude Code, OMP, Codex, opencode, Gemini CLI, …). One local daemon scans every client's skill install on your machine, lets you take skills under management with one click, keeps them in sync across clients and repos, and reports deterministic token/skill-usage metrics — all locally by default, with an optional self-hosted hub for multi-device sync and optional BYOK AI assist (triage suggestions, description tuning, dedupe advice — every suggestion applies only on explicit accept).

## Why

Coding-agent skills live scattered across `~/.claude/skills`, `~/.omp/agent/managed-skills`, per-repo `.agents/skills`, and more. skillkeep gives you one registry, one sync engine, and one dashboard for all of it — no vendor lock-in, no cloud dependency required.

## Components

| Piece | What it is |
|---|---|
| `skillkeep` CLI + daemon | Local core: scan, adopt, sync. Exposes a localhost HTTP API every other surface talks to. |
| Desktop app (macOS/Windows) | Tauri 2 shell around the same API; detects installs on startup, one-click "take over management". |
| TUI | `@skillkeep/tui` — the same screens over SSH/terminal, run from a repo clone (see [TUI](#tui) below). |
| Hub (optional) | Docker image / one-click Railway deploy; multi-device registry sync, usage dashboard, BYOK AI proxy. Never scans your machine — you push to it. |

## Quick start (local, no hub)

```sh
bun install
bun run --cwd apps/cli build   # or: bun build --compile apps/cli/src/main.ts --outfile skillkeep
./skillkeep scan
./skillkeep ui                 # opens the dashboard in your browser
```

## Desktop app

Download the latest `.dmg` (macOS) or `.msi` (Windows) from [Releases](../../releases). Installers are **unsigned in v1** — code-signing/notarisation is a later, paid decision.

- **macOS**: Gatekeeper will block the unsigned app. Right-click → Open the first time, or `xattr -d com.apple.quarantine /Applications/skillkeep.app`.
- **Windows**: SmartScreen will warn "unknown publisher" — click "More info" → "Run anyway".

## TUI

`@skillkeep/tui` is an unpublished workspace package (not a standalone compiled binary — ink's WASM layout engine, `yoga-wasm-web`, doesn't survive `bun build --compile`'s static asset bundling), so it runs from a repo clone against an already-running daemon:

```sh
bun install
./skillkeep daemon &                              # or use an already-running desktop/CLI daemon
bun run --cwd apps/tui start -- --token "$(cat "$HOME/Library/Application Support/skillkeep/daemon.token")"
```

Pass `--url` to point it at a remote hub instead of the local daemon (defaults to `http://127.0.0.1:4517`).

## Self-hosting the hub

### Docker

```sh
docker run -v /path/to/data:/data -e SKILLKEEP_TOKEN=<random-32-byte-token> -p 8080:8080 ghcr.io/george-rd/skillkeep:latest
```

### Deploy on Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/George-RD/skillkeep)

Set `SKILLKEEP_TOKEN` when prompted, mount the `/data` volume (the template does this for you), then point your local agents at the hub in Settings → Hub.

## AI assist (BYOK)

Optional, off by default. Enable in Settings → AI assist: pick a provider (`anthropic`, `openai`, or `openrouter`) and model. The API key is attached per-request to the local daemon (which makes the actual provider call) and is never persisted — not in SQLite, not in config, not in logs. Desktop stores it in the OS keychain; the CLI/hub reads it from the `SKILLKEEP_AI_KEY` environment variable instead. Every suggestion (registry-scope triage, description tuning, duplicate-skill advice) is a proposal only — nothing is written until you explicitly accept it. Without a configured provider/key, the AI endpoints return `503` and the UI hides the AI buttons.

## Development

- Bun workspaces monorepo: `packages/core`, `packages/usage`, `packages/server`, `packages/ui`; `apps/cli`, `apps/desktop`, `apps/tui`.
- `bun test` — full test suite. `bun run lint` — biome strict (zero warnings).
- Conventions: TypeScript strict, async/await only, no `console.*` in committed code, British spelling in user-facing copy, no new dependency without a one-line justification in the PR.

## License

MIT — see [LICENSE](./LICENSE).
