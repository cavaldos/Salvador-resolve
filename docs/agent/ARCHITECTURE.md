# Salvador Resolve architecture

## Layers

```
Preact UI (src/) ── signals ── Project + HistoryStack
        │
        ├── Host (src/host/tauri.ts) ── invoke/listen/Channel ── Rust
        │
        ├── @salvador/core   (pure TS: schema, ops, diff, compile)
        ├── @salvador/tools  (zod tools, executed through Host)
        └── @salvador/agent  (provider loop, permissions, plan/build)
```

`packages/*` never import Tauri. They depend on the `Host` interface only, so the same code
runs in the desktop app, the CLI, and tests.

## Host interface

```ts
interface Host {
  probe(path: string): Promise<ProbeResult>;
  runFfmpeg(args: string[], opts: { jobId: string; durationMs?: number }): Promise<void>;
  onJobProgress(cb: (e: JobProgress) => void): Unsubscribe;
  cancelJob(jobId: string): Promise<void>;
  readProject(dir: string): Promise<Project>;
  writeProject(dir: string, p: Project): Promise<void>;
  llmStream(req: LlmRequest, onChunk: (c: LlmChunk) => void): Promise<void>;
  transcribe?(path: string): Promise<Transcript>;
  detectSilence?(path: string, opts?): Promise<SilenceRange[]>;
  detectScenes?(path: string): Promise<SceneRange[]>;
  extractFrames?(path: string, timesMs: number[]): Promise<string[]>;
  writeTextFile?(path: string, content: string): Promise<void>;
}
```

## Rust responsibilities

- Process spawning (ffmpeg/ffprobe), argument vectors only, never shell strings.
- Jobs: `run_ffmpeg` parses `-progress pipe:1` and emits `job://progress`, `job://done`,
  `job://error`; `cancel_job` kills the child.
- Project folder IO and `.salvador/` cache directory.
- OS keychain for API keys (`keyring`).
- Anthropic streaming proxy (`reqwest` → Tauri `Channel`); keys never reach the webview.

## Package manager

Yarn 1 classic workspaces. Internal dependencies use `"*"` (yarn 1 does not support
`workspace:*`). Tests use Vitest.

## Timeline schema v2

`Effect` is a union of `crop`, `scale`, `colorAdjust`, `lut`, `blur`, `fade`, `text`,
`zoomPan` plus a generic `{ type, params }` fallback. `migrateProject` upgrades v1.
