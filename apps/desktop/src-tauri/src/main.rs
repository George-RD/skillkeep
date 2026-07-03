// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Default port the sidecar binds unless it falls back to an ephemeral one,
/// recorded at `<dataDir>/daemon.port` when it does (contract: `apps/cli`'s
/// `skillkeep daemon` command).
const DEFAULT_PORT: u16 = 4517;

/// Short timeout for the pre-spawn "is a daemon already running?" probe.
const REUSE_PROBE_TIMEOUT: Duration = Duration::from_millis(500);

/// Post-spawn health poll: 20 attempts x 500ms = a 10s ceiling, per plan.
const HEALTH_POLL_ATTEMPTS: u32 = 20;
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(500);

/// Holds the sidecar child process, but only when *this* process spawned it.
/// Stays empty when we reused an already-running daemon (e.g. started by
/// `skillkeep daemon` from the CLI) -- in that case the shutdown handler
/// must never kill it.
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            // Runs synchronously on the main thread during startup, before any
            // window exists: blocking here (HTTP polling, thread::sleep) is
            // fine -- there is nothing visible yet to freeze. The one thing
            // that would deadlock on the main thread is `blocking_show()` on
            // the dialog plugin (it needs the event loop, which hasn't
            // started pumping yet), so failures use the non-blocking `show`
            // API instead and let `setup` return normally.
            match boot(&handle) {
                Ok((port, token)) => {
                    if let Err(e) = open_main_window(&handle, port, &token) {
                        show_fatal_dialog(
                            &handle,
                            format!("skillkeep failed to open its window: {e}"),
                        );
                    }
                }
                Err(message) => show_fatal_dialog(&handle, message),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building skillkeep");

    app.run(|app_handle, event| match event {
        // Normal path: the (only) window was closed by the user.
        RunEvent::WindowEvent {
            event: WindowEvent::CloseRequested { .. },
            ..
        } => kill_owned_sidecar(app_handle),
        // Belt-and-braces: app-level quit (e.g. Cmd+Q on macOS) can reach
        // `Exit` without a prior `WindowEvent::CloseRequested` -- also the
        // path taken when boot failed and no window was ever opened.
        RunEvent::Exit => kill_owned_sidecar(app_handle),
        _ => {}
    });
}

/// Runs the full boot sequence and returns the daemon's `(port, token)` on
/// success, or a human-readable message describing exactly what failed.
fn boot(app: &AppHandle) -> Result<(u16, String), String> {
    let dir = data_dir()?;

    let reuse_client = reqwest::blocking::Client::builder()
        .timeout(REUSE_PROBE_TIMEOUT)
        .build()
        .map_err(|e| format!("failed to build HTTP client: {e}"))?;

    if probe_healthz(&reuse_client, DEFAULT_PORT) {
        // A healthy daemon already answers on the default port (e.g. the
        // user started `skillkeep daemon` via the CLI) -- reuse it, do not
        // spawn a second sidecar, and skip straight to opening the window.
    } else {
        spawn_sidecar(app)?;

        let poll_client = reqwest::blocking::Client::builder()
            .timeout(HEALTH_POLL_INTERVAL)
            .build()
            .map_err(|e| format!("failed to build HTTP client: {e}"))?;

        let mut healthy = false;
        for _ in 0..HEALTH_POLL_ATTEMPTS {
            if probe_healthz(&poll_client, DEFAULT_PORT) {
                healthy = true;
                break;
            }
            std::thread::sleep(HEALTH_POLL_INTERVAL);
        }
        if !healthy {
            return Err(
                "skillkeep daemon failed to start (health check timed out after 10s)".to_string(),
            );
        }
    }

    // The daemon may have fallen back to an ephemeral port if 4517 was
    // already taken by something else; `daemon.port`, if present, is
    // authoritative.
    let port = read_port(&dir).unwrap_or(DEFAULT_PORT);
    let token = read_token(&dir)?;
    Ok((port, token))
}

/// Spawns `skillkeep daemon --port 4517` as a Tauri sidecar and records the
/// child handle in app state so it can be killed on shutdown.
fn spawn_sidecar(app: &AppHandle) -> Result<(), String> {
    let (mut rx, child) = app
        .shell()
        .sidecar("skillkeep")
        .map_err(|e| format!("failed to resolve the skillkeep sidecar: {e}"))?
        .args(["daemon", "--port", &DEFAULT_PORT.to_string()])
        .spawn()
        .map_err(|e| format!("failed to spawn the skillkeep daemon: {e}"))?;

    if let Some(state) = app.try_state::<SidecarState>() {
        *state.child.lock().expect("sidecar state mutex poisoned") = Some(child);
    }

    // Forward the sidecar's stdout/stderr to our own for debugging visibility;
    // the daemon logs its own startup/errors there.
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    eprint!("[skillkeep daemon] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprint!("[skillkeep daemon] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(err) => {
                    eprintln!("[skillkeep daemon] error: {err}");
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Kills the sidecar we spawned, if any. A reused, already-running daemon
/// (never recorded in `SidecarState`) is deliberately left untouched. Safe
/// to call more than once (e.g. both `CloseRequested` and `Exit` fire): the
/// child handle is taken on the first call, so later calls are no-ops.
fn kill_owned_sidecar(app: &AppHandle) {
    if let Some(state) = app.try_state::<SidecarState>() {
        if let Some(child) = state
            .child
            .lock()
            .expect("sidecar state mutex poisoned")
            .take()
        {
            let _ = child.kill();
        }
    }
}

/// `true` iff `GET http://127.0.0.1:<port>/healthz` returns 200 with a JSON
/// body whose `ok` field is `true`.
fn probe_healthz(client: &reqwest::blocking::Client, port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/healthz");
    match client.get(&url).send() {
        Ok(resp) if resp.status().is_success() => resp
            .json::<serde_json::Value>()
            .map(|body| body.get("ok").and_then(|v| v.as_bool()).unwrap_or(false))
            .unwrap_or(false),
        _ => false,
    }
}

/// Platform data directory, matching `@skillkeep/core`'s `dataDir()` exactly:
/// macOS `~/Library/Application Support/skillkeep`, Windows
/// `%APPDATA%\skillkeep`, Linux `$XDG_DATA_HOME/skillkeep` (else
/// `~/.local/share/skillkeep`). `dirs::data_dir()` resolves precisely those
/// three cases, so we defer to it rather than re-deriving the paths by hand.
fn data_dir() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|d| d.join("skillkeep"))
        .ok_or_else(|| "could not resolve the platform data directory".to_string())
}

fn read_port(dir: &Path) -> Option<u16> {
    fs::read_to_string(dir.join("daemon.port"))
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok())
}

fn read_token(dir: &Path) -> Result<String, String> {
    let path = dir.join("daemon.token");
    fs::read_to_string(&path)
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("could not read daemon token at {}: {e}", path.display()))
}

/// Opens the main window with `window.__SKILLKEEP__` injected before any page
/// script runs, so `packages/ui`'s app can read `{ port, token }` synchronously
/// on boot. Built via `WebviewWindowBuilder` (rather than a statically
/// declared window in tauri.conf.json) because port/token are only known
/// once the daemon is confirmed healthy.
fn open_main_window(app: &AppHandle, port: u16, token: &str) -> tauri::Result<()> {
    let payload = json!({ "port": port, "token": token });
    let script = format!("window.__SKILLKEEP__ = {};", payload);

    WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("skillkeep")
        .inner_size(1200.0, 800.0)
        .initialization_script(&script)
        .build()?;
    Ok(())
}

/// Native error dialog for boot-sequence failures (sidecar spawn failure,
/// health-check timeout, unreadable token file). Uses `tauri-plugin-dialog`'s
/// non-blocking `show` (never `blocking_show`, which the plugin's own docs
/// say must not run on the main thread -- it would deadlock the event loop)
/// so it can be called from `setup`, before the event loop starts pumping.
/// Exits via `AppHandle::exit` (not `std::process::exit`) once the user
/// dismisses it: that triggers `RunEvent::Exit` through the normal shutdown
/// path, so a sidecar spawned before the failure (e.g. spawn succeeded but
/// the health poll then timed out) still gets killed instead of orphaned.
fn show_fatal_dialog(app: &AppHandle, message: String) {
    let handle = app.clone();
    app.dialog()
        .message(message)
        .kind(MessageDialogKind::Error)
        .title("skillkeep")
        .show(move |_ok| handle.exit(1));
}
