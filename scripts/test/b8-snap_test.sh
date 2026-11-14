#!/usr/bin/env bash
# The pre-migration snapshot for beta.8 (docs/dev/design/b8-snap.md): feeder-pre-1560.db is named in backup.go, the
# migration prefix lives in db.go, start-up uses it after the 1400, 1500, 1540 and 1550 ones, and the earlier facts stay.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
has() { grep -Eq -- "$2" "$1" && ok || bad "$3"; }

has "$ROOT/internal/backup/backup.go" '^const PreSnapshot1560File = "feeder-pre-1560\.db"' 'backup.go must declare PreSnapshot1560File = "feeder-pre-1560.db"'
has "$ROOT/internal/backup/backup.go" '^const PreSnapshot1550File = "feeder-pre-1550\.db"' 'backup.go must keep PreSnapshot1550File = "feeder-pre-1550.db"'
has "$ROOT/internal/db/db.go" 'Pre1560Prefixes *= *\[\]string\{ *"1560_" *\}' 'db.go must declare Pre1560Prefixes = []string{"1560_"}'
has "$ROOT/internal/db/db.go" 'func NeedsPre1560Snapshot' 'db.go must declare NeedsPre1560Snapshot'
has "$ROOT/internal/db/db.go" 'NeedsSnapshotFor\(ctx, d, Migrations\(\), Pre1560Prefixes\)' 'NeedsPre1560Snapshot must be NeedsSnapshotFor over Migrations() and Pre1560Prefixes'
has "$ROOT/cmd/feeder/startup.go" 'PreSnapshot1560File' 'startup.go must take the snapshot named backup.PreSnapshot1560File'
has "$ROOT/cmd/feeder/startup.go" 'Pre1560Prefixes|NeedsPre1560Snapshot' 'startup.go must ask db.Pre1560Prefixes (or NeedsPre1560Snapshot)'
has "$ROOT/cmd/feeder/startup.go" 'migration: *"1560"' 'startup.go must name the migration "1560" in its table row'

# The table runs 1400, 1500, 1540, 1550, then 1560.
f="$ROOT/cmd/feeder/startup.go"
l1550="$(grep -n 'PreSnapshot1550File' "$f" | head -1 | cut -d: -f1)"
l1560="$(grep -n 'PreSnapshot1560File' "$f" | head -1 | cut -d: -f1)"
if [ -n "$l1550" ] && [ -n "$l1560" ] && [ "$l1550" -lt "$l1560" ]; then ok; else bad 'startup.go must list the 1560 snapshot after the 1550 one'; fi

# The migration file exists and is additive.
m="$ROOT/internal/db/migrations/1560_tick_lot_quantity.sql"
if [ -f "$m" ]; then ok; else bad 'internal/db/migrations/1560_tick_lot_quantity.sql must exist'; fi
has "$m" 'ALTER TABLE shopping_ticks ADD COLUMN lot_quantity REAL' '1560 must add shopping_ticks.lot_quantity REAL'
if grep -Eqi 'DROP TABLE|PRAGMA foreign_keys' "$m" 2>/dev/null; then bad '1560 must be additive: no table rebuild, no foreign-key pragma'; else ok; fi

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
