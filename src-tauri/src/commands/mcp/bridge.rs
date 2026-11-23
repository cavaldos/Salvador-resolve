//! Rust ⇄ webview bridge for MCP tool calls.
//!
//! The editor tools live in the webview (they act on the Zustand stores and
//! go through `historyStore`). Rust only forwards: it emits `mcp://call` to
//! the main window and parks the HTTP request on a oneshot until the webview
//! answers with `mcp_resolve_call`, the call times out, or the server stops.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::oneshot;

/// Default wait for ordinary tools (includes time the user spends on an approval prompt).
pub const DEFAULT_CALL_TIMEOUT: Duration = Duration::from_secs(120);
/// Wait for tools the webview flags as long-running (export, captions).
pub const LONG_CALL_TIMEOUT: Duration = Duration::from_secs(3600);

/// One tool as registered by the webview.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ToolManifest {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
    #[serde(default)]
    pub read_only: bool,
    #[serde(default)]
    pub long_running: bool,
}

impl ToolManifest {
    /// MCP `Tool` shape returned from `tools/list`.
    pub fn to_mcp(&self) -> Value {
        json!({
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
            "annotations": { "readOnlyHint": self.read_only },
        })
    }
}

/// Payload of the `mcp://call` event.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CallRequest {
    pub call_id: String,
    pub name: String,
    pub arguments: Value,
    pub client_name: String,
}

/// Delivers a call to the webview. Implemented over `AppHandle` in production
/// and by a stub in tests.
pub trait CallSink: Send + Sync {
    fn dispatch(&self, req: &CallRequest) -> Result<(), String>;
}

#[derive(Debug, PartialEq)]
pub enum CallError {
    NotReady,
    Dispatch(String),
    Timeout,
    Cancelled,
}

impl std::fmt::Display for CallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CallError::NotReady => write!(
                f,
                "Salvador Resolve is not ready: open the editor window (and a project) first"
            ),
            CallError::Dispatch(e) => write!(f, "could not reach the editor window: {e}"),
            CallError::Timeout => write!(f, "the editor did not answer in time"),
            CallError::Cancelled => write!(
                f,
                "the call was cancelled (server stopped or editor reloaded)"
            ),
        }
    }
}

#[derive(Default)]
pub struct McpBridge {
    tools: RwLock<Vec<ToolManifest>>,
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    seq: AtomicU64,
}

impl McpBridge {
    pub fn new() -> Self {
        Self::default()
    }

    /// Replace the tool manifest. An empty list means "not ready" and also
    /// cancels in-flight calls (the webview is unmounting/reloading).
    pub fn register_tools(&self, tools: Vec<ToolManifest>) {
        let clearing = tools.is_empty();
        *self.tools.write() = tools;
        if clearing {
            self.cancel_all();
        }
    }

    pub fn tools_mcp(&self) -> Vec<Value> {
        self.tools.read().iter().map(ToolManifest::to_mcp).collect()
    }

    pub fn timeout_for(&self, name: &str) -> Duration {
        let long = self
            .tools
            .read()
            .iter()
            .any(|t| t.name == name && t.long_running);
        if long {
            LONG_CALL_TIMEOUT
        } else {
            DEFAULT_CALL_TIMEOUT
        }
    }

    pub fn pending_count(&self) -> usize {
        self.pending.lock().len()
    }

    /// Forward one call and wait for the webview's MCP `CallToolResult`.
    pub async fn call(
        &self,
        sink: &dyn CallSink,
        name: &str,
        arguments: Value,
        client_name: &str,
        timeout: Duration,
    ) -> Result<Value, CallError> {
        if self.tools.read().is_empty() {
            return Err(CallError::NotReady);
        }
        let call_id = format!("mcp-{}", self.seq.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = oneshot::channel();
        self.pending.lock().insert(call_id.clone(), tx);

        let req = CallRequest {
            call_id: call_id.clone(),
            name: name.to_string(),
            arguments,
            client_name: client_name.to_string(),
        };
        if let Err(e) = sink.dispatch(&req) {
            self.pending.lock().remove(&call_id);
            return Err(CallError::Dispatch(e));
        }

        let outcome = match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(v)) => Ok(v),
            Ok(Err(_)) => Err(CallError::Cancelled),
            Err(_) => Err(CallError::Timeout),
        };
        // Always clear our slot (timeout path leaves it behind otherwise).
        self.pending.lock().remove(&call_id);
        outcome
    }

    /// Webview answer. Returns false for unknown/late ids (ignored).
    pub fn resolve(&self, call_id: &str, result: Value) -> bool {
        match self.pending.lock().remove(call_id) {
            Some(tx) => tx.send(result).is_ok(),
            None => false,
        }
    }

    /// Fail every in-flight call (server stop / webview reload).
    pub fn cancel_all(&self) {
        // Dropping the senders wakes receivers with RecvError → CallError::Cancelled.
        self.pending.lock().clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    struct RecordingSink(Mutex<Vec<CallRequest>>);
    impl CallSink for RecordingSink {
        fn dispatch(&self, req: &CallRequest) -> Result<(), String> {
            self.0.lock().push(req.clone());
            Ok(())
        }
    }
    struct FailingSink;
    impl CallSink for FailingSink {
        fn dispatch(&self, _: &CallRequest) -> Result<(), String> {
            Err("no window".into())
        }
    }

    fn manifest(name: &str, long_running: bool) -> ToolManifest {
        ToolManifest {
            name: name.into(),
            description: "d".into(),
            input_schema: json!({ "type": "object" }),
            read_only: false,
            long_running,
        }
    }

    fn ready_bridge() -> Arc<McpBridge> {
        let b = Arc::new(McpBridge::new());
        b.register_tools(vec![
            manifest("list_clips", false),
            manifest("start_export", true),
        ]);
        b
    }

    #[tokio::test]
    async fn call_without_manifest_is_not_ready() {
        let b = McpBridge::new();
        let sink = RecordingSink(Mutex::new(vec![]));
        let r = b
            .call(&sink, "list_clips", json!({}), "c", Duration::from_secs(1))
            .await;
        assert_eq!(r, Err(CallError::NotReady));
        assert!(sink.0.lock().is_empty());
    }

    #[tokio::test]
    async fn resolve_before_timeout_returns_result() {
        let b = ready_bridge();
        let sink = Arc::new(RecordingSink(Mutex::new(vec![])));
        let (b2, s2) = (b.clone(), sink.clone());
        let task = tokio::spawn(async move {
            b2.call(
                &*s2,
                "list_clips",
                json!({ "a": 1 }),
                "claude",
                Duration::from_secs(5),
            )
            .await
        });
        // Wait until dispatched.
        let req = loop {
            if let Some(r) = sink.0.lock().first().cloned() {
                break r;
            }
            tokio::task::yield_now().await;
        };
        assert_eq!(req.name, "list_clips");
        assert_eq!(req.client_name, "claude");
        assert!(b.resolve(&req.call_id, json!({ "content": [] })));
        assert_eq!(task.await.unwrap(), Ok(json!({ "content": [] })));
        assert_eq!(b.pending_count(), 0);
    }

    #[tokio::test]
    async fn timeout_clears_pending_and_late_resolve_is_ignored() {
        let b = ready_bridge();
        let sink = RecordingSink(Mutex::new(vec![]));
        let r = b
            .call(
                &sink,
                "list_clips",
                json!({}),
                "c",
                Duration::from_millis(20),
            )
            .await;
        assert_eq!(r, Err(CallError::Timeout));
        assert_eq!(b.pending_count(), 0);
        let id = sink.0.lock()[0].call_id.clone();
        assert!(!b.resolve(&id, json!({})));
    }

    #[tokio::test]
    async fn dispatch_failure_does_not_leak_pending() {
        let b = ready_bridge();
        let r = b
            .call(
                &FailingSink,
                "list_clips",
                json!({}),
                "c",
                Duration::from_secs(1),
            )
            .await;
        assert!(matches!(r, Err(CallError::Dispatch(_))));
        assert_eq!(b.pending_count(), 0);
    }

    #[tokio::test]
    async fn cancel_all_and_clearing_manifest_fail_in_flight_calls() {
        let b = ready_bridge();
        let sink = Arc::new(RecordingSink(Mutex::new(vec![])));
        let (b2, s2) = (b.clone(), sink.clone());
        let task = tokio::spawn(async move {
            b2.call(&*s2, "list_clips", json!({}), "c", Duration::from_secs(5))
                .await
        });
        while b.pending_count() == 0 {
            tokio::task::yield_now().await;
        }
        b.register_tools(vec![]); // webview unmounted
        assert_eq!(task.await.unwrap(), Err(CallError::Cancelled));
        assert!(b.tools_mcp().is_empty());
    }

    #[test]
    fn long_running_tools_get_long_timeout() {
        let b = ready_bridge();
        assert_eq!(b.timeout_for("start_export"), LONG_CALL_TIMEOUT);
        assert_eq!(b.timeout_for("list_clips"), DEFAULT_CALL_TIMEOUT);
        assert_eq!(b.timeout_for("missing"), DEFAULT_CALL_TIMEOUT);
    }

    #[test]
    fn manifest_maps_to_mcp_tool_shape() {
        let mut m = manifest("list_clips", false);
        m.read_only = true;
        let v = m.to_mcp();
        assert_eq!(v["inputSchema"]["type"], "object");
        assert_eq!(v["annotations"]["readOnlyHint"], true);
    }
}
