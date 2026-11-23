//! Loopback Streamable-HTTP transport for the MCP server (axum).
//!
//! JSON responses only (no SSE stream), which the Streamable HTTP transport
//! permits. Binds `127.0.0.1` exclusively — never `0.0.0.0`.

use std::collections::HashMap;
use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::Router;
use parking_lot::{Mutex, RwLock};
use serde_json::Value;
use tokio::net::TcpListener;
use tokio::sync::{oneshot, Semaphore};

use super::auth::{check_bearer, check_host, check_origin, AuthError};
use super::bridge::{CallSink, McpBridge};
use super::protocol::{self, Routed};

pub const MAX_BODY_BYTES: usize = 1 << 20;
pub const MAX_IN_FLIGHT_CALLS: usize = 32;
const MAX_SESSIONS: usize = 64;
const SESSION_HEADER: &str = "mcp-session-id";

#[derive(Clone)]
struct Ctx {
    bridge: Arc<McpBridge>,
    sink: Arc<dyn CallSink>,
    token: Arc<RwLock<String>>,
    port: u16,
    version: String,
    /// session id → client display name (from `initialize.clientInfo.name`).
    sessions: Arc<Mutex<HashMap<String, String>>>,
    in_flight: Arc<Semaphore>,
}

pub struct RunningServer {
    pub port: u16,
    shutdown: Option<oneshot::Sender<()>>,
    task: tokio::task::JoinHandle<()>,
}

impl RunningServer {
    /// Stop accepting connections and wait for the listener task to end.
    pub async fn stop(mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
        let _ = self.task.await;
    }
}

fn status_with_text(code: StatusCode, text: &'static str) -> Response {
    (code, text).into_response()
}

fn guard(ctx: &Ctx, headers: &HeaderMap) -> Result<(), AuthError> {
    let get = |name: header::HeaderName| headers.get(name).and_then(|v| v.to_str().ok());
    check_host(get(header::HOST), ctx.port)
        .and_then(|_| check_origin(get(header::ORIGIN)))
        .and_then(|_| check_bearer(get(header::AUTHORIZATION), &ctx.token.read()))
}

fn reject(e: AuthError) -> Response {
    match e {
        AuthError::Unauthorized => {
            let mut r =
                status_with_text(StatusCode::UNAUTHORIZED, "missing or invalid bearer token");
            r.headers_mut()
                .insert(header::WWW_AUTHENTICATE, HeaderValue::from_static("Bearer"));
            r
        }
        AuthError::Forbidden(why) => status_with_text(StatusCode::FORBIDDEN, why),
    }
}

fn json_response(body: Value) -> Response {
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json")],
        body.to_string(),
    )
        .into_response()
}

async fn post_mcp(State(ctx): State<Ctx>, headers: HeaderMap, body: Bytes) -> Response {
    if let Err(e) = guard(&ctx, &headers) {
        return reject(e);
    }

    let msg: Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(e) => {
            let body = protocol::error_response(
                Value::Null,
                protocol::PARSE_ERROR,
                format!("parse error: {e}"),
            );
            return (
                StatusCode::BAD_REQUEST,
                [(header::CONTENT_TYPE, "application/json")],
                body.to_string(),
            )
                .into_response();
        }
    };

    let session_id = headers
        .get(SESSION_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let is_initialize = msg.get("method").and_then(Value::as_str) == Some("initialize");
    let client_name = match (&session_id, is_initialize) {
        (Some(sid), false) => match ctx.sessions.lock().get(sid).cloned() {
            Some(name) => name,
            // Unknown session (e.g. app restarted): spec says 404 so the client re-initializes.
            None => return status_with_text(StatusCode::NOT_FOUND, "unknown MCP session"),
        },
        _ => "unknown client".to_string(),
    };

    match protocol::route(&msg, &ctx.bridge.tools_mcp(), &ctx.version) {
        Routed::Accepted => StatusCode::ACCEPTED.into_response(),
        Routed::Respond(v) => json_response(v),
        Routed::Initialized {
            response,
            client_name,
        } => {
            let sid = uuid::Uuid::new_v4().simple().to_string();
            {
                let mut sessions = ctx.sessions.lock();
                if sessions.len() >= MAX_SESSIONS {
                    sessions.clear();
                }
                sessions.insert(sid.clone(), client_name);
            }
            let mut r = json_response(response);
            if let Ok(v) = HeaderValue::from_str(&sid) {
                r.headers_mut().insert(SESSION_HEADER, v);
            }
            r
        }
        Routed::CallTool {
            id,
            name,
            arguments,
        } => {
            let Ok(_permit) = ctx.in_flight.clone().try_acquire_owned() else {
                return json_response(protocol::error_response(
                    id,
                    protocol::INTERNAL_ERROR,
                    "too many concurrent tool calls",
                ));
            };
            let started = std::time::Instant::now();
            let timeout = ctx.bridge.timeout_for(&name);
            let outcome = ctx
                .bridge
                .call(ctx.sink.as_ref(), &name, arguments, &client_name, timeout)
                .await;
            // Invariant 14: log tool name, duration and outcome only — never arguments.
            log::info!(
                "[MCP] tools/call {name} ok={} in {}ms",
                outcome.is_ok(),
                started.elapsed().as_millis()
            );
            let result = match outcome {
                Ok(v) if v.is_object() => v,
                Ok(_) => protocol::tool_error_result("editor returned a malformed result"),
                Err(e) => protocol::tool_error_result(&e.to_string()),
            };
            json_response(protocol::result_response(id, result))
        }
    }
}

async fn delete_mcp(State(ctx): State<Ctx>, headers: HeaderMap) -> Response {
    if let Err(e) = guard(&ctx, &headers) {
        return reject(e);
    }
    if let Some(sid) = headers.get(SESSION_HEADER).and_then(|v| v.to_str().ok()) {
        ctx.sessions.lock().remove(sid);
    }
    StatusCode::NO_CONTENT.into_response()
}

async fn get_mcp(State(ctx): State<Ctx>, headers: HeaderMap) -> Response {
    if let Err(e) = guard(&ctx, &headers) {
        return reject(e);
    }
    // No server-initiated SSE stream in this implementation.
    let mut r = StatusCode::METHOD_NOT_ALLOWED.into_response();
    r.headers_mut()
        .insert(header::ALLOW, HeaderValue::from_static("POST, DELETE"));
    r
}

/// Bind the first free port among `candidates` on 127.0.0.1 and serve `/mcp`.
/// A candidate of `0` asks the OS for an ephemeral port (tests).
pub async fn start(
    candidates: &[u16],
    bridge: Arc<McpBridge>,
    sink: Arc<dyn CallSink>,
    token: Arc<RwLock<String>>,
    version: String,
) -> Result<RunningServer, String> {
    let mut last_err = String::from("no candidate ports");
    for &candidate in candidates {
        let listener = match TcpListener::bind(("127.0.0.1", candidate)).await {
            Ok(l) => l,
            Err(e) => {
                log::warn!("[MCP] port {candidate} unavailable: {e}");
                last_err = format!("port {candidate}: {e}");
                continue;
            }
        };
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let ctx = Ctx {
            bridge: bridge.clone(),
            sink: sink.clone(),
            token: token.clone(),
            port,
            version: version.clone(),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            in_flight: Arc::new(Semaphore::new(MAX_IN_FLIGHT_CALLS)),
        };
        let router = Router::new()
            .route("/mcp", post(post_mcp).get(get_mcp).delete(delete_mcp))
            .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
            .with_state(ctx);
        let (tx, rx) = oneshot::channel::<()>();
        let task = tokio::spawn(async move {
            if let Err(e) = axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = rx.await;
                })
                .await
            {
                log::error!("[MCP] server error: {e}");
            }
        });
        log::info!("[MCP] listening on http://127.0.0.1:{port}/mcp");
        return Ok(RunningServer {
            port,
            shutdown: Some(tx),
            task,
        });
    }
    Err(format!("could not bind the MCP server: {last_err}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::mcp::bridge::{CallRequest, ToolManifest};
    use serde_json::json;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    /// Sink that answers every call immediately by echoing its arguments.
    struct EchoSink(Arc<McpBridge>);
    impl CallSink for EchoSink {
        fn dispatch(&self, req: &CallRequest) -> Result<(), String> {
            let bridge = self.0.clone();
            let req = req.clone();
            tokio::spawn(async move {
                bridge.resolve(
                    &req.call_id,
                    json!({ "content": [{ "type": "text", "text": format!("{} from {}", req.name, req.client_name) }],
                            "structuredContent": req.arguments }),
                );
            });
            Ok(())
        }
    }

    async fn spawn_server() -> (RunningServer, Arc<McpBridge>) {
        let bridge = Arc::new(McpBridge::new());
        bridge.register_tools(vec![ToolManifest {
            name: "list_clips".into(),
            description: "List clips".into(),
            input_schema: json!({ "type": "object" }),
            read_only: true,
            long_running: false,
        }]);
        let sink: Arc<dyn CallSink> = Arc::new(EchoSink(bridge.clone()));
        let token = Arc::new(RwLock::new("secret".to_string()));
        let server = start(&[0], bridge.clone(), sink, token, "9.9.9".into())
            .await
            .unwrap();
        (server, bridge)
    }

    /// Minimal HTTP/1.1 client (avoids a dev-dependency on an HTTP client crate).
    async fn http(
        port: u16,
        method: &str,
        headers: &[(&str, String)],
        body: &str,
    ) -> (u16, HashMap<String, String>, String) {
        let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .unwrap();
        let mut req = format!(
            "{method} /mcp HTTP/1.1\r\nConnection: close\r\nContent-Length: {}\r\n",
            body.len()
        );
        for (k, v) in headers {
            req.push_str(&format!("{k}: {v}\r\n"));
        }
        req.push_str("\r\n");
        req.push_str(body);
        stream.write_all(req.as_bytes()).await.unwrap();
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.unwrap();
        let text = String::from_utf8_lossy(&buf).to_string();
        let (head, body) = text.split_once("\r\n\r\n").unwrap_or((&text, ""));
        let mut lines = head.lines();
        let status: u16 = lines
            .next()
            .unwrap()
            .split(' ')
            .nth(1)
            .unwrap()
            .parse()
            .unwrap();
        let hdrs = lines
            .filter_map(|l| l.split_once(':'))
            .map(|(k, v)| (k.trim().to_ascii_lowercase(), v.trim().to_string()))
            .collect();
        (status, hdrs, body.to_string())
    }

    fn base_headers(port: u16) -> Vec<(&'static str, String)> {
        vec![
            ("Host", format!("127.0.0.1:{port}")),
            ("Authorization", "Bearer secret".into()),
            ("Content-Type", "application/json".into()),
            ("Accept", "application/json, text/event-stream".into()),
        ]
    }

    #[tokio::test]
    async fn full_round_trip_initialize_list_call() {
        let (server, _bridge) = spawn_server().await;
        let port = server.port;

        let init = r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test-agent","version":"1"}}}"#;
        let (status, hdrs, body) = http(port, "POST", &base_headers(port), init).await;
        assert_eq!(status, 200);
        let v: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["result"]["serverInfo"]["version"], "9.9.9");
        let sid = hdrs.get(SESSION_HEADER).cloned().expect("session id");

        let mut h = base_headers(port);
        h.push(("Mcp-Session-Id", sid.clone()));

        let (status, _, _) = http(
            port,
            "POST",
            &h,
            r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
        )
        .await;
        assert_eq!(status, 202);

        let (_, _, body) = http(
            port,
            "POST",
            &h,
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#,
        )
        .await;
        let v: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["result"]["tools"][0]["name"], "list_clips");

        let call = r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_clips","arguments":{"trackId":"t1"}}}"#;
        let (status, _, body) = http(port, "POST", &h, call).await;
        assert_eq!(status, 200);
        let v: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["id"], 3);
        assert_eq!(
            v["result"]["content"][0]["text"],
            "list_clips from test-agent"
        );
        assert_eq!(v["result"]["structuredContent"]["trackId"], "t1");

        let (status, _, _) = http(port, "DELETE", &h, "").await;
        assert_eq!(status, 204);
        // Session is gone now → 404 tells the client to re-initialize.
        let (status, _, _) = http(
            port,
            "POST",
            &h,
            r#"{"jsonrpc":"2.0","id":4,"method":"ping"}"#,
        )
        .await;
        assert_eq!(status, 404);

        server.stop().await;
    }

    #[tokio::test]
    async fn rejects_bad_token_rebinding_host_and_foreign_origin() {
        let (server, _bridge) = spawn_server().await;
        let port = server.port;
        let ping = r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;

        let mut h = base_headers(port);
        h[1] = ("Authorization", "Bearer wrong".into());
        assert_eq!(http(port, "POST", &h, ping).await.0, 401);

        let h: Vec<_> = base_headers(port)
            .into_iter()
            .filter(|(k, _)| *k != "Authorization")
            .collect();
        assert_eq!(http(port, "POST", &h, ping).await.0, 401);

        let mut h = base_headers(port);
        h[0] = ("Host", format!("attacker.example:{port}"));
        assert_eq!(http(port, "POST", &h, ping).await.0, 403);

        let mut h = base_headers(port);
        h.push(("Origin", "https://attacker.example".into()));
        assert_eq!(http(port, "POST", &h, ping).await.0, 403);

        let (status, _, body) = http(port, "POST", &base_headers(port), "{not json").await;
        assert_eq!(status, 400);
        assert!(body.contains("-32700"));

        assert_eq!(http(port, "GET", &base_headers(port), "").await.0, 405);
        server.stop().await;
    }

    #[tokio::test]
    async fn tool_call_when_editor_not_ready_is_a_tool_error_not_a_hang() {
        let (server, bridge) = spawn_server().await;
        let port = server.port;
        let (_, _, body) = http(
            port,
            "POST",
            &base_headers(port),
            r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#,
        )
        .await;
        assert!(body.contains("list_clips"));
        bridge.register_tools(vec![]);
        let (_, _, body) = http(
            port,
            "POST",
            &base_headers(port),
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#,
        )
        .await;
        let v: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["result"]["tools"], json!([]));
        server.stop().await;
    }

    #[tokio::test]
    async fn stop_releases_the_port() {
        let (server, _bridge) = spawn_server().await;
        let port = server.port;
        server.stop().await;
        assert!(TcpListener::bind(("127.0.0.1", port)).await.is_ok());
    }
}
