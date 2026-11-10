-- R11c: the zero-waste streak counts the day a Lot went off, forgives a Keep, and is capped at the
-- Household's age.
-- household_settings.created_at: RFC 3339 UTC. Existing installs backfill from the earliest user,
-- Member or Stock Lot; a fresh install stays NULL and the app stamps it on first read.
ALTER TABLE household_settings ADD COLUMN created_at TEXT;
UPDATE household_settings SET created_at = (
  SELECT MIN(t) FROM (
    SELECT MIN(created_at) AS t FROM users
    UNION ALL SELECT MIN(created_at) FROM members
    UNION ALL SELECT MIN(created_at) FROM stock_lots
  )) WHERE id = 1;
-- stock_lots.kept_on: household date of the last Keep (NULL = never Kept).
ALTER TABLE stock_lots ADD COLUMN kept_on TEXT;
-- stock_waste.lot_goes_off: the thrown-out Lot's go-off date when it had gone off unforgiven.
ALTER TABLE stock_waste ADD COLUMN lot_goes_off TEXT;
-- stock_go_offs: the go-off of a Lot that left Stock without a Throw out (used up by Cooked, counted
-- away by a Stock-take) after it had gone off unforgiven. Not waste (no quantity, never listed in
-- waste reports); only the zero-waste streak reads it. lot_id is never reused (AUTOINCREMENT).
CREATE TABLE stock_go_offs (
  lot_id      INTEGER PRIMARY KEY,
  goes_off    TEXT NOT NULL,
  recorded_on TEXT NOT NULL
);
