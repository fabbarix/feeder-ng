-- B5-SH (docs/dev/design/beta5-plan.md 2.5): Not needed. The Ingredients a User took off the Shopping List for one
-- range (range_to, the range's last date, like ticks). Adds no Stock and is not a purchase. user_id is the User who
-- set it (NULL when none was recorded); Needed is the Line quantity when it was set.
CREATE TABLE shopping_not_needed (
    range_to      TEXT    NOT NULL,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    needed        REAL    NOT NULL CHECK (needed >= 0),
    user_id       INTEGER,
    created_at    TEXT    NOT NULL,
    PRIMARY KEY (range_to, ingredient_id)
);
