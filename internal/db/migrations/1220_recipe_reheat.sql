-- R12: an optional per-Recipe reheat time in whole minutes (1 to 30). NULL = not set: Reheat then
-- works the time out from the portions. Existing Recipes stay NULL.
ALTER TABLE recipes ADD COLUMN reheat_minutes INTEGER CHECK (reheat_minutes IS NULL OR (reheat_minutes BETWEEN 1 AND 30));
