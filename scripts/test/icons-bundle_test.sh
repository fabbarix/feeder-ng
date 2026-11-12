#!/usr/bin/env bash
# Guards the icon bundle budget (docs/design/ui-fix-plan.md WP2, docs/dev/design/uf1-icons.md): the registered
# icons, built on their own through web/src/ui/icons.ts (react external) with the weight-stripping plugin
# (web/vite.phosphor-weights.ts, also used by web/vite.config.ts), must weigh < 42 kB gzipped; the chunk must
# carry only the weights the app uses (regular, bold, fill, duotone; never thin or light); and icons.ts must
# import each icon from its own /dist/csr/<Name> module (never the barrel, which would drag in ~9,000 modules).
# Builds a tiny library entry into a temporary dir; leaves web/dist alone.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB="$HERE/../../web"
ICONS="$WEB/src/ui/icons.ts"
# Budget 43 kB (44,032 B). UF1 measured 40,952 B with 97 glyphs and the plugin (68,255 B without it, which is
# why the old 64 kB budget could not take the four ImagePicker glyphs). Sort-drag measured 42,918 B with 102 modules;
# the PM raised the budget to the new size + sensible headroom (~1.1 kB, 90 B was not sensible).
# Pantry added the Storage Place kind glyphs (Snowflake, ThermometerCold) after Shop Location's MapPin: 44,800 B, so
# the budget moved to 45 KiB, keeping about 1.2 kB of headroom again.
BUDGET=46080
MIN_MODULES=107   # distinct Phosphor icons in docs/dev/design/wp2-icons.md (+4 in UF1, +3 in R14/WP-D: Drop, Cube, Key; +1 in photo-read: Images; +1 in beta.5 WP D: ShoppingCart)
PLUGIN="$WEB/vite.phosphor-weights.ts"
if [ ! -f "$PLUGIN" ]; then
  echo "FAIL: $PLUGIN missing (exports phosphorWeights(), strips thin and light from the Phosphor defs)"; exit 1
fi
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if grep -nE "from ['\"]@phosphor-icons/react['\"]" "$ICONS"; then
  echo "FAIL: barrel import in icons.ts"; exit 1
fi
n="$(grep -cE "from '@phosphor-icons/react/dist/csr/[A-Za-z0-9]+'" "$ICONS")"
if [ "$n" -lt "$MIN_MODULES" ]; then
  echo "FAIL: icons.ts imports $n per-icon modules, expected >= $MIN_MODULES"; exit 1
fi

# This test wires the plugin into its own tiny config; the vitest weights test covers the real web/vite.config.ts.
cat >"$OUT/entry.ts" <<ENTRY
export { icons } from '$ICONS'
ENTRY
cat >"$OUT/vite.config.mjs" <<CONF
import { phosphorWeights } from '$PLUGIN'
export default {
  root: '$WEB',
  logLevel: 'warn',
  plugins: [phosphorWeights()],
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
Q="[\"'\`]"   # weight keys may be quoted with a double quote, single quote or backtick, depending on the minifier
for w in thin light; do
  if grep -qE "$Q$w$Q" "$js"; then echo "FAIL: the icon chunk still ships the unused '$w' weight"; exit 1; fi
done
for w in regular bold fill duotone; do
  grep -qE "$Q$w$Q" "$js" || { echo "FAIL: the icon chunk lost the '$w' weight, which the app uses"; exit 1; }
done
echo "icons bundle ok: $n modules, $gz bytes gzipped (budget $BUDGET)"
