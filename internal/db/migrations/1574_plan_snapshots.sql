-- What changed and Undo of a replanning write (beta.9, B9-11; PC-01, SAFE-07, ADR 0022). Additive only.
-- plan_state.revision: bumped by every write that changes a plan row, so an undo token is good only while nothing else
-- has written since.
ALTER TABLE plan_state ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
-- plan_snapshots: the undoToken store. state_json holds the plan rows the write changed (before and after), the
-- generation, and what each undo participant (Away) captured. revision is plan_state.revision right after the write.
-- The newest 20 are kept.
CREATE TABLE plan_snapshots (
    token      TEXT    PRIMARY KEY,
    revision   INTEGER NOT NULL,
    created_at TEXT    NOT NULL,
    state_json TEXT    NOT NULL
);
