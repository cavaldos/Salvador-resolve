//! Pure JSON-RPC 2.0 / MCP message routing (no I/O).
//!
//! Implements the subset of MCP that Salvador Resolve serves over stateless
//! Streamable HTTP: `initialize`, `ping`, `tools/list`, `tools/call` plus the
//! `notifications/*` the client may send. Tool execution itself is not done
//! here — `route` returns [`Routed::CallTool`] and the HTTP layer forwards it to
//! the webview bridge.

use serde_json::{json, Value};

pub const SERVER_NAME: &str = "salvador-resolve";
pub const LATEST_PROTOCOL_VERSION: &str = "2025-06-18";
pub const SUPPORTED_PROTOCOL_VERSIONS: &[&str] = &["2025-06-18", "2025-03-26", "2024-11-05"];

pub const PARSE_ERROR: i64 = -32700;
pub const INVALID_REQUEST: i64 = -32600;
pub const METHOD_NOT_FOUND: i64 = -32601;
pub const INVALID_PARAMS: i64 = -32602;
pub const INTERNAL_ERROR: i64 = -32603;

/// What the HTTP layer must do with one incoming message.
#[derive(Debug, PartialEq)]
pub enum Routed {
    /// Send this JSON-RPC response body.
    Respond(Value),
    /// Notification or client response: reply `202 Accepted` with no body.
    Accepted,
    /// `initialize` succeeded; respond with `response` and remember the client name.
    Initialized {
        response: Value,
        client_name: String,
    },
    /// Forward a `tools/call` to the bridge, then answer request `id`.
    CallTool {
        id: Value,
        name: String,
        arguments: Value,
    },
}

pub fn error_response(id: Value, code: i64, message: impl Into<String>) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message.into() } })
}

pub fn result_response(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

/// Negotiate the protocol version: echo the client's version if we support it,
/// otherwise offer our latest (the client decides whether to continue).
pub fn negotiate_version(requested: Option<&str>) -> &'static str {
    requested
        .and_then(|r| {
            SUPPORTED_PROTOCOL_VERSIONS
                .iter()
                .find(|v| **v == r)
                .copied()
        })
        .unwrap_or(LATEST_PROTOCOL_VERSION)
}

const INSTRUCTIONS: &str = "Controls the running Salvador Resolve video editor. \
Times are in seconds on the timeline. Call get_project_info and list_clips first to get ids. \
Every edit is one undo step in the editor; destructive tools may wait for the user to approve them in the app.";

/// Route one parsed JSON value. `tools` is the current tool manifest
/// (already in MCP `Tool` shape).
pub fn route(msg: &Value, tools: &[Value], server_version: &str) -> Routed {
    let Some(obj) = msg.as_object() else {
        // Arrays (JSON-RPC batches) were removed in MCP 2025-06-18.
        return Routed::Respond(error_response(
            Value::Null,
            INVALID_REQUEST,
            "expected a single JSON-RPC object",
        ));
    };
    if obj.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
        let id = obj.get("id").cloned().unwrap_or(Value::Null);
        return Routed::Respond(error_response(
            id,
            INVALID_REQUEST,
            "jsonrpc must be \"2.0\"",
        ));
    }

    let method = obj.get("method").and_then(Value::as_str);
    let id = obj.get("id").cloned();

    let Some(method) = method else {
        // A response from the client (we never send requests) — acknowledge.
        return if obj.contains_key("result") || obj.contains_key("error") {
            Routed::Accepted
        } else {
            Routed::Respond(error_response(
                id.unwrap_or(Value::Null),
                INVALID_REQUEST,
                "missing method",
            ))
        };
    };

    // Notifications carry no id and never get a response body.
    let Some(id) = id else {
        return Routed::Accepted;
    };
    if !(id.is_string() || id.is_number()) {
        return Routed::Respond(error_response(
            Value::Null,
            INVALID_REQUEST,
            "id must be a string or number",
        ));
    }

    let params = obj.get("params").cloned().unwrap_or_else(|| json!({}));

    match method {
        "initialize" => {
            let requested = params.get("protocolVersion").and_then(Value::as_str);
            let client_name = params
                .pointer("/clientInfo/name")
                .and_then(Value::as_str)
                .map(sanitize_client_name)
                .unwrap_or_else(|| "unknown client".to_string());
            let response = result_response(
                id,
                json!({
                    "protocolVersion": negotiate_version(requested),
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": SERVER_NAME, "title": "Salvador Resolve", "version": server_version },
                    "instructions": INSTRUCTIONS,
                }),
            );
            Routed::Initialized {
                response,
                client_name,
            }
        }
        "ping" => Routed::Respond(result_response(id, json!({}))),
        "tools/list" => Routed::Respond(result_response(id, json!({ "tools": tools }))),
        "tools/call" => {
            let Some(name) = params.get("name").and_then(Value::as_str) else {
                return Routed::Respond(error_response(
                    id,
                    INVALID_PARAMS,
                    "tools/call requires params.name",
                ));
            };
            if !tools
                .iter()
                .any(|t| t.get("name").and_then(Value::as_str) == Some(name))
            {
                return Routed::Respond(error_response(
                    id,
                    INVALID_PARAMS,
                    format!("unknown tool: {name}"),
                ));
            }
            let arguments = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            if !arguments.is_object() {
                return Routed::Respond(error_response(
                    id,
                    INVALID_PARAMS,
                    "arguments must be an object",
                ));
            }
            Routed::CallTool {
                id,
                name: name.to_string(),
                arguments,
            }
        }
        other => Routed::Respond(error_response(
            id,
            METHOD_NOT_FOUND,
            format!("method not found: {other}"),
        )),
    }
}

/// Client names are shown in the approval prompt: keep them short and printable.
pub fn sanitize_client_name(raw: &str) -> String {
    let cleaned: String = raw.chars().filter(|c| !c.is_control()).take(64).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "unknown client".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Wrap a bridge failure (timeout, editor not ready…) as an MCP tool error result,
/// so the agent sees the reason instead of a transport error.
pub fn tool_error_result(message: &str) -> Value {
    json!({ "content": [{ "type": "text", "text": message }], "isError": true })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tools() -> Vec<Value> {
        vec![
            json!({ "name": "list_clips", "description": "d", "inputSchema": { "type": "object" } }),
        ]
    }

    #[test]
    fn initialize_echoes_supported_version_and_client_name() {
        let msg = json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": { "protocolVersion": "2025-03-26", "clientInfo": { "name": "claude-code\n", "version": "1" } } });
        match route(&msg, &tools(), "0.1.0") {
            Routed::Initialized {
                response,
                client_name,
            } => {
                assert_eq!(response["result"]["protocolVersion"], "2025-03-26");
                assert_eq!(response["result"]["serverInfo"]["name"], SERVER_NAME);
                assert_eq!(client_name, "claude-code");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn initialize_with_unknown_version_offers_latest() {
        assert_eq!(
            negotiate_version(Some("1999-01-01")),
            LATEST_PROTOCOL_VERSION
        );
        assert_eq!(negotiate_version(None), LATEST_PROTOCOL_VERSION);
    }

    #[test]
    fn notification_is_accepted_without_body() {
        let msg = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
        assert_eq!(route(&msg, &tools(), "0"), Routed::Accepted);
    }

    #[test]
    fn client_response_is_accepted() {
        let msg = json!({ "jsonrpc": "2.0", "id": 4, "result": {} });
        assert_eq!(route(&msg, &tools(), "0"), Routed::Accepted);
    }

    #[test]
    fn batch_is_rejected() {
        let msg = json!([{ "jsonrpc": "2.0", "id": 1, "method": "ping" }]);
        match route(&msg, &tools(), "0") {
            Routed::Respond(v) => assert_eq!(v["error"]["code"], INVALID_REQUEST),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn wrong_jsonrpc_version_is_rejected() {
        let msg = json!({ "jsonrpc": "1.0", "id": 1, "method": "ping" });
        match route(&msg, &tools(), "0") {
            Routed::Respond(v) => assert_eq!(v["error"]["code"], INVALID_REQUEST),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn unknown_method_is_method_not_found() {
        let msg = json!({ "jsonrpc": "2.0", "id": "a", "method": "resources/list" });
        match route(&msg, &tools(), "0") {
            Routed::Respond(v) => {
                assert_eq!(v["error"]["code"], METHOD_NOT_FOUND);
                assert_eq!(v["id"], "a");
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn tools_list_returns_manifest() {
        let msg = json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" });
        match route(&msg, &tools(), "0") {
            Routed::Respond(v) => assert_eq!(v["result"]["tools"][0]["name"], "list_clips"),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn tools_call_known_tool_is_forwarded() {
        let msg = json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call",
            "params": { "name": "list_clips", "arguments": { "trackId": "t1" } } });
        assert_eq!(
            route(&msg, &tools(), "0"),
            Routed::CallTool {
                id: json!(3),
                name: "list_clips".into(),
                arguments: json!({ "trackId": "t1" })
            }
        );
    }

    #[test]
    fn tools_call_defaults_missing_arguments_to_empty_object() {
        let msg = json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "list_clips" } });
        assert!(
            matches!(route(&msg, &tools(), "0"), Routed::CallTool { arguments, .. } if arguments == json!({}))
        );
    }

    #[test]
    fn tools_call_unknown_tool_or_bad_args_is_invalid_params() {
        for params in [
            json!({ "name": "rm_rf" }),
            json!({ "name": "list_clips", "arguments": [1] }),
            json!({}),
        ] {
            let msg =
                json!({ "jsonrpc": "2.0", "id": 9, "method": "tools/call", "params": params });
            match route(&msg, &tools(), "0") {
                Routed::Respond(v) => assert_eq!(v["error"]["code"], INVALID_PARAMS),
                other => panic!("unexpected {other:?}"),
            }
        }
    }

    #[test]
    fn non_scalar_id_is_rejected() {
        let msg = json!({ "jsonrpc": "2.0", "id": { "x": 1 }, "method": "ping" });
        match route(&msg, &tools(), "0") {
            Routed::Respond(v) => assert_eq!(v["error"]["code"], INVALID_REQUEST),
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn sanitize_client_name_strips_controls_and_caps_length() {
        assert_eq!(sanitize_client_name("  \u{7}  "), "unknown client");
        assert_eq!(sanitize_client_name(&"x".repeat(200)).len(), 64);
    }
}
