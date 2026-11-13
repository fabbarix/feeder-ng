-- B5-BO (docs/adr/0013-bought-planned-meals-held.md, docs/dev/design/b5-bo.md): what a purchase from the Shopping List
-- was bought for. One row per Planned Meal, Ingredient and Lot, with the amount that purchase took off the Planned
-- Meal's shortfall. A Planned Meal with at least one row is Bought.
--
-- lot_id has no foreign key on purpose: the Lot may be used up (and deleted) when another Planned Meal is Cooked, and
-- the record stays until its own Planned Meal is resolved, removed or changes Recipe. The rows go with the Planned
-- Meal (ON DELETE CASCADE); the repository removes them when the Planned Meal is resolved or its Recipe changes, and
-- the Shopping List removes a Lot's rows on Undo of the Scan, unticking and Lot Delete. No backfill: purchases before
-- the upgrade have no per-Planned-Meal record.
CREATE TABLE planned_meal_bought (
    planned_meal_id INTEGER NOT NULL REFERENCES planned_meals(id) ON DELETE CASCADE,
    ingredient_id   INTEGER NOT NULL REFERENCES ingredients(id),
    lot_id          INTEGER NOT NULL,
    quantity        REAL    NOT NULL CHECK (quantity > 0),
    bought_at       TEXT    NOT NULL,
    PRIMARY KEY (planned_meal_id, ingredient_id, lot_id)
);
CREATE INDEX planned_meal_bought_lot ON planned_meal_bought (lot_id);
CREATE INDEX planned_meal_bought_ingredient ON planned_meal_bought (ingredient_id);

-- For the Recipes list's "Last cooked" (beta.5 F7): the latest Cooked fresh meal per Recipe.
CREATE INDEX planned_meals_recipe_cooked ON planned_meals (recipe_id, date) WHERE state = 'cooked' AND from_date IS NULL;
