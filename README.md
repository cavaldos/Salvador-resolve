# tauri-template

A **Tauri 2** desktop app template: Preact + Vite 8 + TypeScript on the frontend, Rust 2021 on the backend, `yarn` as the package manager.

It ships with everything needed to produce a **signed, auto-updatable** release for Windows, macOS (Apple Silicon **and** Intel) and Linux from GitHub Actions.

The updater endpoint below points at **`cavaldos/tauri`**, which matches this repository's `origin`. If you fork or move the project, change the endpoint in `src-tauri/tauri.conf.json` → `plugins.updater.endpoints` and replace `cavaldos/tauri` throughout this README.

## Table of contents

- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Testing from your phone or another device](#testing-from-your-phone-or-another-device)
- [Scripts](#scripts)
- [Checking the CI/CD wiring](#checking-the-cicd-wiring)
- [Release flow](#release-flow)
- [Build matrix](#build-matrix)
- [Auto-update](#auto-update)
- [Required GitHub secrets](#required-github-secrets)
- [CI](#ci)

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | ≥ 22 | matches the Node version pinned in CI |
| [yarn](https://classic.yarnpkg.com) | 1.x (classic) | the repo ships a `yarn.lock` for yarn 1 |
| [Rust](https://rustup.rs) | stable toolchain | `rustfmt` and `clippy` components are used by CI |
| Tauri system libs | see below | needed for `cargo check` too, not just for bundling |

Tauri CLI dependencies are installed by the CLI itself (`yarn tauri dev` will tell you what is missing).

**Linux** (Debian/Ubuntu):

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**macOS**: `xcode-select --install` (Xcode command line tools).

**Windows**: [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) with the *Desktop development with C++* workload, plus the WebView2 runtime (preinstalled on Windows 11).

## Getting started

```bash
yarn install
script/dev.sh          # or: yarn tauri dev
```

The Vite dev server listens on <http://localhost:1420> and the Tauri window hot-reloads against it.

## Testing from your phone or another device

By default the dev server is reachable only from this machine, which is what you want. To load the app from a phone or another computer on the same network:

```bash
script/dev.sh --lan
```

That binds the server to every interface and advertises your machine's LAN address for hot reload:

```
dev server bound to 0.0.0.0, advertised as 192.168.1.3
  local:   http://localhost:1420
  network: http://192.168.1.3:1420   <- open this on your phone
```

Open the `network:` URL on the device. Both devices must be on the same network, and your firewall has to allow inbound connections to port 1420 (macOS will prompt on first run).

Useful variations:

```bash
script/dev.sh --lan 192.168.1.50   # pin the advertised address
script/dev.sh --lan=192.168.1.50   # same, = form
script/dev.sh --lan --no-watch     # extra args are forwarded to `tauri dev`
script/dev.sh --help
```

If auto-detection picks the wrong adapter (VPN and virtual interfaces often advertise addresses too), pass the address explicitly.

**How it works.** `vite.config.ts` keeps two separate variables: `TAURI_DEV_HOST` is the interface Vite *binds* to, and `TAURI_DEV_HMR_HOST` is the address the browser is *told* to use for the HMR websocket. They have to be different, because nothing can connect to `0.0.0.0` — a client handed `ws://0.0.0.0:1421` for hot reload will never connect. `script/dev.sh` sets both, deriving the second from the interface that carries the default route. You can also set them by hand:

```bash
TAURI_DEV_HOST=0.0.0.0 TAURI_DEV_HMR_HOST=192.168.1.3 yarn tauri dev
```

**Security.** The Vite dev server has no authentication. Anything on the network can load it, and hot reload means a page on your LAN can push code into your running app. Only use `--lan` on a network you trust, and stop the server when you are done.

**Two gotchas.**

- By default Vite binds the IPv6 loopback only, so `http://localhost:1420` works but `http://127.0.0.1:1420` does *not*. That is not a bug; use `localhost`. With `--lan` the server binds all interfaces and both work.
- `--lan` exposes the *frontend*. To run the real native app on a physical phone you still want `tauri android dev` or `tauri ios dev` — `--lan` is what makes that possible, because the device's WebView has to fetch the dev server over the network.

## Scripts

All scripts are plain bash, live in `script/`, and are meant to be run from the repository root.

| Command | What it does |
| --- | --- |
| `script/dev.sh` | Dev mode: Vite dev server + Tauri window with hot reload. Add `--lan` to make it reachable from other devices on your network (see [Testing from your phone](#testing-from-your-phone-or-another-device)). Passes extra args to `yarn tauri dev`. |
| `script/build.sh` | Production build for the **host** platform: `yarn build` (tsc + vite build) then `yarn tauri build`. Unsigned — the updater key is not available locally. Installer bundles land in `src-tauri/target/release/bundle/`. Honours `BUNDLE_TARGETS` (default `all`). |
| `script/check.sh` | Everything CI runs: frontend build, `cargo fmt --check`, `cargo clippy -D warnings`, `cargo check`. Run it before pushing. |
| `script/check-cicd.sh` | Validates the CI/CD *wiring* before you tag: workflow keys, the build matrix, the updater manifest, the signing keypair and the version/tag agreement. Seconds to run. Add `--full` for a real signed bundle build. |
| `script/release.sh vX.Y.Z` | Cuts a release: validates the tag, then creates and pushes it. GitHub Actions does the rest. |

There is no test suite yet, so `script/check.sh` is the local gate for *code*, and `script/check-cicd.sh` is the local gate for the *release plumbing*.

## Checking the CI/CD wiring

`script/check.sh` proves the code builds. It does **not** prove the release will work — a wrong secret name, a missing platform in the matrix or a mistyped updater input only fails *after* you have pushed a tag and burned several minutes of runner time. `script/check-cicd.sh` checks those invariants locally, in about a second:

```bash
script/check-cicd.sh          # fast: config + wiring only
script/check-cicd.sh --full   # also does a real signed bundle build (slow)
```

It exits non-zero on any problem and prints a `FAIL` line explaining what broke and how to fix it, so it is safe to put in a pre-push hook.

What it verifies, and why each one matters:

| Check | Catches |
| --- | --- |
| `Cargo.toml` and `tauri.conf.json` agree on the version | A release that ships a version the updater can never compare correctly. |
| `bundle.createUpdaterArtifacts` is `true` | No updater artifacts, so `latest.json` has nothing to point at. |
| `plugins.updater.pubkey` is set and matches `.secrets/tauri-updater.key.pub` | A half-finished key rotation, which would make **every** update fail signature verification. |
| The private key actually signs | That the value you are about to paste into `TAURI_SIGNING_PRIVATE_KEY` works, and that the password secret is right. It tells you when the password is empty. |
| The endpoint repo matches `git remote get-url origin` | An endpoint pointing at a repo you do not control — the app would never detect a release. |
| `updater:default`, `process:default`, `process:allow-restart` are granted | Missing capabilities, which fail at runtime, not at build time. |
| The matrix has all four targets and runners | A dropped platform, whose users would silently never receive updates. |
| `uploadUpdaterJson: true` is present, `includeUpdaterJson` is absent | tauri-action's input is `uploadUpdaterJson`. The near-identical `includeUpdaterJson` does not exist — the action ignores it, the release publishes without `latest.json`, and every installed app silently stops seeing updates. |
| Draft-then-publish, `contents: write`, signing secrets passed | A half-built release going live, or a job failing at the signing step. |
| Every `script/*.sh` is executable and parses | A script that cannot run because it lost its `+x` bit. |
| `.secrets/` is gitignored | The updater private key being committable. |

**What it cannot check.** A Tauri app cannot be cross-compiled — WebKitGTK, WebView2 and the OS installers only work on their own platform. So the script inspects `release.yml` for the right matrix rather than building for Windows/Linux/macOS. The first real tag push is still the only true test of those three jobs; check the published `latest.json` afterwards for all four platform keys.

Checks that need a local dev environment (`yarn`, `node_modules`) report a `warn` and skip rather than failing, so the script still works in a stripped container or on a fresh clone.

## Release flow

```bash
script/check.sh            # gate: what CI will run
script/check-cicd.sh       # gate: is the release plumbing actually wired up?
# bump version in src-tauri/Cargo.toml AND src-tauri/tauri.conf.json, commit
script/release.sh v0.1.0   # validates, tags, pushes
                              -> GitHub Actions
                              -> 4 platform builds into a DRAFT release
                              -> publish job flips the draft to published
```

Run both gates before you tag. `check.sh` catches a broken build; `check-cicd.sh` catches a release that would build fine and then fail at the signing or manifest step.

`script/release.sh`:

- requires a `vX.Y.Z` argument (anything else prints usage to stderr and exits 1),
- refuses to run with a dirty working tree,
- refuses a tag that does not match the version in `src-tauri/Cargo.toml` (the updater advertises the tag's version, so a mismatch would make a released build that can never see an update),
- re-running with an existing tag force-moves it to `HEAD` and deletes the old GitHub Release so CI recreates it.

**The version lives in two places** and both must be bumped: `src-tauri/Cargo.toml` (`version = "0.1.0"`) and `src-tauri/tauri.conf.json` (`"version": "0.1.0"`).

## Build matrix

A Tauri app **cannot be cross-compiled for another OS** — the webview (WebKitGTK / WebView2), the code-signing tooling and the OS installers all only work on their native platform. So `.github/workflows/release.yml` runs one job per target on a runner of the matching OS:

| Target triple | Runner | Bundles |
| --- | --- | --- |
| `aarch64-apple-darwin` | `macos-latest` | `.app` + `.app.tar.gz` (updater) + `.dmg` |
| `x86_64-apple-darwin` | `macos-15-intel` | `.app` + `.app.tar.gz` (updater) + `.dmg` |
| `x86_64-unknown-linux-gnu` | `ubuntu-latest` | AppImage, `.deb`, `.rpm` |
| `x86_64-pc-windows-msvc` | `windows-latest` | NSIS `.exe`, `.msi` |

Notes:

- The Linux job installs the Tauri v2 system dependencies via `apt` before building, plus `desktop-file-utils` and `rpm` for the `.deb`/`.rpm` bundlers (the `all` bundle target in `tauri.conf.json` includes them).
- If `macos-15-intel` is unavailable in your plan/region, swap it for `macos-13` in the matrix — the rest of the job is identical.
- Bundle **signing/notarization** (Apple Developer ID, Windows code-signing certificate) is *not* configured. The artifacts are updater-signed (see below) but the macOS app will be un-notarized and will show a Gatekeeper warning on first launch, and Windows SmartScreen will warn on the installer. See [Manual steps](#manual-steps-before-the-first-release).

## Auto-update

`src-tauri/tauri.conf.json` enables the updater:

```json
"bundle": { "createUpdaterArtifacts": true },
"plugins": {
  "updater": {
    "pubkey": "<base64 minisign public key of the updater keypair>",
    "endpoints": ["https://github.com/cavaldos/tauri/releases/latest/download/latest.json"],
    "windows": { "installMode": "passive" }
  }
}
```

How it works end to end:

1. `createUpdaterArtifacts: true` makes `tauri build` emit a `.sig` next to every updater artifact (`.app.tar.gz`, `.nsis.zip`, `.msi.zip`, AppImage, …) and sign it with the updater private key.
2. Every matrix job runs [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) with `uploadUpdaterJson: true` against the **same draft release**. The action uploads the bundles and then generates `latest.json`, a manifest of `{ version, notes, pub_date, platforms: { "darwin-aarch64": { signature, url }, … } }`, **merging its target's entry into the copy already on the release** — so the draft accumulates one entry per platform.
3. Only after all four builds succeed does the `publish` job `PATCH` the draft to `draft: false`. That is the moment `/releases/latest/download/latest.json` — the updater endpoint — starts serving the full, signed manifest.
4. At runtime the app compares the manifest version with the running one, verifies each `signature` against the committed `pubkey`, and downloads the matching artifact. A tampered or unsigned manifest is rejected.

Consequence: **the tag must always match `Cargo.toml`/`tauri.conf.json`'s version** (hence the check in `script/release.sh`) — the updater only offers strictly newer versions.

## Required GitHub secrets

Create these under **Settings → Secrets and variables → Actions** in the repository:

| Secret | Required | Value |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | yes | The **contents** of the updater private key, in the one-line form the action expects. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | yes | The password used when the key was generated (empty string if it was generated without one). |
| `GITHUB_TOKEN` | no | Provided automatically by Actions; the release job requests `contents: write` via the workflow's `permissions` block. |

First, the two halves of the key pair, and why they go to different places:

| | What it is | Where it goes |
| --- | --- | --- |
| **Public key** | Verifies that a downloaded update really came from you. | `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` — committed, safe to share. |
| **Private key** | Signs each release artifact. Anyone holding it can ship an "update" to your users. | **Only** the `TAURI_SIGNING_PRIVATE_KEY` secret. Never commit it, never paste it in a chat or an issue. |

> This key is the **Tauri updater** signing key. It is *not* an Apple Developer ID or a Windows code-signing certificate — those are separate credentials, not covered here.

### 1. Generate the key pair

One command, run from the project root:

```bash
yarn tauri signer generate -w .secrets/tauri-updater.key -p ""
```

- `-w` writes the key to that path instead of `~/.tauri/`. Keeping it inside the project means `script/check-cicd.sh` can find it, and `.secrets/` is already gitignored.
- `-p ""` is the password. **An empty password is fine and is the simplest option** — the real protection is that the file never leaves your machine and the secret is write-only in GitHub. Pass something else (`-p "your-password"`) if you prefer, but then you must enter the same value as the password secret or every release build fails at the signing step.
- Omit `-p` entirely to be prompted interactively instead.

It prints two paths and creates both files:

```
Private: .../.secrets/tauri-updater.key   (Keep it secret!)
Public:  .../.secrets/tauri-updater.key.pub
```

Confirm the private key is protected:

```bash
git check-ignore .secrets/tauri-updater.key && echo "gitignored ✓"
```

### 2. Copy the public key into `src-tauri/tauri.conf.json`

The `.pub` file contains exactly the string that belongs in the config:

```bash
jq --arg pk "$(tr -d '\n' < .secrets/tauri-updater.key.pub)" \
   '.plugins.updater.pubkey = $pk' \
   src-tauri/tauri.conf.json > /tmp/tauri.conf.json \
  && mv /tmp/tauri.conf.json src-tauri/tauri.conf.json
```

Commit this. It is public by design — the app needs it to verify updates.

### 3. Add the private key as a GitHub secret

With the `gh` CLI, from the repository root:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY      < .secrets/tauri-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ''
```

The second command is only correct if you generated the key with an empty password. If you used one, put it there instead.

Via the web UI (**Settings → Secrets and variables → Actions → New repository secret**) the same two secrets, with the private key pasted as the file's full single line.

Both files are one line of base64 (the private key is ~348 characters, the public key ~152). GitHub strips surrounding whitespace, but make sure you did not paste the `.pub` file by mistake — `script/check-cicd.sh` will tell you if the pair does not match.

### 4. Verify before your first release

```bash
script/check-cicd.sh
```

This confirms the public key in `tauri.conf.json` matches your private key, and that the private key actually signs with the password you are about to use as the secret. To do the second half by hand:

```bash
# does the pubkey in the config match the .pub file?
[[ "$(jq -r '.plugins.updater.pubkey' src-tauri/tauri.conf.json)" == \
   "$(tr -d '\n' < .secrets/tauri-updater.key.pub)" ]] && echo "pubkey matches"

# can the private key sign? (fails fast if the password is wrong)
TAURI_SIGNING_PRIVATE_KEY="$(cat .secrets/tauri-updater.key)" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
  yarn tauri signer sign /etc/hostname
```

### Rotating the key

Generating a new keypair is easy; the consequence is not. The public key is **baked into every build you have already shipped**, so those installs can only ever accept updates signed by the old key. Rotating means users on existing versions silently stop receiving updates, with no error they can act on.

Only rotate if the old private key has leaked. When you do, update `plugins.updater.pubkey` in `tauri.conf.json` and the `TAURI_SIGNING_PRIVATE_KEY` secret **in the same commit** — a mismatch makes every update fail signature verification. Re-run `script/check-cicd.sh` afterwards.

## CI

`.github/workflows/ci.yml` runs on every push and PR to `main` and is deliberately lean (no tests exist yet):

- `frontend` — `yarn install --frozen-lockfile` (cached) + `yarn build` (`tsc` then `vite build`).
- `rust` — installs the Tauri Linux system dependencies, then `cargo fmt --all --check`, `cargo clippy --all-targets --all-features -- -D warnings`, `cargo check --all-targets --all-features` in `src-tauri/`.

`.github/dependabot.yml` watches the `npm` (root), `cargo` (`/src-tauri`) and `github-actions` ecosystems, weekly.

## Manual steps before the first release

1. **Check the repository slug.** The updater endpoint, the release instructions and this README use `cavaldos/tauri`, which matches `git remote -v`. If you fork or move the project, update `plugins.updater.endpoints` in `src-tauri/tauri.conf.json` — an endpoint pointing at a repo you do not control means no release is ever detected.
2. **Create the two secrets** (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) — without them the release job fails at the signing step. See [Required GitHub secrets](#required-github-secrets) for how to generate the key and set both, if this project does not already have a keypair in `.secrets/`.
3. **Confirm the committed pubkey** in `src-tauri/tauri.conf.json` matches the private key you just pasted. Test with a throwaway release (`v0.0.1`) and check the downloaded `latest.json` — its `signature` must verify against the pubkey.
4. **Enable Actions write permissions** if your repository/org restricts the default token to read-only (workflows are allowed to request `contents: write`, but an org policy can cap it).
5. **Optionally add bundle signing**: Apple Developer ID + notarization credentials (env/secret based, wired into the `macos-*` jobs) and a Windows code-signing certificate for the NSIS installer. Without them macOS Gatekeeper and Windows SmartScreen will warn users.
6. **Set the first tag.** Since `productName`/`identifier` are still `tauri-template` / `com.bourbon.tauri-template`, rename them before the first release if the app is not actually a template — the bundle name, the macOS app and the Windows registry entries all follow the identifier.

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + the [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) extension + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).
