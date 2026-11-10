-- Cook Mode (T14): synced timers and Advance Step "done" marks.
-- scope is "meal:YYYY-MM-DD/<mealSlotId>" or "recipe:<id>"; no foreign keys, because a Recipe cooked
-- without a Planned Meal has no row to point at and a Planned Meal row is rewritten by the planner.

CREATE TABLE cook_timers (
  id               INTEGER PRIMARY KEY,
  scope            TEXT,                                   -- NULL for a free timer
  step             INTEGER,                                -- 0-based index into the Recipe's Steps; NULL for a free timer
  label            TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  state            TEXT NOT NULL CHECK (state IN ('running','paused','finished')),
  started_at       TEXT NOT NULL,                          -- RFC 3339 UTC
  ends_at          TEXT NOT NULL,                          -- running: when it ends; finished: when it ended; paused: unused (= started_at)
  remaining_ms     INTEGER NOT NULL DEFAULT 0              -- paused only
);
-- One timer per (scope, Step): reaching the same Passive Step on two devices starts it once.
CREATE UNIQUE INDEX cook_timers_step ON cook_timers (scope, step) WHERE step IS NOT NULL;

CREATE TABLE advance_step_marks (
  scope   TEXT NOT NULL,
  step    INTEGER NOT NULL,
  done_at TEXT NOT NULL,                                   -- RFC 3339 UTC
  PRIMARY KEY (scope, step)
);
