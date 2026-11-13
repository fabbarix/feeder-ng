# b6-snap: the snapshot before migration 1540

beta.6 adds migration `1540_base_recipes.sql` (Base recipes, ADR 0015, [base-recipes.md](base-recipes.md) §12). It follows
the beta.4 (`feeder-pre-1400.db`, [crs-plan.md](crs-plan.md) §1.3) and beta.5 ([b5-snap.md](b5-snap.md)) pattern exactly:
beta.6 takes `feeder-pre-1540.db` first. The 1400 and 1500 behaviour is unchanged.

Why now: `scripts/check.sh` fails on `1540_base_recipes.sql is a 15NN migration outside the pre-1500 snapshot prefixes`
(`scripts/test/b5-snap_test.sh`). The decision is to name the next snapshot, not to extend `Pre1500Prefixes`: the
pre-1500 file must stay "the database as it was before the beta.5 migrations", and a beta.5 user upgrading to beta.6
needs a restore point that is the beta.5 database.

## Rule

- **Trigger:** the database already holds applied migrations (a `schema_migrations` table with at least one row) and an
  embedded migration whose name starts with `1540_` is not recorded yet.
- **No snapshot** on a brand-new file (fresh install) or when 1540 is recorded.
- **Taken before any migration runs**, with `backup.SnapshotNamed` (verified, mode 0600, folder lock), into
  `<data>/backups/feeder-pre-1540.db`. A failure stops start-up, names the file in the error, and migrates nothing.
- **Never replaced:** if `feeder-pre-1540.db` exists the snapshot is skipped, so a start that failed after the snapshot
  keeps the true pre-1540 file.
- **Ordered table:** start-up runs 1400, then 1500, then 1540. All three are decided and written before `db.Migrate`.
  - A beta.5 database: only `feeder-pre-1540.db`.
  - Skipping beta.5 (a beta.4.2 database, 1500 and 1540 pending): `feeder-pre-1500.db` and `feeder-pre-1540.db`, both
    the pre-1500 database, both before any migration.
  - Skipping to beta.6 from before beta.4 with Planned Meals: all three files, all the pre-1400 database.
  - The first failing snapshot stops start-up with nothing migrated.
- List and Prune ignore the file (the `^feeder-pre-\d{4}\.db$` check in `SnapshotNamed`, `nameRE` for the rest); no code change.
- The prefixes are disjoint: a migration triggers one snapshot only.

## API

| Package | Name | Purpose |
|---|---|---|
| `backup` | `PreSnapshot1540File = "feeder-pre-1540.db"` | next to `PreSnapshot1500File` and `PreSnapshotFile` |
| `db` | `Pre1540Prefixes []string` | `[]string{"1540_"}` |
| `db` | `NeedsPre1540Snapshot(ctx, d)` | `NeedsSnapshotFor(ctx, d, Migrations(), Pre1540Prefixes)` |
| `db` | `NeedsSnapshotFor`, `Pre1500Prefixes`, `NeedsPre1500Snapshot`, `NeedsPre1400Snapshot` | kept as they are |
| `cmd/feeder` | `preSnapshots` | a third row after 1500: `file: backup.PreSnapshot1540File`, `migration: "1540"`, `keep: true`, `need` = `db.NeedsSnapshotFor(ctx, d, fsys, db.Pre1540Prefixes)` |

`prepareDatabaseWith` and `prepareDatabase` keep their signatures.

## Tests

- `internal/db/pending1540_test.go`: prefixes, no overlap with the pre-1500 set, the trigger (new file, beta.4.2 and
  beta.5 upgrades, everything applied), each set ignoring the other's files, `NeedsPre1540Snapshot` against the embedded
  set (false on a new file, true on a beta.5 database, false once applied).
- `internal/backup/snapshot_named_1540_test.go`: constant, the 1400 and 1500 names unchanged, written, 0600, not listed,
  never pruned, no other pre-file created.
- `cmd/feeder/startup_pre1540_test.go` (real migrations below 1500 plus synthetic `1500_`/`1510_`/`1540_` files):
  beta.5 upgrade snapshot is pre-1540, verified and 0600; fresh install none; no retake; existing file kept; failure
  stops without migrating; 1500 plus 1540 skip case; 1400 plus 1500 plus 1540 case; a failing snapshot migrates nothing.
- `scripts/test/b6-snap_test.sh`: the constant in backup.go, the prefix and function in db.go, the startup use, and the
  order 1400, 1500, 1540.
- `scripts/test/b5-snap_test.sh` (approved change): still checks the beta.5 facts. Every `15NN` file must be covered by
  the pre-1500 prefixes or, for `1540_`, by `Pre1540Prefixes` in db.go; any other file (1550 and later) still fails with
  the same message, so it forces a deliberate change.

## Docs that must mention the snapshot (release step, not this task)

- `docs/dev/deploy.md`: a new "Upgrading from 1.0.0-beta.5.x to 1.0.0-beta.6" section next to the beta.5 one (the
  numbered "pre-1540 snapshot" item, the restore commands, the Kubernetes helper pod path, rollback to the beta.5
  image), and a line in the beta.5 section that a skip upgrade also gets `feeder-pre-1500.db` and `feeder-pre-1540.db`.
- `CHANGELOG.md`: the beta.6 entry, in the style of the beta.5 one (what the file is, not listed, not pruned, kept, stops
  on failure, how to go back).
- `docs/spec/functional-spec.md`: a decision entry after 47, "Beta.6 migration and the pre-1540 snapshot".
- `docs/dev/design/base-recipes.md` §12: one line linking to this doc.
- The Helm chart (`deploy/helm`) has no mention of the pre-snapshots, so no change there.
