-- T13: the manual extra a scan counted against (Undo gives its quantity back to the extra).
ALTER TABLE scan_events ADD COLUMN extra_id INTEGER;
