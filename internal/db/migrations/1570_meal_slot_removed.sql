-- feeder:foreign-keys=off
-- A removed Meal Slot keeps its history (beta.9, B9-04; ADR 0021, docs/dev/design/b9-snap.md). Rebuilds meal_slots
-- with removed_at (NULL while active), with the 12-step procedure of 1100 and 1400: create meal_slots_new with the
-- current definition plus the new column, copy every row, drop, rename. Foreign keys are OFF for this file, so the
-- DROP does not cascade into the nine tables that reference meal_slots; their text still names meal_slots, which the
-- renamed table now is. Row ids are kept, and the AUTOINCREMENT counter is carried over BEFORE the DROP, so a deleted id
-- is never handed out again. The runner checks foreign_key_check before commit.
--
-- UNIQUE (weekday, name) becomes the partial unique index meal_slots_active_name over the active slots only, so a
-- removed Dinner on Monday leaves the name free for a new one (name is COLLATE NOCASE, as before).
CREATE TABLE meal_slots_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    name       TEXT    NOT NULL COLLATE NOCASE,
    time       TEXT    NOT NULL,
    removed_at TEXT                              -- RFC 3339 instant of the removal; NULL while the Meal Slot is active
);
INSERT INTO meal_slots_new (id, weekday, name, time) SELECT id, weekday, name, time FROM meal_slots;
DELETE FROM sqlite_sequence WHERE name = 'meal_slots_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'meal_slots_new', seq FROM sqlite_sequence WHERE name = 'meal_slots';
DROP TABLE meal_slots;
ALTER TABLE meal_slots_new RENAME TO meal_slots;
CREATE UNIQUE INDEX meal_slots_active_name ON meal_slots (weekday, name) WHERE removed_at IS NULL;

-- meal_slot_removals: the To confirm rows (unresolved Planned Meals whose slot time had passed) that removing a
-- Meal Slot deleted, so Undo within ten minutes puts them back. meal_json is the planned_meals row (id included) with
-- its Bought rows. Removing the Meal Slot again replaces them; putting it back deletes them.
CREATE TABLE meal_slot_removals (
    id           INTEGER PRIMARY KEY,
    meal_slot_id INTEGER NOT NULL REFERENCES meal_slots (id) ON DELETE CASCADE,
    removed_at   TEXT    NOT NULL,
    meal_json    TEXT    NOT NULL
);
CREATE INDEX meal_slot_removals_slot ON meal_slot_removals (meal_slot_id);
