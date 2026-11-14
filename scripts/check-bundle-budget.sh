#!/usr/bin/env bash
# B9-21 (RES-04): the entry chunk's brotli size budget. The entry is the module script index.html names; its .br sibling
# (written by the build's precompress step) is what a phone downloads. Over 350 KB warns, over 400 KB fails.
# BUNDLE_DIST: the built frontend (default web/dist).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${BUNDLE_DIST:-$ROOT/web/dist}"
WARN_BYTES=350000
FAIL_BYTES=400000

if [ ! -f "$DIST/index.html" ]; then
  echo "bundle budget: FAIL: no built frontend at $DIST (run pnpm -C web build)" >&2
  exit 1
fi
entry="$(grep -oE '<script[^>]*type="module"[^>]*src="[^"]+\.js"' "$DIST/index.html" | grep -oE 'src="[^"]+"' | head -1 | sed -E 's|src="/?([^"]*)"|\1|')"
if [ -z "$entry" ] || [ ! -f "$DIST/$entry" ]; then
  echo "bundle budget: FAIL: index.html names no entry chunk that exists in $DIST" >&2
  exit 1
fi
if [ ! -f "$DIST/$entry.br" ]; then
  echo "bundle budget: FAIL: $entry has no .br sibling (the precompress step did not run)" >&2
  exit 1
fi
size=$(wc -c <"$DIST/$entry.br" | tr -d ' ')
kb=$(( (size + 500) / 1000 ))
if [ "$size" -gt "$FAIL_BYTES" ]; then
  echo "bundle budget: FAIL: $entry is ${kb} KB brotli, over the 400 KB budget" >&2
  exit 1
fi
if [ "$size" -gt "$WARN_BYTES" ]; then
  echo "bundle budget: WARN: $entry is ${kb} KB brotli, over 350 KB (the budget is 400 KB)"
  exit 0
fi
echo "bundle budget: ok: $entry is ${kb} KB brotli (warn at 350 KB, fail over 400 KB)"
