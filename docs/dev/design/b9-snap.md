# b9-snap: the snapshot before migrations 1570 to 1578

beta.9 adds nine migrations, `1570_` to `1578_` ([ui-remediation-plan-3.md](../../design/ui-remediation-plan-3.md)
section 7). It follows the beta.5 ([b5-snap.md](b5-snap.md)), beta.6 ([b6-snap.md](b6-snap.md)), beta.7
([b7-snap.md](b7-snap.md)) and beta.8 ([b8-snap.md](b8-snap.md)) pattern exactly: beta.9 takes `feeder-pre-1570.db`
first. The 1400, 1500, 1540, 1550 and 1560 behaviour is unchanged.

Why: `scripts/test/b5-snap_test.sh` refuses a 15NN migration that no snapshot prefix covers. As for beta.7 and beta.8,
the next snapshot is named rather than an earlier prefix set extended: the pre-1560 file must stay "the database as it
was before beta.8", and a beta.8 user upgrading to beta.9 needs a restore point that is the beta.8 database.

All nine prefixes are listed from the start (B9-04, wave 0), so the packages that add 1572 to 1578 add only their
migration file and never touch `db.go`. No other 15NN number may be added in beta.9 without the main session changing
the plan's table.

## The migrations

| # | File | Package | Kind |
|---|---|---|---|
| 1570 | `1570_meal_slot_removed.sql` | B9-04 | parent-table rebuild |
| 1571 | `1571_member_removals.sql` | B9-04 | additive |
| 1572 | `1572_stock_undo.sql` | B9-05 | additive |
| 1573 | `1573_cooked_takes.sql` | B9-11 | additive |
| 1574 | `1574_plan_snapshots.sql` | B9-11 | additive |
| 1575 | `1575_household_b9.sql` | B9-12 | additive |
| 1576 | `1576_shopping_tick_additions.sql` | B9-23 | additive plus a data move |
| 1577 | `1577_member_away.sql` | B9-24 | additive |
| 1578 | `1578_latest_start.sql` | B9-58 | additive (Latest start Off where the stored Earliest start is 22:00 or later) |

**1570** (a removed Meal Slot keeps its history, ADR 0021) rebuilds `meal_slots` with `removed_at TEXT` (NULL while
active), with the procedure of 1100 and 1400: its first line is `-- feeder:foreign-keys=off`, so the runner applies it on
one connection with foreign keys OFF and the `DROP` does not cascade into the nine tables that reference `meal_slots`
(`meal_slot_attendees`, `attendance_overrides`, `planned_meals`, `slot_rules`, `plan_unfilled`, `meal_slot_courses`,
`meal_slot_course_opt_outs`, `course_attendance_overrides`, `meal_slot_dates`). Row ids and the AUTOINCREMENT counter are
kept (the counter is carried over before the `DROP`). `UNIQUE (weekday, name)` becomes the partial unique index
`meal_slots_active_name ON meal_slots (weekday, name) WHERE removed_at IS NULL`, so a removed name can be used again.
It also adds `meal_slot_removals`: the To confirm rows a removal deleted, as JSON with their Bought rows, which Undo
within ten minutes puts back. The runner checks `PRAGMA foreign_key_check` before the commit and rolls back on any
violation.

**1571** adds `member_removals`: one row per removed Member (`member_id`, `removed_at`, `photo`, `snapshot_json` with
the Member's row and their Attendance, Course opt-outs, Favourites, Dislikes and Exclusions). Undo within ten minutes
restores the Member with the same id. The first removal after those ten minutes deletes the expired rows and releases their
photo files.

## Rule

- **Trigger:** the database already holds applied migrations and an embedded migration whose name starts with one of
  `1570_` … `1578_` is not recorded yet. No snapshot on a brand-new file, or once every listed migration is recorded.
- **Taken before any migration runs**, with `backup.SnapshotNamed` (verified, mode 0600, folder lock), into
  `<data>/backups/feeder-pre-1570.db`. A failure stops start-up, names the file, and migrates nothing.
- **Never replaced** (`keep`): if `feeder-pre-1570.db` exists the snapshot is skipped.
- **Ordered table:** start-up runs 1400, 1500, 1540, 1550, 1560, then 1570, all before `db.Migrate`.
  - A beta.8 database: only `feeder-pre-1570.db`.
  - Skipping beta.8 (a beta.7 database): `feeder-pre-1560.db` and `feeder-pre-1570.db`, both the beta.7 database.
  - Older databases get every earlier file as well, all the same database from before the first pending migration.
- List and Prune ignore the file (the `^feeder-pre-\d{4}\.db$` check); no code change.

## API

| Package | Name | Purpose |
|---|---|---|
| `backup` | `PreSnapshot1570File = "feeder-pre-1570.db"` | next to the 1560 one |
| `db` | `Pre1570Prefixes []string` | `[]string{"1570_", "1571_", "1572_", "1573_", "1574_", "1575_", "1576_", "1577_", "1578_"}` |
| `db` | `NeedsPre1570Snapshot(ctx, d)` | `NeedsSnapshotFor(ctx, d, Migrations(), Pre1570Prefixes)` |
| `cmd/feeder` | `preSnapshots` | a sixth row after 1560: `file: backup.PreSnapshot1570File`, `migration: "1570"`, `keep: true` |

## Tests

- `internal/db/pending1570_test.go`: prefixes, no overlap, the trigger (new file, beta.8, beta.7 and beta.4.2 upgrades,
  everything applied), only pre-1570 due on a beta.8 database, `NeedsPre1570Snapshot` against the embedded set.
- `internal/db/meal_slot_removed_migration_test.go`: 1570 copies every Meal Slot and every child row with the same ids,
  keeps the AUTOINCREMENT counter, leaves `foreign_key_check` empty and foreign keys ON, makes the name unique among
  active slots only; 1570 and 1571 create their tables.
- `internal/backup/snapshot_named_1570_test.go`: constant, earlier names unchanged, written, 0600, not listed, never pruned.
- `cmd/feeder/startup_pre1570_test.go`: beta.8 upgrade, fresh install, an existing file kept, failure migrates nothing,
  the skip upgrade from beta.7 (pre-1560 and pre-1570, both the beta.7 database), all six from before Courses.
- `scripts/test/b9-snap_test.sh`; `scripts/test/b5-snap_test.sh` accepts `1570_` … `1578_` only if `Pre1570Prefixes`
  lists them.

## Rolling back

Stop Feeder, restore `feeder-pre-1570.db` as `feeder.db` (uid/gid 65532, remove the `-wal` and `-shm` files), and run
`1.0.0-beta.8`. Everything recorded after the upgrade is lost.

## Docs (release step)

`docs/dev/deploy.md` gets an "Upgrading from 1.0.0-beta.8 to 1.0.0-beta.9" section in the style of the beta.8 one
(B9-57, from the plan's section 7 upgrade notes), and `CHANGELOG.md` the beta.9 entry.
