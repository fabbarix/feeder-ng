#!/usr/bin/env bash
# Guards the icon bundle budget (docs/design/ui-fix-plan.md WP2): the registered icons, built on their own
# through web/src/ui/icons.ts (react external), must weigh < 40 kB gzipped, and icons.ts must import each
# icon from its own /dist/csr/<Name> module (never the barrel, which would drag in ~9,000 modules).
# Builds a tiny library entry into a temporary dir; leaves web/dist alone.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$HERE/../../web"
ICONS="$WEB/src/ui/icons.ts"
BUDGET=40960
MIN_MODULES=87   # distinct Phosphor icons in docs/dev/design/wp2-icons.md
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if grep -nE "from ['\"]@phosphor-icons/react['\"]" "$ICONS"; then
  echo "FAIL: barrel import in icons.ts"; exit 1
fi
n="$(grep -cE "from '@phosphor-icons/react/dist/csr/[A-Za-z0-9]+'" "$ICONS")"
if [ "$n" -lt "$MIN_MODULES" ]; then
  echo "FAIL: icons.ts imports $n per-icon modules, expected >= $MIN_MODULES"; exit 1
fi

cat >"$OUT/entry.ts" <<ENTRY
export { icons } from '$ICONS'
ENTRY
cat >"$OUT/vite.config.mjs" <<CONF
export default {
  root: '$WEB',
  logLevel: 'warn',
  build: {
    outDir: '$OUT/dist',
    emptyOutDir: true,
    minify: true,
    lib: { entry: '$OUT/entry.ts', formats: ['es'], fileName: 'icons' },
    rollupOptions: { external: ['react', 'react/jsx-runtime'] },
  },
}
CONF

if ! (cd "$WEB" && pnpm exec vite build --config "$OUT/vite.config.mjs" >"$OUT/build.log" 2>&1); then
  cat "$OUT/build.log"; echo "FAIL: icon bundle build failed"; exit 1
fi

js="$(ls "$OUT"/dist/*.js "$OUT"/dist/*.mjs 2>/dev/null | head -1)"
[ -n "$js" ] || { echo "FAIL: no bundle produced"; exit 1; }
gz="$(gzip -9c "$js" | wc -c)"
if [ "$gz" -ge "$BUDGET" ]; then
  echo "FAIL: icon bundle is $gz bytes gzipped, budget $BUDGET"; exit 1
fi
echo "icons bundle ok: $n modules, $gz bytes gzipped (budget $BUDGET)"
