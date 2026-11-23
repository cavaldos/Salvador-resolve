# Connect coding agents over MCP

Salvador Resolve has a built-in Model Context Protocol (MCP) server. When you turn it on, coding agents such as Claude Code, Cursor, VS Code (Copilot), Codex CLI and Gemini CLI can inspect and edit the project that is open in the editor. Every edit goes through the editor's normal history, so you can undo it with Cmd/Ctrl+Z.

The design rationale is in [ADR 0003: MCP agent control](../architecture/adr/0003-mcp-agent-control.md).

## Turn it on

The server is off by default. To enable it:

1. Open Settings, then Integrations, then Agent control (MCP).
2. Switch the server on.

The server runs only while the app is open. The Settings page shows the status line, the URL, the token, and ready-made snippets with the token already filled in. Copy the snippet for your client from there, or build one from the templates below.

## Endpoint and token

- Endpoint: `http://127.0.0.1:<PORT>/mcp`
- Default port: 47821. If the port is busy, the server falls back to +1 and then +2 (47822, 47823). Check the status line in Settings for the port actually in use.
- Authentication: a bearer token, sent as `Authorization: Bearer <TOKEN>`.

The token is stored in your OS keychain. You can regenerate it in Settings. Regenerating immediately invalidates every config that still holds the old token, so update your clients afterward.

## Client configuration

Replace `<PORT>` and `<TOKEN>` with the values shown in Settings.

### Claude Code

Run in a terminal:

```bash
claude mcp add --transport http salvador http://127.0.0.1:<PORT>/mcp \
  --header "Authorization: Bearer <TOKEN>"
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "salvador": {
      "url": "http://127.0.0.1:<PORT>/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>"
      }
    }
  }
}
```

### VS Code (Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "salvador": {
      "type": "http",
      "url": "http://127.0.0.1:<PORT>/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>"
      }
    }
  }
}
```

### Codex CLI

Add to `~/.codex/config.toml`:

```toml
# export SALVADOR_MCP_TOKEN=<TOKEN>
[mcp_servers.salvador]
url = "http://127.0.0.1:<PORT>/mcp"
bearer_token_env_var = "SALVADOR_MCP_TOKEN"
```

Codex reads the token from an environment variable, not from the file. Export `SALVADOR_MCP_TOKEN` in the same shell that launches `codex`:

```bash
export SALVADOR_MCP_TOKEN=<TOKEN>
codex
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "salvador": {
      "httpUrl": "http://127.0.0.1:<PORT>/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>"
      }
    }
  }
}
```

### stdio-only clients (mcp-remote)

For clients that only speak stdio, bridge with `mcp-remote`. Add to the client's `mcp.json`:

```json
{
  "mcpServers": {
    "salvador": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://127.0.0.1:<PORT>/mcp",
        "--header",
        "Authorization:${SALVADOR_AUTH}"
      ],
      "env": {
        "SALVADOR_AUTH": "Bearer <TOKEN>"
      }
    }
  }
}
```

## Permission policies

Choose the policy in Settings, under Agent control (MCP).

| Policy | Behavior |
| --- | --- |
| Ask for risky edits (default) | Asks you in the app before `delete_clip`, `remove_silences`, `add_captions` and `start_export`. All other tools run without a prompt. |
| Read-only | Exposes only the inspect tools. Edit and output tools are not listed to the agent. |
| Allow everything | Never prompts. |

When approval is needed, a toast appears in the editor showing the client name and the tool. If you do not answer, the request is denied automatically after about 110 seconds, and the agent receives a clear error.

## Tool reference

All times are in seconds.

| Tool | Kind | Description |
| --- | --- | --- |
| `get_project_info` | inspect | Project name, canvas size, frame rate, timeline duration, counts and playhead position. |
| `list_tracks` | inspect | List timeline tracks (id, type, name, locked/muted flags, clip count). |
| `list_clips` | inspect | List clips with id, track, kind, start/end/duration, trim in/out, volume and speed. Can filter by track. |
| `list_media_assets` | inspect | List imported media assets (id, name, type, duration, size). |
| `get_playhead` | inspect | Current playhead position, plus which clips are under it. |
| `get_transcript` | inspect | Transcript words with source-time seconds for an asset, if captions were already generated. |
| `split_clip` | edit | Split a clip in two at a timeline time. Defaults to the playhead. |
| `delete_clip` | edit | Delete a clip. With `ripple=true`, later clips shift left to close the gap. Asks by default. |
| `trim_clip` | edit | Trim a clip by moving its left and right edges on the timeline. |
| `move_clip` | edit | Move a clip to a new start time, optionally onto another track of the same kind. Fails if it would overlap. |
| `set_clip_volume` | edit | Set a clip's volume (0 is silent, 1 is original level). |
| `add_text_clip` | edit | Add a text or title clip. Defaults: starts at the playhead, 3 seconds long, centered, white. |
| `add_captions` | edit | Transcribe a clip with local Whisper and add one caption clip per segment. Slow for long media and needs a downloaded Whisper model. Asks by default. |
| `remove_silences` | edit | Cut silent passages from a clip (ripple-deleted, one undo step). Asks by default. |
| `undo` | edit | Undo the most recent edit, same as Cmd/Ctrl+Z. |
| `redo` | edit | Redo the most recently undone edit. |
| `seek` | edit | Move the playhead to a timeline time. Clamped to the timeline duration. |
| `play` | edit | Start playback from the playhead. |
| `pause` | edit | Pause playback and return the playhead position. |
| `start_export` | output | Export the timeline with a preset. If `outputPath` is omitted, the app asks where to save. Blocks until finished. Asks by default. |

## Transport and security

- Transport: Streamable HTTP with JSON responses only. There is no SSE stream, so a `GET` request returns 405.
- The server binds to `127.0.0.1` only and is not reachable from other machines.
- Host and Origin checks guard against DNS rebinding.
- Request bodies are limited to 1 MiB.
- Session: the server issues an `Mcp-Session-Id` on `initialize`. After an app restart an old session gets 404, and the client re-initializes.
- Calls run one at a time.
- Timeouts: 120 seconds per call. `add_captions` and `start_export` get 1 hour.
- Logs record the tool name, duration and outcome only. Arguments are never logged.

## Verify the connection

First send `initialize`. Use `curl -i` so you can see the `Mcp-Session-Id` response header. curl sets the `Host` header for you.

```bash
curl -i http://127.0.0.1:<PORT>/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": { "name": "curl", "version": "0" }
    }
  }'
```

Copy the `Mcp-Session-Id` value from the response headers, then list the tools:

```bash
curl -i http://127.0.0.1:<PORT>/mcp \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <SESSION_ID>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

You can also explore interactively with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
```

Choose the Streamable HTTP transport, enter the URL, and add the `Authorization` header.

## Example prompts

- "List the clips, then remove silences from the interview clip."
- "Add a title 'Intro' at 0s for 3 seconds, then export 1080p to /Users/me/Desktop/out.mp4." (Use an absolute path: `~` is not expanded.)
- "Undo that, then seek to 12 seconds."
- "Split the clip under the playhead and lower the volume of the second half to 0.5."
- "Add captions to the main video clip, then show me the transcript."

## Troubleshooting

- **401 Unauthorized.** The token is missing or wrong. Copy it again from Settings. If you regenerated the token, update every client config.
- **403 Forbidden.** The Host or Origin check failed. This happens when a proxy or tunnel rewrites the `Host` header. Connect directly to `127.0.0.1`.
- **404 Not Found.** The session is stale, usually after an app restart. Reconnect so the client sends a new `initialize`.
- **"not ready" tool error.** Open the editor window and a project, then retry.
- **Approval timeouts.** A risky tool waited for approval and nobody answered, so it was denied after about 110 seconds. Watch for the toast in the editor, or switch the policy to Allow everything if you trust the agent.
- **Port busy.** If 47821 is taken, the server uses 47822 or 47823. Read the port from the Settings status line and update your config.
- **Keychain prompts on macOS.** The first time the app reads or creates the token, macOS may ask for keychain access. Allow it, otherwise the server cannot start.

## Limitations

- The app must be running with a project open.
- There is no `render_frame` or `import_media` tool yet. Both are planned for phase 2 in the ADR.
- macOS, Windows and Linux share the same code. The automated tests (Rust protocol, auth, bridge and HTTP round-trip, plus the webview bridge) have run on macOS only, and an end-to-end session against a packaged build has not been verified on any OS yet.
