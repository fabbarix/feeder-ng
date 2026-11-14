-- Undo of Cooked and Not cooked (beta.9, B9-11; SAFE-03, ADR 0020). Additive only.
-- cooked_takes: one record per Course a Cooked or Not cooked mark resolved, kept so the mark can be taken back
-- (Reopen) until the end of the household day it was made on (marked_on). The Courses of one Mark all share action.
--   lot_json            what Cooked took from each Stock Lot, as a JSON array of {ingredientId, lotId, taken, lot}
--                       (the Lot as it was); '[]' when it took nothing (Not cooked, a meal served from a Leftover, or
--                       the other Courses of a Mark all, whose takes are on the action's first record)
--   plan_json           the plan rows the mark changed, before and after (unpinned dependants, Bought rows, the replan)
--   leftover_id         the Leftover the Cooked meal made, with the leftover_portions it had then
--   source_leftover_id  the Leftover a meal served from a Leftover took source_taken portions from
--   reopened_at         set when the mark was taken back; the record stays as history
-- A meal Cooked or Not cooked before this migration has no record and cannot be reopened.
CREATE TABLE cooked_takes (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    date               TEXT    NOT NULL,
    meal_slot_id       INTEGER NOT NULL,
    course_id          INTEGER NOT NULL,
    kind               TEXT    NOT NULL CHECK (kind IN ('cooked', 'not_cooked')),
    marked_on          TEXT    NOT NULL,
    marked_at          TEXT,
    user_id            INTEGER,
    user_name          TEXT,
    action             TEXT,
    lot_json           TEXT    NOT NULL DEFAULT '[]',
    plan_json          TEXT,
    leftover_id        INTEGER,
    leftover_portions  REAL    NOT NULL DEFAULT 0,
    source_leftover_id INTEGER,
    source_taken       REAL    NOT NULL DEFAULT 0,
    reopened_at        TEXT
);
-- A cell is Cooked or Not cooked once until it is reopened.
CREATE UNIQUE INDEX cooked_takes_open ON cooked_takes (date, meal_slot_id, course_id) WHERE reopened_at IS NULL;
CREATE INDEX cooked_takes_action ON cooked_takes (action);
