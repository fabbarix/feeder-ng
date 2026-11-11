-- Shop Location: where a Shop is (WGS84 degrees), so the phone can pick the nearest Shop. Both NULL = not saved.
ALTER TABLE shops ADD COLUMN lat REAL;
ALTER TABLE shops ADD COLUMN lon REAL;
