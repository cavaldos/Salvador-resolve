#!/usr/bin/env bash
# Cut a release: script/release.sh vX.Y.Z
# Creates + pushes the tag; GitHub Actions (release.yml) builds the bundles
# for macOS/Linux/Windows and publishes the signed GitHub Release.
set -euo pipefail
cd "$(dirname "$0")/.."

TAG="${1:-}"
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "usage: script/release.sh vX.Y.Z  (e.g. script/release.sh v0.1.0)" >&2
  exit 1
}
[[ -z "$(git status --porcelain)" ]] || {
  echo "error: working tree is dirty — commit or stash first" >&2
  exit 1
}
# The version lives in Cargo.toml and tauri.conf.json; the tag must agree
# with it or the updater will advertise a version the app does not report.
APP_VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -1)"
if [[ "$TAG" != "v${APP_VERSION}" ]]; then
  echo "error: tag $TAG does not match src-tauri/Cargo.toml version ${APP_VERSION}." >&2
  echo "       bump the version in src-tauri/Cargo.toml and src-tauri/tauri.conf.json first." >&2
  exit 1
fi
# Re-running with an existing tag moves the tag to HEAD and rebuilds
# the release (old GitHub Release is deleted so CI recreates it).
if git rev-parse "$TAG" >/dev/null 2>&1 \
  || git ls-remote --tags --exit-code origin "refs/tags/$TAG" >/dev/null 2>&1; then
  echo "tag $TAG already exists — rebuilding it on $(git rev-parse --short HEAD)"
  if command -v gh >/dev/null 2>&1; then
    gh release delete "$TAG" --yes 2>/dev/null || true
  fi
  git tag -f -a "$TAG" -m "Release $TAG"
  git push --force origin "$TAG"
else
  git tag -a "$TAG" -m "Release $TAG"
  git push origin "$TAG"
fi
echo "pushed $TAG — watch the release build under GitHub Actions"
