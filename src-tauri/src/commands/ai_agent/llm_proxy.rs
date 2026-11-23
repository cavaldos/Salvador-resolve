use super::secrets;
use futures_util::StreamExt;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::ipc::Channel;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmRequest {
    pub provider: String,
    pub model: String,
    pub messages: Vec<LlmMessage>,
    pub tools: Option<Vec<Value>>,
    /// Optional id so the webview can cancel an in-flight stream.
    pub request_id: Option<String>,
    pub max_tokens: Option<u32>,
}

static CANCELLED: Lazy<Mutex<HashSet<String>>> = Lazy::new(|| Mutex::new(HashSet::new()));

fn is_cancelled(req: &LlmRequest) -> bool {
    match (&req.request_id, CANCELLED.lock()) {
        (Some(id), Ok(set)) => set.contains(id),
        _ => false,
    }
}

fn clear_cancel(req: &LlmRequest) {
    if let (Some(id), Ok(mut set)) = (&req.request_id, CANCELLED.lock()) {
        set.remove(id);
    }
}

#[tauri::command]
pub fn ai_agent_llm_cancel(request_id: String) {
    if let Ok(mut set) = CANCELLED.lock() {
        set.insert(request_id);
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LlmToolCall {
    pub id: String,
    pub name: String,
    pub args: Value,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LlmMessage {
    pub role: String,
    pub content: String,
    pub tool_call_id: Option<String>,
    pub tool_calls: Option<Vec<LlmToolCall>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LlmChunk {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call: Option<LlmToolCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn api_key(provider: &str) -> Result<String, String> {
    secrets::read_api_key(provider)?.ok_or_else(|| format!("no API key set for {provider}"))
}

fn push_message(messages: &mut Vec<Value>, role: &str, blocks: Vec<Value>) {
    if let Some(last) = messages.last_mut() {
        if last.get("role").and_then(|r| r.as_str()) == Some(role) {
            if let Some(arr) = last.get_mut("content").and_then(|c| c.as_array_mut()) {
                arr.extend(blocks);
                return;
            }
        }
    }
    messages.push(json!({ "role": role, "content": blocks }));
}

fn anthropic_messages(req: &LlmRequest) -> (String, Vec<Value>) {
    let mut system = String::new();
    let mut messages: Vec<Value> = Vec::new();
    for m in &req.messages {
        match m.role.as_str() {
            "system" => {
                if !system.is_empty() {
                    system.push_str("\n\n");
                }
                system.push_str(&m.content);
            }
            "assistant" => {
                let mut blocks = Vec::new();
                if !m.content.is_empty() {
                    blocks.push(json!({ "type": "text", "text": m.content }));
                }
                if let Some(calls) = &m.tool_calls {
                    for c in calls {
                        blocks.push(json!({
                            "type": "tool_use",
                            "id": c.id,
                            "name": c.name,
                            "input": c.args,
                        }));
                    }
                }
                push_message(&mut messages, "assistant", blocks);
            }
            "tool" => {
                let id = m.tool_call_id.clone().unwrap_or_default();
                push_message(
                    &mut messages,
                    "user",
                    vec![json!({
                        "type": "tool_result",
                        "tool_use_id": id,
                        "content": m.content,
                    })],
                );
            }
            _ => {
                push_message(
                    &mut messages,
                    "user",
                    vec![json!({ "type": "text", "text": m.content })],
                );
            }
        }
    }
    (system, messages)
}

fn anthropic_tools(req: &LlmRequest) -> Vec<Value> {
    req.tools
        .as_ref()
        .map(|tools| {
            tools
                .iter()
                .filter_map(|t| {
                    let name = t.get("name")?.as_str()?;
                    let description = t.get("description").and_then(|d| d.as_str()).unwrap_or("");
                    let schema = t
                        .get("inputSchema")
                        .cloned()
                        .unwrap_or(json!({ "type": "object" }));
                    Some(json!({
                        "name": name,
                        "description": description,
                        "input_schema": schema,
                    }))
                })
                .collect()
        })
        .unwrap_or_default()
}

async fn anthropic_stream(channel: Channel<LlmChunk>, req: &LlmRequest) -> Result<(), String> {
    let key = api_key("anthropic")?;
    let (system, messages) = anthropic_messages(req);
    let tools = anthropic_tools(req);
    let mut body = json!({
        "model": &req.model,
        "max_tokens": req.max_tokens.unwrap_or(4096),
        "messages": messages,
        "stream": true,
    });
    if !system.is_empty() {
        body["system"] = json!(system);
    }
    if !tools.is_empty() {
        body["tools"] = json!(tools);
    }

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("anthropic request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("anthropic {status}: {text}"));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut current_tool: Option<(String, String, String)> = None;

    while let Some(chunk) = stream.next().await {
        if is_cancelled(req) {
            break;
        }
        let bytes = chunk.map_err(|e| format!("stream error: {e}"))?;
        buf.push_str(&String::from_utf8_lossy(&bytes));
        while let Some(pos) = buf.find("\n\n") {
            let event = buf[..pos].to_string();
            buf = buf[pos + 2..].to_string();
            let data = event
                .lines()
                .find_map(|l| l.strip_prefix("data: "))
                .unwrap_or("");
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            let v: Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let kind = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match kind {
                "content_block_start" => {
                    if let Some(cb) = v.get("content_block") {
                        if cb.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                            let id = cb
                                .get("id")
                                .and_then(|x| x.as_str())
                                .unwrap_or("")
                                .to_string();
                            let name = cb
                                .get("name")
                                .and_then(|x| x.as_str())
                                .unwrap_or("")
                                .to_string();
                            current_tool = Some((id, name, String::new()));
                        }
                    }
                }
                "content_block_delta" => {
                    if let Some(delta) = v.get("delta") {
                        match delta.get("type").and_then(|t| t.as_str()) {
                            Some("text_delta") => {
                                if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                    let _ = channel.send(LlmChunk {
                                        kind: "text".into(),
                                        text: Some(text.to_string()),
                                        tool_call: None,
                                        error: None,
                                    });
                                }
                            }
                            Some("input_json_delta") => {
                                if let Some(partial) =
                                    delta.get("partial_json").and_then(|t| t.as_str())
                                {
                                    if let Some((_, _, json)) = current_tool.as_mut() {
                                        json.push_str(partial);
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                "content_block_stop" => {
                    if let Some((id, name, json)) = current_tool.take() {
                        let args: Value = serde_json::from_str(&json).unwrap_or(json!({}));
                        let _ = channel.send(LlmChunk {
                            kind: "tool_call".into(),
                            text: None,
                            tool_call: Some(LlmToolCall { id, name, args }),
                            error: None,
                        });
                    }
                }
                "message_stop" => {
                    let _ = channel.send(LlmChunk {
                        kind: "done".into(),
                        text: None,
                        tool_call: None,
                        error: None,
                    });
                }
                "error" => {
                    let msg = v
                        .get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .unwrap_or("anthropic error")
                        .to_string();
                    let _ = channel.send(LlmChunk {
                        kind: "error".into(),
                        text: None,
                        tool_call: None,
                        error: Some(msg.clone()),
                    });
                    return Err(msg);
                }
                _ => {}
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn ai_agent_llm_stream(
    channel: Channel<LlmChunk>,
    req: LlmRequest,
) -> Result<(), String> {
    clear_cancel(&req);
    let result = match req.provider.as_str() {
        "anthropic" => anthropic_stream(channel.clone(), &req).await,
        _ => Err(format!("provider {} is not implemented yet", req.provider)),
    };
    if is_cancelled(&req) {
        let _ = channel.send(LlmChunk {
            kind: "done".into(),
            text: None,
            tool_call: None,
            error: None,
        });
    }
    clear_cancel(&req);
    result
}
