# Base recipes

Design (docs only) for a new **1.0.0-beta.5** feature. Branch `team/b5-base-design`, from main `878952b`. Architectural decisions: [ADR 0015](../../adr/0015-base-recipes.md) (Proposed). It fits into the beta.5 work packages of [beta5-reconcile.md §12](beta5-reconcile.md#12-proposed-work-packages-and-order) (§14 below).

Terms in **bold** are [GLOSSARY](../../../GLOSSARY.md) terms; the new ones are proposed in §2 and are not in GLOSSARY.md yet. Everything was read from the tree at `878952b`.

The user's decisions (final), numbered as in the brief and referred to as **D1** to **D9**:

1. Name: **Base recipe**; UI line "500 ml Béchamel (Base recipe)". Avoid: component, sub-recipe, sub recipe.
2. A Base recipe is never plannable: never picked for a Meal Slot or Course, never Pinned or chosen. A kind set in the Recipe editor.
3. It states its Yield as an amount with a unit (1 l, 300 g, N portions); its Ingredients scale to the amount the using Recipe asks for (500 ml of 1 l is ×0.5), through Unit Conversion; the using Recipe's Batches multiply on top.
4. Its Steps go on the **cooking timeline** so it is ready just before the Step that uses it, overlapping other work where it can; Cook Mode, the Next gate, timers and Advance Steps work as for any Step; its Steps are labelled with its name.
5. Stock first: Stock of the Base recipe (a bought jar, a frozen batch) covers it first; only the missing amount is made, and only that amount's Ingredients go on the Shopping List. Cooked deducts accordingly.
6. Nesting at any depth (lasagne → béchamel → roux); a cycle is refused with a clear message.
7. Recipe editor: Base recipes appear in the same ingredient picker with a recipe badge; pick one, enter the amount. Recipe detail links to the Base recipe.
8. Exclusions and preferences look all the way down: every Ingredient inside counts for Exclusions, Review Exclusions and the planner as if it were on the using Recipe.
9. Import: the Recipe Assistant read (text and photos) and Recipe File import mark ingredient lines that refer to another recipe; Import Review asks, per line, what it is. Nothing is linked silently. A plannable Recipe picked as the target is turned into a Base recipe only after the User confirms.

---

## 0. Summary

| Area | Decision |
|---|---|
| Model | A Base recipe is a Recipe with a **Base recipe Ingredient** (`recipes.base_ingredient_id`, like the Ready Meal's Ingredient but linked by id) and a Yield unit (`recipes.yield_unit`). It has no Courses, Whole meal, Cool-down, Use-by, Reheat time or Frozen Use-by. |
| Base recipe line | An ordinary `recipe_lines` row whose Ingredient is a Base recipe Ingredient, plus an optional **Needed at** Step (`recipe_lines.needed_at_step`). No new line table. |
| Stock | The Base recipe Ingredient is an ordinary Ingredient: Stock Lots, Products (a jar's barcode), Scan, Stock-take, Shelf Life, Frozen Shelf Life, Used from all work unchanged. |
| Expansion | Read time, in a new pure package `internal/recipe/baserecipe` (unit-tested): a need tree, scaled by Unit Conversion, nested, cycle-checked. Nothing denormalised except the cached total time, as today. |
| Planner | No change to `internal/planner`. A Base recipe has no Course, so Course fit already keeps it out. `DBSources` feeds the planner the flattened Ingredients (plus each Base recipe Ingredient as an optional zero line), so Exclusions and Review Exclusions look all the way down. |
| Shopping List | `shopping.Need` gains `Made`; `derivedLines` draws the Base recipe Ingredient from Stock first and only expands the shortfall. |
| Cooked | The runner resolves the tree against Stock (Base recipe Ingredient first), then deducts as today; Used from can pick the jar. |
| Cooking timeline | The recipe store composes each Recipe's cook Steps (its own plus its Base recipes', inserted where the total time is shortest, ending before the Needed at Step). `cook.Timeline` and `schedule.Compute` are unchanged; Steps carry a label. |
| Import | Recipe File v1 gains optional `baseRecipe`, `yieldUnit` (Recipe) and `recipe`, `neededAtStep` (line). The Recipe Assistant output schema follows by projection (all-required + `pruneNone`); the Agent Prompt gains two rules. Import Review gets a **Base recipe line** tile. |
| Migration | `1540_base_recipes.sql`, additive (`ALTER TABLE ... ADD COLUMN`), no rebuild. |
| Schedule | Fits beta.5 only with one more wave on the tail, or with the cooking timeline part cut to beta.6 (§14.4, question P4). |

---

## 1. What main has (read at `878952b`)

- **Recipe** (`internal/recipe/recipe.go`): `Input{Name, Yield (portions, 0 < y ≤ 100), ReadyMeal, CourseIDs, WholeMeal, Tags, CooldownDays, LeftoverUseByDays, ReheatMinutes, Source, Image, Lines, Steps}`; `Line{IngredientID, Quantity, Unit, Optional, Note}` for one Batch; `Step{Text, Kind, DurationMinutes, LeadTimeMinutes, After, Uses, Image}`. `Validate` checks unit convertibility last (`UnknownUnitError` → the editor's inline Unit Conversion prompt). `TimingOf` runs `schedule.Compute`.
- **Ready Meal** (`readymeal.go`): Feeder keeps an Ingredient with the Recipe's name (matched by `units.NormalizeName`, created with Base Unit piece) so the pack can be stocked and bought. The link is the Recipe's one line, not a column. This is the precedent for the Base recipe Ingredient.
- **Schema** (`0300_recipes.sql`, `1400_courses.sql`): `recipes`, `recipe_lines (recipe_id, position, ingredient_id, quantity, unit, optional, note)`, `recipe_steps`, `recipe_step_uses`, `recipe_courses`, `member_recipe_preferences`, `member_ingredient_exclusions`. Highest migration on main: **1530** (1500, 1510, 1520 are reserved for SD, LO, BO).
- **Units** (`internal/units`): Base Units g, ml, piece; global units; Ingredient-specific Unit Conversions; `ToBase`, `Factor`, `IsConvertible`.
- **Planner input** (`internal/plan/runner/sources.go`, `DBSources.Recipes`): the only place a Recipe's lines become `planner.Need`s (Base Units, per Batch). `Preferences` builds each Member's Favourites, Dislikes, Exclusions and excluded Ingredients. The planner uses `Need`s for Exclusions (`excludes`, optional lines included), Review Exclusions (`explainExclusions`), scoring (non-optional lines) and its projected Stock (`consumeNeeds`, non-optional).
- **Course fit**: the planner only places a Recipe marked with the cell's Course; cells always carry a real Course (crs-c3). Slot Rules by Recipe need the Recipe marked with that Course (`CheckRule`).
- **Shopping List** (`internal/shopping/shopping.go`, pure): `Meal{Needs []Need}`; `derivedLines` draws each need from projected Stock (`draw`) and lists the shortfall. The wiring (`internal/shopping/httpapi/wiring.go`, `plans.Meals`) takes the Needs from `DBSources.Recipes`.
- **Cooked** (`internal/plan/runner/actions.go`, `courses_c2.go`, `snapshot.go needsFor`): `needsFor(planner.Recipe, batches)` → `StockPort.DeductCookedTx` → `stock.Deduct` (soonest go-off first). UF adds Used from (ADR 0011).
- **Cook Mode** (`internal/cook`): `cook.Timeline` places each Course's `schedule.Compute` block; the cook adapter (`cook/service/adapters.go dbRecipes.Steps`) and the notification facts (`notify/facts/facts.go scheduleSteps`) read `rec.Steps`. Timers (`cook_timers (scope, step)`) and Advance Step marks (`advance_step_marks (scope, step)`) are keyed by the Step's index in the Recipe.
- **Recipe File** (`docs/spec/recipe-file-v1.schema.json`, `internal/recipefile`): lines are `quantity {ingredient, quantity, unit, note?, optional?}`; Import Review matches Ingredients, units, Recipe conflicts, Courses.
- **Recipe Assistant** (`internal/recipeassistant`): `OutputSchema` projects the canonical schema and makes every property required; `pruneNone` drops "none" values ("", [], null, 0 for a plain number) where the canonical schema leaves the property optional. The Agent Prompt and the addendum live in `recipe-file.md`; golden files in `internal/recipeassistant/testdata`.
- **Web**: `features/recipes` (editor with `IngredientLineRow` using the shared `IngredientSelect`, `RecipeTile`, `RecipeDetailScreen`, `RecipesScreen` with `?sort=` from team R), `features/import` (tiles per decision: `IngredientMatchTile`, `CourseMatchTile`, `RecipeConflictTile`, `UnitPromptTile`), `features/cook`.
- **Nutrition** is out of v1 (spec §1), so there are no nutrition totals to extend; only total time.

---

## 2. GLOSSARY: proposed changes (not applied; W-BR or H applies them)

```diff
 **Recipe**:
-A dish the Household can plan, made from Ingredients, with a Yield, one or more **Courses** it can fill, an optional **Whole meal** flag and optional timed Steps.
+A dish the Household can plan, made from Ingredients, with a Yield, one or more **Courses** it can fill, an optional **Whole meal** flag and optional timed Steps. A **Base recipe** is a Recipe that is never planned.
 _Avoid_: Dish, meal

 **Yield**:
-The number of standard portions one Batch of a Recipe produces.
+The number of standard portions one Batch of a Recipe produces. A **Base recipe**'s Yield is an amount with a unit instead (1 l, 300 g, 8 portions).
 _Avoid_: Servings, makes
+
+**Base recipe**:
+A Recipe that other Recipes call for on an ingredient line (a béchamel, a pasta frolla, a stock) and that is never planned on its own: it has no Courses, and it is never chosen for a Meal Slot or Pinned. Feeder keeps an Ingredient with its name, so a bought jar or a frozen batch can be stocked, scanned and used first; only what Stock does not cover is made, scaled from its Yield, and only that goes on the Shopping List. A Base recipe may call for other Base recipes, but never, through any of them, for itself.
+_Avoid_: Component, sub-recipe, sub recipe, nested recipe
+
+**Base recipe line**:
+An ingredient line that calls for a Base recipe by amount ("500 ml Béchamel (Base recipe)"). Every Ingredient inside the Base recipe, at any depth, counts for Exclusions and the planner as if it were on the Recipe itself.
+_Avoid_: Recipe reference, linked recipe, sub-recipe line
+
+**Needed at**:
+The Step of a Recipe by which a Base recipe line must be ready: the Base recipe's Steps are placed on the cooking timeline to finish before it. Unless the User picks one, it is the first Step that uses the Base recipe, else the first Step whose text names it, else the first Step.
+_Avoid_: Link step, anchor step, ready-by step
+_Note_: not **Not needed**, which is a Shopping List line.

 **Stock**:
-The quantity of each Ingredient the Household currently has at home.
+The quantity of each Ingredient the Household currently has at home, a Base recipe's Ingredient included (a jar of béchamel, a frozen batch of ragù).
```

Word check: none of the new _Avoid_ words occurs inside a quoted string of any `strings.ts` at `878952b` (`component` occurs only in comments of `ui/CoursePicker/strings.ts` and `features/cook/strings.ts`, which `check-ui.sh` rule 6 skips). Copy must not say "makes" (Yield's _Avoid_ word, inflections "make", "made", "making" included): the editor and tiles say **Yield**, Import Review says "Add it as a new Base recipe", never "Make it".

---

## 3. Domain model

### 3.1 Recipe kind and Yield

- A Recipe is a **Base recipe** iff `recipes.base_ingredient_id` is set. The kind is chosen in the Recipe editor (a **Base recipe** switch) and by import; a Ready Meal can never be one (`422 base_recipe_ready_meal`).
- **Yield** keeps its column. For a plannable Recipe it is portions (unchanged, `yield_unit` NULL). For a Base recipe it is an amount in `yield_unit`, which is one of the global units (`g`, `kg`, `ml`, `l`, `dl`, `cl`, `tsp`, `tbsp`, `cup`), `piece` or `portion`. Validation: `0 < yield ≤ 100000` for a Base recipe (1000 g must fit), unchanged `≤ 100` for a plannable Recipe; `422 yield_unit_invalid` otherwise.
- Fields that do not apply to a Base recipe are stored empty and hidden in the editor: Courses (no `recipe_courses` rows; `courseIds` is `[]` in payloads), Whole meal (false), Ready Meal (false), Cool-down, Use-by, Reheat time and Frozen Use-by (NULL). An API write that sets any of them for a Base recipe is `422 base_recipe_field` naming the field. **Tags** are allowed (they help find it on the Recipes list); they never reach Slot or Variety Rules because a Base recipe is never planned.

### 3.2 The Base recipe Ingredient

The Base recipe owns one Ingredient (`recipes.base_ingredient_id`, unique). It exists so that a jar or a frozen batch is Stock like any Ingredient (comparison of the options in §6).

- **Created** with the Base recipe, in the same transaction: name = the Recipe's name; Base Unit from the Yield unit (g and kg → `g`; the ml family → `ml`; `piece`, `portion` → `piece`); no Shelf Life (the User sets one on the Ingredient, as for any Ingredient). If an Ingredient with that name already exists and is not another Base recipe's, the editor asks before adopting it (question P7); it is never adopted silently.
- **Batch conversion.** The store keeps a Unit Conversion `batch` = Yield in Base Units on it (1 l Yield → `1 batch = 1000 ml`), rewritten whenever the Yield changes, so "1 batch of pasta frolla" is a valid line. A Yield in `portion` also keeps `portion = 1 piece`. The Ingredient page shows both read-only ("Set by the Base recipe").
- **Name follows** the Base recipe: a rename renames the Ingredient in the same transaction (`409 ingredient_name_taken` when another Ingredient has the new name). The Ingredients page shows the name read-only with a recipe badge and a link to the Base recipe; Shelf Life, Frozen Shelf Life, Picture and other Unit Conversions are editable as usual.
- **Base Unit change** (a Yield unit of another family) follows the Ingredient rule: refused while the Ingredient has Stock, Products or lines that would no longer convert (`409 base_unit_in_use`).
- **Guards** in `internal/ingredient/store`: it cannot be deleted while its Base recipe exists (`ErrInUse`); merging it **into** another Ingredient is refused (`409 base_recipe_ingredient`); merging another Ingredient **into** it is allowed (its lines become Base recipe lines; refused with `422 base_recipe_cycle` if that would make a cycle).
- Products may supply it (a jar's barcode), so Scan in Shop mode and Stock-take add Lots of it. Manual Shopping List extras may name it ("buy a jar").

### 3.3 Base recipe line

- A line whose Ingredient is a Base recipe Ingredient. Quantity and unit are converted with the Base recipe Ingredient's units (`units.ToBase`), so `500 ml`, `0.5 l`, `1 batch` and any Unit Conversion the User added work. An unconvertible unit is the usual `UnknownUnitError` and inline Unit Conversion prompt, on the Base recipe Ingredient.
- `optional` and `note` keep their meaning. An optional Base recipe line makes everything inside it optional.
- **Needed at** (`recipe_lines.needed_at_step`, 0-based index into the Recipe's own Steps, NULL = default). The default, computed at read time by `baserecipe.NeededAt`:
  1. the first non-Advance Step whose `uses` names the Base recipe Ingredient;
  2. else the first non-Advance Step whose text contains the Base recipe's name (`units.NormalizeName`, whole words, accents folded; also the Ingredient's name when it differs, which it never does once created);
  3. else 0, the first Step ("ready before you start").
  A stored value that no longer points at a non-Advance Step (Steps were deleted or reordered) falls back to the default and the editor shows it. Lines that are not Base recipe lines store NULL (`422 needed_at_step_invalid` otherwise).
- A Recipe with no Steps (a Ready Meal, a bare list) has no Needed at: its Base recipes are listed on their own in Cook Mode, before Serve.

### 3.4 Nesting and cycles

- A Base recipe may have Base recipe lines (lasagne → béchamel → roux). No depth limit.
- **Cycle check on every save** (create, update, kind change, import commit, Ingredient merge): the store loads the "calls for" graph (`recipe_lines` joined to `recipes.base_ingredient_id`, archived Recipes included), replaces the saved Recipe's edges with the new ones and runs `baserecipe.FindCycle`. A cycle is `422 base_recipe_cycle` with `path` (names) and the line's `field`: "Béchamel calls for Roux, which calls for Béchamel." A line calling for its own Recipe is the one-step cycle: "Béchamel cannot call for itself."
- Expansion also carries a visited set and returns `ErrCycle` instead of recursing for ever, so data written before a check (none exist, but a restore could) degrades to "the line counts as its Ingredient" plus a logged warning, never a hang.

### 3.5 Archive and delete

Follows the Archived pattern:

- **Delete** of a Base recipe that any Recipe (archived ones included) calls for is `409 base_recipe_in_use` with `usedBy: [{id, name}]`; the dialog says "Béchamel is used in Lasagne and Moussaka" and offers **Archive** instead. A Base recipe nobody calls for is deleted with its Ingredient when that Ingredient has no Stock, Products or other references; otherwise the Ingredient stays as an ordinary one.
- **Archive** hides the Base recipe from the Recipes list and the ingredient picker; Recipes that already call for it keep expanding it (shopping, Cooked, Cook Mode), and their detail shows "Béchamel (Base recipe, archived)". Unarchive brings it back.

### 3.6 Changing the kind

- **Plannable → Base** (the editor switch on a saved Recipe, or an Import Review answer, D9): `POST /api/recipes/{id}/to-base?dryRun=1` lists what goes, then `POST /api/recipes/{id}/to-base {yield, yieldUnit}` applies it in one transaction, like a Recipe losing all its Courses (spec §4, "A Recipe that loses a Course"), but stricter because a Base recipe can never be planned:
  - unresolved Planned Meals of it from today on are removed and their cells replanned, **Pinned and Bought ones included** (they are listed in the confirm, with what was bought);
  - Cooked and Not cooked Planned Meals stay as history; Last cooked keeps them;
  - Slot Rules by that Recipe are removed (listed);
  - its Leftovers stay as rows, are never planned again (no Course fit), and are answered on Today at their Use-by (ADR 0012);
  - Favourites and Dislikes on it are removed (question P2); Exclusions of it move to its Ingredient (§8);
  - its Yield becomes an amount: the confirm asks for it ("Yield: 4 portions" is prefilled from the old Yield with unit `portion`).
  Confirm copy: "Turn Pesto into a Base recipe? It will no longer be planned. 2 Planned Meals from today come off the plan (Tue Dinner, Pinned; Thu Lunch). The Slot Rule Friday Dinner · Main = Pesto is removed." Actions **Turn into a Base recipe** and **Cancel**.
- **Base → plannable**: `POST /api/recipes/{id}/to-plannable {yield, courseIds}`; `409 base_recipe_in_use` (with `usedBy`) while any Recipe calls for it. Its Ingredient stays as an ordinary Ingredient with its Stock.

---

## 4. Expansion: the pure package `internal/recipe/baserecipe`

New package, standard library plus `internal/units` and `internal/recipe/schedule` only (no SQL, HTTP, clock). Unit-tested on its own. Every consumer gets the data through a small `Catalog` the store implements.

```go
// Catalog is what expansion reads. The recipe store implements it over one read transaction.
type Catalog interface {
    Recipe(id int64) (Recipe, bool)           // lines and Steps of one Batch
    BaseOf(ingredientID int64) (int64, bool)  // the Base recipe whose Ingredient this is
    Units(ingredientID int64) (units.Ingredient, bool)
}

type Recipe struct {
    ID          int64
    Name        string
    Base        *Yield // nil for a plannable Recipe
    Lines       []Line
    Steps       []Step // recipe.Step's scheduling fields, text, uses
}
type Yield struct { IngredientID int64; Quantity float64; Unit string }
type Line  struct { IngredientID int64; Quantity float64; Unit string; Optional bool; NeededAtStep *int }

// Need is one node of a Recipe's need tree, for ONE Batch of the root Recipe, in Base Units.
type Need struct {
    IngredientID int64
    Quantity     float64
    Optional     bool
    BaseRecipeID int64  // set when IngredientID is a Base recipe's Ingredient
    Made         []Need // what making the whole Quantity needs; nil for a plain Ingredient or an empty Base recipe
}
```

### 4.1 `Expand(cat, recipeID) ([]Need, error)`

For each line of the Recipe:

1. `q = units.ToBase(line.Quantity, line.Unit, Units(line.IngredientID))`. An unconvertible line is skipped with a warning, as `DBSources.Recipes` does today.
2. If the Ingredient is a Base recipe Ingredient (`BaseOf`), the **factor** is `q / ToBase(base.Yield.Quantity, base.Yield.Unit, Units(base.IngredientID))` (500 ml of a 1 l béchamel → 0.5). `Made` is the Base recipe's own expansion with every Quantity multiplied by the factor, recursively (roux inside béchamel inside lasagne gets the product of the factors). A Base recipe with no lines has `Made == nil` (§4.6).
3. `Optional` is the line's flag OR the parent's.
4. Recursion keeps the path; a Base recipe already on the path is `ErrCycle{Path []string}`.

The root Recipe's Batches multiply on top in every consumer (D3): a 2-Batch lasagne needs `2 × 500 ml` of béchamel.

### 4.2 `Flatten(tree) []Need` (planner and Exclusions)

The leaves, depth first, without Stock: every plain Ingredient at its full Quantity, plus every Base recipe Ingredient as an **optional line with Quantity 0**. The planner's `excludes` and `explainExclusions` read optional lines, so an Exclusion of milk (inside béchamel) or of Béchamel itself rules the lasagne out; `consumeNeeds` and scoring skip optional lines, so the zero line costs nothing. An empty Base recipe's Ingredient stays a real (non-optional) line at its Quantity.

### 4.3 `Resolve(tree, batches, have func(ingredientID) float64, take func(ingredientID, q))` (Cooked)

Stock first, depth first, with one availability map shared across the whole deduction (several Courses of a Mark all Cooked, several lines calling for the same Base recipe): for a Base recipe node needing `q × batches`, take `min(have, need)` of its Ingredient, then resolve its `Made` scaled by `(need − taken) / need`. Returns flat `[]Need` with the Base recipe Ingredient for the part Stock covered and plain Ingredients for the part made. Pure; the availability numbers come from the caller.

### 4.4 `ComposeSteps(cat, recipeID, made func(path) float64) (Composed, error)` (cooking timeline)

Builds the Steps Cook Mode walks for one Batch-independent Recipe, Base recipes included (D4):

1. Compose each Base recipe first (bottom up), so a nested Base recipe is already inside its parent's Steps.
2. For each Base recipe line, in line order, its composed Steps form one **block**. The block is inserted into the Recipe's Step list at position `p ∈ [0, k]`, where `k` is the line's Needed at Step; the Needed at Step gains an `After` on every Step of the block that no other Step of the block waits for (its sinks), so it cannot start before the Base recipe is ready. `After` indexes inside the block and of the following Steps are renumbered.
3. `p` is chosen by running `schedule.Compute` for every candidate and taking the **shortest total time; ties go to the latest position** ("ready just before the Step that uses it"). The cook rule of `schedule.Compute` (an Active Step holds the cook, a Passive Step frees it) is what makes a Base recipe's Active Steps fill the cook's free time during the Recipe's own Passive Steps.
4. Advance Steps of a Base recipe stay Advance Steps of the Recipe (soak the beans overnight), labelled.
5. Each composed Step carries its origin: `BaseRecipeID`, `BaseRecipeName` and the path for a nested one ("Béchamel · Roux").
6. **Stock first** (D5): `made(path)` is the fraction of that Base recipe line still to make (1 with no Stock, 0 when Stock covers it). The Steps stay in the list (so indexes do not move with Stock), but a fully covered block's Steps become zero-length Active Steps and are hidden in Cook Mode; the Needed at Step then shows "Use 500 ml Béchamel from the Pantry". A partly covered block keeps its durations, with its `uses` scaled by the fraction.
7. Step `uses` of a Base recipe Step are multiplied by the line factor (as its Ingredients, §4.1); Cook Mode then multiplies by the Batches as today (`schedule.ScaleUses`). **Durations are not scaled** (as for Batches today); question P1.

`schedule.Compute`, `schedule.Validate` and `cook.Timeline` are unchanged: the composed list is a valid Step list (every `After` points at an earlier Step).

**Indexes.** A composed Step's index is its position in the composed list; timers (`cook_timers.step`), Advance Step marks and Advance Step reminder keys use it. It only moves when a Recipe in the tree is edited (Stock never moves it, point 6). Editing a Recipe mid-cook already moves indexes today; the same holds, and the CHANGELOG need not mention it.

**Total time** on Recipe tiles and detail is the composed `TotalMinutes` with no Stock (everything made), so the tile says how long it takes from scratch. The recipe store caches it in `recipes.total_minutes` as now and **also rewrites the cache of every Recipe that calls for an edited Base recipe** (transitively), in the same transaction.

### 4.5 `NeededAt`, `FindCycle`, `MatchReference`

- `NeededAt(recipe, lineIndex, baseName) int`: the default of §3.3.
- `FindCycle(edges map[int64][]int64, names) []string`: a path or nil.
- `MatchReference(name, cue string, candidates []Candidate) []Suggestion` for import (§11.3): candidates are existing Base recipes, existing plannable Recipes and Recipes of the same file; the match key is `units.NormalizeName` with accents folded and a trailing plural "s" dropped; exact key first, then the fuzzy score of `internal/ingredient/search.go` (reused through a small exported function, no copy). A cue naming "previous recipe" / "above" / "next recipe" picks the neighbouring Recipe of the same file. Pure.

### 4.6 An empty Base recipe

A Base recipe may have no lines (D9's "create an empty Base recipe to fill later"; `lines_required` does not apply to a Base recipe). While empty, its line counts as its own Ingredient everywhere: the Shopping List asks for "Béchamel 500 ml", Cooked deducts the jar, Cook Mode shows no Steps for it. Its tile and detail say "No Ingredients yet", and the using Recipe's line shows the same. So an empty Base recipe is never wrong, only less helpful.

---

## 5. Planner and Exclusions (D2, D8)

- **Never planned (D2).** A Base recipe has no Courses, so Course fit excludes it from every cell, Swap, Leftover first and the Slot Rule checks (`CheckRule`'s `ErrRecipeNotInCourse`). The SPA never offers it (the pickers filter by Course already). The choose-a-Recipe route already checks Course fit; a BDD scenario pins `422` for a Base recipe so a later change cannot let one through. No change to `internal/planner`.
- **Needs.** `DBSources.Recipes` (in `internal/plan/runner/sources.go`) takes each Recipe's tree from the recipe store (`Store.NeedTree`) and gives the planner `baserecipe.Flatten(tree)`. Base recipes themselves are not passed to the planner (they could never be a candidate).
- **Exclusions all the way down (D8).** An Exclusion of any Ingredient inside, at any depth, rules the Recipe out, through the flattened lines. An Exclusion of the Base recipe itself is stored as the Member's **Ingredient Exclusion of the Base recipe Ingredient** (one fact, one place; §8), which the zero line carries. Review Exclusions then names "Sam: Béchamel" or "Sam: milk" with the Recipes it ruled out, using the existing `explainExclusions` records. Leftover first checks the same lines.
- **Advance Steps.** `DBSources.Recipes` reads `rec.Timing.Advance`, which is now composed, so a Base recipe's Advance Step counts for the lead-time hard filter.
- **Stock in scoring (known limitation).** The planner's projected Stock and its Ingredient Overlap / perishable-use scores see the Base recipe as made from scratch: a jar in the Pantry does not make a lasagne more likely. The Shopping List and Cooked, which the User sees, are Stock first. Teaching the planner the tree (a `Made` on `planner.Need`) is left for later; it is not needed for any user decision.

---

## 6. Stock of a Base recipe: options

| Option | What | For | Against |
|---|---|---|---|
| **A. Base recipe Ingredient** (recommended) | The Base recipe owns an Ingredient; a Base recipe line is a line of that Ingredient; Stock is ordinary Stock Lots of it | Stock Lots, Products and barcodes, Scan and Stock-take, Shelf Life and Frozen Shelf Life, Storage Places, Used from, waste and the Zero-waste streak, Ingredient Exclusions, the ingredient picker and Unit Conversions all work unchanged. No new line table, no change to `recipe_lines`' meaning. Same idea as the Ready Meal's Ingredient, which users already know | The Ingredient must follow the Recipe (name, Base Unit, `batch` conversion) and be guarded against delete and merge; the Ingredients page lists it (with a badge) |
| B. A Stock Lot kind | `stock_lots.recipe_id` beside `ingredient_id` | Stock is visibly "of a Recipe" | Every Stock path (Project, Deduct, Used from, Pantry, Scan, Products, waste, go-off, Shopping List draw, ST's Lot edit) gains a second kind, in the files ST, UF and LOW own in beta.5. No barcode for a jar without inventing a Product kind too |
| C. Base recipe surplus as a Leftover | Portions in `leftovers` | Reuses freezing (ADR 0012) | A Leftover is portions of a plannable Recipe that the planner serves; a Base recipe is an amount, never served. ADR 0012 already rejected "Leftover becomes Stock" for this reason. A bought jar is not a Leftover |

**Recommendation: A.** Recorded in ADR 0015.

---

## 7. Shopping List with Stock first (D5)

- `shopping.Need` gains `Made []Need` (pure, `internal/shopping/shopping.go`). `derivedLines` treats a node with `Made != nil`: it draws the Base recipe Ingredient from projected Stock (`draw`, the same date rule), and only the shortfall `s` is expanded: each child is drawn and summed with `q_child × s / q`, recursively. The Base recipe Ingredient itself is never a Line then. A node with `Made == nil` (a plain Ingredient, or an empty Base recipe) is drawn and listed as today.
- Past-meal hints (`PastPlannedMeals`) pass down to the child lines a past meal adds to.
- Ticks, Not needed and BO's Bought attribution (`shopping.Attribute`, which derives the list twice) work on the resulting Lines unchanged.
- The wiring (`internal/shopping/httpapi/wiring.go`, `plans.Meals`) builds the tree from `Store.NeedTree` instead of `DBSources.Recipes`' flat needs.
- Example: lasagne (1 Batch) calls for 500 ml béchamel (Yield 1 l: 1 l milk, 60 g butter, 60 g flour); the Pantry has a 300 ml jar. The list draws 300 ml from the jar and asks for the ingredients of 200 ml: 200 ml milk, 12 g butter, 12 g flour (less what Stock has of those).

---

## 8. Mark as Cooked (D5) and preferences

- **Cooked.** The runner's `needsFor` takes the tree (kept per Recipe beside the planner's Recipes in the snapshot) and calls `baserecipe.Resolve` with the Stock totals inside the transaction (`StockPort.Lots`), then `DeductCookedTx` as today. So the jar is used first and only the made part's Ingredients are deducted. **Used from** (ADR 0011) lists the Base recipe Ingredient as a line when Stock covers some of it, so the User can pick which jar or frozen batch; a pick covering more than the default moves the rest of the made part accordingly (the resolve runs on the picked amount).
- The Mark as Cooked sheet needs no new UI: Used from rows name the Base recipe Ingredient ("Béchamel"); short-Stock warnings name raw Ingredients.
- **A made surplus** does not arise: the made amount is scaled to the need (D3). Making more on purpose (a batch for the freezer) is question P5; until then the User adds a Lot of the Base recipe Ingredient on the Pantry page (it is an Ingredient), with its Storage Place.
- **Preferences on a Base recipe** (question P2, recommended A): its detail shows the Preferences Tile with the **Exclusion** column only. Setting it writes `member_ingredient_exclusions` for the Base recipe Ingredient (so it is one fact, seen by the planner and Review Exclusions). Favourite and Dislike are not offered: a Base recipe is never planned, and liking béchamel says nothing about lasagne.
- **"via" on a using Recipe** (spec §4, *An Exclusion via an Ingredient*): the Preferences Tile and the line Avatars look down. The detail payload gains `within` (every Ingredient inside, with the Base recipe path), so the cell reads "via milk (in Béchamel)" or "via Béchamel".

---

## 9. Cooking timeline and Cook Mode (D4)

- **Where the composition lives.** The recipe store's `Get` fills a new `Recipe.Cook` (the composed Steps with their origin, §4.4, with no Stock) and computes `Timing` from it. Readers of the cooking timeline switch from `rec.Steps` to `rec.Cook`: the cook adapter `dbRecipes.Steps` (`internal/cook/service/adapters.go`) and the notification facts `scheduleSteps` (`internal/notify/facts/facts.go`), so Start cooking fires early enough and Advance Step reminders include a Base recipe's.
- **Stock at cook time.** `dbRecipes.Steps` takes the Planned Meal's Batches and reads Stock totals of the Base recipe Ingredients (a read through the cook adapter's DB), so a block covered by a jar is hidden (§4.4 point 6). A Recipe opened on its own (no Planned Meal) assumes everything is made.
- **Labels.** `cook.Step`, `cook.CookStep` and `service.TimelineItem` gain `baseRecipe: { id, name, path } | null`. Cook Mode shows a neutral chip with the Base recipe's name on each such Step ("Béchamel", "Béchamel · Roux"), and the Needed at Step's text gains "Béchamel ready" when the block ends before it. Timers on a Base recipe's Passive Step are labelled "Béchamel: simmer". The Next gate, Advance Step marks and the single-Course view are unchanged (they work on indexes).
- **Multi-Course slots.** Each Course's composed Steps are its block for `cook.Timeline`, unchanged: one Course's Base recipe never leaves its Course's block.

---

## 10. API

New spec section **§19 API for Base recipes** (§18 is beta.5's). Errors use the existing `validation_failed` / conflict shapes.

**Recipes** (`internal/recipe/httpapi`):

- Recipe in: `baseRecipe: boolean` (create: absent = false; update: absent keeps), `yieldUnit: string | null` (required for a Base recipe, null otherwise). Line in: either `ingredientId` (a Base recipe Ingredient is accepted) or `baseRecipeId` (the server maps it to its Ingredient); `neededAtStep: number | null`.
- Recipe out: `baseRecipe`, `yieldUnit`, `usedBy: [{ id, name, archived }]` (Base recipes only; `[]` otherwise), `within: [{ ingredientId, name, path: [baseRecipeName] }]`, `timing` composed. Line out: `baseRecipe: { id, name, archived, empty } | null`, `neededAtStep` (stored), `neededAt` (effective, a Step index).
- `GET /api/recipes?kind=plannable|base|all` (default `plannable`, D: hidden by default). Summary gains `baseRecipe`, `yieldUnit`, `usedByCount`. `?sort=last_cooked_*` with `kind=base` sorts by name (no Last cooked); with `kind=all` Base recipes count as "not cooked yet".
- `DELETE /api/recipes/{id}`: `409 base_recipe_in_use { usedBy }`.
- `POST /api/recipes/{id}/to-base?dryRun=1` → `{ plannedMeals: [{ date, mealSlotName, courseName, pinned, bought }], slotRules: [...], leftovers: n, preferences: n }`; without `dryRun`, body `{ yield, yieldUnit }`, applies (§3.6). `POST /api/recipes/{id}/to-plannable { yield, courseIds }` → `409 base_recipe_in_use`.
- New validation reasons: `base_recipe_cycle` (`path`), `base_recipe_ready_meal`, `base_recipe_field`, `yield_unit_invalid`, `needed_at_step_invalid`, `base_unit_in_use`.
- Events: a Base recipe save publishes `recipes` as any Recipe save (replan; the Shopping List refreshes); a rename also publishes `ingredients`.

**Ingredients** (`internal/ingredient/httpapi`): list and detail gain `baseRecipe: { id, name, archived } | null` (through a small `BaseRecipes` port wired at mount, in the ADR 0010 `TagExists` pattern, so the Ingredient store does not read Recipe tables). Rename of a Base recipe Ingredient: `409 base_recipe_ingredient` ("Rename the Base recipe instead"); delete: `409 in_use`; merge away: `409 base_recipe_ingredient`.

**Cook**: `TimelineItem`, cook view Steps gain `baseRecipe`. **Plan, Shopping, Stock**: no payload change.

**Recipe File and Recipe Assistant**: §11.

---

## 11. Import, the Recipe File and the Recipe Assistant (D9)

### 11.1 Recipe File v1, optional and backwards compatible

| Where | Field | Meaning |
|---|---|---|
| Recipe | `baseRecipe` | Optional boolean or null. `true` for a Base recipe. Then `yield` is the amount one Batch produces in `yieldUnit`, and `courses`, `wholeMeal`, `readyMeal`, `cooldownDays`, `leftoverUseByDays`, `reheatMinutes` must be absent or none. Export writes it for Base recipes only. |
| Recipe | `yieldUnit` | Optional unit or null; required when `baseRecipe` is true (`g`, `kg`, the ml family, `piece`, `portion`). |
| Line (`quantity`) | `recipe` | Optional `{ "name": string, "cue": string? }` or null: this line calls for another recipe. `name` is that recipe's name; `cue` is the words in the source that point at it ("see page 42", "from the previous recipe"). The line's `ingredient`, `quantity` and `unit` stay a valid plain line, so a file means something even where the reference is not taken. |
| Line | `neededAtStep` | Optional integer (0-based Step index) or null: the Step by which it must be ready. |

The checks that the schema cannot express (the projection drops `if`/`then`) live in `internal/recipefile/check.go`: `baseRecipe` true needs `yieldUnit`; a Base recipe with `courses` is a path error.

**Export** (`internal/recipefile/export.go`): exporting a Recipe adds every Base recipe it calls for, transitively, to `recipes` (the Export picker says "Also exports Béchamel (Base recipe)"), with the Base recipe Ingredient's definition (Base Unit, Unit Conversions without `batch`, Shelf Life, picture) in `ingredients`; each Base recipe line is written as `{ "ingredient": "Béchamel", "quantity": 500, "unit": "ml", "recipe": { "name": "Béchamel" }, "neededAtStep": 3 }`. Round trip: a Feeder export imports with every tile preselected (§11.3).

### 11.2 Recipe Assistant

- **Output schema** (`OutputSchema`): no code change. The new properties come through the projection: `recipe` becomes required with `anyOf [{$ref recipeRef}, {type: null}]`, `cue` required inside it, `baseRecipe` required `anyOf [boolean, null]`, `yieldUnit` required `anyOf [unit, null]`, `neededAtStep` required `anyOf [integer, null]`. The model writes `null` / `""` for none; `pruneNone` drops them where the canonical schema leaves them optional (it already treats `null` and blank text as none; `false` stays, which means "plannable"). Golden: `testdata/output-schema.golden.json`.
- **Agent Prompt** gains two rules (the addendum is unchanged):

  > 15. Base recipes: a recipe that is only there to be used inside other recipes (a sauce, a dough, a stock, a spice mix) and is not served as a dish of its own gets "baseRecipe": true, "yield" = the amount one batch produces and "yieldUnit" (g, kg, ml, l, piece or portion); leave "courses", "wholeMeal", "cooldownDays", "leftoverUseByDays" and "reheatMinutes" out. Every other recipe gets "baseRecipe": false.
  >
  > 16. A line that calls for another recipe ("500 ml béchamel (see page 42)", "1 quantity of pasta frolla", "the sauce from the previous recipe") stays an ordinary ingredient line with a sensible name, amount and unit ("1 quantity" is quantity 1, unit "batch", with a conversion), and adds "recipe": { "name": the other recipe's name, "cue": the words that point at it }. When the other recipe is in the same source, use its exact name. Set "neededAtStep" to the step that adds it when that is clear. Otherwise "recipe" is null. Never invent a recipe that the source does not point at.

  Golden: `testdata/agent-prompt-template.golden.txt`.
- **Photos**: no change to the photo read; a cookbook's "see page 42" arrives as a cue. Import Review then offers to read that page (§11.3).
- **Detection beyond the model.** The model's mark is a hint. Import Review also runs `baserecipe.MatchReference` on **every** line's Ingredient name against existing Base recipes, existing plannable Recipes and the file's Recipes, so "béchamel" is asked about even when the model left `recipe` null, and "pesto" is asked about when a plannable Recipe "Pesto" exists. A line matching only an Ingredient (not a Recipe) is not asked about.
- **fake-anthropic**: a canned response with two recipes (Lasagne, plannable, with a line `500 ml béchamel`, `recipe: { name: "Béchamel", cue: "" }`; Béchamel, `baseRecipe: true`, `yield: 1`, `yieldUnit: "l"`) and one with a page cue (`recipe: { name: "pasta frolla", cue: "see page 42" }`, no recipe in the file).

### 11.3 Import Review: the Base recipe line tile

One tile per line that is marked or matched (`BaseRecipeLineTile`, `features/import`), after Ingredient matching and before Recipe conflicts. It shows the line as read ("500 ml béchamel · see page 42") and asks **"Is this another recipe?"** with these answers (a crafted radio group, no native control):

1. **Use Base recipe Béchamel**: an existing Base recipe; preselected only on an exact name match; **Choose another** opens the shared crafted select of Base recipes (search, recipe badge).
2. **Use Béchamel from this import**: a Recipe of the same file (offered when one matches); it is imported as a Base recipe. If the file did not mark it as one, the tile asks its Yield (amount and unit; prefilled from `yield` with unit `portion`).
3. **Add it as a new Base recipe**: creates a Base recipe with no Ingredients (§4.6) named from the line, Yield = the line's amount and unit (a unit outside the g, ml and piece families, such as "1 quantity", gives Yield 1 `portion`, and the line becomes `1 batch`). Two variants: **Fill in later**, and **Read it next** (same creation; after Confirm the screen offers "Read Béchamel now", which opens the Read step; that read's Import Review proposes *replace* of the empty Béchamel, which keeps its id, its Ingredient and every line that calls for it).
4. **A Recipe you plan** (offered when a plannable Recipe matches, or chosen through **Choose another**, which lists plannable Recipes in a second group): picking one opens the ConfirmDialog of §3.6 (with the dry run's list and the Yield field). **Turn into a Base recipe** takes the answer; **Cancel** goes back to the tile with nothing chosen. The kind change runs in the import's commit transaction.
5. **Keep it as an Ingredient**: the line stays the plain Ingredient line it was read as (then matched in the Ingredient tiles).

**Nothing is linked silently (D9).** Confirm is disabled while any tile has no answer (the existing pattern for unresolved rows). A preselected answer is shown like any other and counts as answered only because the User confirms the whole review (question P3). The line's unit is then checked against the target's Base recipe Ingredient, so a unit prompt can follow on that Ingredient. Cycle check runs at Confirm (`422 base_recipe_cycle` on the tile).

Server: `internal/recipefile/review.go` gains rows for these lines; `plan()` returns `baseRecipeLines: [{ path, name, cue, quantity, unit, suggestions: [{ kind: "base" | "plannable" | "file", recipeId?, recipeIndex?, name, exact }], answer? }]`; decisions take `baseRecipeLines: { "<path>": { "action": "use" | "file" | "create" | "convert" | "keep", "recipeId"?, "recipeIndex"?, "yield"?, "yieldUnit"?, "readNext"? } }`; `commit()` creates Base recipes and their Ingredients before the Recipes that call for them, in its one transaction.

---

## 12. Migration `1540_base_recipes.sql`

Next free number after 1530 (1500, 1510 and 1520 are reserved by SD, LO and BO). Additive; no table rebuild, no foreign-key pragma; covered by the `feeder-pre-1500.db` snapshot that SNAP takes before the first beta.5 migration.

```sql
-- Base recipes (ADR 0015). A Recipe is a Base recipe iff base_ingredient_id is set.
ALTER TABLE recipes ADD COLUMN base_ingredient_id INTEGER REFERENCES ingredients(id); -- its Ingredient, NULL = plannable
ALTER TABLE recipes ADD COLUMN yield_unit TEXT;  -- Base recipe only: units.NormalizeUnit of the Yield's unit; NULL = portions
CREATE UNIQUE INDEX recipes_base_ingredient ON recipes (base_ingredient_id) WHERE base_ingredient_id IS NOT NULL;
-- Base recipe line only: 0-based index of the Recipe's own Step by which it must be ready; NULL = the default rule.
ALTER TABLE recipe_lines ADD COLUMN needed_at_step INTEGER CHECK (needed_at_step IS NULL OR needed_at_step >= 0);
```

The kind rules that span columns (Yield unit iff Base recipe; no Courses; not a Ready Meal) are checked in Go (`recipe.Input.Validate` and the store), not in SQL, because `ADD COLUMN` cannot add a table constraint. A migration test (`internal/db/base_recipes_migration_test.go`) checks existing Recipes stay plannable and the index refuses a second Recipe on one Ingredient.

---

## 13. Web

All copy in `strings.ts`, GLOSSARY terms, no _Avoid_ word ("makes" included). Shared primitives only; no native control.

- **Recipe editor** (`features/recipes`): a **Base recipe** switch at the top of the details (helper: "Used inside other Recipes and never planned"). On: Courses, Whole meal, Ready Meal, Cool-down, Use-by, Reheat time and Frozen Use-by are hidden; **Yield** becomes amount plus the shared `UnitSelect` (g, kg, ml, l, …, piece, portion). Turning it on for a saved, plannable Recipe runs the §3.6 dry run and its ConfirmDialog before save. Pure lib `lib/baseRecipe.ts` (which fields apply, the draft's kind switch, the line label); hook `useBaseRecipeChange`.
- **Ingredient picker**: the shared `IngredientSelect` gains an optional badge per option (Phosphor `cooking-pot`, label "Base recipe") from `IngredientRef.baseRecipe`; archived Base recipes and the Recipe being edited are left out. Picking one keeps the line's quantity and offers the Base recipe Ingredient's units. A Base recipe line row shows a **Needed at** chip-menu ("Needed at Step 4" / "Before you start"), listing the Recipe's non-Advance Steps; the default is marked "(default)".
- **Recipe detail**: a Base recipe line reads "500 ml Béchamel (Base recipe)", the name a link to `/recipes/<id>`; "No Ingredients yet" for an empty one. A Base recipe's detail shows **Yield** ("Yield 1 l"), **Used in** (links), its Ingredient's Stock ("In the Pantry: 300 ml", a link to the Ingredient's Lots) and the Exclusion-only Preferences Tile (§8). Total time includes Base recipes; the facts line says "includes Béchamel".
- **Recipes list**: a crafted segmented control **Recipes · Base recipes** beside the filters, kept in the URL as `?kind=base` like the other filters; default Recipes (D: hidden by default). The sort select (team R) is hidden on Base recipes; their tiles show the Yield and "Used in 3 Recipes" / "Not used yet" where plannable tiles show Last cooked. Course and Tag filters keep working (Course filter is hidden on Base recipes).
- **Ingredients page** (`features/ingredients`): the Base recipe badge and link; the name and the `batch` / `portion` conversions read-only.
- **Import** (`features/import`): `BaseRecipeLineTile`, pure `lib/baseRecipeLines.ts` (rows, answers, "Confirm needs an answer"), hook `useBaseRecipeLines`; the convert ConfirmDialog; "Read Béchamel now" after Confirm; the Export picker's "Also exports".
- **Cook Mode** (`features/cook`): the Base recipe chip on Steps and timeline items, "Béchamel ready", hidden covered Steps; pure `lib/baseSteps.ts`.
- **Pantry, Shop, Plan**: no new UI (the Base recipe Ingredient is an Ingredient; Lines are raw Ingredients; Used from names it).

---

## 14. Team split, dependencies and schedule

### 14.1 Work packages

Each WP runs the usual pipeline (designer/test author, developer, reviewer) in its own worktree. Files are owned exactly as listed; nothing here overlaps a beta.5 WP while that WP owns the file (see 14.2).

| WP | Scope | Owns | Depends on |
|---|---|---|---|
| **BR-A Domain** | The pure package (§4): Expand, Flatten, Resolve, ComposeSteps, NeededAt, FindCycle, MatchReference; the exported fuzzy score in `ingredient/search.go` | `internal/recipe/baserecipe/**` (new), `internal/ingredient/search.go` (one exported function) | none. **Can start now** |
| **BR-B Recipe backend** | Migration 1540 and its test; kind, Yield unit and Needed at validation (`recipe.go`); the Base recipe Ingredient lifecycle; the store's `NeedTree`, `Cook` composition, total-time cache rewrite, cycle check, to-base / to-plannable; the API (§10) | `internal/db/migrations/1540_*`, `internal/db/base_recipes_migration_test.go`, `internal/recipe/{recipe.go,readymeal.go,base.go}`, `internal/recipe/store/**`, `internal/recipe/httpapi/**`, `internal/ingredient/{store,httpapi}/**`, `internal/modules/{recipes,ingredients}.go` | BR-A merged. **Before LO** (LO owns `internal/recipe/**` and `modules/recipes.go` from wave 4) |
| **BR-C Recipe File and Recipe Assistant** | Schema, `recipe-file.md` (fields, rules 15 and 16), example, `check.go`, export, Import Review rows, decisions and commit; golden files; fake-anthropic fixture | `docs/spec/{recipe-file-v1.schema.json,recipe-file.md,examples/**,fixtures/**,spec_test.go}`, `internal/recipefile/**`, `internal/recipeassistant/{testdata/**,fakeanthropic/**}` and tests | BR-A; the commit half after BR-B. Nobody else owns these in beta.5 |
| **BR-D Web recipes** | Editor switch and Yield, picker badge, Needed at, detail, list kind filter, Ingredients page badge | `web/src/features/recipes/**`, `web/src/features/ingredients/**`, `web/src/ui/Select/IngredientSelect*` (not `ui/index.ts`; the export exists) | BR-B (API; can start on fixtures after BR-B's tests are red). **Before LOW** (LOW owns the editor in wave 5) |
| **BR-E Web import** | Base recipe line tile, convert dialog, Read it next, Export picker | `web/src/features/import/**` | BR-C |
| **BR-F Planning and shopping wiring** | `DBSources.Recipes` flatten + Exclusions (§5), the Base recipe Exclusion mapping; `shopping.Need.Made`, `derivedLines` Stock first, `plans.Meals` tree | `internal/plan/runner/sources.go`, new `internal/plan/runner/basetree.go`, `internal/shopping/shopping.go`, `internal/shopping/httpapi/wiring.go` | BR-B; **after LO** (runner) and **after BO** (shopping) |
| **BR-G Cooked and Cook Mode backend** | `needsFor` with `Resolve` (Stock first, Used from), composed Steps in the cook adapter, labels in the cook payloads, notify facts on composed Steps | `internal/plan/runner/{snapshot.go,courses_c2.go,actions.go,stockport.go}`, `internal/cook/**`, `internal/notify/facts/facts.go` | BR-B; **after UF-runner** (owns stockport, actions, `internal/cook/**`) and SD (notify) |
| **BR-H Web Cook Mode** | Base recipe chips, "ready", hidden covered Steps | `web/src/features/cook/**` | BR-G API (can build on a fixture once BR-G's tests are red); after F1 (owns `features/cook` captions) |
| **W-BR Docs** | GLOSSARY (§2), spec §4, §6, §7.2, §8, §9, §11, §13, decision 46, §19; ADR 0015 to Accepted | `GLOSSARY.md`, `docs/spec/functional-spec.md`, `docs/adr/0015-*` | the answers to §15; GLOSSARY before any `strings.ts` with the new terms is checked (rule 6 has no problem with new terms, only with avoid words, so it does not block BR-D) |

### 14.2 Fit with the beta.5 waves (reconcile §12.1, as on main today: R and SH merged; SD, ST, G, SNAP, D in flight)

| Wave | beta.5 (unchanged) | Base recipes beside it |
|---|---|---|
| 0 | W0, SNAP, D, NAV, MS, R, SH | **BR-A** (new package only) |
| 1 | G, ST | **BR-B** (recipe/ingredient files: no beta.5 owner until LO), **BR-C** (schema, prompt, assistant; review on stubs) |
| 2 | SD, UF-stock | BR-B continues; **BR-D** (recipes web: no owner until LOW); BR-C commit half |
| 3 | F1, BO | **BR-E** (import web) |
| 4 | BOW, LO | LO rebases on BR-B (it adds a Recipe field next to the new ones; conflicts are in the same files but different lines) |
| 5 | UF-runner, LOW | **BR-F** (sources.go and a new runner file: disjoint from UF-runner's stockport/actions; shopping after BO). LOW rebases on BR-D |
| 6 | UF-web | **BR-G** (after UF-runner) |
| 7 | H, QA | **BR-H** (after BR-G), then H, QA |

Shared hot spots and the order they force, added to reconcile §12's: recipes backend BR-B, then LO; recipes web BR-D, then LOW; runner LO, then BR-F (sources) beside UF-runner, then BR-G (stockport, actions); cook and notify SD, then UF-runner, then BR-G; shopping SH, BO, then BR-F; cook web F1, then BR-H.

What can run in parallel now: BR-A at once; BR-B and BR-C as soon as BR-A's API is fixed (its tests); BR-D and BR-E against their APIs. Six of the nine WPs are off beta.5's critical path.

### 14.3 Requests to the PM about in-flight teams

- **LO must rebase on BR-B** (both add Recipe fields and touch `recipe.go`, the store and `modules/recipes.go`). If LO starts before BR-B merges, BR-B waits for LO instead, which moves BR-D, BR-F and BR-G one wave later.
- **SD** (in flight) touches `sources.go`, `snapshot.go`, `courses_c2.go` and `notify/facts`; nothing to ask, only to merge first.
- **UF-runner** owns `stockport.go`, `actions.go` and `internal/cook/**`: BR-G must follow it.

### 14.4 Honest estimate

- **Size**: nine WPs, about as much as beta.5's planner features (SD, BO, LO, UF). BR-A, BR-B and BR-C are the large ones; BR-F, BR-G and BR-H are small adapters on top of a tested pure package.
- **Critical path**: BR-G sits after UF-runner and beside UF-web, and BR-H after BR-G. If both land first time, the wave count stays at 7 with a fuller wave 6 and 7; realistically **one more wave** on the tail, and a QA round about a third larger (planner, Shopping List, Cooked, Cook Mode and Import all gain cases).
- **Risk**: it touches four of beta.5's hot spots (runner, shopping, cook, recipes). The ownership plan above avoids parallel edits, but every slip in SD, BO, LO or UF-runner now also delays Base recipes.
- **Does it threaten one beta.5?** Yes, moderately: one more wave and a bigger QA round, not a rewrite. The options (question P4):
  - **A. All of it in beta.5** (+1 wave, recommended if the date can move by a wave): the feature is consistent everywhere.
  - **B. Cut the cooking timeline merge to beta.6** (BR-G's cook part and BR-H): beta.5 then has authoring, import, planner, Exclusions, Shopping List and Cooked; Cook Mode shows only the Recipe's own Steps and the Base recipe line, and the Base recipe is cooked from its own detail. Total time on tiles must then stay uncomposed too, or it disagrees with Cook Mode and Start cooking. Saves the tail wave.
  - **C. All of Base recipes in beta.6**: beta.5 keeps its plan; only BR-A (pure, no user effect) could still land early.
  Not recommended: shipping authoring without BR-F, because then Exclusions would not look down (D8 is a safety rule for allergies) while Base recipe lines already exist.

---

## 15. Product questions for the user

Only real choices; each has a recommended default (A).

- **P1. Step times when a Base recipe is scaled.** The brief says "ingredients and step times scale". Today Batches never scale durations (a 30-minute simmer stays 30 minutes for 2 Batches).
  A. Amounts scale, durations stay as written (as for Batches). *(recommended)*
  B. Active Step durations scale with the amount, Passive ones stay.
  C. All durations scale with the amount.
- **P2. Preferences on a Base recipe.**
  A. Exclusion only, stored as the Exclusion of its Ingredient and counted inside every Recipe that uses it; no Favourite or Dislike. *(recommended)*
  B. All three; a Favourite or Dislike of the Base recipe counts for every Recipe that uses it.
- **P3. Preselected answers in Import Review.**
  A. Preselect only an exact name match to an existing Base recipe or to a Base recipe in the same file (a Feeder export); every other marked line waits for an answer before Confirm. *(recommended)*
  B. Never preselect; every marked line waits for an answer, Feeder exports included.
- **P4. Schedule** (§14.4).
  A. All of Base recipes in beta.5, one more wave. *(recommended)*
  B. beta.5 without the cooking timeline merge (Cook Mode shows Base recipes from beta.6).
  C. Base recipes in beta.6.
- **P5. Making a Base recipe on purpose** (Sunday's ragù for the freezer, or more béchamel than the lasagne needs).
  A. Not in beta.5: the jar or batch is added on the Pantry page as a Lot of the Base recipe's Ingredient; a "Made it" action that deducts the Ingredients and adds the Lot comes later. *(recommended)*
  B. In beta.5: a **Made it** action on the Base recipe's detail and an "extra" amount in Mark as Cooked, both adding a Lot.
- **P6. Turning a plannable Recipe into a Base recipe** (the flow of §3.6, to confirm).
  A. Allowed after the confirm that names what goes: its Planned Meals from today (Pinned and Bought too) and Slot Rules are removed, Cooked history stays, its Leftovers stay until answered. *(recommended)*
  B. Refused while it has Pinned or Bought Planned Meals or Leftovers; the User clears them first.
- **P7. A new Base recipe whose name an Ingredient already has** ("béchamel" from older Recipes or a jar in Stock).
  A. Ask: "An Ingredient called béchamel is on 3 Recipes and in the Pantry. Use it for this Base recipe? Those lines will then be made from it, Stock first." Yes adopts it; No keeps them apart and asks for another name. *(recommended)*
  B. Always keep them apart; the Base recipe needs a name no Ingredient has.

Decided here, no question (veto if wrong): Base recipes hidden from the Recipes list by default with a **Base recipes** filter; no Last cooked for them; Tags allowed; Delete in use refused and Archive offered, archived ones keep working inside Recipes that use them; an empty Base recipe counts as its own Ingredient (on the Shopping List as itself) until it has Ingredients; the planner's scores treat a Base recipe as made from scratch; nutrition stays out of v1.

---

## 16. Test plan

**Go unit, `internal/recipe/baserecipe`** (BR-A):

- Scaling: 500 ml of a 1 l Yield → ×0.5; `0.5 l`, `1 batch`, a custom Unit Conversion; Yield in kg, line in g; `portion` Yield.
- Nesting three deep (lasagne → béchamel → roux): factors multiply; optional propagates down.
- Cycles: self, two-step, three-step; the path names in order; `FindCycle` on a graph with an unrelated cycle elsewhere returns only the saved Recipe's.
- Empty Base recipe: `Made == nil`; `Flatten` keeps it as a real line.
- `Flatten`: the Base recipe Ingredient as an optional zero line; an unconvertible line skipped.
- `Resolve`: Stock covers all, part, none; nested partial (jar of béchamel, no roux); two lines and two Courses sharing one jar; Batches 2.
- `ComposeSteps`: a Base recipe with a long Passive Step goes early, an Active-only one goes just before Needed at; ties take the latest position; `After` renumbered and still valid (`schedule.Validate`); Advance Steps carried and labelled; Needed at default rules (uses, text with accents and case, first Step) and an override; a stale override falls back; a Recipe with no Steps; covered block becomes zero-length with indexes unchanged; `uses` scaled; nested composition.
- `MatchReference`: exact, case, accents, plural, fuzzy; file vs existing vs plannable groups; "previous recipe" cue.

**Go, recipe and ingredient stores and API** (BR-B): migration 1540 test; create a Base recipe creates its Ingredient with Base Unit and `batch` conversion; Yield change rewrites `batch`; rename follows; a Base Unit change refused with Stock; field rules (`base_recipe_field`, `yield_unit_invalid`, `base_recipe_ready_meal`, `needed_at_step_invalid`); cycle `422` with path; delete in use `409` with `usedBy`; archive keeps expansion; to-base dry run and apply (Planned Meals, Slot Rules, Leftovers, preferences); to-plannable refused in use; total-time cache of users rewritten on a Base recipe edit; `kind` filter and sort; Ingredient guards (delete, merge away, merge into with cycle).

**Go, wiring** (BR-F, BR-G): the planner never places a Base recipe; Exclusion of milk inside béchamel excludes lasagne; Exclusion of Béchamel excludes lasagne and Review Exclusions names it; Advance Step of a Base recipe blocks a too-late cell; Shopping List: jar covers part, the rest's Ingredients only, nested, past-meal hint on child lines, empty Base recipe listed as itself (pure `shopping` tests plus a wiring test); Cooked deducts the jar first then the made part; Used from on the Base recipe Ingredient; Mark all Cooked sharing one jar across Courses; cook timeline with labels; covered block hidden; timers on a Base recipe Step; Start cooking reminder earlier by the Base recipe's time.

**Go, import** (BR-C): schema accepts the new fields and an old file unchanged (`spec_test.go`); `check.go` rules; export includes Base recipes transitively and round-trips; review rows from a model mark and from a name match only; each decision's commit (use, file, create, convert, keep); convert inside the commit transaction; cycle at Confirm; replace keeps id and Ingredient. Recipe Assistant: `OutputSchema` golden; `pruneNone` on `recipe: null`, `cue: ""`, `yieldUnit: ""`, `neededAtStep: null`; prompt golden; the fake-anthropic fixture end to end (read → review with a tile).

**Web unit (vitest)**: `lib/baseRecipe.ts` (fields shown per kind, line label "500 ml Béchamel (Base recipe)", Needed at options), list kind in the URL, `IngredientSelect` badge, `lib/baseRecipeLines.ts` (answers, Confirm blocked), `lib/baseSteps.ts`; components for the tile, the convert dialog, the Needed at menu, Cook Mode chips. Plus the whole-suite run and `scripts/check-ui.sh` (rule 6 for the new strings).

**BDD (Gherkin)**, `bdd/features/recipes/base-recipes*.feature`, `planning/`, `shopping-scan/`, `cook-board/`, `import-export/`, `recipe-assistant/`:

- Recipe editor: mark a Recipe as a Base recipe with Yield 1 l; call for 500 ml of it in Lasagne; the detail reads "500 ml Béchamel (Base recipe)" and links to it; a cycle is refused with "Béchamel calls for Roux, which calls for Béchamel".
- Planning: a Base recipe is never planned and cannot be chosen for a Course; Sam excludes milk, so Lasagne is not planned for a Course Sam eats; Review Exclusions names milk.
- Shopping: with a 300 ml jar of Béchamel in the Pantry, the list asks for the Ingredients of 200 ml only; with 600 ml, nothing for Béchamel.
- Cooked: marking Lasagne Cooked takes the jar first and the rest from milk, butter and flour.
- Cook Mode: Béchamel's Steps are labelled and end before "Layer the lasagne"; with a full jar they are not shown.
- Import Review, one scenario per answer: use an existing Base recipe; use one from this import; add it as a new Base recipe (Fill in later, Read it next); choose a plannable Recipe and confirm turning it into a Base recipe; cancel that confirm; keep it as an Ingredient; Confirm waits while a line has no answer.
- Recipe File round trip of Lasagne with Béchamel and Roux.
