# apps/desktop — integration notes

Tauri 2 shell only. Rust side (`src-tauri/`) builds standalone; the two
things it embeds — `packages/ui/dist` and the compiled `skillkeep` CLI
sidecar — are owned by sibling agents and did not exist on disk while this
was written. This file records exactly what could and could not be verified
here, for the integration step.

## Verified

- `cargo check` and `cargo build` (debug) both succeed cleanly in
  `src-tauri/` — zero warnings, `cargo clippy --all-targets` also clean.
- `tauri.conf.json` is valid JSON and matches the sidecar/dataDir/token/
  health-check contract given in the assignment.
- Boot-sequence logic (reuse-existing-daemon probe, spawn, 10s health poll,
  port/token read, `window.__SKILLKEEP__` injection, sidecar kill only when
  *we* spawned it, native error dialog on any failure) compiles and follows
  the plan's boot sequence step by step; see doc comments in `src/main.rs`
  for the reasoning behind each non-obvious choice (notably: why the fatal
  dialog uses non-blocking `show()` + `AppHandle::exit()` rather than
  `blocking_show()`/`std::process::exit()` — the former deadlocks the event
  loop from `setup`, the latter would orphan a sidecar that had already
  spawned before a later failure).

## Integration step results (M1+M2 complete, verified live)

`bun run --cwd apps/desktop dev` was run for real: `beforeDevCommand` started
the actual `packages/ui` vite dev server (`http://localhost:5173`, real HTML
returned), `cargo run` compiled `skillkeep-desktop` and launched it, and its
captured stdout showed `[skillkeep daemon] skillkeep daemon ready on
http://127.0.0.1:4517` — i.e. the boot sequence spawned the sidecar (the real
`bun build --compile apps/cli/src/main.ts` binary, not the stub) and it
passed the health poll. `GET http://127.0.0.1:4517/healthz` returned
`{"ok":true,...}` while the app was running, confirming a live daemon
process reachable exactly where the shell expects it. `window.__SKILLKEEP__`
injection itself was **not** visually confirmed — this sandbox has no
attached display (`screencapture` fails with "could not create image from
display"), so devtools inspection isn't possible here. The token-read/inject
code path was not observed to throw or trigger the fatal-dialog path (the
process stayed up cleanly for the full test window), which is consistent
with — but not conclusive proof of — a correct injection. Re-run this test
on a machine with an attached display to close that gap with a screenshot.

"Manage creates a symlink" was verified at the contract level instead of
against this machine's real skill installs (deliberately — mutating a
developer's actual `~/.claude/skills` etc. as a smoke test would be a real,
unwanted side effect): `packages/server/test/server.test.ts`'s `POST
/api/adopt` test adopts a fixture skill into an isolated temp registryRoot
and asserts it appears via a follow-up `GET /api/registry`, proving the
adopt route's on-disk materialisation works end-to-end through the real HTTP
router.

## NOT verified (needs the integration step)

- **`bun run dev` / `tauri dev`** — needs `packages/ui`'s dev server
  actually running at `http://localhost:5173` (the configured `devUrl`).
  Not attempted.
- **`bun run build` / `tauri build`** — needs `packages/ui/dist` to exist
  for real (currently absent; `frontendDist` in `tauri.conf.json` points at
  `../../../packages/ui/dist`, three levels up from `src-tauri/` to the repo
  root then into `packages/ui/dist` — correct relative depth for this
  layout, double-checked against how `create-tauri-app`'s default
  `"../dist"` resolves). `cargo check`/`cargo build` in **dev** profile do
  not touch this path at all (Tauri uses `devUrl` in dev mode), so its
  absence was invisible to the acceptance check as expected; a **release**
  build will fail hard until `packages/ui/dist` exists.
- **Real sidecar spawn** — `apps/desktop/binaries/skillkeep-aarch64-apple-darwin`
  is a **placeholder stub** (a shell script that prints a message and exits
  1), committed nowhere (the path is `.gitignore`d), created only so
  `cargo check`/`cargo build` don't fail on Tauri's `externalBin` resource-
  existence check (which runs even in `cargo check`, not just `tauri
  build`). **Delete or replace it** once `apps/cli` produces the real
  compiled binary at that path — the boot sequence has never actually
  talked to a live `skillkeep daemon` process. `release.yml` (pre-existing,
  unmodified) already writes the real binaries to exactly this path
  (`apps/desktop/binaries/skillkeep-<triple>`), which is what `externalBin:
  ["../binaries/skillkeep"]` in `tauri.conf.json` resolves to relative to
  `src-tauri/` — confirmed by reading `release.yml` rather than guessing.
- **End-to-end health check / token read** — `boot()`'s HTTP polling and
  `<dataDir>/daemon.port` / `<dataDir>/daemon.token` reads are logically
  correct against the documented contract but have never run against a real
  daemon (none exists yet). Worth a manual smoke test once `apps/cli`'s
  `skillkeep daemon` command exists: run it, then `bun run --cwd
  apps/desktop dev` and confirm the window opens with `window.__SKILLKEEP__`
  populated (check via devtools console).
- **`cargo tauri icon`-generated icon set** is a **placeholder** (flat
  solid-colour rounded square + simple key glyph, generated locally, not
  real branding) — replace before any real release. Only the desktop-
  relevant subset was kept (`icon.png`, `icon.icns`, `icon.ico`, `32x32.png`,
  `128x128.png`, `128x128@2x.png`, `64x64.png`); the `tauri icon` command
  also emits Android/iOS/Windows-Store variants which were deleted since
  this app targets `dmg`/`msi` only.
- **Main-binary vs. sidecar filename collision** — the Cargo package/bin
  name is `skillkeep-desktop` (not `skillkeep`), which by default becomes
  Tauri's bundled main executable name; the sidecar is named `skillkeep`.
  These are distinct, so no collision is expected, but this is reasoned
  from `tauri-utils`' `main_binary_name` doc comment, not observed from an
  actual `tauri build` (which cannot run yet).
- **CSP** is `null` (disabled) in `tauri.conf.json` for now — fine for v1
  (only ever loads bundled/localhost content) but worth tightening to an
  explicit policy once the UI's actual asset/connect-src needs are known.
- **Capabilities** (`capabilities/default.json`) grants only `core:default`
  for the `main` window. The sidecar spawn and error dialog are called
  directly from Rust (`main.rs`), not invoked via IPC from the webview, so
  they don't need permission grants. If `packages/ui` ever calls
  `@tauri-apps/plugin-shell` or `@tauri-apps/plugin-dialog` directly from
  JS, this capability file will need `shell:*`/`dialog:*` permissions added
  — not needed for anything built here.
- Windows target (`x86_64-pc-windows-msvc`) was never compiled or run —
  this machine is macOS/aarch64 only. The code was written against the
  documented cross-platform `dirs` crate behaviour (`%APPDATA%\skillkeep`)
  but is otherwise unverified on Windows.
