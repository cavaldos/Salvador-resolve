//! MCP (Model Context Protocol) server that lets external coding agents
//! (Claude Code, Cursor, Codex, …) drive the running editor.
//!
//! Design: docs/architecture/adr/0003-mcp-agent-control.md
//! User guide: docs/agent/MCP.md
//!
//! Off by default. The webview starts it (`mcp_start`) when the user enabled
//! it in Settings, and registers the editor tool manifest
//! (`mcp_register_tools`). Tool calls are forwarded to the webview through the
//! `mcp://call` event and answered with `mcp_resolve_call`.

pub mod auth;
pub mod bridge;
pub mod protocol;
pub mod server;

use std::sync::Arc;

use keyring::Entry;
use parking_lot::RwLock;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

use bridge::{CallRequest, CallSink, McpBridge, ToolManifest};
use server::RunningServer;

pub const DEFAULT_PORT: u16 = 47821;
pub const CALL_EVENT: &str = "mcp://call";
const KEYRING_SERVICE: &str = "salvador-resolve";
const KEYRING_TOKEN_USER: &str = "mcp-token";

pub struct McpState {
    bridge: Arc<McpBridge>,
    /// Cached bearer token ("" until first loaded from the keychain).
    token: Arc<RwLock<String>>,
    server: tokio::sync::Mutex<Option<RunningServer>>,
}

impl McpState {
    pub fn new() -> Self {
        Self {
            bridge: Arc::new(McpBridge::new()),
            token: Arc::new(RwLock::new(String::new())),
            server: tokio::sync::Mutex::new(None),
        }
    }
}

impl Default for McpState {
    fn default() -> Self {
        Self::new()
    }
}

/// Emits calls to the main window. `emit_to` only queues an IPC message, so it
/// is safe from tokio workers (Invariant 16: no AppKit/Win32/GTK calls here).
struct AppSink(AppHandle);

impl CallSink for AppSink {
    fn dispatch(&self, req: &CallRequest) -> Result<(), String> {
        self.0
            .emit_to("main", CALL_EVENT, req)
            .map_err(|e| e.to_string())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub url: Option<String>,
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_TOKEN_USER).map_err(|e| e.to_string())
}

/// Load the token from the cache, else the keychain, else create and store one.
fn ensure_token(state: &McpState) -> Result<String, String> {
    {
        let cached = state.token.read();
        if !cached.is_empty() {
            return Ok(cached.clone());
        }
    }
    let entry = keyring_entry()?;
    let token = match entry.get_password() {
        Ok(t) if !t.is_empty() => t,
        Ok(_) | Err(keyring::Error::NoEntry) => {
            let t = auth::generate_token();
            entry
                .set_password(&t)
                .map_err(|e| format!("could not store MCP token in the OS keychain: {e}"))?;
            t
        }
        Err(e) => {
            return Err(format!(
                "could not read MCP token from the OS keychain: {e}"
            ))
        }
    };
    *state.token.write() = token.clone();
    Ok(token)
}

fn status_of(server: &Option<RunningServer>) -> McpStatus {
    match server {
        Some(s) => McpStatus {
            running: true,
            port: Some(s.port),
            url: Some(format!("http://127.0.0.1:{}/mcp", s.port)),
        },
        None => McpStatus {
            running: false,
            port: None,
            url: None,
        },
    }
}

/// Start the server (idempotent). Tries `port`, `port+1`, `port+2`.
#[tauri::command]
pub async fn mcp_start(
    app: AppHandle,
    state: State<'_, McpState>,
    port: Option<u16>,
) -> Result<McpStatus, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    if port < 1024 {
        return Err("port must be between 1024 and 65535".into());
    }
    let mut guard = state.server.lock().await;
    if let Some(running) = guard.as_ref() {
        if (port..=port.saturating_add(2)).contains(&running.port) {
            return Ok(status_of(&guard));
        }
        // Different port requested: restart.
        state.bridge.cancel_all();
        if let Some(old) = guard.take() {
            old.stop().await;
        }
    }
    ensure_token(&state)?;
    let candidates = [port, port.saturating_add(1), port.saturating_add(2)];
    let version = app.package_info().version.to_string();
    let sink: Arc<dyn CallSink> = Arc::new(AppSink(app.clone()));
    let running = server::start(
        &candidates,
        state.bridge.clone(),
        sink,
        state.token.clone(),
        version,
    )
    .await?;
    *guard = Some(running);
    Ok(status_of(&guard))
}

#[tauri::command]
pub async fn mcp_stop(state: State<'_, McpState>) -> Result<McpStatus, String> {
    let mut guard = state.server.lock().await;
    state.bridge.cancel_all();
    if let Some(running) = guard.take() {
        running.stop().await;
    }
    Ok(status_of(&guard))
}

#[tauri::command]
pub async fn mcp_status(state: State<'_, McpState>) -> Result<McpStatus, String> {
    Ok(status_of(&*state.server.lock().await))
}

/// Returns the bearer token so Settings can build client config snippets.
/// (Unlike AI provider keys, this token is meant to be pasted into agent configs.)
#[tauri::command]
pub fn mcp_get_token(state: State<'_, McpState>) -> Result<String, String> {
    ensure_token(&state)
}

/// Replace the token. Takes effect immediately; connected clients must be reconfigured.
#[tauri::command]
pub fn mcp_regenerate_token(state: State<'_, McpState>) -> Result<String, String> {
    let token = auth::generate_token();
    keyring_entry()?
        .set_password(&token)
        .map_err(|e| format!("could not store MCP token in the OS keychain: {e}"))?;
    *state.token.write() = token.clone();
    Ok(token)
}

#[tauri::command]
pub fn mcp_register_tools(
    state: State<'_, McpState>,
    tools: Vec<ToolManifest>,
) -> Result<(), String> {
    state.bridge.register_tools(tools);
    Ok(())
}

#[tauri::command]
pub fn mcp_resolve_call(
    state: State<'_, McpState>,
    call_id: String,
    result: Value,
) -> Result<bool, String> {
    Ok(state.bridge.resolve(&call_id, result))
}
