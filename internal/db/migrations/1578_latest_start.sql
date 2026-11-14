-- Household settings: Latest start (beta.9, A2, B9-58). Additive only.
-- latest_start: the latest "HH:MM" the planner may ask someone to start cooking, in the household zone, on the day of
-- the meal or an earlier one. NULL is Off (a start must then be on the day of the meal, at or after the Earliest start).
-- The Household already there gets '22:00', the same as a new one, so its next replan may plan a long Recipe to start
-- the evening before (upgrade notes).
ALTER TABLE household_settings ADD COLUMN latest_start TEXT DEFAULT '22:00';
-- Latest start must be later than Earliest start: a Household whose Earliest start is 22:00 or later gets Off instead.
UPDATE household_settings SET latest_start = NULL WHERE earliest_start IS NOT NULL AND earliest_start >= '22:00';
