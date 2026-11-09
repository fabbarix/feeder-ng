-- T11: internal/scheduler remembers the last household date each daily job ran, so a restart neither repeats nor skips a night.
CREATE TABLE scheduler_runs (
    job    TEXT PRIMARY KEY,
    ran_on TEXT NOT NULL   -- YYYY-MM-DD, household time
);
