-- T2: Ingredients and their Unit Conversions.
-- name_key is units.NormalizeName(name): lower case, trimmed, whitespace collapsed. It is the identity.
CREATE TABLE ingredients (
    id              INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL,
    name_key        TEXT    NOT NULL UNIQUE,
    base_unit       TEXT    NOT NULL CHECK (base_unit IN ('g', 'ml', 'piece')),
    shelf_life_days INTEGER CHECK (shelf_life_days IS NULL OR shelf_life_days >= 1),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);

-- unit is units.NormalizeUnit(unit); 1 unit = to_base Base Units.
CREATE TABLE ingredient_conversions (
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    unit          TEXT    NOT NULL,
    to_base       REAL    NOT NULL CHECK (to_base > 0),
    PRIMARY KEY (ingredient_id, unit)
);
