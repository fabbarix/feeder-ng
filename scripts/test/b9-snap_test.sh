#!/usr/bin/env bash
# The pre-migration snapshot for beta.9 (docs/dev/design/b9-snap.md, plan section 7): feeder-pre-1570.db is named in
# backup.go, the nine migration prefixes 1570_ to 1578_ live in db.go, start-up uses it after the 1400, 1500, 1540,
# 1550 and 1560 ones, and the earlier facts stay.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
has() { grep -Eq -- "$2" "$1" && ok || bad "$3"; }

has "$ROOT/internal/backup/backup.go" '^const PreSnapshot1570File = "feeder-pre-1570\.db"' 'backup.go must declare PreSnapshot1570File = "feeder-pre-1570.db"'
has "$ROOT/internal/backup/backup.go" '^const PreSnapshot1560File = "feeder-pre-1560\.db"' 'backup.go must keep PreSnapshot1560File = "feeder-pre-1560.db"'
has "$ROOT/internal/db/db.go" 'Pre1570Prefixes *= *\[\]string\{ *"1570_", *"1571_", *"1572_", *"1573_", *"1574_", *"1575_", *"1576_", *"1577_", *"1578_" *\}' 'db.go must declare Pre1570Prefixes listing 1570_ to 1578_'
has "$ROOT/internal/db/db.go" 'Pre1560Prefixes *= *\[\]string\{ *"1560_" *\}' 'db.go must keep Pre1560Prefixes = []string{"1560_"}'
has "$ROOT/internal/db/db.go" 'func NeedsPre1570Snapshot' 'db.go must declare NeedsPre1570Snapshot'
has "$ROOT/internal/db/db.go" 'NeedsSnapshotFor\(ctx, d, Migrations\(\), Pre1570Prefixes\)' 'NeedsPre1570Snapshot must be NeedsSnapshotFor over Migrations() and Pre1570Prefixes'
has "$ROOT/cmd/feeder/startup.go" 'PreSnapshot1570File' 'startup.go must take the snapshot named backup.PreSnapshot1570File'
has "$ROOT/cmd/feeder/startup.go" 'Pre1570Prefixes|NeedsPre1570Snapshot' 'startup.go must ask db.Pre1570Prefixes (or NeedsPre1570Snapshot)'
has "$ROOT/cmd/feeder/startup.go" 'migration: *"1570"' 'startup.go must name the migration "1570" in its table row'

# The table runs 1400, 1500, 1540, 1550, 1560, then 1570.
f="$ROOT/cmd/feeder/startup.go"
l1560="$(grep -n 'PreSnapshot1560File' "$f" | head -1 | cut -d: -f1)"
l1570="$(grep -n 'PreSnapshot1570File' "$f" | head -1 | cut -d: -f1)"
if [ -n "$l1560" ] && [ -n "$l1570" ] && [ "$l1560" -lt "$l1570" ]; then ok; else bad 'startup.go must list the 1570 snapshot after the 1560 one'; fi

# The B9-04 migrations exist: 1570 is a parent-table rebuild with the foreign-key pragma, 1571 is additive.
m1="$ROOT/internal/db/migrations/1570_meal_slot_removed.sql"
m2="$ROOT/internal/db/migrations/1571_member_removals.sql"
if [ -f "$m1" ]; then ok; else bad 'internal/db/migrations/1570_meal_slot_removed.sql must exist'; fi
if [ -f "$m2" ]; then ok; else bad 'internal/db/migrations/1571_member_removals.sql must exist'; fi
has "$m1" 'removed_at TEXT' '1570 must add meal_slots.removed_at TEXT'
has "$m1" 'meal_slots_active_name' '1570 must create the partial unique index meal_slots_active_name'
has "$m1" 'WHERE removed_at IS NULL' 'the index meal_slots_active_name must be partial (WHERE removed_at IS NULL)'
has "$m1" 'meal_slot_removals' '1570 must create meal_slot_removals'
has "$m1" '^-- feeder:foreign-keys=off' '1570 rebuilds a parent table: its first line must be the directive "-- feeder:foreign-keys=off"'
has "$m2" 'member_removals' '1571 must create member_removals'
if grep -Eqi 'DROP TABLE|foreign-keys=off|PRAGMA foreign_keys' "$m2" 2>/dev/null; then bad '1571 must be additive: no table rebuild, no foreign-key pragma'; else ok; fi

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
