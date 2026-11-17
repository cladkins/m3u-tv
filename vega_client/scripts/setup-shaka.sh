#!/usr/bin/env bash
# Fetches Amazon's Vega patches for Shaka Player, builds Shaka with them, and
# copies the build plus Amazon's W3C media polyfills into src/vendor/shaka.
# The output is gitignored: Amazon ships the polyfills under its own license,
# so they are downloaded at install time instead of committed to this repo.
#
# Needs git, python3, Java 21+ and node. Pass --force to rebuild.

set -euo pipefail

SHAKA_VERSION="4.8.5"
SHAKA_RELEASE="1.7"
TARBALL="shaka-rel-v${SHAKA_VERSION}-r${SHAKA_RELEASE}-devices_scope.tar.gz"
TARBALL_URL="https://amzndevresources.com/vega/media-player/${TARBALL}"
TARBALL_SHA256="8a9d55c8bb9fdf08b40f46a308e47d6530cc31a251e381086434d77da17ff90f"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/.shaka"
OUT="$ROOT/src/vendor/shaka"

if [[ "${1:-}" != "--force" && -f "$OUT/dist/shaka-player.compiled.js" ]]; then
  echo "Shaka Player for Vega already set up in src/vendor/shaka (use --force to rebuild)."
  exit 0
fi

if [[ "${M3UTV_SKIP_SHAKA:-}" == "1" ]]; then
  echo "M3UTV_SKIP_SHAKA=1: skipping Shaka Player setup. HLS playback will not bundle."
  exit 0
fi

for tool in git python3 java node npm curl tar; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Error: $tool is required to build Shaka Player for Vega." >&2
    exit 1
  fi
done

mkdir -p "$WORK"
cd "$WORK"

if [[ ! -f "$TARBALL" ]]; then
  echo "Downloading $TARBALL_URL"
  curl -fsSL -o "$TARBALL.part" "$TARBALL_URL"
  mv "$TARBALL.part" "$TARBALL"
fi

ACTUAL_SHA="$( (sha256sum "$TARBALL" 2>/dev/null || shasum -a 256 "$TARBALL") | cut -d' ' -f1)"
if [[ "$ACTUAL_SHA" != "$TARBALL_SHA256" ]]; then
  echo "Error: checksum mismatch for $TARBALL (got $ACTUAL_SHA)." >&2
  rm -f "$TARBALL"
  exit 1
fi

rm -rf shaka-rel
tar -xzf "$TARBALL" 2>/dev/null
find shaka-rel -name '._*' -delete
find shaka-rel -name '.DS_Store' -delete

# Shaka's karma test runner pins ua-parser-js to a GitHub fork, which npm
# fetches over SSH. The build doesn't need it, and SSH to GitHub isn't
# available on every machine, so the clone uses the npm release instead.
(
  cd shaka-rel/scripts
  rm -rf shaka-player
  git clone --quiet https://github.com/shaka-project/shaka-player.git
  cd shaka-player
  git checkout --quiet -b "amz_${SHAKA_VERSION}" "v${SHAKA_VERSION}"
  git -c user.name=m3utv -c user.email=m3utv@localhost am --quiet -3 ../../shaka-patch/*.patch
  sed -i.bak 's#"github:joeyparrish/ua-parser-js\#preview"#"0.7.33"#' package.json
  # The demo UI's CSS inlines Google Fonts at build time; the app never uses
  # that UI, and the fetch fails on restricted networks.
  sed -i.bak '/@import (css, inline) "https:\/\/fonts.googleapis.com/d' ui/controls.less
  rm -f package.json.bak ui/controls.less.bak package-lock.json
  npm install --no-audit --no-fund
  python3 build/all.py
)

BUILD="$WORK/shaka-rel/scripts/shaka-player"
rm -rf "$OUT"
mkdir -p "$OUT/dist" "$OUT/polyfills"
cp "$BUILD"/dist/shaka-player.compiled.js "$OUT/dist/"
cp "$BUILD"/dist/shaka-player.compiled.d.ts "$OUT/dist/" 2>/dev/null || true
cp "$WORK"/shaka-rel/src/polyfills/*.ts "$OUT/polyfills/"

for file in "$OUT"/polyfills/*.ts; do
  if ! grep -qF '// @ts-nocheck' "$file"; then
    { echo '// @ts-nocheck'; cat "$file"; } > "$file.tmp" && mv "$file.tmp" "$file"
  fi
done

node --check "$OUT/dist/shaka-player.compiled.js"
echo "Shaka Player ${SHAKA_VERSION}-r${SHAKA_RELEASE} for Vega is ready in src/vendor/shaka."
