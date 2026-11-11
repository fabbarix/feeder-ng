-- Storage Places (Pantry page): where the Household keeps its Stock (Garage Freezer, Kitchen Pantry, ...).
-- kind decides how a Lot's go-off date is counted: a freezer uses the Ingredient's frozen Shelf Life.
CREATE TABLE storage_places (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    name_key   TEXT    NOT NULL UNIQUE,
    kind       TEXT    NOT NULL CHECK (kind IN ('pantry', 'fridge', 'freezer')),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    created_at TEXT    NOT NULL
);
-- At most one default Storage Place.
CREATE UNIQUE INDEX storage_places_one_default ON storage_places (is_default) WHERE is_default = 1;

-- Each Stock Lot sits in one Storage Place, or none (NULL: not sorted yet, or its place was deleted).
ALTER TABLE stock_lots ADD COLUMN storage_place_id INTEGER REFERENCES storage_places(id) ON DELETE SET NULL;
CREATE INDEX stock_lots_storage_place ON stock_lots (storage_place_id);

-- The Storage Place an Ingredient was last put in: new Lots of it go there.
CREATE TABLE ingredient_storage (
    ingredient_id    INTEGER PRIMARY KEY REFERENCES ingredients(id) ON DELETE CASCADE,
    storage_place_id INTEGER NOT NULL REFERENCES storage_places(id) ON DELETE CASCADE
);

-- How long an Ingredient keeps in a Freezer; NULL = the Freezer does not change its go-off date.
ALTER TABLE ingredients ADD COLUMN frozen_shelf_life_days INTEGER;
