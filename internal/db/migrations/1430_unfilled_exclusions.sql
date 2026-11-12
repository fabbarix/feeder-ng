-- 1430 (team B-RX, docs/dev/design/rx-pt.md 2.4): the planner's Exclusion detail for a Couldn't plan cell.
-- Nullable, no backfill: NULL means nothing recorded; the startup replan rewrites every reason.
ALTER TABLE plan_unfilled ADD COLUMN exclusions_json TEXT;
