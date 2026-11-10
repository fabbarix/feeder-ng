-- T13: the Undo steps already done for a scan (comma separated), so a retried Undo never repeats one.
ALTER TABLE scan_events ADD COLUMN undo_steps TEXT;
