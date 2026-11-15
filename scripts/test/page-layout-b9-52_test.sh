#!/usr/bin/env bash
# B9-52 (SET-12; plan section 9: "a pending sign-in request created through the store"): the page-layout seed drop-in
# scripts/test/fixtures/page-layout-seed/access.mjs writes pending Access Requests into the scratch database, and the scenario
# module scripts/lib/page-layout/scenarios/b9-52.mjs loads. Runs the drop-in against a temp database made from the real migration.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

command -v sqlite3 >/dev/null 2>&1 || { echo "page-layout-b9-52: sqlite3 not installed, skipped"; exit 0; }
mkdir -p "$TMP/data"
# only the access_requests table of the migration (the rest of the file rebuilds push tables)
sed -n '/^CREATE TABLE access_requests/,/^);/p' "$ROOT/internal/db/migrations/1200_access_requests.sql" | sqlite3 "$TMP/data/feeder.db"

OUT="$(cd "$ROOT" && node --input-type=module -e "
import { seed, REQUESTS } from './scripts/test/fixtures/page-layout-seed/access.mjs'
const ctx = { dataDir: '$TMP/data' }
await seed(ctx)
await seed(ctx) // again: no duplicate rows, no crash
console.log(JSON.stringify({ n: ctx.accessRequests, expected: REQUESTS.length }))
" 2>&1)"
echo "$OUT" | grep -q '"n":5' && ok || bad "the drop-in must write 5 requests: $OUT"

rows="$(sqlite3 "$TMP/data/feeder.db" 'select count(*) from access_requests')"
[ "$rows" = 5 ] && ok || bad "5 rows expected after running the seed twice, got $rows"
[ "$(sqlite3 "$TMP/data/feeder.db" "select count(*) from access_requests where name = ''")" = 1 ] && ok || bad "one request must have no name"
[ "$(sqlite3 "$TMP/data/feeder.db" "select count(*) from access_requests where length(name) > 30 and length(email) > 40")" -ge 1 ] && ok || bad "one request must have a long name and a long address"
[ "$(sqlite3 "$TMP/data/feeder.db" "select count(*) from access_requests where expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ','now')")" = 0 ] && ok || bad "every request must still be pending (expires in the future)"
[ "$(sqlite3 "$TMP/data/feeder.db" "select count(*) from access_requests where expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ','now','+2 days')")" -ge 1 ] && ok || bad "one request must expire within two days (the warn state)"

# the data dir comes from --out when the context has none
DIR="$(cd "$ROOT" && node --input-type=module -e "
import { dataDirOf } from './scripts/test/fixtures/page-layout-seed/access.mjs'
console.log(dataDirOf({}, ['node', 'seed.mjs', 'http://x', '--out', '/w/build/page-layout-ids.json'], {}))
")"
[ "$DIR" = "/w/build/page-layout-data" ] && ok || bad "the data dir must sit beside --out: got $DIR"

# the scenario module loads through the real loader (the guard's own self-check names a malformed one)
(cd "$ROOT" && node --input-type=module -e "
const m = await import('./scripts/lib/page-layout/scenarios/b9-52.mjs')
const names = m.default.scenarios.map((s) => s.name)
for (const want of ['allowlist-actions', 'allowlist-share', 'access-requests-rows']) if (!names.includes(want)) { console.error('missing scenario ' + want); process.exit(1) }
for (const s of m.default.scenarios) if (!m.default.setups[s.setup]) { console.error('no setup ' + s.setup); process.exit(1) }
") >"$TMP/scn.log" 2>&1 && ok || bad "scenarios/b9-52.mjs: $(head -c 300 "$TMP/scn.log")"

printf 'page-layout-b9-52: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
