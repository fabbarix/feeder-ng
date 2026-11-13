-- B5-LO (docs/adr/0012-leftovers-stay-leftovers.md): Leftovers by hand. A Leftover stays a Leftover; it may sit in a
-- Storage Place and be frozen. "Frozen" is frozen_on IS NOT NULL, never the place's kind: deleting or re-kinding a
-- Storage Place changes nothing about a frozen Leftover (its storage_place_id goes NULL and the Pantry shows it under
-- "Not sorted").
ALTER TABLE leftovers ADD COLUMN storage_place_id INTEGER REFERENCES storage_places (id) ON DELETE SET NULL;
ALTER TABLE leftovers ADD COLUMN frozen_on TEXT; -- household date it went into a Freezer; NULL = not frozen
CREATE INDEX leftovers_storage_place ON leftovers (storage_place_id);

-- Frozen Use-by: days a Leftover of the Recipe keeps in a Freezer (NULL = the Household's), and the Household's default.
ALTER TABLE recipes ADD COLUMN frozen_use_by_days INTEGER
    CHECK (frozen_use_by_days IS NULL OR frozen_use_by_days BETWEEN 1 AND 365);
ALTER TABLE household_settings ADD COLUMN frozen_use_by_days INTEGER NOT NULL DEFAULT 90
    CHECK (frozen_use_by_days BETWEEN 1 AND 365);

-- History of the hand actions. No foreign keys: the Leftover may be gone (Wasn't there deletes it).
CREATE TABLE leftover_events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    leftover_id      INTEGER NOT NULL,
    recipe_id        INTEGER NOT NULL,
    kind             TEXT    NOT NULL CHECK (kind IN ('had_it', 'threw_out', 'froze', 'took_out', 'wasnt_there')),
    portions         REAL    NOT NULL CHECK (portions >= 0),
    on_date          TEXT    NOT NULL,
    storage_place_id INTEGER,
    user_id          INTEGER,
    created_at       TEXT    NOT NULL
);
CREATE INDEX leftover_events_leftover ON leftover_events (leftover_id);
