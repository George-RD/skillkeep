# skillkeep

A self-hostable, cross-platform manager for AI coding-agent skills (Claude Code, OMP, Codex, opencode, Gemini CLI, …). One local daemon scans every client's skill install on your machine, lets you take skills under management with one click, keeps them in sync across clients and repos, and reports deterministic token/skill-usage metrics — all locally by default, with an optional self-hosted hub for multi-device sync.

## Why

Coding-agent skills live scattered across `~/.claude/skills`, `~/.omp/agent/managed-skills`, per-repo `.agents/skills`, and more. skillkeep gives you one registry, one sync engine, and one dashboard for all of it — no vendor lock-in, no cloud dependency required.

## Components

| Piece | What it is |
|---|---|
| `skillkeep` CLI + daemon | Local core: scan, adopt, sync. Exposes a localhost HTTP API every other surface talks to. |
| Desktop app (macOS/Windows) | Tauri 2 shell around the same API; detects installs on startup, one-click "take over management". |
| TUI | `skillkeep tui` — the same screens over SSH/terminal. |
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

## Self-hosting the hub

### Docker

```sh
docker run -v /path/to/data:/data -e SKILLKEEP_TOKEN=<random-32-byte-token> -p 8080:8080 ghcr.io/george-rd/skillkeep:latest
```

### Deploy on Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/George-RD/skillkeep)

Set `SKILLKEEP_TOKEN` when prompted, mount the `/data` volume (the template does this for you), then point your local agents at the hub in Settings → Hub.

## Development

- Bun workspaces monorepo: `packages/core`, `packages/usage`, `packages/server`, `packages/ui`; `apps/cli`, `apps/desktop`, `apps/tui`.
- `bun test` — full test suite. `bun run lint` — biome strict (zero warnings).
- Conventions: TypeScript strict, async/await only, no `console.*` in committed code, British spelling in user-facing copy, no new dependency without a one-line justification in the PR.

## License

MIT — see [LICENSE](./LICENSE).
