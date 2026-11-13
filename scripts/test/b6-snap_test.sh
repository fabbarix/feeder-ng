#!/usr/bin/env bash
# The pre-migration snapshot for beta.6 (docs/dev/design/b6-snap.md): feeder-pre-1540.db is named in backup.go, the
# migration prefix lives in db.go, start-up uses it after the 1400 and 1500 ones, and the beta.4 and beta.5 facts stay.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
has() { grep -Eq -- "$2" "$1" && ok || bad "$3"; }

has "$ROOT/internal/backup/backup.go" '^const PreSnapshot1540File = "feeder-pre-1540\.db"' 'backup.go must declare PreSnapshot1540File = "feeder-pre-1540.db"'
has "$ROOT/internal/backup/backup.go" '^const PreSnapshot1500File = "feeder-pre-1500\.db"' 'backup.go must keep PreSnapshot1500File = "feeder-pre-1500.db"'
has "$ROOT/internal/backup/backup.go" '^const PreSnapshotFile = "feeder-pre-1400\.db"' 'backup.go must keep PreSnapshotFile = "feeder-pre-1400.db"'
has "$ROOT/internal/db/db.go" 'Pre1540Prefixes *= *\[\]string\{ *"1540_" *\}' 'db.go must declare Pre1540Prefixes = []string{"1540_"}'
has "$ROOT/internal/db/db.go" 'func NeedsPre1540Snapshot' 'db.go must declare NeedsPre1540Snapshot'
has "$ROOT/internal/db/db.go" 'NeedsSnapshotFor\(ctx, d, Migrations\(\), Pre1540Prefixes\)' 'NeedsPre1540Snapshot must be NeedsSnapshotFor over Migrations() and Pre1540Prefixes'
has "$ROOT/cmd/feeder/startup.go" 'PreSnapshot1540File' 'startup.go must take the snapshot named backup.PreSnapshot1540File'
has "$ROOT/cmd/feeder/startup.go" 'Pre1540Prefixes|NeedsPre1540Snapshot' 'startup.go must ask db.Pre1540Prefixes (or NeedsPre1540Snapshot)'

# The table runs 1400, then 1500, then 1540.
f="$ROOT/cmd/feeder/startup.go"
l1400="$(grep -n 'PreSnapshotFile' "$f" | head -1 | cut -d: -f1)"
l1500="$(grep -n 'PreSnapshot1500File' "$f" | head -1 | cut -d: -f1)"
l1540="$(grep -n 'PreSnapshot1540File' "$f" | head -1 | cut -d: -f1)"
if [ -n "$l1400" ] && [ -n "$l1500" ] && [ -n "$l1540" ] && [ "$l1400" -lt "$l1500" ] && [ "$l1500" -lt "$l1540" ]; then ok; else bad 'startup.go must list the snapshots in the order 1400, 1500, 1540'; fi

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
