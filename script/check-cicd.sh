#!/usr/bin/env bash
# Validate the CI/CD wiring before you push a tag: script/check-cicd.sh
#
# GitHub Actions only fails *after* it has burned runner minutes and after you
# have pushed a tag, which is the worst moment to learn that a secret is named
# wrong or that the updater manifest is not being produced. This script checks
# the same invariants locally, in seconds, without publishing anything.
#
# What it cannot do: build for another OS. A Tauri app is not cross-compilable
# (WebKitGTK / WebView2 / the OS installers only work natively), so the release
# matrix is verified by *inspecting release.yml*, not by running it. The first
# real tag push is still the only true test of the Windows/Linux/macOS jobs.
#
# Usage:
#   script/check-cicd.sh          # config + wiring checks (fast, default)
#   script/check-cicd.sh --full   # also do a real signed bundle build locally
set -euo pipefail
cd "$(dirname "$0")/.."

FULL=0
[[ "${1:-}" == "--full" ]] && FULL=1

FAILED=0
WARNED=0
step() { echo; echo "==> $*"; }
ok()   { echo "  ok   $*"; }
bad()  { echo "  FAIL $*"; FAILED=$((FAILED + 1)); }
warn() { echo "  warn $*"; WARNED=$((WARNED + 1)); }
die()  { echo "  FAIL $*" >&2; exit 1; }

# has <file> <extended-regex> <description>
has() {
  local file="$1" re="$2" desc="$3"
  if grep -qE "$re" "$file" 2>/dev/null; then ok "$desc"; else bad "$desc — not found in $file"; fi
}

# lacks <file> <extended-regex> <description>
lacks() {
  local file="$1" re="$2" desc="$3"
  if grep -qE "$re" "$file" 2>/dev/null; then
    bad "$desc — found in $file"
  else ok "$desc"; fi
}

command -v jq >/dev/null 2>&1 || die "jq is required (brew install jq)"

# ---------------------------------------------------------------- toolchain --
step "local toolchain"
ok "jq $(jq --version | sed 's/jq-//')"
if command -v gh >/dev/null 2>&1; then
  ok "gh CLI present (script/release.sh can delete a stale release)"
else
  warn "gh CLI not found — re-pushing an existing tag will not delete the old release"
fi

# -------------------------------------------------------------- script gate --
step "script/ integrity"
for s in dev build check release check-cicd; do
  f="script/$s.sh"
  if [[ ! -f "$f" ]]; then bad "$f is missing"; continue; fi
  bash -n "$f" 2>/dev/null || { bad "$f has a bash syntax error"; continue; }
  [[ -x "$f" ]] || { bad "$f is not executable — run: chmod +x $f"; continue; }
  ok "$f"
done

# The malformed-tag guard is the only release.sh behaviour that can be tested
# without side effects: it rejects before touching git. A matching tag would
# create and push a real release, so that path is deliberately not exercised.
if bash script/release.sh 0.1 >/dev/null 2>&1; then
  bad "script/release.sh accepted a malformed tag (expected rejection)"
else
  ok "script/release.sh rejects a malformed tag before doing anything"
fi

# ------------------------------------------------------------- version gate --
step "version consistency (the updater depends on it)"
CARGO_VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -1)"
CONF_VERSION="$(jq -r '.version' src-tauri/tauri.conf.json)"
if [[ "$CARGO_VERSION" == "$CONF_VERSION" ]]; then
  ok "Cargo.toml and tauri.conf.json agree on $CARGO_VERSION"
else
  bad "version mismatch: Cargo.toml=$CARGO_VERSION but tauri.conf.json=$CONF_VERSION"
  echo "       the updater only advertises versions strictly newer than the running one,"
  echo "       so a mismatch ships a release that can never see an update."
fi
[[ "$CARGO_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
  && ok "version is semver-shaped ($CARGO_VERSION)" \
  || bad "version '$CARGO_VERSION' is not X.Y.Z"

# ------------------------------------------------------------ updater wiring --
step "updater wiring (src-tauri/tauri.conf.json)"
if [[ "$(jq -r '.bundle.createUpdaterArtifacts' src-tauri/tauri.conf.json)" == "true" ]]; then
  ok "bundle.createUpdaterArtifacts = true (tauri build emits updater artifacts + .sig)"
else
  bad "bundle.createUpdaterArtifacts is not true — no updater artifacts will be built"
fi

PUBKEY="$(jq -r '.plugins.updater.pubkey // ""' src-tauri/tauri.conf.json)"
if [[ -n "$PUBKEY" && "$PUBKEY" != "null" ]]; then
  ok "plugins.updater.pubkey is set"
else
  bad "plugins.updater.pubkey is missing — every update will fail signature verification"
fi

ENDPOINT="$(jq -r '.plugins.updater.endpoints[0] // ""' src-tauri/tauri.conf.json)"
if [[ "$ENDPOINT" == *"/releases/latest/download/latest.json" ]]; then
  ok "endpoint points at a stable latest.json asset"
else
  bad "endpoint does not end in /releases/latest/download/latest.json — got '$ENDPOINT'"
fi

ENDPOINT_SLUG="${ENDPOINT#https://github.com/}"
ENDPOINT_SLUG="${ENDPOINT_SLUG%%/releases/*}"
REMOTE_URL="$(git remote get-url origin 2>/dev/null || true)"
if [[ -z "$REMOTE_URL" ]]; then
  warn "no 'origin' remote — cannot verify the endpoint points at this repository"
elif [[ "$REMOTE_URL" =~ \.git$ || "$REMOTE_URL" == *"://"* || "$REMOTE_URL" == *"@"* ]]; then
  # Strip the .git suffix first, otherwise the slug regex swallows it.
  REMOTE_SLUG="$(printf '%s' "${REMOTE_URL%.git}" | grep -oE '[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')"
  if [[ "$REMOTE_SLUG" == "$ENDPOINT_SLUG" ]]; then
    ok "endpoint repo matches origin ($REMOTE_SLUG)"
  else
    bad "endpoint points at '$ENDPOINT_SLUG' but origin is '$REMOTE_SLUG'"
    echo "       fix plugins.updater.endpoints, or the app will never detect a release."
  fi
else
  warn "could not parse origin '$REMOTE_URL'"
fi

for perm in "updater:default" "process:default" "process:allow-restart"; do
  has src-tauri/capabilities/default.json "\"$perm\"" "capability grants $perm"
done

# ------------------------------------------------------------- signing key --
step "updater signing keypair"
if [[ -f .secrets/tauri-updater.key && -f .secrets/tauri-updater.key.pub ]]; then
  ok ".secrets/tauri-updater.key is present (gitignored)"
  # Compare with trailing newlines stripped from both sides: jq -r appends one,
  # and the .pub file may have none.
  if [[ "$PUBKEY" == "$(tr -d '[:space:]' < .secrets/tauri-updater.key.pub)" ]]; then
    ok "pubkey matches the local private key"
  else
    bad "pubkey does NOT match .secrets/tauri-updater.key.pub — every update would be rejected"
  fi
  # Proves the value you are about to paste into TAURI_SIGNING_PRIVATE_KEY works,
  # and that the password secret is right. Signs a throwaway file.
  tmp="$(mktemp -d)"
  printf 'check-cicd\n' > "$tmp/probe"
  if ! command -v yarn >/dev/null 2>&1 || [[ ! -d node_modules ]]; then
    warn "yarn or node_modules unavailable — cannot exercise the signing key here"
    echo "       this is a local-environment gap, not a config problem; run 'yarn install' to enable it"
  elif TAURI_SIGNING_PRIVATE_KEY="$(cat .secrets/tauri-updater.key)" \
     TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
     yarn --silent tauri signer sign "$tmp/probe" >/dev/null 2>&1 \
     && [[ -s "$tmp/probe.sig" ]]; then
    ok "private key signs successfully with an empty password"
    echo "       -> set TAURI_SIGNING_PRIVATE_KEY_PASSWORD to an empty value"
  else
    bad "private key failed to sign — check the password you plan to use as the secret"
  fi
  rm -rf "$tmp"
else
  warn "no .secrets/tauri-updater.key — skipping keypair checks"
  echo "       generate one with: yarn tauri signer generate -w .secrets/tauri-updater.key"
fi

git check-ignore -q .secrets/tauri-updater.key 2>/dev/null \
  && ok ".secrets/ is gitignored (the private key cannot be committed by accident)" \
  || bad ".secrets/ is NOT gitignored — add it to .gitignore immediately"

# ------------------------------------------------------------------ ci.yml ---
step ".github/workflows/ci.yml"
[[ -f .github/workflows/ci.yml ]] || die ".github/workflows/ci.yml is missing"
has .github/workflows/ci.yml "yarn build" "runs the frontend build"
has .github/workflows/ci.yml "cargo clippy" "runs clippy"
has .github/workflows/ci.yml "cargo fmt" "runs rustfmt"
has .github/workflows/ci.yml "permissions:" "declares an explicit permissions block"
has .github/workflows/ci.yml "libwebkit2gtk-4\.1-dev" "installs the Tauri Linux system deps"

# ------------------------------------------------------------- release.yml ---
step ".github/workflows/release.yml (the cross-platform matrix)"
REL=.github/workflows/release.yml
[[ -f "$REL" ]] || die "$REL is missing"

has "$REL" "tags: \[\"v\*\"\]" "triggers on v* tags"
has "$REL" "contents: write" "requests the write permission it needs"
has "$REL" "releaseDraft: true" "builds into a draft release"
has "$REL" "draft=false" "publishes the draft only after every build succeeded"
has "$REL" "TAURI_SIGNING_PRIVATE_KEY:" "passes the signing key from secrets"
has "$REL" "TAURI_SIGNING_PRIVATE_KEY_PASSWORD:" "passes the signing password from secrets"

# A Tauri app cannot be cross-compiled, so each target needs a native runner.
# Missing one here means users on that platform silently never get updates.
for target in aarch64-apple-darwin x86_64-apple-darwin x86_64-unknown-linux-gnu x86_64-pc-windows-msvc; do
  has "$REL" "$target" "matrix covers $target"
done
for runner in macos-latest macos-15-intel ubuntu-latest windows-latest; do
  has "$REL" "platform: $runner" "matrix uses runner $runner"
done

# tauri-action's input is uploadUpdaterJson. includeUpdaterJson is a plausible
# typo that does not exist: the action ignores it, the release publishes without
# latest.json, and every installed app silently stops seeing updates.
has "$REL" "uploadUpdaterJson: true" "generates the signed latest.json manifest"
lacks "$REL" "includeUpdaterJson" "does not use the non-existent includeUpdaterJson input"
has "$REL" "desktop-file-utils" "installs desktop-file-utils (deb bundler)"
has "$REL" "rpm" "installs rpm (rpm bundler)"

step ".github/dependabot.yml"
[[ -f .github/dependabot.yml ]] || die ".github/dependabot.yml is missing"
for eco in npm cargo github-actions; do
  has .github/dependabot.yml "$eco" "watches the $eco ecosystem"
done

# --------------------------------------------------------------------- full --
if [[ "$FULL" == "1" ]]; then
  step "full check: real signed bundle build on this host (slow)"
  KEY_ARG=()
  if [[ -f .secrets/tauri-updater.key ]]; then
    export TAURI_SIGNING_PRIVATE_KEY="$(cat .secrets/tauri-updater.key)"
    export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
    echo "  building with the updater key, so .sig files are actually produced"
  else
    KEY_ARG=(--no-bundle)
    warn "no private key — running a compile-only check, no bundle will be produced"
  fi
  if yarn tauri build "${KEY_ARG[@]}"; then
    ok "tauri build succeeded"
    SIGS="$(find src-tauri/target/release/bundle -name '*.sig' 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$SIGS" -gt 0 ]]; then
      ok "found $SIGS .sig file(s) — the updater artifacts are signed"
    else
      bad "no .sig files found — release.yml would publish latest.json with nothing to verify"
    fi
  else
    bad "tauri build failed"
  fi
else
  echo
  echo "(re-run with --full for a real signed bundle build on this host)"
fi

# ------------------------------------------------------------------ verdict --
echo
if [[ "$FAILED" -gt 0 ]]; then
  echo "check-cicd FAILED: $FAILED problem(s), $WARNED warning(s)"
  exit 1
fi
echo "check-cicd passed${WARNED:+ ($WARNED warning(s))}"
