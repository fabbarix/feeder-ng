#!/usr/bin/env bash
# check-profile: browser (builds the web app, starts a server and Chrome; CHECK_PROFILE=ci leaves it out, the full check runs it)
# B9-21 res-serving: RES-01 (Feeder opens offline), RES-04 (compression, immutable assets, the bundle budget), RES-10 (the worker
# waits). The unit tests (web/src/sw, web/src/app/serviceWorker.test.ts, internal/app/spa_res_test.go) pin the behaviour; this
# test pins what only a built app shows: the precompressed files of the build, the budget script, the headers a live server sends,
# and the offline launch of a real Chrome with the service worker on.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WEB="$ROOT/web"
SCRATCH="$ROOT/build/res-serving-test"
rm -rf "$SCRATCH"
mkdir -p "$SCRATCH"
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
SERVER_PID=""
stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 0.2; done
    kill -0 "$SERVER_PID" 2>/dev/null && { kill -KILL -- "-$SERVER_PID" 2>/dev/null || kill -KILL "$SERVER_PID" 2>/dev/null; }
  fi
  SERVER_PID=""
}
cleanup() { stop_server; rm -rf "$SCRATCH"; }
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

# ---------------------------------------------------------------- the bundle budget (RES-04)
B="$ROOT/scripts/check-bundle-budget.sh"
CH="$ROOT/scripts/check.sh"
[ -x "$B" ] && ok || bad "scripts/check-bundle-budget.sh must exist and be executable"
bash -n "$B" 2>/dev/null && ok || bad "scripts/check-bundle-budget.sh must parse"

# fixture dist: index.html names the entry chunk; only the brotli sibling's size counts
fixture() { # name brotli-bytes
  local d="$SCRATCH/dist-$1"
  mkdir -p "$d/assets"
  printf '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-Ab12Cd.js"></script><link rel="stylesheet" href="/assets/index-Ab12Cd.css"></head><body><div id="root"></div></body></html>' >"$d/index.html"
  printf 'import("./other-9f9f9f.js");console.log(1)' >"$d/assets/index-Ab12Cd.js"
  printf 'body{}' >"$d/assets/index-Ab12Cd.css"
  # another chunk that is NOT the entry and is bigger than a small entry: it never counts toward the entry's budget
  # (B9-59: it has its own, 250 KB, and this one is within it)
  printf 'export{}' >"$d/assets/other-9f9f9f.js"
  head -c 150000 /dev/zero >"$d/assets/other-9f9f9f.js.br"
  [ -n "${2:-}" ] && head -c "$2" /dev/zero >"$d/assets/index-Ab12Cd.js.br"
  echo "$d"
}
# B9-59: a route chunk of the given brotli size beside an entry within its budget
route_fixture() { # name brotli-bytes
  local d; d="$(fixture "$1" 300000)"
  printf 'export{}' >"$d/assets/PlanScreen-77aa77.js"
  head -c "$2" /dev/zero >"$d/assets/PlanScreen-77aa77.js.br"
  printf 'import("./PlanScreen-77aa77.js");' >>"$d/assets/index-Ab12Cd.js"
  echo "$d"
}
run_budget() { BUNDLE_DIST="$1" bash "$B" 2>&1; }

out="$(run_budget "$(fixture ok 300000)")"; rc=$?
[ "$rc" -eq 0 ] && ok || bad "budget: a 300000-byte entry brotli must pass (exit $rc: $out)"
grep -qi 'warn' <<<"$out" && bad "budget: no warning under 350 KB (got: $out)" || ok

out="$(run_budget "$(fixture warn 380000)")"; rc=$?
[ "$rc" -eq 0 ] && ok || bad "budget: 380000 bytes passes with a warning (exit $rc: $out)"
grep -qi 'warn' <<<"$out" && ok || bad "budget: 380000 bytes (over 350 KB) must print WARN (got: $out)"

out="$(run_budget "$(fixture over 420000)")"; rc=$?
[ "$rc" -ne 0 ] && ok || bad "budget: 420000 bytes (over 400 KB) must fail"
grep -qiE 'fail|over|budget' <<<"$out" && ok || bad "budget: the failure names the budget (got: $out)"

# B9-59: the route chunks' own budget (warn over 200 KB, fail over 250 KB) and the five largest chunks
out="$(run_budget "$(route_fixture rok 190000)")"; rc=$?
[ "$rc" -eq 0 ] && ok || bad "budget: a 190000-byte route chunk must pass (exit $rc: $out)"
grep -qi 'warn' <<<"$out" && bad "budget: no warning for a route chunk under 200 KB (got: $out)" || ok
out="$(run_budget "$(route_fixture rwarn 220000)")"; rc=$?
[ "$rc" -eq 0 ] && ok || bad "budget: a 220000-byte route chunk passes with a warning (exit $rc: $out)"
grep -qiE 'warn.*PlanScreen-77aa77' <<<"$out" && ok || bad "budget: a route chunk over 200 KB must print WARN with its name (got: $out)"
out="$(run_budget "$(route_fixture rover 260000)")"; rc=$?
[ "$rc" -ne 0 ] && ok || bad "budget: a 260000-byte route chunk (over 250 KB) must fail"
grep -qiE 'fail.*PlanScreen-77aa77.*250' <<<"$out" && ok || bad "budget: the failure names the chunk and the 250 KB budget (got: $out)"
out="$(run_budget "$(route_fixture rlist 120000)")"; rc=$?
grep -qi 'five largest' <<<"$out" && ok || bad "budget: prints the five largest chunks (got: $out)"
listed="$(sed -n '/five largest/,$p' <<<"$out" | tail -n +2)"
[ "$(grep -c 'KB' <<<"$listed")" -eq 3 ] && ok || bad "budget: lists every chunk when there are fewer than five (got: $listed)"
head -1 <<<"$listed" | grep -q 'index-Ab12Cd.js (entry)' && ok || bad "budget: the list is largest first and marks the entry (got: $listed)"
out="$(run_budget "$(route_fixture rover2 260000)")"
grep -qi 'five largest' <<<"$out" && ok || bad "budget: the five largest are printed when a chunk fails too (got: $out)"
d6="$(fixture six 300000)"
for i in 1 2 3 4 5 6; do printf 'export{}' >"$d6/assets/r$i-aa.js"; head -c $((i * 1000)) /dev/zero >"$d6/assets/r$i-aa.js.br"; printf 'import("./r%s-aa.js");' "$i" >>"$d6/assets/index-Ab12Cd.js"; done
listed="$(run_budget "$d6" | sed -n '/five largest/,$p' | tail -n +2)"
[ "$(grep -c 'KB' <<<"$listed")" -eq 5 ] && ok || bad "budget: lists five chunks, no more (got: $listed)"

# B9-59: a chunk the entry imports statically (index.html preloads it) is downloaded before Today paints: it counts toward
# the entry's budget, not the route-chunk one
dp="$(fixture preload 300000)"
printf 'export{}' >"$dp/assets/ui-Ee55Ff.js"
printf 'import"./ui-Ee55Ff.js";' >>"$dp/assets/index-Ab12Cd.js"
head -c 60000 /dev/zero >"$dp/assets/ui-Ee55Ff.js.br"
sed -i 's|<link rel="stylesheet"|<link rel="modulepreload" crossorigin href="/assets/ui-Ee55Ff.js"><link rel="stylesheet"|' "$dp/index.html"
out="$(run_budget "$dp")"; rc=$?
[ "$rc" -eq 0 ] && grep -qiE 'warn.*index-Ab12Cd.js.*360 KB' <<<"$out" && ok || bad "budget: the entry (300000) and its preloaded chunk (60000) count together: 360 KB warns (exit $rc: $out)"
head -c 120000 /dev/zero >"$dp/assets/ui-Ee55Ff.js.br"
out="$(run_budget "$dp")"; rc=$?
[ "$rc" -ne 0 ] && ok || bad "budget: the entry and its preloaded chunk over 400 KB together must fail (got: $out)"

# B9-59: an older build's chunk left in dist/ (the build does not empty it), referenced by nothing of this build, is not
# counted, however big
ds="$(fixture stale 300000)"
printf 'export{}' >"$ds/assets/index-OldOld.js"
head -c 300000 /dev/zero >"$ds/assets/index-OldOld.js.br"
out="$(run_budget "$ds")"; rc=$?
[ "$rc" -eq 0 ] && ! grep -q 'index-OldOld' <<<"$out" && ok || bad "budget: a stale chunk of an older build must not count (exit $rc: $out)"

out="$(run_budget "$(fixture nobr)")"; rc=$?
[ "$rc" -ne 0 ] && ok || bad "budget: a build with no .br sibling for the entry chunk must fail (the compression step did not run)"

out="$(run_budget "$SCRATCH/does-not-exist")"; rc=$?
[ "$rc" -ne 0 ] && ok || bad "budget: a missing dist must fail"

# wired into check.sh as ONE line, in the web group right after the build
grep -q 'check-bundle-budget.sh' "$CH" && ok || bad "check.sh must run scripts/check-bundle-budget.sh"
l_build=$(grep -n 'step "vite build"' "$CH" | cut -d: -f1); l_b=$(grep -n 'check-bundle-budget.sh' "$CH" | head -1 | cut -d: -f1)
[ -n "$l_b" ] && [ "$l_b" -gt "$l_build" ] && [ "$l_b" -le $((l_build + 2)) ] && ok || bad "the budget step must come right after step \"vite build\""
[ "$(grep -c 'check-bundle-budget.sh' "$CH")" -eq 1 ] && ok || bad "check.sh gets ONE budget line"

# ---------------------------------------------------------------- the build writes the precompressed siblings (RES-04)
if (cd "$WEB" && pnpm exec vite build --outDir "$SCRATCH/dist" --emptyOutDir >"$SCRATCH/build.log" 2>&1); then
  D="$SCRATCH/dist"
  entry="$(grep -oE 'src="/assets/index-[^"]+\.js"' "$D/index.html" | head -1 | sed -E 's|src="/(.*)"|\1|')"
  css="$(grep -oE 'href="/assets/index-[^"]+\.css"' "$D/index.html" | head -1 | sed -E 's|href="/(.*)"|\1|')"
  [ -n "$entry" ] && [ -f "$D/$entry" ] && ok || bad "build: the entry JS is not named in index.html"
  for f in "$entry" "$css"; do
    for ext in br gz; do
      [ -s "$D/$f.$ext" ] && ok || bad "build: $f.$ext is missing or empty"
    done
  done
  # each sibling decodes to exactly the original
  node -e '
    const z = require("node:zlib"), fs = require("node:fs")
    const [d, ...files] = process.argv.slice(1)
    let bad = 0
    for (const f of files) {
      const raw = fs.readFileSync(`${d}/${f}`)
      for (const [ext, dec] of [["br", z.brotliDecompressSync], ["gz", z.gunzipSync]]) {
        try { if (!dec(fs.readFileSync(`${d}/${f}.${ext}`)).equals(raw)) { console.log(`${f}.${ext} does not decode to the original`); bad++ } }
        catch (e) { console.log(`${f}.${ext}: ${e.message}`); bad++ }
      }
      if (fs.statSync(`${d}/${f}.br`).size >= raw.length) { console.log(`${f}.br is not smaller than the original`); bad++ }
    }
    process.exit(bad ? 1 : 0)
  ' "$D" "$entry" "$css" && ok || bad "build: the siblings of the entry JS and CSS must decode to the originals and be smaller"
  # the worker must not precache the siblings, nor an image or small file that gets none
  if grep -oE '"?url"?:"[^"]+"' "$D/sw.js" | grep -qE '\.(br|gz)"'; then bad "build: sw.js precaches a .br or .gz file"; else ok; fi
  # the worker precaches the entry JS and CSS (the plugin drops a file over its size limit with only a warning)
  for f in "$entry" "$css"; do
    grep -qF "\"$f\"" "$D/sw.js" && ok || bad "build: sw.js does not precache $f"
  done
  # B9-59: the routes load on demand, so there are route chunks, and the worker precaches every one of them (and every
  # stylesheet): after one visit, a route never opened before still opens offline
  nchunks=$(find "$D/assets" -maxdepth 1 -name '*.js' | wc -l)
  [ "$nchunks" -ge 10 ] && ok || bad "build: expected the routes split into chunks (10 or more JS files), got $nchunks"
  missing=""
  for f in "$D"/assets/*.js "$D"/assets/*.css; do
    rel="${f#"$D"/}"
    grep -qF "\"$rel\"" "$D/sw.js" || missing="$missing $rel"
  done
  [ -z "$missing" ] && ok || bad "build: sw.js does not precache:$missing"
  # a sibling exists only for a text file over 1 KB (a png, ico or woff2 is already compressed)
  badsib=""
  while IFS= read -r sib; do
    orig="${sib%.*}"
    [ -f "$orig" ] && [ "$(wc -c <"$orig")" -gt 1024 ] || badsib="$badsib $sib"
    case "$orig" in *.png | *.ico | *.woff2 | *.webp | *.jpg) badsib="$badsib $sib" ;; esac
  done < <(find "$D" -type f \( -name '*.br' -o -name '*.gz' \))
  [ -z "$badsib" ] && ok || bad "build: siblings written where none belong:$badsib"
  # the budget passes on the real build
  out="$(run_budget "$D")"; rc=$?
  [ "$rc" -eq 0 ] && ok || bad "budget: the real build must be within the budget (exit $rc: $out)"
else
  tail -20 "$SCRATCH/build.log"
  bad "build: vite build failed"
fi

# ---------------------------------------------------------------- Helm notes (RES-04)
H="$ROOT/deploy/helm/feeder/README.md"
grep -q 'Content-Encoding' "$H" && ok || bad "helm README: must say a proxy passes Content-Encoding through"
grep -q 'Cache-Control' "$H" && ok || bad "helm README: must say a proxy passes Cache-Control through"
grep -qE 'proxy-buffering' "$H" && grep -q '/api/events' "$H" && ok || bad "helm README: must keep proxy-buffering \"off\" for /api/events"

# ---------------------------------------------------------------- a live server: headers, then the offline launch (browser)
CHROME="${CHROME:-google-chrome}"
if ! command -v "$CHROME" >/dev/null 2>&1; then
  echo "SKIP: Chrome not found ($CHROME); the live header and offline-launch probes were not run"
else
  PORT="$(bash "$ROOT/scripts/check-page-layout.sh" --print-port)"
  URL="http://127.0.0.1:$PORT"
  if curl -s -o /dev/null --max-time 1 "$URL/" 2>/dev/null; then
    bad "port $PORT (this worktree's) is taken; the live probes were not run"
  else
    # the binary embeds web/dist: build it when it is missing or older than the compression step
    ls "$WEB"/dist/assets/index-*.js.br >/dev/null 2>&1 || (cd "$ROOT" && pnpm -C web build >"$SCRATCH/web-build.log" 2>&1)
    (cd "$ROOT" && go build -buildvcs=false -o "$SCRATCH/feeder" ./cmd/feeder) >"$SCRATCH/go-build.log" 2>&1 || { cat "$SCRATCH/go-build.log"; bad "go build failed"; }
    mkdir -p "$SCRATCH/data"
    FEEDER_DEV_LOGIN=1 FEEDER_ADMIN_EMAIL=admin@example.test FEEDER_DATA_DIR="$SCRATCH/data" FEEDER_ADDR="127.0.0.1:$PORT" \
      setsid nohup bash -c 'echo $$ >"$1"; shift; exec "$@"' _ "$SCRATCH/pid" "$SCRATCH/feeder" >"$SCRATCH/server.log" 2>&1 </dev/null &
    SERVER_PID=$!
    for _ in $(seq 1 100); do curl -s -o /dev/null --max-time 1 "$URL/" 2>/dev/null && break; kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 0.2; done
    [ -s "$SCRATCH/pid" ] && SERVER_PID="$(cat "$SCRATCH/pid")"

    hdr() { curl -s -D - -o /dev/null --max-time 5 "$@" | tr -d '\r'; }
    h="$(hdr "$URL/index.html")"
    head -1 <<<"$h" | grep -q ' 200' && ok || bad "live: GET /index.html must be 200, got: $(head -1 <<<"$h")"
    grep -qi '^location:' <<<"$h" && bad "live: GET /index.html must not redirect" || ok
    grep -qi '^cache-control: no-cache' <<<"$h" && ok || bad "live: GET /index.html must be no-cache"
    grep -qi '^content-type: text/html' <<<"$h" && ok || bad "live: GET /index.html must be text/html"

    h="$(hdr "$URL/sw.js")"
    grep -qi '^cache-control: no-cache' <<<"$h" && ok || bad "live: /sw.js must be no-cache"

    entry="$(curl -s --max-time 5 "$URL/" | grep -oE '/assets/index-[^"]+\.js' | head -1)"
    if [ -z "$entry" ]; then
      bad "live: no entry chunk found in the served index.html"
    else
      onDisk="$WEB/dist$entry"
      h="$(hdr -H 'Accept-Encoding: br, gzip' "$URL$entry")"
      grep -qi '^content-encoding: br' <<<"$h" && ok || bad "live: $entry with br must be Content-Encoding: br"
      grep -qi '^cache-control: public, max-age=31536000, immutable' <<<"$h" && ok || bad "live: $entry must be immutable"
      grep -qi '^vary:.*accept-encoding' <<<"$h" && ok || bad "live: $entry must Vary on Accept-Encoding"
      got="$(curl -s --max-time 10 -H 'Accept-Encoding: br' "$URL$entry" | wc -c)"
      [ "$got" -eq "$(wc -c <"$onDisk.br")" ] && ok || bad "live: the br body is $got bytes, the .br file is $(wc -c <"$onDisk.br")"
      got="$(curl -s --max-time 10 -H 'Accept-Encoding: identity' "$URL$entry" | wc -c)"
      [ "$got" -eq "$(wc -c <"$onDisk")" ] && ok || bad "live: with no encoding the body is $got bytes, the file is $(wc -c <"$onDisk")"
    fi
    h="$(hdr -H 'Accept-Encoding: br, gzip' "$URL/api/events")"
    grep -qi '^content-encoding:' <<<"$h" && bad "live: /api/events must never be encoded" || ok

    # the offline launch: Chrome with the service worker on (its own profile under build/)
    out="$(node "$ROOT/scripts/lib/res-serving/offline-launch.mjs" --url "$URL" --profile-dir "$SCRATCH/chrome-profile" --server-pid "$SERVER_PID" --chrome "$CHROME" 2>&1)"; rc=$?
    if [ "$rc" -eq 0 ]; then ok; else printf '%s\n' "$out"; bad "offline launch (exit $rc)"; fi
    stop_server
  fi
fi

printf 'res-serving: %s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
