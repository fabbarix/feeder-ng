-- T8: Recipes, Tags, ingredient lines, Steps, Member preferences.
-- Needs ingredients (0200, T2) and members (0100, T1). Quantities are as typed (unit + quantity);
-- the Base Unit maths happens at use time via internal/units.
CREATE TABLE recipes (
    id                   INTEGER PRIMARY KEY,
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
CREATE INDEX recipes_archived ON recipes (archived);

-- Household Tags, created on first use. key = recipe.TagKey(name); name keeps the first spelling.
CREATE TABLE tags (
    id   INTEGER PRIMARY KEY,
    key  TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);
CREATE TABLE recipe_tags (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(id),
    position  INTEGER NOT NULL,
    PRIMARY KEY (recipe_id, tag_id)
);

-- The same Ingredient may appear on several lines (oil for the sauce and for frying).
CREATE TABLE recipe_lines (
    id            INTEGER PRIMARY KEY,
    recipe_id     INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    quantity      REAL    NOT NULL CHECK (quantity > 0),
    unit          TEXT    NOT NULL,                     -- units.NormalizeUnit
    optional      INTEGER NOT NULL DEFAULT 0 CHECK (optional IN (0, 1)),
    note          TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX recipe_lines_recipe ON recipe_lines (recipe_id);
CREATE INDEX recipe_lines_ingredient ON recipe_lines (ingredient_id);

CREATE TABLE recipe_steps (
    recipe_id         INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position          INTEGER NOT NULL,                 -- 0-based, the index `after` refers to
    text              TEXT    NOT NULL,
    kind              TEXT    NOT NULL CHECK (kind IN ('active', 'passive', 'advance')),
    duration_minutes  INTEGER NOT NULL DEFAULT 0,
    lead_time_minutes INTEGER NOT NULL DEFAULT 0,
    after_json        TEXT    NOT NULL DEFAULT '[]',    -- JSON array of step positions
    image             TEXT    NOT NULL DEFAULT '',
    PRIMARY KEY (recipe_id, position)
);
CREATE TABLE recipe_step_uses (
    recipe_id     INTEGER NOT NULL,
    step_position INTEGER NOT NULL,
    position      INTEGER NOT NULL,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    quantity      REAL    NOT NULL CHECK (quantity > 0),
    unit          TEXT    NOT NULL,
    PRIMARY KEY (recipe_id, step_position, position),
    FOREIGN KEY (recipe_id, step_position) REFERENCES recipe_steps(recipe_id, position) ON DELETE CASCADE
);
CREATE INDEX recipe_step_uses_ingredient ON recipe_step_uses (ingredient_id);

-- One state per (Member, Recipe): favourite | dislike | exclusion. No row = none.
CREATE TABLE member_recipe_preferences (
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    state     TEXT    NOT NULL CHECK (state IN ('favourite', 'dislike', 'exclusion')),
    PRIMARY KEY (member_id, recipe_id)
);
-- A Member's Exclusion of an Ingredient (allergy etc.).
CREATE TABLE member_ingredient_exclusions (
    member_id     INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    PRIMARY KEY (member_id, ingredient_id)
);
