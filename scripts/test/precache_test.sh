#!/usr/bin/env bash
# Guards the service worker's precache: the built sw.js must list every URL once. A duplicate (once
# manifest.webmanifest, listed by both the glob and the PWA plugin) makes Cache.addAll throw
# InvalidStateError, so the worker never installs. Builds into a temporary dir; leaves web/dist alone.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$HERE/../../web"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if ! (cd "$WEB" && pnpm exec vite build --outDir "$OUT" --emptyOutDir >"$OUT/build.log" 2>&1); then
  cat "$OUT/build.log"
  echo "FAIL: vite build failed"
  exit 1
fi

[ -f "$OUT/sw.js" ] || { echo "FAIL: sw.js was not built"; exit 1; }

urls="$(grep -oE '"?url"?:"[^"]+"' "$OUT/sw.js" | sort)"
[ -n "$urls" ] || { echo "FAIL: no precache entries found in sw.js"; exit 1; }
dups="$(printf '%s\n' "$urls" | uniq -d)"
if [ -n "$dups" ]; then
  printf 'FAIL: duplicate precache URLs in sw.js:\n%s\n' "$dups"
  exit 1
fi
# LG: the Family Pot icons are precached, so the installed app has them offline
for u in favicon.ico favicon.svg favicon-16.png favicon-32.png apple-touch-icon.png icon-192.png icon-512.png \
  icon-maskable-192.png icon-maskable-512.png safari-pinned-tab.svg; do
  printf '%s\n' "$urls" | grep -qE "\"$u\"" || { echo "FAIL: $u is not in the precache"; exit 1; }
done
echo "precache ok: $(printf '%s\n' "$urls" | wc -l) unique URLs"
