-- feeder:foreign-keys=off
-- Rebuilds the eight tables whose ids clients cache or link to, with AUTOINCREMENT, so a deleted id is never
-- handed out again (SQLite reuses max(rowid)+1 for a plain INTEGER PRIMARY KEY). Follows the 12-step
-- procedure in https://www.sqlite.org/lang_altertable.html#otheralter: create the new table with the
-- current definition, copy, drop, rename, recreate the indexes. Foreign keys are OFF for this file
-- (see internal/db: the runner), so dropping a parent does not cascade into its children, and the
-- runner checks foreign_key_check before commit. Join and child tables are not rebuilt (composite keys).

-- ingredients
CREATE TABLE ingredients_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    name_key        TEXT    NOT NULL UNIQUE,
    base_unit       TEXT    NOT NULL CHECK (base_unit IN ('g', 'ml', 'piece')),
    shelf_life_days INTEGER CHECK (shelf_life_days IS NULL OR shelf_life_days >= 1),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);
INSERT INTO ingredients_new (id, name, name_key, base_unit, shelf_life_days, created_at, updated_at) SELECT id, name, name_key, base_unit, shelf_life_days, created_at, updated_at FROM ingredients;
DROP TABLE ingredients;
ALTER TABLE ingredients_new RENAME TO ingredients;

-- recipes
CREATE TABLE recipes_new (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    name                 TEXT    NOT NULL,
    description          TEXT    NOT NULL DEFAULT '',
    yield                REAL    NOT NULL CHECK (yield > 0),
    ready_meal           INTEGER NOT NULL DEFAULT 0 CHECK (ready_meal IN (0, 1)),
    cooldown_days        INTEGER CHECK (cooldown_days IS NULL OR cooldown_days >= 0),
    leftover_use_by_days INTEGER CHECK (leftover_use_by_days IS NULL OR leftover_use_by_days >= 0),
    source_url           TEXT    NOT NULL DEFAULT '',
    source_attribution   TEXT    NOT NULL DEFAULT '',
    image                TEXT    NOT NULL DEFAULT '',   -- internal/imaging id, '' = none
    archived             INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    total_minutes        INTEGER NOT NULL DEFAULT 0,    -- cached critical path, rewritten on every save
    advance_minutes      INTEGER NOT NULL DEFAULT 0,    -- cached longest Advance Step lead time
    created_at           TEXT    NOT NULL,
    updated_at           TEXT    NOT NULL
);
INSERT INTO recipes_new (id, name, description, yield, ready_meal, cooldown_days, leftover_use_by_days, source_url, source_attribution, image, archived, total_minutes, advance_minutes, created_at, updated_at) SELECT id, name, description, yield, ready_meal, cooldown_days, leftover_use_by_days, source_url, source_attribution, image, archived, total_minutes, advance_minutes, created_at, updated_at FROM recipes;
DROP TABLE recipes;
ALTER TABLE recipes_new RENAME TO recipes;

-- products
CREATE TABLE products_new (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    pack_size     REAL NOT NULL CHECK (pack_size > 0),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
INSERT INTO products_new (id, name, ingredient_id, pack_size, created_at, updated_at) SELECT id, name, ingredient_id, pack_size, created_at, updated_at FROM products;
DROP TABLE products;
ALTER TABLE products_new RENAME TO products;

-- shops
CREATE TABLE shops_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    name_key   TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
INSERT INTO shops_new (id, name, name_key, created_at) SELECT id, name, name_key, created_at FROM shops;
DROP TABLE shops;
ALTER TABLE shops_new RENAME TO shops;

-- members
CREATE TABLE members_new (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, colour TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '',
  portion_factor REAL NOT NULL, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL);
INSERT INTO members_new (id, name, colour, avatar, portion_factor, user_id, created_at) SELECT id, name, colour, avatar, portion_factor, user_id, created_at FROM members;
DROP TABLE members;
ALTER TABLE members_new RENAME TO members;

-- meal_slots
CREATE TABLE meal_slots_new (id INTEGER PRIMARY KEY AUTOINCREMENT, weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  name TEXT NOT NULL COLLATE NOCASE, time TEXT NOT NULL, UNIQUE (weekday, name));
INSERT INTO meal_slots_new (id, weekday, name, time) SELECT id, weekday, name, time FROM meal_slots;
DROP TABLE meal_slots;
ALTER TABLE meal_slots_new RENAME TO meal_slots;

-- planned_meals
CREATE TABLE planned_meals_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT    NOT NULL,
    meal_slot_id    INTEGER NOT NULL REFERENCES meal_slots (id) ON DELETE CASCADE,
    recipe_id       INTEGER NOT NULL REFERENCES recipes (id),
    batches         REAL    NOT NULL DEFAULT 0 CHECK (batches >= 0),
    portions        REAL    NOT NULL DEFAULT 0 CHECK (portions >= 0),   -- what the slot needed when it was placed
    state           TEXT    NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'cooked', 'skipped')),
    pinned          INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    from_leftover_id INTEGER REFERENCES leftovers (id) ON DELETE SET NULL, -- actual Leftover, once there is one
    from_date       TEXT,                                                -- slot of the fresh meal that produced the Leftover
    from_meal_slot_id INTEGER,
    why_json        TEXT    NOT NULL DEFAULT '[]',                       -- structured why chips (internal/plan.Why)
    resolved_at     TEXT,                                                -- when it became cooked or skipped
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    UNIQUE (date, meal_slot_id),
    CHECK ((from_date IS NULL) = (from_meal_slot_id IS NULL))
);
INSERT INTO planned_meals_new (id, date, meal_slot_id, recipe_id, batches, portions, state, pinned, from_leftover_id, from_date, from_meal_slot_id, why_json, resolved_at, created_at, updated_at) SELECT id, date, meal_slot_id, recipe_id, batches, portions, state, pinned, from_leftover_id, from_date, from_meal_slot_id, why_json, resolved_at, created_at, updated_at FROM planned_meals;
DROP TABLE planned_meals;
ALTER TABLE planned_meals_new RENAME TO planned_meals;

-- stock_lots
CREATE TABLE stock_lots_new (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    quantity      REAL    NOT NULL CHECK (quantity > 0),
    purchased     TEXT    NOT NULL,
    goes_off      TEXT,
    source        TEXT    NOT NULL CHECK (source IN ('scan', 'stock_take', 'manual')),
    product_id    INTEGER,
    shop_id       INTEGER,
    client_uuid   TEXT UNIQUE,
    created_at    TEXT    NOT NULL
);
INSERT INTO stock_lots_new (id, ingredient_id, quantity, purchased, goes_off, source, product_id, shop_id, client_uuid, created_at) SELECT id, ingredient_id, quantity, purchased, goes_off, source, product_id, shop_id, client_uuid, created_at FROM stock_lots;
DROP TABLE stock_lots;
ALTER TABLE stock_lots_new RENAME TO stock_lots;

-- indexes dropped with their tables
CREATE INDEX recipes_archived ON recipes (archived);
CREATE INDEX products_ingredient ON products(ingredient_id);
CREATE INDEX planned_meals_recipe ON planned_meals (recipe_id);
CREATE INDEX planned_meals_state_date ON planned_meals (state, date);
CREATE INDEX stock_lots_ingredient ON stock_lots (ingredient_id);
