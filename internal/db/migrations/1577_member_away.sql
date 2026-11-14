-- Away on the Member (beta.9, B9-24; PC-08, ADR 0025). Additive only.
-- member_away: one Away per row, a run of dates on which the Member eats at no Meal Slot. from_date is the first day and
-- through_date the last ("YYYY-MM-DD" household dates; NULL is "No last day yet"). from_slot_id is the first Meal Slot
-- missed on the first day and through_slot_id the last one missed on the last day; NULL is the whole day. applies_from is
-- the RFC 3339 instant of the write that set the first day: a Meal Slot that started before it keeps the Member ('' is
-- every Meal Slot of the range). The Away goes with its Member (Remove Member keeps it in the snapshot for Undo).
CREATE TABLE member_away (
    id              INTEGER PRIMARY KEY,
    member_id       INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    from_date       TEXT    NOT NULL,
    from_slot_id    INTEGER,
    through_date    TEXT,
    through_slot_id INTEGER,
    applies_from    TEXT    NOT NULL DEFAULT '',
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX member_away_member ON member_away (member_id, from_date);

-- despite_away: 1 when the date's Who's eating keeps a Member who is away at that Meal Slot ("Eats here anyway").
ALTER TABLE attendance_override_attendees ADD COLUMN despite_away INTEGER NOT NULL DEFAULT 0 CHECK (despite_away IN (0, 1));
