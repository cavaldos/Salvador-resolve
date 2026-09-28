#!/usr/bin/env bash
# Run exactly what CI runs, before pushing: script/check.sh
# Mirrors .github/workflows/ci.yml (frontend build + cargo fmt/clippy/check).
set -euo pipefail
cd "$(dirname "$0")/.."

step() { echo "==> $*"; }

step "frontend build (tsc + vite build)"
yarn install --frozen-lockfile
yarn build

step "cargo fmt --all --check"
(cd src-tauri && cargo fmt --all --check)

step "cargo clippy -- -D warnings"
(cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings)

step "cargo check"
(cd src-tauri && cargo check --all-targets --all-features)

echo "check passed"
