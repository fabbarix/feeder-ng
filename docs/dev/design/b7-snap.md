# b7-snap: the snapshot before migration 1550

beta.7 adds migration `1550_supplies.sql` (Supplies, [ADR 0017](../../adr/0017-supplies-are-ingredients-of-kind-supply.md),
[household-items.md](household-items.md) §5.1). It follows the beta.4 (`feeder-pre-1400.db`, [crs-plan.md](crs-plan.md) §1.3),
beta.5 ([b5-snap.md](b5-snap.md)) and beta.6 ([b6-snap.md](b6-snap.md)) pattern exactly: beta.7 takes `feeder-pre-1550.db`
first. The 1400, 1500 and 1540 behaviour is unchanged.

Why now: `scripts/check.sh` fails on `1550_supplies.sql is a 15NN migration outside the pre-1500 snapshot prefixes`
(`scripts/test/b5-snap_test.sh`). The decision is to name the next snapshot, not to extend `Pre1500Prefixes` or
`Pre1540Prefixes`: the pre-1540 file must stay "the database as it was before the beta.6 migration", and a beta.6.x user
upgrading to beta.7 (decision D8) needs a restore point that is the beta.6.5 database. Numbering the migration 1600 would
dodge the guard without a decision and is not done.

## The migration

Additive only (no table rebuild, no foreign-key pragma):

```sql
ALTER TABLE ingredients ADD COLUMN kind TEXT NOT NULL DEFAULT 'food' CHECK (kind IN ('food', 'supply'));
ALTER TABLE ingredients ADD COLUMN restock_level REAL CHECK (restock_level IS NULL OR restock_level > 0);
```

Every existing Ingredient becomes `food` and has no Restock level. The rules that span columns (a Supply has no Shelf Life;
only a Supply has a Restock level) are checked in Go, as 1540 does.

## Rule

- **Trigger:** the database already holds applied migrations (a `schema_migrations` table with at least one row) and an
  embedded migration whose name starts with `1550_` is not recorded yet.
- **No snapshot** on a brand-new file (fresh install) or when 1550 is recorded.
- **Taken before any migration runs**, with `backup.SnapshotNamed` (verified, mode 0600, folder lock), into
  `<data>/backups/feeder-pre-1550.db`. A failure stops start-up, names the file in the error, and migrates nothing.
- **Never replaced:** if `feeder-pre-1550.db` exists the snapshot is skipped, so a start that failed after the snapshot
  keeps the true pre-1550 file.
- **Ordered table:** start-up runs 1400, then 1500, then 1540, then 1550. All four are decided and written before `db.Migrate`.
  - A beta.6 database: only `feeder-pre-1550.db`.
  - **Skipping beta.6 (a beta.5.x database, 1540 and 1550 pending):** `feeder-pre-1540.db` and `feeder-pre-1550.db`, both
    the beta.5 database, both before any migration. No `feeder-pre-1500.db` (beta.5 has 1500 to 1530).
  - Skipping beta.5 and beta.6 (a beta.4.2 database): `feeder-pre-1500.db`, `feeder-pre-1540.db` and `feeder-pre-1550.db`,
    all the pre-1500 database.
  - Skipping to beta.7 from before beta.4 with Planned Meals: all four files, all the pre-1400 database.
  - The first failing snapshot stops start-up with nothing migrated.
- List and Prune ignore the file (the `^feeder-pre-\d{4}\.db$` check in `SnapshotNamed`, `nameRE` for the rest); no code change.
- The prefixes are disjoint: a migration triggers one snapshot only.

## API

| Package | Name | Purpose |
|---|---|---|
| `backup` | `PreSnapshot1550File = "feeder-pre-1550.db"` | next to `PreSnapshot1540File`, `PreSnapshot1500File` and `PreSnapshotFile` |
| `db` | `Pre1550Prefixes []string` | `[]string{"1550_"}` |
| `db` | `NeedsPre1550Snapshot(ctx, d)` | `NeedsSnapshotFor(ctx, d, Migrations(), Pre1550Prefixes)` |
| `db` | `NeedsSnapshotFor`, `Pre1500Prefixes`, `Pre1540Prefixes` and their `NeedsPre*Snapshot` | kept as they are |
| `cmd/feeder` | `preSnapshots` | a fourth row after 1540: `file: backup.PreSnapshot1550File`, `migration: "1550"`, `keep: true`, `need` = `db.NeedsSnapshotFor(ctx, d, fsys, db.Pre1550Prefixes)` |

`prepareDatabaseWith` and `prepareDatabase` keep their signatures.

## Tests

- `internal/db/pending1550_test.go`: prefixes, no overlap with the pre-1500 and pre-1540 sets, the trigger (new file, beta.6,
  beta.5 and beta.4.2 upgrades, everything applied), the skip upgrade from beta.5 (1540 and 1550 both due, 1500 not), each set
  ignoring the others' files, `NeedsPre1550Snapshot` against the embedded set (false on a new file, true on a beta.6
  database, false once applied).
- `internal/db/supplies_migration_test.go`: the two columns, every existing Ingredient is `food` with no Restock level, no
  other data changes, an insert without a kind is food, the two CHECKs.
- `internal/backup/snapshot_named_1550_test.go`: constant, the 1400, 1500 and 1540 names unchanged, written, 0600, not listed,
  never pruned, no other pre-file created.
- `cmd/feeder/startup_pre1550_test.go` (real migrations below 1500 plus synthetic `1500_`/`1510_`/`1540_`/`1550_` files):
  beta.6 upgrade snapshot is pre-1550, verified and 0600; fresh install none; no retake; existing file kept; failure stops
  without migrating; **the skip upgrade from beta.5.x to beta.7 takes `feeder-pre-1540.db` and `feeder-pre-1550.db`, both the
  beta.5 database**; the 1500 + 1540 + 1550 case; the all-four case; a failing snapshot migrates nothing.
- `scripts/test/b7-snap_test.sh`: the constants in backup.go, the prefix and function in db.go, the startup use, the order
  1400, 1500, 1540, 1550, and the migration file being additive.
- `scripts/test/b5-snap_test.sh` (approved change): still checks the beta.5 facts. Every `15NN` file must be covered by the
  pre-1500 prefixes or, for `1540_` and `1550_`, by `Pre1540Prefixes` and `Pre1550Prefixes` in db.go; any other file (1560 and
  later) still fails with the same message, so it forces a deliberate change.

## Docs that must mention the snapshot (release step H8, not this task)

- `docs/dev/deploy.md`: a new "Upgrading from 1.0.0-beta.6.x to 1.0.0-beta.7" section next to the beta.6 one (the numbered
  "pre-1550 snapshot" item, the restore commands, the Kubernetes helper pod path, rollback to the beta.6.5 image), and a line
  in the beta.6 section that a skip upgrade from beta.5.x also gets `feeder-pre-1540.db` and `feeder-pre-1550.db`.
- `CHANGELOG.md`: the beta.7 entry, in the style of the beta.6 one.
- `docs/spec/functional-spec.md`: decision 49 already names the snapshot.
- `docs/dev/design/household-items.md` §5.1: links here.
- The Helm chart (`deploy/helm`) has no mention of the pre-snapshots, so no change there.
