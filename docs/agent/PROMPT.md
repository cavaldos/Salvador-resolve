# Salvador Resolve — Continuation Brief (Tauri desktop app)

> Paste this into your coding agent from the repo root (`salvador/`).
> It describes what already exists and what to build next. Do not start from scratch.

## 1. Product
Salvador Resolve is an open-source **desktop AI video-editing agent**, in the spirit of opencode /
Claude Code but for video. The user opens a folder of media, chats with an agent in natural
language ("remove silences, add yellow captions, reframe to 9:16, render for TikTok"), and the
agent edits a **non-destructive timeline** by calling deterministic tools (FFmpeg first). The
LLM never touches pixels. It reasons over structured data and calls tools.

Principles: non-destructive (source media is never modified), deterministic tools with an
LLM planner, multi-provider LLMs (Anthropic, OpenAI, Gemini, Ollama), human approval for
expensive or destructive actions, and undo/redo for every agent turn.

## 2. Current state of the repo (read it first, then verify)
This repo started from a Tauri 2 template (`tauri-template`) with working CI/CD and an
auto-updater. Keep all of that intact.

What exists:
- **Tauri 2 shell:** `src-tauri/` (Rust 2021). `lib.rs` has only a demo `greet` command.
  Plugins: opener, updater, process. Capabilities in `src-tauri/capabilities/default.json`.
- **Frontend:** `src/`, Preact 11 + Vite 8 + Tailwind 4 + TypeScript. `App.tsx` is still the
  template demo page. `src/update/*` is a working updater banner. Keep it and mount it in
  the new layout.
- **Tooling:** yarn 1 (classic), `script/{dev,build,check,check-cicd,release}.sh`,
  GitHub Actions `ci.yml` + `release.yml` (4-target matrix, signed updater artifacts),
  dependabot.
- **`packages/core`** (`@salvador/core`):
  - `src/timeline/schema.ts`: zod schemas for `Project` (schemaVersion 1), `ProjectSettings`,
    `Asset`, `StreamInfo`, `Scene`, `Track` (video|audio|subtitle|overlay, muted, locked),
    `Clip` (inMs/outMs/startMs/speed/volume/effects/transitions), `Effect` (untyped
    `{type, params}`), `Transition`, `Marker`. All times are integer milliseconds.
  - `src/timeline/diff.ts`: `diffTimeline(a, b)` → `TimelineChange[]`.
  - No `src/index.ts` yet (the package.json `main` points to it), and no tests yet.
- **`packages/media`** (`@salvador/media`): package.json only, `src/` is empty.
- **`apps/cli`**: package.json only, `src/` is empty.
- `docs/` and `examples/` are empty. All of `apps/` and `packages/` are untracked in git.

Known problems to fix first:
1. Root `package.json` has **no `workspaces`** field, so the packages aren't linked.
2. Packages use `"workspace:*"`, which **yarn 1 does not support**. Use `"*"` with yarn 1
   workspaces, or migrate the repo to bun / pnpm. Pick one, justify it, and update scripts
   and CI to match.
3. Package scripts use `bun test`, but the repo uses yarn/node. Standardize on **Vitest**
   (works with Vite), unless you migrate to bun.
4. Rename the app away from the template: `productName`, `identifier` (e.g.
   `com.bourbon.salvador`), the window title, the Cargo package/lib name
   (`tauri_template_lib` → `salvador_lib`), and the root package name. Keep the updater
   pubkey and endpoint unchanged unless I say otherwise. `script/check-cicd.sh` must still
   pass.
5. Window is 800×600. Make it 1440×900 with a sensible min size.

## 3. Target architecture (Tauri-specific)

```
salvador/
  src/                   # Preact UI (editor shell)
  src-tauri/src/
    lib.rs               # builder, plugin + command registration
    commands/            # thin #[tauri::command] wrappers only
    media/               # ffprobe, ffmpeg runner, proxy gen, progress parsing, cancel
    project/             # open/save project folder, SQLite index, snapshots
    secrets.rs           # API keys in the OS keychain (keyring crate)
    llm_proxy.rs         # streams LLM HTTP calls so keys never reach the webview
  packages/
    core/                # pure TS: timeline schema, ops, diff, filtergraph compiler
    agent/               # pure TS: agent loop, providers, tool registry, system prompt
    tools/               # tool definitions (zod schema + execute via a host adapter)
  apps/cli/              # optional headless CLI reusing core/agent (lower priority)
```

Responsibilities:
- **TypeScript (`packages/core`, `packages/agent`)** owns all logic that should be
  testable without Tauri: timeline operations, diffing, compiling the timeline to an FFmpeg
  argument list, the agent loop, and tool schemas. It must have **no Tauri imports**. It
  talks to the host through an interface:
  ```ts
  interface Host {
    probe(path: string): Promise<ProbeResult>;
    runFfmpeg(args: string[], opts: { jobId: string; durationMs?: number }): Promise<void>;
    onJobProgress(cb: (e: JobProgress) => void): Unsubscribe;
    cancelJob(jobId: string): Promise<void>;
    readProject(dir: string): Promise<Project>;
    writeProject(dir: string, p: Project): Promise<void>;
    llmStream(req: LlmRequest, onChunk: (c: LlmChunk) => void): Promise<void>;
    // transcribe, detectSilence, detectScenes, extractFrames ...
  }
  ```
  `src/host/tauri.ts` implements it with `invoke` and `listen`. A Node implementation can
  back the CLI and tests later.
- **Rust (`src-tauri`)** owns process spawning, the file system, secrets, and long-running
  jobs:
  - Ship **FFmpeg/ffprobe as Tauri sidecars** (`bundle.externalBin`), with a fallback to the
    system PATH. Use `tauri-plugin-shell`, or `tokio::process` directly.
  - Never build shell strings. Always pass argument vectors.
  - Jobs: each render/proxy/transcribe gets a `jobId`. Parse `-progress pipe:1` and emit
    `job://progress` events `{jobId, pct, fps, etaMs}` plus `job://done` and `job://error`.
    Cancellation kills the child process and cleans up partial outputs.
  - The project folder holds `salvador.project.json` (the `Project`) and `.salvador/` (SQLite
    index via `rusqlite`, proxies, cache, snapshots, transcripts).
  - LLM calls go through Rust (`reqwest` streaming → Tauri `Channel`). API keys live in the
    OS keychain and are never sent to the webview or written to disk in plaintext.
- **Capabilities:** add only the permissions you need (dialog, fs scoped to the opened
  project folder, shell sidecar execute for ffmpeg/ffprobe, asset protocol for previews).
  Set a real CSP instead of `null`.
- **Preview:** serve proxy files through Tauri's asset protocol (`convertFileSrc`) and play
  them in an HTML `<video>`. Timeline playback can seek per clip at first. Real-time
  multi-clip composition comes later.

## 4. Timeline core work (`packages/core`)
- Add `src/index.ts` exporting everything.
- Replace the untyped `Effect` with a **discriminated union** (crop, scale, colorAdjust,
  lut, blur, fade, text, zoomPan, …). Bump to `schemaVersion: 2` and add a migration from v1.
- Pure, immutable ops returning a new `Project`: `addClip`, `trimClip`, `splitClip`,
  `moveClip`, `deleteClip`, `rippleDelete`, `setSpeed`, `setVolume`, `addEffect`,
  `addTransition`, `addSubtitleTrackFromTranscript`, `removeRanges(assetId, ranges)`. Each op
  validates its invariants (in < out, no overlap on the same track unless allowed, clip
  inside the asset's duration, locked tracks are immutable) and returns typed errors.
- `HistoryStack` for undo/redo of snapshots, one entry per agent turn or user action.
- `compileToFfmpeg(project, { range?, proxy?, preset })` → `string[]` args, using
  trim/atrim, setpts/atempo, concat, overlay, drawtext/subtitles, amix, sidechaincompress
  (ducking), and loudnorm. Frame-snap at compile time.
- Tests (Vitest): ops, invariants, diff, and **snapshot tests of the generated ffmpeg args**.

## 5. Agent (`packages/agent`)
- Provider interface with streaming + tool calls. Start with Anthropic (default model:
  latest Claude), then OpenAI, Gemini, Ollama.
- Loop: context (system prompt + project summary + compact timeline JSON + transcript
  excerpts) → stream → tool call → permission check → execute → result → repeat, until the
  model ends its turn or reaches max steps. Snapshot after any mutating turn. Auto-compact
  the context near the token limit.
- **Plan mode** (proposes a checklist, executes nothing) and **Build mode**.
- Permissions: `allow | ask | deny` per tool from `salvador.json`. Read-only tools are
  auto-allowed. `render_final`, overwrite, and deletion ask by default.
- Project instructions file `SALVADOR.md` (house style: fonts, caption colors, LUFS target)
  is injected into the system prompt.
- System prompt (`packages/agent/src/prompt.md`): inspect before editing; never invent
  asset IDs or timestamps (derive them from tool results); state a 1–3 line plan before
  mutating; preview before final render; keep edits minimal; summarize changes from the
  timeline diff.

### Tools
- Inspect (auto): `list_assets`, `probe_asset`, `get_timeline`, `transcribe`,
  `search_transcript`, `detect_silence`, `detect_scenes`, `describe_frames` (vision).
- Edit (timeline only, reversible): `add_clip`, `trim_clip`, `split_clip`, `move_clip`,
  `delete_clip`, `ripple_delete`, `remove_silences`, `remove_filler_words`, `set_speed`,
  `set_volume`, `add_fade`, `add_transition`, `add_text_overlay`, `add_subtitles`,
  `crop_reframe` (9:16 / 1:1 / 16:9, center first, face-tracking later), `add_music`
  (with ducking), `color_adjust`, `apply_lut`.
- Output (ask): `render_preview`, `render_final` (presets: youtube-1080p, tiktok-9x16, gif,
  audio-only), `export_fcpxml`, `export_edl`.
- Each tool: zod input, structured JSON result + a one-line summary, progress events,
  cancellable.
- Transcription: whisper.cpp as a sidecar (word-level timestamps), with an optional cloud
  fallback.

## 6. UI (`src/`)
Replace the template page with an editor layout:
- **Left:** media bin (import via dialog or drag-and-drop, thumbnails, durations, status of
  proxy/transcript).
- **Center:** preview player + transport controls; below it the **timeline** (tracks,
  clips, playhead, zoom, select/trim/drag. Agent edits animate in and are highlighted
  using `diffTimeline`).
- **Right:** **agent chat panel**: streaming text, collapsible tool-call cards (input,
  result, duration), approval prompts (Approve / Deny / Always allow), a Plan/Build toggle,
  model picker, and per-turn **Undo** buttons.
- **Bottom/status bar:** job queue with progress bars and cancel buttons.
- Keyboard: Space play/pause, J/K/L, S split, Del delete, Cmd+Z / Cmd+Shift+Z, Cmd+K focus
  chat.
- Settings: providers and API keys (stored via the Rust keychain command), FFmpeg path,
  default presets.
- State: Preact signals. The UI and the agent edit the same `Project` through the same ops
  and the same history stack.
- Keep `UpdateBanner` mounted.

## 7. Milestones (stop for review after each one)
- **M0 — Fix the foundation:** workspaces/package manager, renames, Vitest, `core/index.ts`,
  tests for the existing schema and diff, `script/check.sh` and CI extended to run TS tests.
  Everything green, including `script/check-cicd.sh`.
- **M1 — Media backend:** ffmpeg/ffprobe sidecars, probe command, job runner with
  progress/cancel events, project open/save, SQLite index, proxy generation on import.
- **M2 — Editor UI without AI:** media bin, preview, timeline with manual edits, undo/redo,
  preview + final render through `compileToFfmpeg`.
- **M3 — Agent:** keychain + Rust LLM proxy, Anthropic provider, tool registry, chat panel,
  permissions, plan/build modes, per-turn snapshots.
- **M4 — Smart editing:** whisper transcription, silence/filler removal, captions,
  scene detection, 9:16 reframe, music ducking.
- **M5 — Polish and extensibility:** more providers, FCPXML/EDL export, MCP client for
  external tools, custom tool plugins, an eval suite of 20+ natural-language tasks with
  automatic timeline assertions, and the headless CLI in `apps/cli`.

## 8. Quality bar
- TypeScript strict. `cargo fmt` + `clippy -D warnings` stay clean (CI already enforces it).
- Rust unit tests for progress parsing and argument building. Vitest for TS.
- Integration fixtures generated with ffmpeg `testsrc` / `sine` (2–5 s), never committed
  binaries larger than 1 MB.
- Clear user-facing errors for: FFmpeg missing, unsupported codec, missing API key, and
  jobs that were cancelled.
- No secrets in logs, in the webview, or in project files.

## 9. Definition of done (MVP)
Open a folder with a vlog clip and a music file, type:
"Remove silences and ums, add yellow captions, reframe to 9:16, add lo-fi.mp3 ducked under
speech, and render for TikTok."
The agent transcribes, edits the timeline (visible and highlighted in the UI), renders a
preview, asks for approval, and produces a correct MP4. Every step can be undone.

## 10. How to work
1. Read the whole repo and confirm or correct section 2.
2. Before coding M0, output: the package-manager decision, the final folder tree, the
   `Host` interface, the v2 `Effect` union, and open questions.
3. Implement milestone by milestone with tests. Run `script/check.sh` before declaring a
   milestone done, and stop for my review.
