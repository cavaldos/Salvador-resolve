# Salvador Desktop

## Open a project folder

On the Projects screen, choose **Open Folder** and select an existing directory. Salvador links supported top-level videos (MP4, MOV, M4V, WebM, and MKV when the installed WebView supports the codec) without copying them. Videos appear in Media; a new timeline starts empty. Edits autosave to `Salvador.salvador.json` in the selected folder. Reopen the same folder or its recent project to continue editing.

Keep the project file and videos together. If the folder moves, choose it again with **Open Folder**. Additional files added via **Import Media** are still managed by Salvador on this device; they are not bundled into the folder. **New Project** continues to work without a folder.

Tauri 2 packages the Vite build from `dist/`. The installed app needs neither Node.js nor a local web server. It opens the Projects workspace by default; project links use `/editor?project=…`. In development, Tauri starts Vite on `http://localhost:3000` so existing WebView project storage keeps the same origin. Stop any previous dev server on port 3000 before starting.

## Run locally

Install the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/), Rust, Node.js and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm desktop:dev
pnpm desktop:build --bundles app  # macOS: src-tauri/target/release/bundle/macos/Salvador.app
```

Run `pnpm desktop:build` for the host's default bundle targets. For distribution, sign and notarize macOS bundles and test Windows and Linux on their native WebViews.

## Engine migration: stage 1

- The timeline and compositor still use Salvador's WebView code. Project data and imported media still use the WebView's IndexedDB/OPFS; browser data does not automatically migrate into the desktop app.
- After rendering, **Save Video…** opens a native picker. Rust receives MP4 or WebM in 1 MiB chunks, writes a temporary file next to the destination, and replaces the destination only after the transfer finishes. Canceling the picker leaves the destination unchanged. Desktop save accepts exports up to 8 GiB; rendering still depends on WebView codec and storage support.
- If FFmpeg is available, Rust remuxes the video and audio streams without re-encoding and enables fast-start for MP4. The app looks at standard Homebrew locations on macOS and `/usr/bin/ffmpeg` or `/usr/local/bin/ffmpeg` on Linux. FFmpeg is not bundled. If it is absent or remuxing fails, the original render is saved; the latter shows a warning.
- The next stages are native project/media storage, native decoding, and native video compositing/audio mixing and encoding. Each stage needs output parity checks for timeline timing, layering, text, and audio.

## Verification

```sh
pnpm typecheck
pnpm desktop:test
pnpm build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml remux_preserves_video_and_audio -- --ignored
```

The last command requires a system FFmpeg build with ffprobe, VP9 and Opus encoders. It generates short MP4 and WebM files and checks that track codecs and packet counts survive the native remux.
