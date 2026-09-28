#!/usr/bin/env bash
# Production build of the Tauri app: script/build.sh
# Frontend (tsc + vite build) then cargo/t bundling for the host platform.
# Installer bundles land in src-tauri/target/release/bundle/.
#
# Env:
#   BUNDLE_TARGETS  tauri --bundles value (default: all)
#   VERSION          stamped into the log line only; the app version comes
#                    from src-tauri/Cargo.toml + src-tauri/tauri.conf.json
set -euo pipefail
cd "$(dirname "$0")/.."

BUNDLE_TARGETS="${BUNDLE_TARGETS:-all}"
VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo dev)}"

echo "==> frontend build"
yarn install --frozen-lockfile
yarn build

echo "==> tauri build (bundles: $BUNDLE_TARGETS)"
# Local builds are unsigned: the updater key is not available outside CI.
yarn tauri build --bundles "$BUNDLE_TARGETS"

echo "built $VERSION — installers in src-tauri/target/release/bundle/"
