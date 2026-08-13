#!/usr/bin/env bash
# Downloads the mood-matched background music tracks listed in
# extension/music/manifest.json into extension/music/<mood>.<ext>.
# Idempotent: skips any file that already exists.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MUSIC_DIR="$SCRIPT_DIR/extension/music"
MANIFEST="$MUSIC_DIR/manifest.json"

if [ ! -f "$MANIFEST" ]; then
  echo "Manifest not found at $MANIFEST" >&2
  exit 1
fi

for cmd in jq curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd is required but not installed. Install $cmd and re-run." >&2
    exit 1
  fi
done

mkdir -p "$MUSIC_DIR"

# No mapfile/process substitution: macOS ships bash 3.2, and a jq parse
# failure must abort instead of silently yielding an empty mood list.
MOODS=$(jq -r 'keys[]' "$MANIFEST") || { echo "Failed to parse $MANIFEST" >&2; exit 1; }

failed=0

for mood in $MOODS; do
  file=$(jq -r ".\"$mood\".file" "$MANIFEST")
  url=$(jq -r ".\"$mood\".url" "$MANIFEST")
  dest="$MUSIC_DIR/$file"

  if [ -f "$dest" ]; then
    echo "[skip] $mood -> $file (already exists)"
    continue
  fi

  echo "[download] $mood -> $file"
  if curl -sL --fail -o "$dest" "$url"; then
    echo "  ok: $(du -h "$dest" | cut -f1)"
  else
    echo "  FAILED to download $mood from $url" >&2
    rm -f "$dest"
    failed=$((failed + 1))
  fi
done

if [ "$failed" -gt 0 ]; then
  echo "$failed track(s) FAILED to download — the extension will have no music for those moods." >&2
  exit 1
fi
echo "Done."
