-- feeder:foreign-keys=off
-- Courses (ADR 0008, docs/dev/design/crs-plan.md §1.1). A Planned Meal is keyed by (date, Meal Slot, Course).
-- Rebuilds the tables whose keys change, with the 12-step procedure of 1100: create *_new with the current
-- definition plus the new columns, copy EVERY current column, drop, rename, recreate indexes. Row ids are kept.
-- MAIN below is the id of the Course with is_main = 1 (never a literal id). The runner checks
-- foreign_key_check before commit. planned_meals keeps its AUTOINCREMENT counter (carried over before the DROP).

-- courses: the household's Courses in order. name_key is course.NameKey (trim, collapse, lower-case).
CREATE TABLE courses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    name_key   TEXT    NOT NULL UNIQUE,
    position   INTEGER NOT NULL,
    is_main    INTEGER NOT NULL DEFAULT 0 CHECK (is_main IN (0, 1)),
    archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at TEXT    NOT NULL,
    CHECK (NOT (is_main = 1 AND archived = 1))
);
CREATE UNIQUE INDEX courses_one_main ON courses (is_main) WHERE is_main = 1;
INSERT INTO courses (name, name_key, position, is_main, archived, created_at) VALUES
    ('Main',    'main',    0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Side',    'side',    1, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Starter', 'starter', 2, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('Dessert', 'dessert', 3, 0, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

-- recipe_courses: the Courses a Recipe is served as (every Recipe, archived ones included, gets MAIN).
CREATE TABLE recipe_courses (
    recipe_id INTEGER NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses (id),
    PRIMARY KEY (recipe_id, course_id)
);
CREATE INDEX recipe_courses_course ON recipe_courses (course_id);
INSERT INTO recipe_courses (recipe_id, course_id) SELECT id, (SELECT id FROM courses WHERE is_main = 1) FROM recipes;

-- recipes.whole_meal: a Ready Meal is a Whole meal (it stands alone as a whole dinner).
ALTER TABLE recipes ADD COLUMN whole_meal INTEGER NOT NULL DEFAULT 0 CHECK (whole_meal IN (0, 1));
UPDATE recipes SET whole_meal = 1 WHERE ready_meal = 1;

-- meal_slot_courses: the Courses a Meal Slot serves, in order. Saved by delete and reinsert, so no foreign key
-- points at it from the opt-out tables below.
CREATE TABLE meal_slot_courses (
    meal_slot_id INTEGER NOT NULL REFERENCES meal_slots (id) ON DELETE CASCADE,
    course_id    INTEGER NOT NULL REFERENCES courses (id),
    position     INTEGER NOT NULL,
    optional     INTEGER NOT NULL DEFAULT 0 CHECK (optional IN (0, 1)),
    PRIMARY KEY (meal_slot_id, course_id),
    UNIQUE (meal_slot_id, position)
);
INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional)
    SELECT id, (SELECT id FROM courses WHERE is_main = 1), 0, 0 FROM meal_slots;

-- Course Attendance: usual opt-outs, per-date overrides and their opt-outs. Nobody opts out yet.
-- No foreign key to meal_slot_courses (see above): the store deletes the opt-outs of a Course that leaves a slot.
CREATE TABLE meal_slot_course_opt_outs (
    meal_slot_id INTEGER NOT NULL REFERENCES meal_slots (id) ON DELETE CASCADE,
    course_id    INTEGER NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    member_id    INTEGER NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    PRIMARY KEY (meal_slot_id, course_id, member_id)
);
CREATE INDEX meal_slot_course_opt_outs_course ON meal_slot_course_opt_outs (course_id);

CREATE TABLE course_attendance_overrides (
    slot_id   INTEGER NOT NULL REFERENCES meal_slots (id) ON DELETE CASCADE,
    date      TEXT    NOT NULL,
    course_id INTEGER NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    PRIMARY KEY (slot_id, date, course_id)
);
CREATE INDEX course_attendance_overrides_course ON course_attendance_overrides (course_id);

CREATE TABLE course_attendance_override_opt_outs (
    slot_id   INTEGER NOT NULL,
    date      TEXT    NOT NULL,
    course_id INTEGER NOT NULL,
    member_id INTEGER NOT NULL REFERENCES members (id) ON DELETE CASCADE,
    PRIMARY KEY (slot_id, date, course_id, member_id),
    FOREIGN KEY (slot_id, date, course_id) REFERENCES course_attendance_overrides (slot_id, date, course_id) ON DELETE CASCADE
);

-- planned_meals (rebuild): keyed by (date, Meal Slot, Course); from_course_id and relaxed (ADR 0009).
-- The AUTOINCREMENT counter is carried over BEFORE the DROP, so a deleted id is never handed out again.
CREATE TABLE planned_meals_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    date              TEXT    NOT NULL,
    meal_slot_id      INTEGER NOT NULL REFERENCES meal_slots (id) ON DELETE CASCADE,
    course_id         INTEGER NOT NULL REFERENCES courses (id),
    recipe_id         INTEGER NOT NULL REFERENCES recipes (id),
    batches           REAL    NOT NULL DEFAULT 0 CHECK (batches >= 0),
    portions          REAL    NOT NULL DEFAULT 0 CHECK (portions >= 0),   -- what the slot needed when it was placed
    state             TEXT    NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'cooked', 'skipped')),
    pinned            INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    from_leftover_id  INTEGER REFERENCES leftovers (id) ON DELETE SET NULL, -- actual Leftover, once there is one
    from_date         TEXT,                                                -- slot of the fresh meal that produced the Leftover
    from_meal_slot_id INTEGER,
    from_course_id    INTEGER REFERENCES courses (id),                     -- Course of that fresh meal
    relaxed           INTEGER NOT NULL DEFAULT 0 CHECK (relaxed IN (0, 1)), -- a relaxed pick (ADR 0009)
    why_json          TEXT    NOT NULL DEFAULT '[]',                       -- structured why chips (internal/plan.Why)
    resolved_at       TEXT,                                                -- when it became cooked or skipped
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    UNIQUE (date, meal_slot_id, course_id),
    CHECK ((from_date IS NULL) = (from_meal_slot_id IS NULL)),
    CHECK ((from_date IS NULL) = (from_course_id IS NULL))
);
DELETE FROM sqlite_sequence WHERE name = 'planned_meals_new';
INSERT INTO sqlite_sequence (name, seq) SELECT 'planned_meals_new', seq FROM sqlite_sequence WHERE name = 'planned_meals';
INSERT INTO planned_meals_new (id, date, meal_slot_id, course_id, recipe_id, batches, portions, state, pinned, from_leftover_id, from_date, from_meal_slot_id, from_course_id, relaxed, why_json, resolved_at, created_at, updated_at)
    SELECT id, date, meal_slot_id, (SELECT id FROM courses WHERE is_main = 1), recipe_id, batches, portions, state, pinned, from_leftover_id, from_date, from_meal_slot_id,
           CASE WHEN from_date IS NULL THEN NULL ELSE (SELECT id FROM courses WHERE is_main = 1) END, 0, why_json, resolved_at, created_at, updated_at
    FROM planned_meals;
DROP TABLE planned_meals;
ALTER TABLE planned_meals_new RENAME TO planned_meals;
CREATE INDEX planned_meals_recipe ON planned_meals (recipe_id);
CREATE INDEX planned_meals_state_date ON planned_meals (state, date);
CREATE INDEX planned_meals_course ON planned_meals (course_id);

-- leftovers (rebuild; plain INTEGER PRIMARY KEY, so no counter to carry): from_course_id is the Course of the Cooked meal.
CREATE TABLE leftovers_new (
    id                INTEGER PRIMARY KEY,
    recipe_id         INTEGER NOT NULL REFERENCES recipes (id),
    from_date         TEXT    NOT NULL,        -- slot of the Cooked meal
    from_meal_slot_id INTEGER NOT NULL,
    from_course_id    INTEGER NOT NULL REFERENCES courses (id),
    portions          REAL    NOT NULL CHECK (portions >= 0),   -- remaining
    cooked_on         TEXT    NOT NULL,
    use_by            TEXT    NOT NULL,
    status            TEXT    NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'discarded')),
    discarded_on      TEXT,
    created_at        TEXT    NOT NULL
);
INSERT INTO leftovers_new (id, recipe_id, from_date, from_meal_slot_id, from_course_id, portions, cooked_on, use_by, status, discarded_on, created_at)
    SELECT id, recipe_id, from_date, from_meal_slot_id, (SELECT id FROM courses WHERE is_main = 1), portions, cooked_on, use_by, status, discarded_on, created_at FROM leftovers;
DROP TABLE leftovers;
ALTER TABLE leftovers_new RENAME TO leftovers;
CREATE INDEX leftovers_status ON leftovers (status, use_by);

-- plan_unfilled (rebuild): a reason per (date, Meal Slot, Course); adds no_course_recipes.
CREATE TABLE plan_unfilled_new (
    date              TEXT    NOT NULL,
    meal_slot_id      INTEGER NOT NULL REFERENCES meal_slots (id) ON DELETE CASCADE,
    course_id         INTEGER NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    reason            TEXT    NOT NULL CHECK (reason IN ('no_attendance', 'no_candidates', 'no_course_recipes')),
    slot_rule_claimed INTEGER NOT NULL DEFAULT 0,
    eliminated_json   TEXT    NOT NULL DEFAULT '{}',
    PRIMARY KEY (date, meal_slot_id, course_id)
);
INSERT INTO plan_unfilled_new (date, meal_slot_id, course_id, reason, slot_rule_claimed, eliminated_json)
    SELECT date, meal_slot_id, (SELECT id FROM courses WHERE is_main = 1), reason, slot_rule_claimed, eliminated_json FROM plan_unfilled;
DROP TABLE plan_unfilled;
ALTER TABLE plan_unfilled_new RENAME TO plan_unfilled;

-- slot_rules (rebuild; plain INTEGER PRIMARY KEY): a rule belongs to one Course of its Meal Slot.
CREATE TABLE slot_rules_new (
    id           INTEGER PRIMARY KEY,
    meal_slot_id INTEGER NOT NULL REFERENCES meal_slots (id) ON DELETE CASCADE,
    course_id    INTEGER NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
    recipe_id    INTEGER REFERENCES recipes (id),
    tag          TEXT,                    -- recipe.TagKey
    CHECK ((recipe_id IS NULL) <> (tag IS NULL)),
    UNIQUE (meal_slot_id, course_id, recipe_id, tag)
);
INSERT INTO slot_rules_new (id, meal_slot_id, course_id, recipe_id, tag)
    SELECT id, meal_slot_id, (SELECT id FROM courses WHERE is_main = 1), recipe_id, tag FROM slot_rules;
DROP TABLE slot_rules;
ALTER TABLE slot_rules_new RENAME TO slot_rules;

-- Cook scopes: a Planned Meal's scope gains its Course. Recipe scopes, free timers and scopes that already carry a Course (three parts) are untouched.
UPDATE cook_timers SET scope = scope || '/' || (SELECT id FROM courses WHERE is_main = 1) WHERE scope LIKE 'meal:%' AND scope NOT GLOB 'meal:*/*/*';
UPDATE advance_step_marks SET scope = scope || '/' || (SELECT id FROM courses WHERE is_main = 1) WHERE scope LIKE 'meal:%' AND scope NOT GLOB 'meal:*/*/*';
