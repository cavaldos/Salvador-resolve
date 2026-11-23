<div align="center">

<img src="src-tauri/icons/128x128@2x.png" alt="Salvador Resolve" width="112" height="112" />

# Salvador Resolve

**An open-source desktop video editor with an AI editing agent built in.**

Rust · Tauri 2 · React 19 · FFmpeg · wgpu

[Download](https://github.com/cavaldos/Salvador-resolve/releases/latest) ·
[Features](#features) ·
[AI agent](#ai-agent) ·
[MCP](#agent-control-via-mcp) ·
[Getting started](#getting-started) ·
[Credits](#credits-and-acknowledgements)

<p>
  <a href="https://github.com/cavaldos/Salvador-resolve/releases/latest"><img alt="download" src="https://img.shields.io/github/v/release/cavaldos/Salvador-resolve?label=download&color=4c1&style=flat-square" /></a>
  <a href="https://github.com/cavaldos/Salvador-resolve/releases"><img alt="downloads" src="https://img.shields.io/github/downloads/cavaldos/Salvador-resolve/total?label=downloads&color=97ca00&style=flat-square" /></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-2f80ed?style=flat-square" />
  <img alt="built with" src="https://img.shields.io/badge/built%20with-Tauri%202-e05d44?style=flat-square" />
  <a href="https://github.com/cavaldos/Salvador-resolve/stargazers"><img alt="stars" src="https://img.shields.io/github/stars/cavaldos/Salvador-resolve?label=stars&color=2f80ed&style=flat-square" /></a>
  <a href="https://github.com/cavaldos/Salvador-resolve/network/members"><img alt="forks" src="https://img.shields.io/github/forks/cavaldos/Salvador-resolve?label=forks&color=2f80ed&style=flat-square" /></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/github/license/cavaldos/Salvador-resolve?label=license&color=e67e22&style=flat-square" /></a>
</p>

</div>

---

Salvador Resolve is a free, open-source desktop video editor in the style of CapCut. It is a
native app built with Rust, Tauri 2 and React 19. Video is decoded by FFmpeg, composited on the
GPU with wgpu, and edited on a multi-track timeline.

You can chat with the built-in agent ("cut the first 5 seconds, add captions, export for
TikTok"), or connect an external coding agent such as Claude Code, Cursor or Codex over MCP. Both
edit the timeline through deterministic tools that use the same undo history as manual edits.

> [!NOTE]
> **Based on Clypra.** Salvador Resolve is a fork of [Clypra](https://github.com/AIEraDev/Clypra)
> by [AIEraDev](https://github.com/AIEraDev) (MIT), merged with the AI agent from the earlier
> *Cutline* prototype. The editor engine and UI come from Clypra. Thank you to its author and
> contributors. See [Credits and acknowledgements](#credits-and-acknowledgements).

<details>
<summary><strong>Contents</strong></summary>

- [Features](#features)
- [AI agent](#ai-agent)
- [Agent control via MCP](#agent-control-via-mcp)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Testing and verification](#testing-and-verification)
- [Project layout](#project-layout)
- [Remote services](#remote-services)
- [Contributing](#contributing)
- [Credits and acknowledgements](#credits-and-acknowledgements)
- [License](#license)

</details>

## Features

### Editing

- Multi-track timeline with multiple layers.
- Frame-accurate trimming and splitting.
- Undo and redo for timeline edits.

### Engine

- Native Rust and FFmpeg decoding with hardware acceleration (VideoToolbox, D3D11VA, VAAPI).
- wgpu compositing, with a native GPU preview surface (Metal on macOS, DirectX 12 on Windows)
  and a WebGL/web-canvas readback fallback.

### Media and resources

- Media import.
- Text and text templates, stickers, effects, transitions.
- Filters and LUTs.

### Audio

- Waveforms and volume envelopes.
- Voiceover recording.

### Captions and AI

- Captions generated locally with Whisper.
- A built-in AI editing agent (see below).

### Export

- H.264, ProRes and other formats.

## AI agent

The agent comes from the earlier Cutline prototype. It is a chat panel in the editor. You describe
an edit in plain language, and the agent carries it out by calling tools that act on the editor
stores. It can inspect the project (tracks, clips, media assets, playhead, transcript), make
timeline edits, add captions and text, remove silences, and start an export.

Tools exposed to the agent (`src/features/ai-agent/tools.ts`):

| Group | Tools |
| --- | --- |
| Inspect | `get_project_info`, `list_tracks`, `list_clips`, `list_media_assets`, `get_playhead`, `get_transcript` |
| Edit | `split_clip`, `delete_clip`, `trim_clip`, `move_clip`, `set_clip_volume` |
| Text and captions | `add_text_clip`, `add_captions` |
| Cleanup | `remove_silences` |
| Output | `start_export` |

Notes:

- API keys are stored in the OS keychain. Only the Rust side can read them.
- Edits made by the agent are dispatched through the editor's history, so they can be undone like
  any manual edit.
- More detail on the agent design is in [`docs/agent`](./docs/agent).

## Agent control via MCP

Salvador Resolve has a built-in MCP server so external coding agents (Claude Code, Cursor, Codex and
similar) can inspect and edit the open project. It is off by default and runs only while the app is
open. Enable it in Settings, Integrations, Agent control (MCP), which also shows the URL and token.
Example for Claude Code:

```bash
claude mcp add --transport http salvador http://127.0.0.1:47821/mcp \
  --header "Authorization: Bearer <TOKEN>"
```

Setup for every client is in [`docs/agent/MCP.md`](docs/agent/MCP.md). The design is in
[`docs/architecture/adr/0003-mcp-agent-control.md`](docs/architecture/adr/0003-mcp-agent-control.md).

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, TypeScript 5.8, Vite 7 |
| State | Zustand 5 |
| Desktop shell and backend | Tauri 2.11, Rust 2021 edition |
| GPU compositor | wgpu 24 (Metal on macOS, DirectX 12 on Windows) |
| Video decode | FFmpeg 8.x (static build via `ffmpeg-next`), VideoToolbox hardware decode |
| Audio | CPAL, rtrb and wsola in Rust; Web Audio API in the frontend |
| ML | ONNX Runtime (`ort`), Whisper.cpp (`whisper-rs`) |
| Tests | Vitest 4, Playwright, `cargo test` |

## Getting started

Requirements:

- Node 22 or newer, and npm.
- Rust stable.
- macOS: Xcode command-line tools.
- Windows: the toolchain required by Tauri 2 for Windows builds. Platform-specific details are in
  [`docs/engineering/platform-compatibility.md`](./docs/engineering/platform-compatibility.md).

```bash
npm install
npm run setup:ffmpeg     # builds static FFmpeg 8 into src-tauri/ffmpeg-static (first run only)
npm run tauri dev        # desktop dev window
```

The native GPU preview is the default. To force the WebGL/web-canvas fallback:

```bash
VITE_SALVADOR_NATIVE_SURFACE=0 npm run tauri dev
```

To build a production bundle:

```bash
npm run tauri build
```

## Testing and verification

```bash
npx tsc --noEmit                                  # typecheck
npm test                                          # typecheck + vitest
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
```

Verification scripts (see [`AGENTS.md`](./AGENTS.md) for the full list):

```bash
npm run verify:architecture   # architecture invariants
npm run verify:fast           # typecheck + architecture + preview render loop
npm run verify:changed        # targeted checks based on changed files
npm run verify:integration    # subsystem and audio integration tests
npm run verify:media          # media engine and timeline math regressions
npm run verify:ui             # Playwright browser UI tests
npm run verify:desktop        # packaged desktop smoke validation
npm run verify:gate           # engineering quality gate
npm run verify:full           # full regression suite
npm run i18n:check            # locale catalog parity
npm run docs:check            # documentation link check
```

## Project layout

```
src/                    React UI: editor layout, timeline, preview, resource tabs, stores
src/features/ai-agent/  AI agent chat panel and tool adapter over the editor stores
src-tauri/              Rust backend: FFmpeg decode/export, wgpu compositor, IPC commands
crates/                 salvador-native-core / -cli / -render-wasm
packages/agent*         AI agent loop, tools, timeline core (from Cutline)
apps/cli                headless CLI (from Cutline)
docs/                   architecture and engineering notes (docs/agent for the AI agent)
```

## Remote services

These upstream defaults still exist. Review them before you ship a release:

- **Content API** (text effects, templates, stickers, effect previews): defaults to the
  Clypra project's public API. Set `VITE_API_BASE_URL` (and `VITE_SALVADOR_API_KEY`) to use
  your own backend.
- **Telemetry upload**: opt-in, and off by default. Crash reports are sent only when
  `VITE_SALVADOR_CRASH_REPORT_URL` is set.
- **Auto-updater**: disabled, because `plugins.updater.endpoints` in
  `src-tauri/tauri.conf.json` is empty. To enable it, generate a key with
  `npx tauri signer generate`, then set the endpoint and pubkey.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and follow the
[Code of Conduct](./CODE_OF_CONDUCT.md). Coding agents working in this repository should read
[AGENTS.md](./AGENTS.md), which defines the architecture invariants, verification commands and
definition of done.

## Credits and acknowledgements

Salvador Resolve would not exist without [Clypra](https://github.com/AIEraDev/Clypra). Our thanks
go to its author, AIEraDev, and to all Clypra contributors. The editor engine and UI of Salvador
Resolve are built on their MIT-licensed work, and we are grateful that they released it openly.

- [Clypra](https://github.com/AIEraDev/Clypra) by the Clypra Contributors (MIT). This is the
  editor engine and UI this project is based on.
- Upstream npm packages `@clypra-studio/*` and `@clypra/ui-color-picker` (MIT) are used as-is.
- The AI agent comes from the earlier Cutline prototype.
- FFmpeg is licensed under the LGPL v2.1+. See
  [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).

## License

MIT. See [LICENSE](./LICENSE).
