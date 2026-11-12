# b5-snap: the snapshot before migrations 1500 to 1530

Reconcile Q28 A: beta.5 takes `feeder-pre-1500.db` before its four migrations (1500 Slot dates and Guests, 1510
Leftovers, 1520 Bought, 1530 Not needed), as beta.4 did with `feeder-pre-1400.db`. The 1400 behaviour is unchanged.

## Rule

- **Trigger:** the database already holds applied migrations (a `schema_migrations` table with at least one row)
  and any embedded migration whose name starts with `1500_`, `1510_`, `1520_` or `1530_` is not recorded yet.
- **No snapshot** on a brand-new file (fresh install) or when all four are recorded.
- **Taken before any migration runs**, with `backup.SnapshotNamed` (verified, 0600, folder lock), into
  `<data>/backups/feeder-pre-1500.db`. A failure stops start-up, names the file in the error, and migrates nothing.
- **Never replaced:** if `feeder-pre-1500.db` already exists the snapshot is skipped. A failed 1510 leaves 1500
  applied; the next start-up must keep the true pre-1500 file, not overwrite it with a half-migrated one.
- If 1400 is also pending (skipping a release), both files are written, both before any migration.
- List and Prune already ignore the name (the `^feeder-pre-\d{4}\.db$` check in `SnapshotNamed`, `nameRE` for the rest).

## API

| Package | Name | Purpose |
|---|---|---|
| `db` | `Pre1500Prefixes []string` | `1500_`, `1510_`, `1520_`, `1530_` |
| `db` | `Migrations() fs.FS` | the embedded set (what `MigrateEmbedded` applies) |
| `db` | `NeedsSnapshotFor(ctx, d, fsys, prefixes)` | the generic trigger above |
| `db` | `NeedsPre1500Snapshot(ctx, d)` | `NeedsSnapshotFor` over `Migrations()` and `Pre1500Prefixes` |
| `db` | `NeedsPre1400Snapshot` | kept as it is |
| `backup` | `PreSnapshot1500File = "feeder-pre-1500.db"` | next to `PreSnapshotFile` |
| `cmd/feeder` | `prepareDatabaseWith(ctx, d, dataDir, logger, fsys)` | `prepareDatabase` over a given migration set (tests); `prepareDatabase` passes `db.Migrations()` |

`prepareDatabaseWith` runs a short ordered table of pre-migration snapshots (1400 first, then 1500): for each, ask
whether it is needed, take it (1500: skip if the file exists), log one line; then `db.Migrate(ctx, d, fsys)`.

## Tests

- `internal/db/pending1500_test.go`: prefixes, the trigger (new file, 1500 and 1510 pending, only a later one pending,
  all applied, files outside the prefixes ignored, each of the four prefixes alone), `NeedsPre1500Snapshot` against the
  embedded set (true only while a 15NN file is embedded and pending).
- `internal/backup/snapshot_named_1500_test.go`: constant, written, 0600, not listed, never pruned.
- `cmd/feeder/startup_pre1500_test.go`: snapshot is pre-1500 and verified, fresh install none, no retake, existing file kept,
  only-later-pending takes it, failure stops without migrating, 1400 plus 1500 together. They use the real migrations plus
  synthetic `1500_`/`1510_`/`1530_` files, so they stay valid when the real files land.
- `scripts/test/b5-snap_test.sh`: names and prefixes in the sources, and a guard that every embedded `15NN` migration is
  covered by a prefix.
