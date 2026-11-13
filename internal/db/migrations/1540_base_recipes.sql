-- Base recipes (ADR 0015, docs/dev/design/base-recipes.md §12). A Recipe is a Base recipe iff base_ingredient_id is set.
-- Additive only: no table rebuild, no foreign-key pragma. The kind rules that span columns (Yield unit iff Base recipe;
-- no Courses; not a Ready Meal) are checked in Go, because ADD COLUMN cannot add a table constraint.
ALTER TABLE recipes ADD COLUMN base_ingredient_id INTEGER REFERENCES ingredients(id); -- its Ingredient, NULL = plannable
ALTER TABLE recipes ADD COLUMN yield_unit TEXT;  -- Base recipe only: units.NormalizeUnit of the Yield's unit; NULL = portions
CREATE UNIQUE INDEX recipes_base_ingredient ON recipes (base_ingredient_id) WHERE base_ingredient_id IS NOT NULL;

-- Base recipe line only: 0-based index of the Recipe's own Step by which it must be ready; NULL = the default rule.
ALTER TABLE recipe_lines ADD COLUMN needed_at_step INTEGER CHECK (needed_at_step IS NULL OR needed_at_step >= 0);
-- Base recipe line only: the plain Ingredient the line had before it was linked (§3.7), for Use as a plain Ingredient.
-- Not a reference for the Ingredient delete and merge guards: a delete sets it NULL, a merge rewrites it.
ALTER TABLE recipe_lines ADD COLUMN linked_from_ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL;

-- Every Base recipe Ingredient has ingredients.name_key = 'base-recipe:<recipe id>' (own or taken over, §3.2). The store
-- writes it; no existing row changes.
