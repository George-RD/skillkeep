# skillkeep

skillkeep is a free, self-hosted tool that keeps your AI coding skills in one place.

Your AI coding tools — Claude Code, OMP, Codex, Gemini CLI, and others — each store their own folder of skills. skillkeep puts them all in one registry, syncs them across tools, and gives you a simple dashboard to manage them. Everything runs locally by default. You can also add an optional hub for syncing between devices, or switch on AI help for suggestions.

## Why use it

AI coding skills are spread across folders like `~/.claude/skills`, `~/.omp/agent/managed-skills`, and per-repo `.agents/skills`. It is easy to lose track of them, keep old copies, or redo the same work in different tools.

skillkeep gives you one place to:

- see every skill on your machine
- bring a skill under management with one click
- keep skills in sync across clients and repos
- see clear usage numbers per skill and tool

No cloud is required. No single vendor locks you in.

## Parts of skillkeep

| Part | What it does |
|---|---|
| CLI + daemon | The local core. It scans, adopts, and syncs skills. It also serves a small HTTP API that the desktop app and TUI talk to. |
| Desktop app | The same dashboard, wrapped in a small native window for macOS or Windows. It starts and manages its own background daemon for you. |
| TUI | The same screens, but in a terminal. Good for SSH or quick keyboard use. |
| Hub (optional) | A Docker image or one-click Railway deploy. It lets you sync skills across multiple devices. It never scans your machine — you push to it. |
| AI assist (optional) | Off by default. With your own API key, it can suggest triage, description tuning, or duplicate-skill advice. |

## Quick start (local, no hub)

This is the fastest way to see the dashboard. The web dashboard is built from the `packages/ui` folder, so skillkeep needs to run from the cloned repo.

```sh
git clone https://github.com/George-RD/skillkeep && cd skillkeep
bun install
bun run --cwd packages/ui build
bun apps/cli/src/main.ts ui   # starts the daemon and opens the dashboard in your browser
```

From the same repo clone you can also run commands like:

```sh
bun apps/cli/src/main.ts scan   # find skills on your machine
bun apps/cli/src/main.ts sync   # sync the managed ones
```

## Keep it running

`skillkeep ui` starts the daemon for one browser session; it stops when you close your terminal. To keep it running in the background and have it maintain itself:

```sh
bun apps/cli/src/main.ts setup   # installs a login service (macOS launchd) that keeps the daemon alive
```

By default the daemon runs a maintenance pass (sync + drift check) every 24 hours; the interval and full automation (pull, auto-triage, push) are configurable in Settings, or via `setup --auto`. Run `bun apps/cli/src/main.ts cron --auto` any time for a one-off pass, or `setup --remove` to uninstall the service.

## Compiled binary for CLI and daemon only

You can also build a single compiled binary. It is useful for running `scan`, `sync`, and the API without needing the repo around. It does **not** include the web dashboard, because the dashboard is read from the `packages/ui` build files at runtime. `./skillkeep ui` from a compiled binary will show a "UI not built" page.

```sh
bun build --compile apps/cli/src/main.ts --outfile skillkeep
./skillkeep scan
./skillkeep sync
```

## Desktop app

The desktop app is the same dashboard you see in the browser, but it runs in its own native window. It also handles its own background daemon, so you do not need to start one yourself.

Download the latest `.dmg` for macOS or `.msi` for Windows from [Releases](../../releases). The installers are **unsigned in v1** — code-signing and notarisation will come later.

- **macOS**: Gatekeeper may block the app the first time. Right-click it and choose **Open**, or run `xattr -d com.apple.quarantine /Applications/skillkeep.app`.
- **Windows**: SmartScreen will show "unknown publisher". Click **More info**, then **Run anyway**.

## TUI

`@skillkeep/tui` is a workspace package inside the repo. It runs from a clone against an already-running daemon:

```sh
bun install
bun apps/cli/src/main.ts daemon &                 # or use a running desktop or CLI daemon
bun run --cwd apps/tui start                       # auto-reads the local daemon token; add --token <t> for a remote hub
```

Pass `--url` to point it at a remote hub instead of the local daemon. It defaults to `http://127.0.0.1:4517`.

## Self-hosting the hub

### Docker

```sh
docker run -v /path/to/data:/data -e SKILLKEEP_TOKEN=<random-32-byte-token> -p 4517:4517 ghcr.io/george-rd/skillkeep:latest
```

### Deploy on Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/George-RD/skillkeep)

Set `SKILLKEEP_TOKEN` when prompted, mount the `/data` volume (the template does this for you), then link your devices as below.

### Link a device

From each machine you want synced, either run:

```sh
bun apps/cli/src/main.ts connect http://<hub-host>:<port> --token <token> [--device <name>]
```

or open Settings → Hub in the dashboard and enter the same URL and token. `connect --remove` unlinks the device. Once linked, `cron --auto` (run manually or by the daemon's own scheduled maintenance — see "Keep it running" above) pushes this device's registry/usage snapshot to the hub and pulls back any skills that changed elsewhere.

## AI assist (bring your own key)

AI assist is off by default. Switch it on in Settings → AI assist: pick a provider (`anthropic`, `openai`, or `openrouter`) and a model.

Your API key is attached to each request by the local daemon. It is never saved — not in SQLite, not in config, not in logs. The desktop app stores it in the OS keychain. The CLI and hub read it from the `SKILLKEEP_AI_KEY` environment variable.

Every AI suggestion is a proposal. Nothing is written until you explicitly accept it. If no provider or key is set, the AI endpoints return `503` and the UI hides the AI buttons.

## Development

skillkeep is a Bun workspaces monorepo: `packages/core`, `packages/usage`, `packages/server`, `packages/ui`; and `apps/cli`, `apps/desktop`, `apps/tui`.

- `bun test` — run the full test suite.
- `bun run lint` — run the biome strict linter (zero warnings).

Conventions: TypeScript strict, async/await only, no `console.*` in committed code, British spelling in user-facing copy, and no new dependency without a one-line justification in the PR.

## License

MIT — see [LICENSE](./LICENSE).
