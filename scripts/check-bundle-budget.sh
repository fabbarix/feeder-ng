#!/usr/bin/env bash
# B9-21 (RES-04): the entry chunk's brotli size budget. The entry is the module script index.html names; its .br sibling
# (written by the build's precompress step) is what a phone downloads. Over 350 KB warns, over 400 KB fails.
# B9-59: with the routes split, the entry is that script AND the chunks it imports statically (the modulepreload links of
# index.html): all of it is downloaded before Today paints, so all of it counts. Moving code into a shared chunk the entry
# imports does not make the entry smaller.
# B9-59 (RES-04, route splitting): every other chunk under assets/ (a route's code, loaded on demand, or a library one route
# uses) has its own budget: over 200 KB brotli warns, over 250 KB fails. A chunk under 1 KB has no .br sibling and counts
# with its raw size. The five largest chunks are printed, so a growing one is seen before it fails.
# BUNDLE_DIST: the built frontend (default web/dist).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="${BUNDLE_DIST:-$ROOT/web/dist}"
WARN_BYTES=350000
FAIL_BYTES=400000
CHUNK_WARN_BYTES=200000
CHUNK_FAIL_BYTES=250000

kb() { echo $(( ($1 + 500) / 1000 )); }

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

brsize() { # the .br sibling's size, else the raw size (a file under 1 KB gets no sibling)
  if [ -f "$DIST/$1.br" ]; then wc -c <"$DIST/$1.br" | tr -d ' '; else wc -c <"$DIST/$1" | tr -d ' '; fi
}
# The entry's static imports, as index.html preloads them.
preloads="$(grep -oE '<link[^>]*rel="modulepreload"[^>]*>' "$DIST/index.html" | grep -oE 'href="[^"]+\.js"' | sed -E 's|href="/?([^"]*)"|\1|' | sort -u)"
initial=("$entry")
while read -r p; do
  [ -n "$p" ] && [ "$p" != "$entry" ] && [ -f "$DIST/$p" ] && initial+=("$p")
done <<<"$preloads"
size=0
for f in "${initial[@]}"; do size=$((size + $(brsize "$f"))); done
[ "${#initial[@]}" -eq 1 ] && what="$entry"
[ "${#initial[@]}" -gt 1 ] && what="$entry with its $(( ${#initial[@]} - 1 )) static import(s)"

rc=0
if [ "$size" -gt "$FAIL_BYTES" ]; then
  echo "bundle budget: FAIL: $what: $(kb "$size") KB brotli, over the 400 KB budget" >&2
  rc=1
elif [ "$size" -gt "$WARN_BYTES" ]; then
  echo "bundle budget: WARN: $what: $(kb "$size") KB brotli, over 350 KB (the budget is 400 KB)"
else
  echo "bundle budget: ok: $what: $(kb "$size") KB brotli, within 350 KB (the budget is 400 KB)"
fi

# Every JS chunk with its brotli size (raw when it has no .br sibling), largest first.
sizes="$(
  for js in "$DIST"/assets/*.js; do
    [ -f "$js" ] || continue
    printf '%s %s\n' "$(brsize "${js#"$DIST"/}")" "${js#"$DIST"/}"
  done | sort -rn
)"

over=0; warned=0; others=0
while read -r n name; do
  [ -n "${name:-}" ] || continue
  [[ " ${initial[*]} " == *" $name "* ]] && continue
  others=$((others + 1))
  if [ "$n" -gt "$CHUNK_FAIL_BYTES" ]; then
    echo "bundle budget: FAIL: chunk $name is $(kb "$n") KB brotli, over the 250 KB route-chunk budget" >&2
    over=$((over + 1))
  elif [ "$n" -gt "$CHUNK_WARN_BYTES" ]; then
    echo "bundle budget: WARN: chunk $name is $(kb "$n") KB brotli, over 200 KB (the route-chunk budget is 250 KB)"
    warned=$((warned + 1))
  fi
done <<<"$sizes"
[ "$over" -gt 0 ] && rc=1
if [ "$over" -eq 0 ] && [ "$warned" -eq 0 ]; then
  echo "bundle budget: ok: every chunk loaded on demand ($others) is within 200 KB brotli (the route-chunk budget is 250 KB)"
fi

echo "bundle budget: the five largest chunks (brotli):"
head -5 <<<"$sizes" | while read -r n name; do
  mark=""
  [[ " ${initial[*]} " == *" $name "* ]] && mark=" (loaded at start)"
  [ "$name" = "$entry" ] && mark=" (entry)"
  printf '  %6s KB  %s%s\n' "$(kb "$n")" "$name" "$mark"
done
exit "$rc"
