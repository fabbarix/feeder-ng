-- B5-SD (docs/adr/0014-meal-slot-on-one-date.md): a Meal Slot on one date. Not served, the date's own time and the
-- number of Guests. Separate from attendance_overrides on purpose: an override owns an attendee list and is deleted by
-- "Reset to usual Attendance"; these three are not attendance. The repository deletes a row that is back to all
-- defaults (not_served 0, time NULL, guests 0). Rows before today are kept (history shows the time it was served at).
CREATE TABLE meal_slot_dates (
    slot_id    INTEGER NOT NULL REFERENCES meal_slots(id) ON DELETE CASCADE,
    date       TEXT    NOT NULL,
    not_served INTEGER NOT NULL DEFAULT 0 CHECK (not_served IN (0, 1)),
    time       TEXT    CHECK (time IS NULL OR time GLOB '[0-2][0-9]:[0-5][0-9]'),
    guests     INTEGER NOT NULL DEFAULT 0 CHECK (guests BETWEEN 0 AND 20),
    updated_at TEXT    NOT NULL,
    PRIMARY KEY (slot_id, date)
);
