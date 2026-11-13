#!/usr/bin/env bash
# The pre-migration snapshot for beta.5 (docs/dev/design/b5-snap.md): feeder-pre-1500.db is named in backup.go, the four
# migration prefixes live in db.go, start-up uses them, and every embedded 15NN migration is covered by a prefix, so a
# later 15NN file cannot slip in without the snapshot. 1540_ is accepted because Pre1540Prefixes lists it (b6-snap_test.sh)
# and 1550_ because Pre1550Prefixes lists it (b7-snap_test.sh).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
has() { grep -Eq -- "$2" "$1" && ok || bad "$3"; }

has "$ROOT/internal/backup/backup.go" '^const PreSnapshot1500File = "feeder-pre-1500\.db"' 'backup.go must declare PreSnapshot1500File = "feeder-pre-1500.db"'
has "$ROOT/internal/backup/backup.go" '^const PreSnapshotFile = "feeder-pre-1400\.db"' 'backup.go must keep PreSnapshotFile = "feeder-pre-1400.db"'
has "$ROOT/internal/db/db.go" '"1500_", *"1510_", *"1520_", *"1530_"' 'db.go must list the prefixes 1500_, 1510_, 1520_ and 1530_ in Pre1500Prefixes'
has "$ROOT/internal/db/db.go" 'func NeedsPre1400Snapshot' 'db.go must keep NeedsPre1400Snapshot'
has "$ROOT/cmd/feeder/startup.go" 'PreSnapshot1500File' 'startup.go must take the snapshot named backup.PreSnapshot1500File'
has "$ROOT/cmd/feeder/startup.go" 'NeedsPre1500Snapshot|NeedsSnapshotFor' 'startup.go must ask db.NeedsPre1500Snapshot (or NeedsSnapshotFor)'

# Every 15NN migration file is covered by the pre-1500 prefixes (beta.5) or, for 1540_, by Pre1540Prefixes (beta.6,
# docs/dev/design/b6-snap.md) or, for 1550_, by Pre1550Prefixes (beta.7, docs/dev/design/b7-snap.md), so 1560 and later
# force a conscious change here.
for f in "$ROOT"/internal/db/migrations/15*.sql; do
  [ -e "$f" ] || continue
  n="$(basename "$f")"
  case "$n" in
    1500_*|1510_*|1520_*|1530_*) ok ;;
    1540_*) has "$ROOT/internal/db/db.go" 'Pre1540Prefixes *= *\[\]string\{[^}]*"1540_"' "$n is covered only if Pre1540Prefixes in db.go lists \"1540_\"" ;;
    1550_*) has "$ROOT/internal/db/db.go" 'Pre1550Prefixes *= *\[\]string\{[^}]*"1550_"' "$n is covered only if Pre1550Prefixes in db.go lists \"1550_\"" ;;
    *) bad "$n is a 15NN migration outside the pre-1500 snapshot prefixes: extend Pre1500Prefixes or name the next snapshot" ;;
  esac
done

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
