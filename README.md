# Salvador Resolve

A free, open-source desktop video editor in the style of CapCut, with an AI editing agent
built in. Rust + Tauri 2 + React 19.

> Salvador Resolve is a fork of [Clypra](https://github.com/AIEraDev/Clypra) (MIT), merged
> with the AI agent from the earlier *Cutline* prototype. See [Credits](#credits).

## Features

- **Multi-track timeline**: frame-accurate trimming, splitting, multiple layers, undo/redo.
- **Hardware-accelerated engine**: native Rust + FFmpeg decoding (VideoToolbox / D3D11VA /
  VAAPI), wgpu compositing.
- **Resource panel**: media import, audio, text and text templates, stickers, effects,
  transitions, captions (local Whisper), filters/LUTs.
- **Audio**: waveforms, volume envelopes, voiceover recording.
- **Export**: H.264 / ProRes and other formats.
- **AI agent** (from Cutline): chat with an agent ("cut the first 5 seconds, add captions,
  export for TikTok") that edits the timeline through deterministic tools. API keys are stored
  in the OS keychain and only the Rust side can read them.

## Development

Requirements: Node 22+, npm, Rust stable, Xcode command-line tools on macOS.

```bash
npm install
npm run setup:ffmpeg     # builds static FFmpeg 8 into src-tauri/ffmpeg-static (first run only)
npm run tauri dev        # desktop dev window
```

```bash
npx tsc --noEmit                  # typecheck
npm test                          # vitest
cd src-tauri && cargo test        # Rust tests
npm run tauri build               # production bundle
```

### Repository layout

```
src/                    React UI: editor layout, timeline, preview, resource tabs, stores
src/features/ai-agent/  AI agent chat panel + tool adapter over the editor stores
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

## Credits

- [Clypra](https://github.com/AIEraDev/Clypra) by the Clypra Contributors (MIT). This is
  the editor engine and UI this project is based on.
- Upstream npm packages `@clypra-studio/*` and `@clypra/ui-color-picker` (MIT) are used
  as-is.
- FFmpeg is licensed under the LGPL v2.1+. See [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).

## License

MIT. See [LICENSE](./LICENSE).
