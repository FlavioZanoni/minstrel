#!/usr/bin/env bash
# Builds minstrel.zip for the Chrome Web Store from the extension/ folder.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/extension"

# Every mood in the music manifest must have its audio file present.
missing=0
for f in $(jq -r '.[].file' music/manifest.json); do
  if [ ! -f "music/$f" ]; then
    echo "missing music/$f. Run ./download-music.sh first." >&2
    missing=1
  fi
done
[ "$missing" -eq 0 ] || exit 1

rm -f "$SCRIPT_DIR/minstrel.zip"
zip -qr "$SCRIPT_DIR/minstrel.zip" . -x "*.DS_Store"
echo "built $SCRIPT_DIR/minstrel.zip ($(du -h "$SCRIPT_DIR/minstrel.zip" | cut -f1))"
