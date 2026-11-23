# ADR 0003: MCP server for external coding agents

- **Status**: Accepted (phase 1 implemented, plus `undo`, `redo`, `seek`, `play` and `pause` from phase 2)
- **Date**: 2026-11-23
- **Scope**: `src-tauri/src/mcp/` (new), `src/features/mcp-bridge/` (new), `src/features/ai-agent/tools.ts`, settings UI, i18n catalogs

## Context

Salvador Resolve already has an in-app AI agent (`src/features/ai-agent/`). Its tools
(`EDITOR_TOOLS`: `list_clips`, `split_clip`, `trim_clip`, `add_captions`, `start_export`, …)
run in the webview against the real Zustand stores, and every edit goes through
`historyStore`, so one Cmd+Z reverts it.

We want external coding agents (Claude Code, Cursor, Codex, VS Code Copilot, …) to drive the
**running** desktop app the same way: inspect the timeline, edit it, render a frame to check
the result, and export. The Model Context Protocol (MCP) is the common interface those clients
support.

## Decision drivers

1. One tool registry. The in-app agent and MCP clients must call the same tool code, with the
   same validation, undo behavior and permission rules.
2. Architectural invariants: mutations go through `historyStore` (Inv. 3), there is one clock
   (Inv. 1), export never mutates stores (Inv. 8), there are no native UI calls off the main
   thread (Inv. 16), and diagnostics are private (Inv. 14).
3. Local-only security. An open localhost port is reachable by every local process and, through
   DNS rebinding, by web pages.
4. Cross-platform. The same behavior on macOS, Windows and Linux, with no OS branching.

## Options considered

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. In-app Streamable HTTP server (Rust/axum) bridged to webview tools** | Rust serves `POST /mcp` on `127.0.0.1`. `tools/call` is forwarded to the webview with a Tauri event, the webview runs the existing tool and replies with an `invoke`. | Reuses `EDITOR_TOOLS` unchanged. Works with any client that supports HTTP MCP. axum and tokio are already dependencies. | Only works while the app is running with a project open. Needs a request/response correlation layer. |
| B. Stdio sidecar (`salvador-mcp`) | The client spawns a small binary that proxies stdio to the app's local endpoint. | Works with stdio-only clients. | Adds a second binary to build, sign and bundle. It still needs A behind it. |
| C. Headless CLI MCP (`apps/cli` + `@salvador/core`) | Edits project files on disk with no app running. | Runs in CI and on headless machines. | Different semantics from the editor stores, with no live preview, undo or frame render. It is not "controlling the app". |
| D. Reimplement tools in Rust | Rust edits project state directly. | No webview round-trip. | Duplicates timeline logic and violates Inv. 3, because the stores live in TS. |

**Decision: A now.** We do not build B, because stdio-only clients can use the off-the-shelf
`mcp-remote` bridge. We revisit B only if users need it. C stays a separate, later track. D is
rejected.

### Protocol implementation: `rmcp` crate vs a hand-rolled JSON-RPC subset

- `rmcp` (official Rust SDK) tracks spec revisions and has an axum Streamable HTTP transport. It
  adds a new dependency, which must be verified on all three targets before adoption
  (cross-platform rule 2).
- Hand-rolled: we would implement `initialize`, `notifications/initialized`, `ping`,
  `tools/list` and `tools/call`, with JSON responses only and no SSE. It is about 300 lines,
  has no new dependency, and is easy to unit test, but we own spec drift.

**Recommendation:** start hand-rolled on the stateless JSON subset of Streamable HTTP
(spec 2025-06-18). Move to `rmcp` if we need server-initiated messages (progress
notifications for long exports, sampling, resources subscriptions).

## Specification

### Transport and lifecycle

- The server is off by default. The user enables it in **Settings → Integrations → Agent
  control (MCP)**. The setting is persisted, and while it is on, the server starts on app
  launch.
- It binds `127.0.0.1` only (never `0.0.0.0`). It uses the configured port (default `47821`)
  and falls back to the next 2 ports. The bound port is shown in Settings.
- The endpoint is `POST /mcp` with JSON-RPC 2.0. `GET /mcp` returns `405`, because there is no
  SSE stream in phase 1.
- Stopping the server, disabling it, or quitting the app aborts the listener, and pending calls
  resolve with an error.

### Security

- **Bearer token**: 32 random bytes, base64url, generated on first enable and stored in the OS
  keychain (same `keyring` path as the AI keys). Every request needs
  `Authorization: Bearer <token>`. A missing or wrong token gets `401`. The token is compared
  in constant time. Settings has *Copy client config* and *Regenerate token* actions.
- **DNS-rebinding guard**: requests whose `Host` is not `127.0.0.1:<port>` or
  `localhost:<port>` are rejected. A present `Origin` header gets `403` unless it is a loopback
  origin. No CORS layer is installed.
- **Body limit**: 1 MiB request body limit, a 32-request in-flight limit, and a 30 s default
  call timeout (exports are exempt, see below).
- **Approval policy**: tools that the in-app agent marks `ask` (`delete_clip`,
  `remove_silences`, `add_captions`, `start_export`) show an in-app approval toast naming the
  client (from `initialize.clientInfo.name`). Settings offers *Ask* (default), *Allow all for
  this session*, and *Read-only* (only `kind: "inspect"` tools are listed). A denied call
  returns a tool result with `isError: true` and the text `denied by user`.
- **Logging**: diagnostics log the tool name, duration and outcome only, never arguments
  (which can contain paths or user text). This follows Inv. 14.

### Webview bridge

```
MCP client ──HTTP──▶ Rust mcp::server ──emit "mcp://call" {callId, name, args, client}──▶ main window
                         ▲                                                          │
                         └──────── invoke mcp_resolve_call {callId, result} ◀───────┘
```

- On startup and whenever the registry changes, the webview calls
  `invoke("mcp_register_tools", { tools: [{ name, description, kind, inputSchema }] })`.
  `inputSchema` comes from `zod-to-json-schema`, the same path `@salvador/agent` already uses.
  Rust caches the manifest. Until a manifest arrives, `tools/list` returns an empty list and
  `tools/call` returns `editor not ready`.
- Rust keeps `HashMap<callId, oneshot::Sender<CallResult>>`. A timeout or a dropped webview
  (page reload) removes the entry and returns an error. A late `mcp_resolve_call` for an unknown
  id is ignored.
- The webview **serializes** MCP calls through one FIFO queue, so two agents cannot interleave
  edits. Calls are not wrapped in an extra transaction: each tool is already one undo step, and
  an outer transaction held open across an `await` (captions, export, approval prompts) would
  swallow edits the user makes in the meantime.
- Tool execution reuses one shared function `executeEditorTool(name, args, policy)`: zod parse,
  then permission check, then `execute`. That function is extracted from the agent loop so the
  in-app agent and MCP cannot diverge.
- Results map to MCP content: `{ summary, data }` becomes
  `content: [{ type: "text", text: summary }]` plus `structuredContent: data`. A thrown error
  becomes `isError: true` with the error message. Image results (phase 2) become
  `{ type: "image", mimeType: "image/png", data }`.
- All native work (the emit, keychain access) happens from tokio tasks through `AppHandle`.
  Nothing touches `NSWindow`, `HWND` or GTK, which satisfies Inv. 16.

### Tool surface

Phase 1 exposes the existing `EDITOR_TOOLS` unchanged.

Phase 2 adds tools that coding agents specifically need:

| Tool | Kind | Notes |
|---|---|---|
| `undo` / `redo` | edit | `historyStore`. Returns the label of the reverted step. |
| `seek` | inspect | Through `PlaybackClock` only (Inv. 1). |
| `play` / `pause` | inspect | Playback transport, no store mutation. |
| `import_media` | edit | Takes absolute paths. Waits for the asset to be probed (path non-empty, Inv. 4) before returning ids. Always asks. |
| `render_frame` | inspect | Renders `EvaluatedScene` at time *t* to a PNG of at most 1280 px, returned as image content. Uses the thumbnail path, never the live preview loop (Inv. 2, 7). |
| `get_export_status` / `cancel_export` | output | Lets `start_export` return a job id immediately instead of blocking past the call timeout. |
| `save_project` | output | Asks first. |

### Client configuration (what users paste)

```bash
claude mcp add --transport http salvador http://127.0.0.1:47821/mcp \
  --header "Authorization: Bearer <token>"
```

```json
{ "mcpServers": { "salvador": {
    "url": "http://127.0.0.1:47821/mcp",
    "headers": { "Authorization": "Bearer <token>" } } } }
```

Stdio-only clients use `npx mcp-remote http://127.0.0.1:47821/mcp --header "Authorization: Bearer <token>"`.

## Consequences

- The app must be running with a project open. This is intentional, because the feature is
  about driving the live editor.
- A second automation entry point puts permission bugs on a security boundary. That is why the
  server is off by default, uses a token, and is loopback-only.
- Every new editor tool becomes available to the in-app agent and to MCP with no extra work.

## Ordered task list

Each task is one PR with its own tests.

1. **Extract `executeEditorTool`** from `@salvador/agent`'s call path into
   `src/features/ai-agent/runTool.ts`. *Verify:* the existing ai-agent vitest suite stays
   green, and a new unit test covers zod-reject, deny and ask flows.
2. **Rust `mcp::protocol`**: pure JSON-RPC handling for `initialize`, `ping`, `tools/list` and
   `tools/call` dispatch, plus error codes. *Verify:* `cargo test mcp::protocol` (malformed
   JSON, unknown method, notification without id, batch rejected).
3. **Rust `mcp::auth`**: token check and Host/Origin guard. *Verify:* cargo tests for missing
   token, wrong token, rebinding Host, foreign Origin, and loopback Origin allowed.
4. **Rust `mcp::bridge`**: pending-call map, timeout, the `mcp_register_tools` and
   `mcp_resolve_call` commands, and capability entries. *Verify:* cargo tests for
   resolve-before-timeout, timeout, unknown id, and shutdown draining pending calls.
5. **Rust `mcp::server`**: axum listener on `127.0.0.1`, plus `mcp_start`, `mcp_stop` and
   `mcp_status` commands, and the keychain token. *Verify:* an integration test that binds an
   ephemeral port and runs a full `initialize` → `tools/list` → `tools/call` round-trip with a
   stub resolver.
6. **Webview `mcp-bridge`**: event listener, FIFO queue, transaction wrapping, manifest
   registration, and cleanup on unmount. *Verify:* vitest with a mocked `@tauri-apps/api`
   (ordering, error mapping, undo-label assertion on a real `historyStore`).
7. **Approval toast and Settings panel**: toggle, port, token copy and regenerate, and policy.
   Keys go in `en.json` and all 9 locales. *Verify:* `npm run i18n:check`, component tests, and
   a Playwright settings flow.
8. **End-to-end smoke**: a script that runs MCP Inspector or `curl` against `npm run tauri dev`.
   Document it in `docs/agent/MCP.md`. Update the README section from "planned" to usage.
9. **Phase 2 tools**, one per PR: `undo`/`redo`, then `seek`/`play`/`pause`, then
   `render_frame`, then `import_media`, then async export.
