#!/usr/bin/env bash
# Run the app in dev mode (Vite dev server + Tauri window, hot reload):
#   script/dev.sh            # localhost only (default)
#   script/dev.sh --lan      # reachable from other devices on the same network
#   script/dev.sh --lan 192.168.1.50   # pin the advertised address
#
# Any extra arguments are forwarded to `tauri dev` (e.g. --no-watch).
set -euo pipefail
cd "$(dirname "$0")/.."

# lan_ip prints this machine's IPv4 address on the network that carries the
# default route, i.e. the address a phone on the same Wi-Fi can actually reach.
# Prints nothing (and fails) on an isolated machine.
lan_ip() {
  case "$(uname -s)" in
    Darwin)
      local dev ip
      dev="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
      if [[ -n "$dev" ]]; then
        ip="$(ipconfig getifaddr "$dev" 2>/dev/null || true)"
        [[ -n "$ip" ]] && { echo "$ip"; return 0; }
      fi
      for dev in en0 en1; do
        ip="$(ipconfig getifaddr "$dev" 2>/dev/null || true)"
        [[ -n "$ip" ]] && { echo "$ip"; return 0; }
      done
      ;;
    Linux)
      ip -4 route get 1.1.1.1 2>/dev/null \
        | awk '{for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}'
      ;;
  esac
}

BIND=""
ADVERTISE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lan)
      BIND="0.0.0.0"
      # An explicit IP may follow: --lan 192.168.1.50.
      # Read $2 *before* shifting, or the address is consumed as the shift.
      if [[ "${2:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        ADVERTISE="$2"
        shift 2
      else
        shift
      fi
      ;;
    --lan=*)
      BIND="0.0.0.0"
      ADVERTISE="${1#--lan=}"
      shift
      ;;
    -h|--help)
      # Print the leading comment block, stop at the first line of code.
      awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

if [[ -n "$BIND" ]]; then
  if [[ -z "$ADVERTISE" ]]; then
    ADVERTISE="$(lan_ip || true)"
  fi
  if [[ -z "$ADVERTISE" ]]; then
    echo "error: --lan given but no LAN address could be detected." >&2
    echo "       connect to a network, or pass one explicitly:" >&2
    echo "         script/dev.sh --lan 192.168.1.50" >&2
    exit 1
  fi
  export TAURI_DEV_HOST="$BIND"
  export TAURI_DEV_HMR_HOST="$ADVERTISE"
  echo "dev server bound to $BIND, advertised as $ADVERTISE"
  echo "  local:  http://localhost:1420"
  echo "  network: http://$ADVERTISE:1420   <- open this on your phone"
  echo
  echo "note: the Vite dev server has no authentication. Anything on this network"
  echo "      can load it while it runs; use --lan only on a network you trust."
else
  # Respect a hand-set TAURI_DEV_HOST without requiring --lan.
  export TAURI_DEV_HOST="${TAURI_DEV_HOST-}"
  [[ -n "$TAURI_DEV_HOST" ]] || unset TAURI_DEV_HOST
fi

exec yarn tauri dev "$@"
