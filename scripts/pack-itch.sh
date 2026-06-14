#!/usr/bin/env bash
# pack-itch.sh -- build Interstellar Craft and zip for itch.io upload.
# Usage: bash scripts/pack-itch.sh
# (chmod +x scripts/pack-itch.sh to make executable on Unix/macOS)

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Building Interstellar Craft..."
# Use root-relative base for itch.io HTML5 (no sub-path prefix needed).
VITE_BASE=/ npm run build

echo "==> Zipping dist/ -> interstellar-craft.zip..."
rm -f interstellar-craft.zip
if command -v zip >/dev/null 2>&1; then
  cd dist && zip -r ../interstellar-craft.zip . && cd ..
elif command -v python3 >/dev/null 2>&1; then
  python3 - <<'PYEOF'
import zipfile, os
zip_path = 'interstellar-craft.zip'
dist_dir = 'dist'
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(dist_dir):
        for f in files:
            fp = os.path.join(root, f)
            arcname = os.path.relpath(fp, dist_dir)
            zf.write(fp, arcname)
print('Written: interstellar-craft.zip')
PYEOF
else
  echo "ERROR: Neither zip nor python3 found. Install zip and retry."
  exit 1
fi

echo ""
echo "====================================================="
echo " interstellar-craft.zip is ready."
echo "====================================================="
echo ""
echo " Upload interstellar-craft.zip to itch.io as an HTML5 game:"
echo "   1. Go to https://itch.io/game/new  (or edit your existing page)"
echo "   2. Kind: HTML  |  Upload: interstellar-craft.zip"
echo "   3. Check 'This file will be played in the browser'"
echo "   4. Embed options: width 1280, height 720, fullscreen enabled"
echo "   5. Publish!"
echo ""
