#!/usr/bin/env bash
# Scaffold a help-video topic for a tenant.
#
# Usage:  scaffold.sh <tenant> <topic> [desktop|mobile|both]
# Example: scaffold.sh scs login both
#
# Creates:
#   docs/documentation/videos/<tenant>/<topic>/<platform>/script.md   (from template)
#   docs/documentation/videos/<tenant>/<topic>/<platform>/assets/
# Existing script.md files are never overwritten.
set -euo pipefail

TENANT="${1:?tenant required (e.g. scs)}"
TOPIC="${2:?topic slug required (e.g. login)}"
PLATFORMS="${3:-both}"

SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="docs/documentation/videos/$TENANT/$TOPIC"

case "$PLATFORMS" in
  both)    PLATS="desktop mobile" ;;
  desktop) PLATS="desktop" ;;
  mobile)  PLATS="mobile" ;;
  *) echo "platform must be one of: desktop | mobile | both" >&2; exit 1 ;;
esac

for p in $PLATS; do
  mkdir -p "$ROOT/$p/assets"
  [ -e "$ROOT/$p/assets/.gitkeep" ] || touch "$ROOT/$p/assets/.gitkeep"
  dest="$ROOT/$p/script.md"
  if [ -e "$dest" ]; then
    echo "exists, skipping: $dest"
  else
    sed -e "s/{{TENANT}}/$TENANT/g" -e "s/{{TOPIC}}/$TOPIC/g" -e "s/{{PLATFORM}}/$p/g" \
      "$SKILL_DIR/script-template.md" > "$dest"
    echo "created: $dest"
  fi
done

echo "scaffolded $ROOT  (platforms: $PLATS)"
echo "Next: fill in each script.md storyboard, then write $ROOT/CAPTURE-GUIDE.md"
