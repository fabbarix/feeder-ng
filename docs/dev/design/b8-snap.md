# b8-snap: the snapshot before migration 1560

beta.8 adds migration `1560_tick_lot_quantity.sql` (Undo of a tick takes back the Stock it added,
[ADR 0019](../../adr/0019-undo-of-a-tick-takes-back-its-stock.md), [b8-undo.md](b8-undo.md)). It follows the beta.5
([b5-snap.md](b5-snap.md)), beta.6 ([b6-snap.md](b6-snap.md)) and beta.7 ([b7-snap.md](b7-snap.md)) pattern exactly:
beta.8 takes `feeder-pre-1560.db` first. The 1400, 1500, 1540 and 1550 behaviour is unchanged.

Why: `scripts/test/b5-snap_test.sh` refuses a 15NN migration that no snapshot prefix covers. As for beta.7, the next
snapshot is named rather than an earlier prefix set extended: the pre-1550 file must stay "the database as it was before
beta.7", and a beta.7 user upgrading to beta.8 needs a restore point that is the beta.7 database.

## The migration

Additive only (no table rebuild, no foreign-key pragma): `shopping_ticks.lot_quantity`, `shopping_extras.tick_lot_id` and
`tick_lot_quantity`, and the table `stock_lot_take_backs` (one row per Stock Lot an Undo of a tick took back from, so a
retried Undo takes nothing twice). A tick from before 1560 has no `lot_quantity`: its Undo takes back the Lot's whole
current quantity.

## Rule

- **Trigger:** the database already holds applied migrations and an embedded migration whose name starts with `1560_` is
  not recorded yet. No snapshot on a brand-new file, or once 1560 is recorded.
- **Taken before any migration runs**, with `backup.SnapshotNamed` (verified, mode 0600, folder lock), into
  `<data>/backups/feeder-pre-1560.db`. A failure stops start-up, names the file, and migrates nothing.
- **Never replaced** (`keep`): if `feeder-pre-1560.db` exists the snapshot is skipped.
- **Ordered table:** start-up runs 1400, 1500, 1540, 1550, then 1560, all before `db.Migrate`.
  - A beta.7 database: only `feeder-pre-1560.db`.
  - Skipping beta.7 (a beta.6.x database): `feeder-pre-1550.db` and `feeder-pre-1560.db`, both the beta.6 database.
  - Older databases get every earlier file as well, all the same database from before the first pending migration.
- List and Prune ignore the file (the `^feeder-pre-\d{4}\.db$` check); no code change.

## API

| Package | Name | Purpose |
|---|---|---|
| `backup` | `PreSnapshot1560File = "feeder-pre-1560.db"` | next to the 1550 one |
| `db` | `Pre1560Prefixes []string` | `[]string{"1560_"}` |
| `db` | `NeedsPre1560Snapshot(ctx, d)` | `NeedsSnapshotFor(ctx, d, Migrations(), Pre1560Prefixes)` |
| `cmd/feeder` | `preSnapshots` | a fifth row after 1550: `file: backup.PreSnapshot1560File`, `migration: "1560"`, `keep: true` |

## Tests

- `internal/db/pending1560_test.go`: prefixes, no overlap, the trigger (new file, beta.7, beta.6 and beta.4.2 upgrades,
  everything applied), only pre-1560 due on a beta.7 database, `NeedsPre1560Snapshot` against the embedded set.
- `internal/backup/snapshot_named_1560_test.go`: constant, earlier names unchanged, written, 0600, not listed, never pruned.
- `cmd/feeder/startup_pre1560_test.go`: beta.7 upgrade, fresh install, an existing file kept, failure migrates nothing, the
  skip upgrade from beta.6 (pre-1550 and pre-1560, both the beta.6 database), all five from before Courses.
- `scripts/test/b8-snap_test.sh`; `scripts/test/b5-snap_test.sh` accepts `1560_` only if `Pre1560Prefixes` lists it.

## Docs (release step, main session)

`docs/dev/deploy.md` gets an "Upgrading from 1.0.0-beta.7.x to 1.0.0-beta.8" section in the style of the beta.7 one, and
`CHANGELOG.md` the beta.8 entry.
