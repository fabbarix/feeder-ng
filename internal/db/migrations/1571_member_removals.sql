-- Remove Member keeps a snapshot for Undo (beta.9, B9-04; SAFE-02, docs/dev/design/b9-snap.md). Additive only.
-- One row per removed Member, written in the transaction that removes them: the Member's own row and every row that
-- went with them (usual and date Attendance, Course opt-outs, Favourites, Dislikes and Exclusions) as JSON. Undo within
-- ten minutes puts them back with the same id and deletes the row. An expired row is deleted by the next removal, which
-- then releases its photo file. No foreign key: the Member is gone.
CREATE TABLE member_removals (
    member_id     INTEGER PRIMARY KEY,           -- the removed Member's id, which Undo gives back
    removed_at    TEXT    NOT NULL,              -- RFC 3339 instant of the removal
    photo         TEXT    NOT NULL DEFAULT '',   -- the Member's photo id, released when the snapshot expires
    snapshot_json TEXT    NOT NULL
);
