#!/usr/bin/env bash
# The pre-migration snapshot for beta.7 (docs/dev/design/b7-snap.md): feeder-pre-1550.db is named in backup.go, the
# migration prefix lives in db.go, start-up uses it after the 1400, 1500 and 1540 ones, and the earlier facts stay.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
has() { grep -Eq -- "$2" "$1" && ok || bad "$3"; }

has "$ROOT/internal/backup/backup.go" '^const PreSnapshot1550File = "feeder-pre-1550\.db"' 'backup.go must declare PreSnapshot1550File = "feeder-pre-1550.db"'
has "$ROOT/internal/backup/backup.go" '^const PreSnapshot1540File = "feeder-pre-1540\.db"' 'backup.go must keep PreSnapshot1540File = "feeder-pre-1540.db"'
has "$ROOT/internal/backup/backup.go" '^const PreSnapshot1500File = "feeder-pre-1500\.db"' 'backup.go must keep PreSnapshot1500File = "feeder-pre-1500.db"'
has "$ROOT/internal/backup/backup.go" '^const PreSnapshotFile = "feeder-pre-1400\.db"' 'backup.go must keep PreSnapshotFile = "feeder-pre-1400.db"'
has "$ROOT/internal/db/db.go" 'Pre1550Prefixes *= *\[\]string\{ *"1550_" *\}' 'db.go must declare Pre1550Prefixes = []string{"1550_"}'
has "$ROOT/internal/db/db.go" 'func NeedsPre1550Snapshot' 'db.go must declare NeedsPre1550Snapshot'
has "$ROOT/internal/db/db.go" 'NeedsSnapshotFor\(ctx, d, Migrations\(\), Pre1550Prefixes\)' 'NeedsPre1550Snapshot must be NeedsSnapshotFor over Migrations() and Pre1550Prefixes'
has "$ROOT/cmd/feeder/startup.go" 'PreSnapshot1550File' 'startup.go must take the snapshot named backup.PreSnapshot1550File'
has "$ROOT/cmd/feeder/startup.go" 'Pre1550Prefixes|NeedsPre1550Snapshot' 'startup.go must ask db.Pre1550Prefixes (or NeedsPre1550Snapshot)'
has "$ROOT/cmd/feeder/startup.go" 'migration: *"1550"' 'startup.go must name the migration "1550" in its table row'

# The table runs 1400, then 1500, then 1540, then 1550.
f="$ROOT/cmd/feeder/startup.go"
l1400="$(grep -n 'PreSnapshotFile' "$f" | head -1 | cut -d: -f1)"
l1500="$(grep -n 'PreSnapshot1500File' "$f" | head -1 | cut -d: -f1)"
l1540="$(grep -n 'PreSnapshot1540File' "$f" | head -1 | cut -d: -f1)"
l1550="$(grep -n 'PreSnapshot1550File' "$f" | head -1 | cut -d: -f1)"
if [ -n "$l1400" ] && [ -n "$l1500" ] && [ -n "$l1540" ] && [ -n "$l1550" ] \
  && [ "$l1400" -lt "$l1500" ] && [ "$l1500" -lt "$l1540" ] && [ "$l1540" -lt "$l1550" ]; then ok; else bad 'startup.go must list the snapshots in the order 1400, 1500, 1540, 1550'; fi

# The migration file exists, is additive and adds the two columns.
m="$ROOT/internal/db/migrations/1550_supplies.sql"
if [ -f "$m" ]; then ok; else bad 'internal/db/migrations/1550_supplies.sql must exist'; fi
has "$m" "ADD COLUMN kind TEXT NOT NULL DEFAULT 'food'" "1550_supplies.sql must add kind TEXT NOT NULL DEFAULT 'food'"
has "$m" 'ADD COLUMN restock_level REAL' '1550_supplies.sql must add restock_level REAL'
if grep -Eqi 'DROP TABLE|PRAGMA foreign_keys' "$m" 2>/dev/null; then bad '1550_supplies.sql must be additive: no table rebuild, no foreign-key pragma'; else ok; fi

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
