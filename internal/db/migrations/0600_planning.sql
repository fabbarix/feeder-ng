-- T11: planning. Planned Meals, Leftovers, Slot Rules, Variety Rules, couldn't-plan reasons, generation counter.
-- Needs meal_slots (0100) and recipes (0300). Dates are YYYY-MM-DD in household time; instants are RFC 3339 UTC.

-- One Planned Meal per Meal Slot on one date. A Planned Meal is either freshly cooked (batches > 0)
-- or served from a Leftover (from_* set, batches = 0).
CREATE TABLE planned_meals (
    id              INTEGER PRIMARY KEY,
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
CREATE INDEX planned_meals_recipe ON planned_meals (recipe_id);
CREATE INDEX planned_meals_state_date ON planned_meals (state, date);

-- Actual Leftovers, recorded when a fresh Planned Meal is marked Cooked.
CREATE TABLE leftovers (
    id          INTEGER PRIMARY KEY,
    recipe_id   INTEGER NOT NULL REFERENCES recipes (id),
    from_date   TEXT    NOT NULL,        -- slot of the Cooked meal
    from_meal_slot_id INTEGER NOT NULL,
    portions    REAL    NOT NULL CHECK (portions >= 0),   -- remaining
    cooked_on   TEXT    NOT NULL,
    use_by      TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'discarded')),
    discarded_on TEXT,
    created_at  TEXT    NOT NULL
);
CREATE INDEX leftovers_status ON leftovers (status, use_by);

-- Slot Rule: a Meal Slot is fixed to a Recipe or a Tag (exactly one of the two).
CREATE TABLE slot_rules (
    id           INTEGER PRIMARY KEY,
    meal_slot_id INTEGER NOT NULL REFERENCES meal_slots (id) ON DELETE CASCADE,
    recipe_id    INTEGER REFERENCES recipes (id),
    tag          TEXT,                    -- recipe.TagKey
    CHECK ((recipe_id IS NULL) <> (tag IS NULL)),
    UNIQUE (meal_slot_id, recipe_id, tag)
);

-- Variety Rule: at most max_per_week Recipes with the Tag per ISO week and/or never on consecutive days.
CREATE TABLE variety_rules (
    tag                  TEXT    PRIMARY KEY,   -- recipe.TagKey
    max_per_week         INTEGER NOT NULL DEFAULT 0 CHECK (max_per_week >= 0),
    not_consecutive_days INTEGER NOT NULL DEFAULT 0 CHECK (not_consecutive_days IN (0, 1)),
    CHECK (max_per_week > 0 OR not_consecutive_days = 1)
);

-- "Couldn't plan" reasons from the last run, one per slot the planner left empty.
CREATE TABLE plan_unfilled (
    date             TEXT    NOT NULL,
    meal_slot_id     INTEGER NOT NULL REFERENCES meal_slots (id) ON DELETE CASCADE,
    reason           TEXT    NOT NULL CHECK (reason IN ('no_attendance', 'no_candidates')),
    slot_rule_claimed INTEGER NOT NULL DEFAULT 0,
    eliminated_json  TEXT    NOT NULL DEFAULT '{}',
    PRIMARY KEY (date, meal_slot_id)
);

-- The single planner state row. generation seeds the jitter: Regenerate bumps it.
CREATE TABLE plan_state (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    generation INTEGER NOT NULL DEFAULT 1
);
INSERT INTO plan_state (id) VALUES (1);
