# Base recipes

Design (docs only) for **Base recipes**, **scheduled for beta.6** (the user's answer P4 = C; nothing is built in beta.5). Written on branch `team/b5-base-design`, from main `878952b`. Architectural decisions: [ADR 0015](../../adr/0015-base-recipes.md) (Accepted, Target: beta.6). The user's answers to the design's questions are in §15; the beta.6 work packages and waves are in §14. Spec: [functional-spec.md](../../spec/functional-spec.md) decision 46 and §19, both marked "Scheduled for beta.6".

Terms in **bold** are [GLOSSARY](../../../GLOSSARY.md) terms; the new ones of §2 are now in GLOSSARY.md, each marked "(beta.6)". Everything was read from the tree at `878952b`.

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
| Base recipe line | An ordinary `recipe_lines` row whose Ingredient is a Base recipe Ingredient, plus an optional **Needed at** Step (`recipe_lines.needed_at_step`). No new line table. An existing plain line can be linked to one (re-pointing `ingredient_id`, remembering the old Ingredient for Undo), one by one, in bulk when a Recipe becomes a Base recipe, or all at once when the User lets the Base recipe take over a same-name Ingredient; nothing is linked silently. |
| Stock | The Base recipe Ingredient is an ordinary Ingredient: Stock Lots, Products (a jar's barcode), Scan, Stock-take, Shelf Life, Frozen Shelf Life, Used from all work unchanged. |
| Expansion | Read time, in a new pure package `internal/recipe/baserecipe` (unit-tested): a need tree, scaled by Unit Conversion, nested, cycle-checked. Nothing denormalised except the cached total time and the composed longest lead (`advance_minutes`), as today. |
| Planner | No change to `internal/planner`. A Base recipe has no Course, so Course fit already keeps it out. `DBSources` feeds the planner the flattened Ingredients (plus each Base recipe Ingredient as an optional zero line), so Exclusions and Review Exclusions look all the way down. |
| Shopping List | `shopping.Need` gains `Made`; `derivedLines` draws the Base recipe Ingredient from Stock first and only expands the shortfall. |
| Cooked | The runner resolves the tree against Stock (Base recipe Ingredient first), then deducts as today; Used from can pick the jar. |
| Cooking timeline | The recipe store composes each Recipe's cook Steps (its own plus its Base recipes', inserted where the total time is shortest, ending before the Needed at Step). `cook.Timeline` and `schedule.Compute` are unchanged; Steps carry a label. |
| Import | Recipe File v1 gains optional `baseRecipe`, `yieldUnit` (Recipe) and `recipe`, `neededAtStep` (line). The Recipe Assistant output schema follows by projection (all-required + `pruneNone`); the Agent Prompt gains two rules. Import Review gets a **Base recipe line** tile. |
| Migration | `1540_base_recipes.sql`, additive (`ALTER TABLE ... ADD COLUMN`), no rebuild. |
| Schedule | **beta.6** (P4 = C), five waves plus QA on top of a finished beta.5 (§14). |

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

## 2. GLOSSARY changes (applied to GLOSSARY.md with a "(beta.6)" note on each)

The entries (Recipe and Yield additions, **Base recipe**, **Base recipe line**, **Needed at**, Stock) are in GLOSSARY.md, which is the source of truth; the original proposal block was dropped as superseded.

Word check: none of the new _Avoid_ words occurs inside a quoted string of any `strings.ts` at `878952b` (`component` occurs only in comments of `ui/CoursePicker/strings.ts` and `features/cook/strings.ts`, which `check-ui.sh` rule 6 skips). The CHANGELOG word check (`scripts/changelog-avoid.py`, run by `scripts/test/release_test.sh`) found "open-source component" in the 1.0.0 notes (third-party notices), another sense of the word; it is on that script's allow list, like "app icons". Copy must not use "makes" for a Yield ("makes 4"): the editor and tiles say **Yield**, Import Review says "Add it as a new Base recipe", never "Make it".

---

## 3. Domain model

### 3.1 Recipe kind and Yield

- A Recipe is a **Base recipe** iff `recipes.base_ingredient_id` is set. The kind is chosen in the Recipe editor (a **Base recipe** switch) and by import; a Ready Meal can never be one (`422 base_recipe_ready_meal`).
- **Yield** keeps its column. For a plannable Recipe it is portions (unchanged, `yield_unit` NULL). For a Base recipe it is an amount in `yield_unit`, which is one of the global units (`g`, `kg`, `ml`, `l`, `dl`, `cl`, `tsp`, `tbsp`, `cup`), `piece` or `portion`. Validation: `0 < yield ≤ 100000` for a Base recipe (1000 g must fit), unchanged `≤ 100` for a plannable Recipe; `422 yield_unit_invalid` otherwise.
- Fields that do not apply to a Base recipe are stored empty and hidden in the editor: Courses (no `recipe_courses` rows; `courseIds` is `[]` in payloads), Whole meal (false), Ready Meal (false), Cool-down, Use-by, Reheat time and Frozen Use-by (NULL). An API write that sets any of them for a Base recipe is `422 base_recipe_field` naming the field. **Tags** are allowed (they help find it on the Recipes list); they never reach Slot or Variety Rules because a Base recipe is never planned.

### 3.2 The Base recipe Ingredient

The Base recipe owns one Ingredient (`recipes.base_ingredient_id`, unique). It exists so that a jar or a frozen batch is Stock like any Ingredient (comparison of the options in §6).

- **Created** with the Base recipe, in the same transaction: name = the Recipe's name; Base Unit from the Yield unit (g and kg → `g`; the ml family → `ml`; `piece`, `portion` → `piece`); no Shelf Life (the User sets one on the Ingredient, as for any Ingredient).
- **A same-name Ingredient is taken over only after asking** (P7 = B). When a Base recipe is created or named like an existing plain Ingredient ("béchamel" on older Recipes, a jar in Stock), a confirm asks **"Béchamel (Base recipe) has the name of an Ingredient. Take it over?"**, naming the Recipes it is on ("On 3 Recipes: Lasagne, Cannelloni, Moussaka") and its Stock ("2 jars in the Pantry"). Not offered when that Ingredient is already some other Base recipe's, or is a Ready Meal's Ingredient: there is **no take-over**, and the new Base recipe must get a different name. The save is refused with `422 validation_failed`, `field: name`, and reason `ready_meal_name_taken` ("A Ready Meal already uses that name", a Ready Meal's Ingredient holds it) or `base_recipe_name_taken` ("A Base recipe already uses that name", another Base recipe holds it); the editor and Import Review show it on the name field (user answer, 2026-11-12). **Yes, take it over**: that Ingredient becomes the Base recipe's (`base_ingredient_id` points at it, its Stock Lots, Products and Exclusions stay) and is **re-keyed**: its `ingredients.name_key` becomes `base-recipe:<recipe id>` instead of the name. All its lines become Base recipe lines at once, so Stock carries over. A taken-over Ingredient keeps its Base Unit; the take-over is offered only when the Yield's unit converts to it (otherwise the confirm says why and only No is offered), and the store then writes its `batch` (and `portion`) conversion from the Yield, replacing one the User had. **No, keep it apart**: the Base recipe gets its **own** Ingredient, and the plain one is kept as it is, because the bulk link (§3.8) and D9 forbid linking lines without the User ticking them. With no same-name Ingredient the Base recipe always gets its own. **The key is the Base recipe, never the name.** Every Base recipe Ingredient, own or taken over, has `ingredients.name_key = base-recipe:<recipe id>` (the column stays unique; only plain Ingredients use `units.NormalizeName(name)`). So a plain Ingredient with the same name **may exist beside a Base recipe's**, also after a Yes ("Allow both", user answer 2026-11-12: this reverses the earlier draft, where a taken-over Ingredient kept the name key and no plain one could exist). Two Ingredients may then show the same name; the picker, the Pantry and the Ingredients page tell them apart by the Base recipe badge, and the take-over confirm says so ("After this, Béchamel (Base recipe) has its own Ingredient. An Ingredient named Béchamel can still be added; the Base recipe badge tells them apart."). The same ask comes when a Base recipe is **renamed** to a name an existing plain Ingredient has: the same confirm, naming the Recipes and Stock; Yes takes that Ingredient over (re-keyed to `base-recipe:<id>`) and merges the Base recipe's former Ingredient into it (its Stock carries over), No keeps them apart. **No collision on a rename**: a rename never touches `name_key`, because the Base recipe's Ingredient keys on its id. So a rename to the name of a plain Ingredient, answered No, leaves two Ingredients of that name (one plain, one the Base recipe's) with no unique-key conflict; answered Yes it merges as above. On a rename that merges, the former Ingredient is merged with the existing Ingredient merge in the same transaction, after `base_ingredient_id` is re-pointed (so the 'cannot be merged away' guard does not apply to it); Base Units must agree or the merge's usual conflict step runs, and the store-kept `batch` conversion wins. **Name matching handles both.** Matching by name (import, the ingredient picker, quick create, "Did you mean") looks at plain Ingredients by `units.NormalizeName` and at Base recipes by their Recipe name (§4.5), and never returns a Base recipe Ingredient through the plain name key. When a name matches both a Base recipe and a plain Ingredient, the picker lists both (the Base recipe with its badge) and quick create of that name offers "Béchamel (Base recipe)" next to the plain Ingredient; Import Review's Base recipe line tile offers both and still **Keep it as an Ingredient** (§11.3). The User always confirms, and only an exact name match is preselected, preferring the Base recipe (P3 = A). **Reverse Ready Meal case**: any Ready Meal save whose name a Base recipe holds is refused with `422 base_recipe_name_taken` ("A Base recipe already uses that name"). Every Ready Meal save is checked, a rename included, not only marking a Recipe as a Ready Meal: a Recipe saved as a Ready Meal, and a Ready Meal renamed. `ChooseReadyMealIngredient` matches only the plain name key, so it must also compare the name with the Base recipes' names (their Ingredients are keyed `base-recipe:<id>`); otherwise it would quietly create a same-name plain Ingredient. A Ready Meal cannot be turned into a Base recipe, nor the reverse (`422 base_recipe_ready_meal`, the flag clash only, §3.1) and, as above, a Base recipe cannot take a Ready Meal's name. A kept-apart plain Ingredient is linked line by line (§3.7, §3.8) and, once no Recipe line uses it, offered for merge into the Base recipe's (§3.8).
- **Batch conversion.** The store keeps a Unit Conversion `batch` = Yield in Base Units on it (1 l Yield → `1 batch = 1000 ml`), rewritten whenever the Yield changes, so "1 batch of pasta frolla" is a valid line. A Yield in `portion` also keeps `portion = 1 piece`. The Ingredient page shows both read-only ("Set by the Base recipe").
- **Name follows** the Base recipe: a rename renames the Ingredient in the same transaction (`name_key` stays `base-recipe:<id>`, so a rename never collides with a plain Ingredient of the new name; a rename to a name a plain Ingredient already has asks the take-over question above instead, and No leaves both). The Ingredients page shows the name read-only with a recipe badge and a link to the Base recipe; Shelf Life, Frozen Shelf Life, Picture and other Unit Conversions are editable as usual.
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
  - Favourites and Dislikes on it are removed (P2 = A); Exclusions of it move to its Ingredient (§8);
  - its Yield becomes an amount: the confirm asks for it ("Yield: 4 portions" is prefilled from the old Yield with unit `portion`).
  Confirm copy: "Turn Pesto into a Base recipe? It will no longer be planned. 2 Planned Meals from today come off the plan (Tue Dinner, Pinned; Thu Lunch). The Slot Rule Friday Dinner · Main = Pesto is removed." Actions **Turn into a Base recipe** and **Cancel**.
- **Base → plannable**: `POST /api/recipes/{id}/to-plannable {yield, courseIds}`; `409 base_recipe_in_use` (with `usedBy`) while any Recipe calls for it. Its Ingredient stays as an ordinary Ingredient with its Stock (its `name_key` changes from `base-recipe:<id>` to `units.NormalizeName(name)` again; `409 ingredient_name_taken` when a plain Ingredient already has that key, which can now happen because both may coexist, and the dialog offers to merge the two).
- Becoming a Base recipe by either path (create, the switch, to-base, an Import Review answer) is followed by the take-over ask of §3.2 when a plain Ingredient has its name, then by the bulk link offer (§3.8) for any plain same-key lines left (all of them after a No).

### 3.7 Linking an existing line to a Base recipe

Existing Recipes have lines such as "500 ml Béchamel" written against a plain Ingredient. Any such line can become a Base recipe line, from the Recipe editor and from the Recipe detail.

- **Action.** Each plain ingredient line has, in its line menu, **Link to a Base recipe** (editor and detail alike; on the detail it saves at once, in the editor it changes the draft and saves with the Recipe).
- **Picker** (`BaseRecipePicker`, a crafted sheet with search, no native control): Base recipes, **name matches first** (`baserecipe.MatchReference` on the line's Ingredient name: exact, then close, then the rest by name); then **Add "Béchamel" as a new Base recipe** (named from the line's Ingredient; Yield = the line's amount and unit, as the import's "Add it as a new Base recipe", §11.3; created with no Ingredients, §4.6); then a second group, **Recipes you plan**, whose choice opens the P6 confirm of §3.6 (the Recipe stops being plannable) before it is used. Archived Base recipes and the Recipe itself are left out; a Base recipe that would make a cycle is listed disabled with the reason ("Béchamel already calls for this Recipe").
- **Re-point.** Linking sets the line's `ingredient_id` to the chosen Base recipe's Ingredient. Quantity, unit, optional and note carry over; Needed at starts at the default. If the unit does not convert for the Base recipe Ingredient, the usual inline Unit Conversion prompt asks for it on that Ingredient before the link is saved. The cycle check of §3.4 runs.
- **The old plain Ingredient is kept** and remembered on the line (`recipe_lines.linked_from_ingredient_id`), so the link can be undone. It is not deleted, renamed or merged by the link. When the link leaves it on no Recipe line, the merge offer of §3.8 follows.
- **Undo.** A Toast "Linked to Béchamel (Base recipe). Undo" right after; and, on a Base recipe line at any time, **Use as a plain Ingredient**, which re-points the line back to `linked_from_ingredient_id` (quantity and unit carry over, `needed_at_step` is cleared). Lines made Base recipe lines by a take-over have no `linked_from_ingredient_id`, so the action opens the ordinary Ingredient picker for them too. When that Ingredient no longer exists (merged or deleted), the action opens the ordinary Ingredient picker instead.
- Linking or undoing publishes `recipes` (Exclusions, the Shopping List and the plan change with the Ingredients inside).

### 3.8 Bulk link when a Recipe becomes a Base recipe

When a Recipe is created as a Base recipe, or becomes one (§3.6), and it did not take over a same-name Ingredient (§3.2), Feeder looks for plain lines of **an Ingredient with the same name** (the key of §4.5: `units.NormalizeName`, accents folded, a trailing plural "s" dropped) on other Recipes, archived ones included.

- If there are any, the editor (or Import Review after Confirm, or the to-base confirm) opens a sheet: **"3 Recipes use an Ingredient named béchamel. Link them to this Base recipe?"**, listing each Recipe with its line ("Lasagne · 500 ml béchamel") and a crafted checkbox. **Nothing is ticked at first**; **Link 2** applies the ticked ones; **Not now** links nothing. Lines whose unit does not convert, or that would make a cycle, are listed disabled with the reason ("cup cannot be converted to ml yet: link it from Moussaka").
- The same list stays reachable from the Base recipe's detail ("Recipes with an Ingredient named béchamel (3)") until no candidate is left, so "Not now" is never final.
- Linking is the §3.7 re-point for each ticked line, in **one transaction**, cycle-checked as a whole, with one Toast "Linked 2 Recipes. Undo" (Undo re-points them all back).
- **The old plain Ingredient.** It is kept. When no Recipe line uses it any more (after a link of every candidate, or later), the sheet ends with a second offer: **"béchamel is no longer on any Recipe. Merge it into Béchamel (Base recipe)?"**, naming what moves (its Stock Lots, Products, Exclusions); **Merge** uses the existing Ingredient merge (into the Base recipe Ingredient, which §3.2 allows; Base Units must agree or the merge's usual conflict step runs), **Keep it** leaves it. It is never merged silently, and while any line still uses it the merge is not offered (it would re-point those lines without a tick).

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
7. Step `uses` of a Base recipe Step are multiplied by the line factor (as its Ingredients, §4.1); Cook Mode then multiplies by the Batches as today (`schedule.ScaleUses`). **Durations are not scaled** (as for Batches today; P1 = A).

`schedule.Compute`, `schedule.Validate` and `cook.Timeline` are unchanged: the composed list is a valid Step list (every `After` points at an earlier Step).

**Indexes.** A composed Step's index is its position in the composed list; timers (`cook_timers.step`), Advance Step marks and Advance Step reminder keys use it. It only moves when a Recipe in the tree is edited (Stock never moves it, point 6). Editing a Recipe mid-cook already moves indexes today; the same holds, and the CHANGELOG need not mention it.

**Total time** on Recipe tiles and detail is the composed `TotalMinutes` with no Stock (everything made), so the tile says how long it takes from scratch. The recipe store caches it in `recipes.total_minutes` as now, and the composed longest lead of its Advance Steps in `recipes.advance_minutes`, and **also rewrites both caches of every Recipe that calls for an edited Base recipe** (transitively), in the same transaction.

### 4.5 `NeededAt`, `FindCycle`, `MatchReference`

- `NeededAt(recipe, lineIndex, baseName) int`: the default of §3.3.
- `LinkCandidates(baseName string, baseRecipeID int64, lines []CandidateLine, graph, units) []Candidate`: the bulk link list of §3.8 (same-name plain lines; the Base recipe itself and its own tree left out), each `Linkable` or with a reason (`unit_unconvertible`, `cycle`). `PickerOrder` orders the `BaseRecipePicker` of §3.7 (name matches first) through `MatchReference`.
- `FindCycle(edges map[int64][]int64, names) []string`: a path or nil.
- `MatchReference(name, cue string, candidates []Candidate) []Suggestion` for import (§11.3): candidates are existing Base recipes, existing plannable Recipes and Recipes of the same file; the match key is `units.NormalizeName` with accents folded and a trailing plural "s" dropped; exact key first, then the fuzzy score of `internal/ingredient/search.go` (reused through a small exported function, no copy). A cue naming "previous recipe" / "above" / "next recipe" picks the neighbouring Recipe of the same file. Pure.

### 4.6 An empty Base recipe

A Base recipe may have no lines (Import Review's "Add it as a new Base recipe · Fill in later" (D9, §11.3); `lines_required` does not apply to a Base recipe). While empty, its line counts as its own Ingredient everywhere: the Shopping List asks for "Béchamel 500 ml", Cooked deducts the jar, Cook Mode shows no Steps for it. Its tile and detail say "No Ingredients yet", and the using Recipe's line shows the same. So an empty Base recipe is never wrong, only less helpful.

---

## 5. Planner and Exclusions (D2, D8)

- **Never planned (D2).** A Base recipe has no Courses, so Course fit excludes it from every cell, Swap, Leftover first and the Slot Rule checks (`CheckRule`'s `ErrRecipeNotInCourse`). The SPA never offers it (the pickers filter by Course already). The choose-a-Recipe route already checks Course fit; a BDD scenario pins `422` for a Base recipe so a later change cannot let one through. No change to `internal/planner`.
- **Needs.** `DBSources.Recipes` (in `internal/plan/runner/sources.go`) takes the trees of all Recipes from the recipe store's batch `Store.NeedTrees` (one catalog load; a cycle and the skipped lines of each Recipe, with the Base recipe they sit in, are logged once per read) and gives the planner `baserecipe.Flatten(tree)`. Base recipes themselves are not passed to the planner (they could never be a candidate).
- **Exclusions all the way down (D8).** An Exclusion of any Ingredient inside, at any depth, rules the Recipe out, through the flattened lines. An Exclusion of the Base recipe itself is stored as the Member's **Ingredient Exclusion of the Base recipe Ingredient** (one fact, one place; §8), which the zero line carries. Review Exclusions then names "Sam: Béchamel" or "Sam: milk" with the Recipes it ruled out, using the existing `explainExclusions` records. Leftover first checks the same lines.
- **Advance Steps.** `DBSources.Recipes` reads `Summary.AdvanceMinutes` (the cached composed longest lead) as a single `AdvanceStep`, so a Base recipe's Advance Step counts for the lead-time hard filter. This is equivalent to passing every step: `advanceBlocked` blocks a cell when any step starts too late, so the longest lead decides, and past cells are never replanned. Prep reminders, Today and Cook Mode still read the full Steps through `Get`.
- **Stock in scoring (known limitation).** The planner's projected Stock and its Ingredient Overlap / perishable-use scores see the Base recipe as made from scratch: a jar in the Pantry does not make a lasagne more likely. The Shopping List and Cooked, which the User sees, are Stock first. Teaching the planner the tree (a `Made` on `planner.Need`) is left for later; it is not needed for any user decision.

---

## 6. Stock of a Base recipe: options

| Option | What | For | Against |
|---|---|---|---|
| **A. Base recipe Ingredient** (recommended) | The Base recipe owns an Ingredient; a Base recipe line is a line of that Ingredient; Stock is ordinary Stock Lots of it | Stock Lots, Products and barcodes, Scan and Stock-take, Shelf Life and Frozen Shelf Life, Storage Places, Used from, waste and the Zero-waste streak, Ingredient Exclusions, the ingredient picker and Unit Conversions all work unchanged. No new line table, no change to `recipe_lines`' meaning. Same idea as the Ready Meal's Ingredient, which users already know | The Ingredient must follow the Recipe (name, Base Unit, `batch` conversion) and be guarded against delete and merge; the Ingredients page lists it (with a badge) |
| B. A Stock Lot kind | `stock_lots.recipe_id` beside `ingredient_id` | Stock is visibly "of a Recipe" | Every Stock path (Project, Deduct, Used from, Pantry, Scan, Products, waste, go-off, Shopping List draw, ST's Lot edit) gains a second kind, in the Stock, Used from and Pantry code. No barcode for a jar without inventing a Product kind too |
| C. An extra Base recipe as a Leftover | Portions in `leftovers` | Reuses freezing (ADR 0012) | A Leftover is portions of a plannable Recipe that the planner serves; a Base recipe is an amount, never served. ADR 0012 already rejected "Leftover becomes Stock" for this reason. A bought jar is not a Leftover |

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
- **More than the need is never made**: the made amount is scaled to the need (D3). Making more on purpose (a batch for the freezer) is a later feature (P5 = A); the User adds a Lot of the Base recipe Ingredient on the Pantry page (it is an Ingredient), with its Storage Place.
- **Preferences on a Base recipe** (P2 = A): its detail shows the Preferences Tile with the **Exclusion** column only. Setting it writes `member_ingredient_exclusions` for the Base recipe Ingredient (so it is one fact, seen by the planner and Review Exclusions). Favourite and Dislike are not offered: a Base recipe is never planned, and liking béchamel says nothing about lasagne.
- **"via" on a using Recipe** (spec §4, *An Exclusion via an Ingredient*): the Preferences Tile and the line Avatars look down. The detail payload gains `within` (every Ingredient inside, with the Base recipe path), so the cell reads "via milk (in Béchamel)" or "via Béchamel".

---

## 9. Cooking timeline and Cook Mode (D4)

- **Where the composition lives.** The recipe store's `Get` fills a new `Recipe.Cook` (the composed Steps with their origin, §4.4, with no Stock) and computes `Timing` from it. Readers of the cooking timeline switch from `rec.Steps` to `rec.Cook`: the cook adapter `dbRecipes.Steps` (`internal/cook/service/adapters.go`) and the notification facts `scheduleSteps` (`internal/notify/facts/facts.go`), so Start cooking fires early enough and Advance Step reminders include a Base recipe's.
- **Stock at cook time.** `dbRecipes.Steps` takes the Planned Meal's Batches and reads Stock totals of the Base recipe Ingredients (a read through the cook adapter's DB), so a block covered by a jar is hidden (§4.4 point 6). A Recipe opened on its own (no Planned Meal) assumes everything is made.
- **Labels.** `cook.Step`, `cook.CookStep` and `service.TimelineItem` gain `baseRecipe: { id, name, path } | null`. Cook Mode shows a neutral chip with the Base recipe's name on each such Step ("Béchamel", "Béchamel · Roux"), and the Needed at Step's text gains "Béchamel ready" when the block ends before it. Timers on a Base recipe's Passive Step are labelled "Béchamel: simmer". The Next gate, Advance Step marks and the single-Course view are unchanged (they work on indexes).
- **Multi-Course slots.** Each Course's composed Steps are its block for `cook.Timeline`, unchanged: one Course's Base recipe never leaves its Course's block.

**Amendment (2026-11-13).** The notification facts (`internal/notify/facts`) apply Stock with the meal's Batches, as Cook Mode does: a Planned Meal's composed Steps are read with `NeedTree`, `MadeFractions` over the Stock on hand and `Cook`, so a jar that covers a Base recipe turns its block into zero-length Steps. Start cooking therefore matches the timeline's `startAt` when a jar covers a Base recipe. The Advance Step IDs stay composed indexes, and a covered Advance Step is not listed. The backend hides covered Steps from the timeline and the Cook Mode view and returns `covered` (the Base recipes left out, in order, `[]` when none) for BR-H's wording.

---

## 10. API

New spec section **§19 Base recipes (scheduled for beta.6)** (§18 is beta.5's). Errors use the existing `validation_failed` / conflict shapes.

**Recipes** (`internal/recipe/httpapi`):

- Recipe in: `baseRecipe: boolean` (create: absent = false; update: absent keeps), `yieldUnit: string | null` (required for a Base recipe, null otherwise). Line in: either `ingredientId` (a Base recipe Ingredient is accepted) or `baseRecipeId` (the server maps it to its Ingredient); `neededAtStep: number | null`.
- Recipe out: `baseRecipe`, `yieldUnit`, `usedBy: [{ id, name, archived }]` (Base recipes only; `[]` otherwise), `within: [{ ingredientId, name, path: [baseRecipeName] }]`, `timing` composed. Line out: `baseRecipe: { id, name, archived, empty } | null`, `neededAtStep` (stored), `neededAt` (effective, a Step index).
- `GET /api/recipes?kind=plannable|base|all` (default `plannable`, D: hidden by default). Summary gains `baseRecipe`, `yieldUnit`, `usedByCount`. `?sort=last_cooked_*` with `kind=base` sorts by name (no Last cooked); with `kind=all` Base recipes count as "not cooked yet".
- `DELETE /api/recipes/{id}`: `409 base_recipe_in_use { usedBy }`.
- `POST /api/recipes/{id}/to-base?dryRun=1` → `{ plannedMeals: [{ date, mealSlotName, courseName, pinned, bought }], slotRules: [...], leftovers: n, preferences: n }`; without `dryRun`, body `{ yield, yieldUnit }`, applies (§3.6). `POST /api/recipes/{id}/to-plannable { yield, courseIds }` → `409 base_recipe_in_use`.
- **Linking a line** (§3.7; the line payload gains its `id`): `POST /api/recipes/{id}/lines/{lineId}/base` with exactly one of `{ baseRecipeId }`, `{ create: { name, yield, yieldUnit } }` or `{ convertRecipeId, yield, yieldUnit }` (runs to-base first, in the same transaction) → the Recipe; `DELETE /api/recipes/{id}/lines/{lineId}/base` (body `{ ingredientId }` when the remembered Ingredient is gone) → the Recipe. Errors: `422 base_recipe_cycle`, the usual `UnknownUnitError` shape on the Base recipe Ingredient, `422 line_not_plain` / `line_not_base`. The editor sends the same change inside its PUT (a line's `baseRecipeId`, with `linkedFromIngredientId` kept by the server).
- **Bulk link** (§3.8): `GET /api/recipes/{id}/link-candidates` → `{ lines: [{ lineId, recipeId, recipeName, archived, ingredientId, ingredientName, quantity, unit, linkable, reason? }] }`; `POST /api/recipes/{id}/link { lineIds }` (one transaction, all or nothing) → `{ linked: [lineId], mergeOffer: [{ ingredientId, name, stockLots, products }] }` (`mergeOffer` lists the plain Ingredients the link left on no Recipe line); `POST /api/recipes/{id}/unlink { lineIds }` for the Toast's Undo. The merge itself is the existing Ingredient merge route.
- New validation reasons: `base_recipe_cycle` (`path`), `base_recipe_ready_meal` (the flag clash only), `base_recipe_name_taken`, `ready_meal_name_taken`, `ingredient_name_taken` (409, to-plannable, §3.6), `base_recipe_field`, `yield_unit_invalid`, `needed_at_step_invalid`, `base_unit_in_use`.
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

**One definition per name (beta.6, BR-C round 2).** A Feeder export may hold a plain Ingredient and a Base recipe's Ingredient with the same name ("béchamel" on Moussaka, the Base recipe Béchamel's own). The file has one name per definition, so `Build` writes one definition per normalised name: the Base recipe's Ingredient's (the plain one is merged into it), which takes the plain Ingredient's Unit Conversions (without `batch`) and its Shelf Life where it has none. A plain Ingredient with another base unit cannot be merged: its definition is left out with the warning `same_name_ingredient`. Import then sees one "béchamel" row, and the Base recipe's line keeps its tile. Telling the two apart again after import is the store's job (`base-recipe:<id>` keys, §3.2), so the round trip of §16 stays skipped until then.

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

**A name that matches a Base recipe and a plain Ingredient** (user answer, 2026-11-12): a line whose name matches a Base recipe, with or without a plain Ingredient of that name, gets this tile. When both match, the tile offers **Use Base recipe Béchamel** and, as **Keep it as an Ingredient**, the plain Ingredient of that name (shown by name, so the User sees it is the one that exists); a name that matches only a plain Ingredient is not asked about (§11.2). Only an exact name match is preselected, and then the Base recipe is preferred over the plain Ingredient (P3 = A). Nothing is linked silently: the User always confirms in Import Review.

**Nothing is linked silently (D9).** Confirm is disabled while any tile has no answer (the existing pattern for unresolved rows). A preselected answer is shown like any other and counts as answered only because the User confirms the whole review (P3 = A). The line's unit is then checked against the target's Base recipe Ingredient, so a unit prompt can follow on that Ingredient. Cycle check runs at Confirm (`422 base_recipe_cycle` on the tile).

Server: `internal/recipefile/review.go` gains rows for these lines; `plan()` returns `baseRecipeLines: [{ path, name, cue, quantity, unit, suggestions: [{ kind: "base" | "plannable" | "file", recipeId?, recipeIndex?, name, exact }], answer? }]`; decisions take `baseRecipeLines: { "<path>": { "action": "use" | "file" | "create" | "convert" | "keep", "recipeId"?, "recipeIndex"?, "yield"?, "yieldUnit"?, "readNext"? } }`; `commit()` creates Base recipes and their Ingredients before the Recipes that call for them, in its one transaction.

---

## 12. Migration `1540_base_recipes.sql`

The next free number after beta.5's 1500 to 1530, unless another beta.6 migration takes it first (then BR-B takes the next free one). Additive; no table rebuild, no foreign-key pragma, so it needs no snapshot of its own beyond the release's usual one.

```sql
-- Base recipes (ADR 0015). A Recipe is a Base recipe iff base_ingredient_id is set.
ALTER TABLE recipes ADD COLUMN base_ingredient_id INTEGER REFERENCES ingredients(id); -- its Ingredient, NULL = plannable
ALTER TABLE recipes ADD COLUMN yield_unit TEXT;  -- Base recipe only: units.NormalizeUnit of the Yield's unit; NULL = portions
CREATE UNIQUE INDEX recipes_base_ingredient ON recipes (base_ingredient_id) WHERE base_ingredient_id IS NOT NULL;
-- Base recipe line only: 0-based index of the Recipe's own Step by which it must be ready; NULL = the default rule.
ALTER TABLE recipe_lines ADD COLUMN needed_at_step INTEGER CHECK (needed_at_step IS NULL OR needed_at_step >= 0);
-- Base recipe line only: the plain Ingredient the line had before it was linked (§3.7), for Use as a plain Ingredient.
ALTER TABLE recipe_lines ADD COLUMN linked_from_ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL;
```

`linked_from_ingredient_id` does not count as a reference for the Ingredient delete and merge guards: a remembered Ingredient can still be merged or deleted (a merge rewrites the column to the merge target; a delete sets it NULL). Every Base recipe Ingredient's `name_key` is `base-recipe:<recipe id>`, own or taken over (§3.2). The store writes it; no existing row changes.

The kind rules that span columns (Yield unit iff Base recipe; no Courses; not a Ready Meal) are checked in Go (`recipe.Input.Validate` and the store), not in SQL, because `ADD COLUMN` cannot add a table constraint. A migration test (`internal/db/base_recipes_migration_test.go`) checks existing Recipes stay plannable and the index refuses a second Recipe on one Ingredient.

---

## 13. Web

All copy in `strings.ts`, GLOSSARY terms, no _Avoid_ word ("makes" included). Shared primitives only; no native control.

- **Recipe editor** (`features/recipes`): a **Base recipe** switch at the top of the details (helper: "Used inside other Recipes and never planned"). On: Courses, Whole meal, Ready Meal, Cool-down, Use-by, Reheat time and Frozen Use-by are hidden; **Yield** becomes amount plus the shared `UnitSelect` (g, kg, ml, l, …, piece, portion). Turning it on for a saved, plannable Recipe runs the §3.6 dry run and its ConfirmDialog before save. Pure lib `lib/baseRecipe.ts` (which fields apply, the draft's kind switch, the line label); hook `useBaseRecipeChange`.
- **Ingredient picker**: the shared `IngredientSelect` gains an optional badge per option (Phosphor `cooking-pot`, label "Base recipe") from `IngredientRef.baseRecipe`; archived Base recipes and the Recipe being edited are left out. Picking one keeps the line's quantity and offers the Base recipe Ingredient's units. A plain Ingredient and a Base recipe with the same name are two options, told apart by the badge, and quick create of a name a Base recipe has offers "Béchamel (Base recipe)" next to creating the plain Ingredient. A Base recipe line row shows a **Needed at** chip-menu ("Needed at Step 4" / "Before you start"), listing the Recipe's non-Advance Steps; the default is marked "(default)".
- **Link a line** (§3.7): the line menu's **Link to a Base recipe** in the editor (`IngredientLineRow`) and on the detail; the `BaseRecipePicker` sheet (search, name matches first, "Add … as a new Base recipe", a "Recipes you plan" group that opens the P6 confirm, disabled rows with reasons); **Use as a plain Ingredient** on a Base recipe line; the Undo Toast. The list logic is a pure lib shared with Import Review, `web/src/lib/baseRecipes/**` (new: `pickerRows`, `linkCandidateRows`, `mergeOffer`, with hooks `useBaseRecipePicker`, `useLinkCandidates`); the sheets import it by path (no `ui/index.ts` change).
- **Bulk link** (§3.8): `LinkCandidatesSheet` (crafted checkboxes, nothing ticked, **Link N** / **Not now**, disabled rows with reasons), then the merge offer step (**Merge** / **Keep it**); opened after saving a new Base recipe, after the to-base confirm, and from the Base recipe detail's "Recipes with an Ingredient named béchamel (N)" row.
- **Recipe detail**: a Base recipe line reads "500 ml Béchamel (Base recipe)", the name a link to `/recipes/<id>`; "No Ingredients yet" for an empty one. A Base recipe's detail shows **Yield** ("Yield 1 l"), **Used in** (links), its Ingredient's Stock ("In the Pantry: 300 ml", a link to the Ingredient's Lots) and the Exclusion-only Preferences Tile (§8). Total time includes Base recipes; the facts line says "includes Béchamel".
- **Recipes list**: a crafted segmented control **Recipes · Base recipes** beside the filters, kept in the URL as `?kind=base` like the other filters; default Recipes (D: hidden by default). The sort select (team R) is hidden on Base recipes; their tiles show the Yield and "Used in 3 Recipes" / "Not used yet" where plannable tiles show Last cooked. Course and Tag filters keep working (Course filter is hidden on Base recipes).
- **Ingredients page** (`features/ingredients`): the Base recipe badge and link; the name and the `batch` / `portion` conversions read-only.
- **Import** (`features/import`): `BaseRecipeLineTile`, pure `lib/baseRecipeLines.ts` (rows, answers, "Confirm needs an answer"), hook `useBaseRecipeLines`; the convert ConfirmDialog; "Read Béchamel now" after Confirm; the bulk link sheet after Confirm for each Base recipe the import created or converted (reusing `lib/baseRecipes` and BR-D's sheet); the Export picker's "Also exports".
- **Cook Mode** (`features/cook`): the Base recipe chip on Steps and timeline items, "Béchamel ready", hidden covered Steps; pure `lib/baseSteps.ts`.
- **Pantry, Shop, Plan**: no new UI (the Base recipe Ingredient is an Ingredient; Lines are raw Ingredients; Used from names it).

---

## 14. Team split, dependencies and schedule (beta.6)

The user chose **P4 C**: Base recipes are **scheduled for beta.6**, and nothing of them is built in beta.5. The plan below starts on a finished beta.5 (SD, BO, LO, UF and their web teams merged), so it no longer interleaves with beta.5's waves and none of the beta.5 ordering requests (LO rebasing on BR-B, BR-G after UF-runner) applies. If other beta.6 work is planned on the same files (the runner, shopping, cook, `features/recipes`), the PM serialises it against these WPs as usual.

### 14.1 Work packages

Each WP runs the usual pipeline (designer/test author, developer, reviewer) in its own worktree. Files are owned exactly as listed.

| WP | Scope | Owns | Depends on |
|---|---|---|---|
| **BR-A Domain** | The pure package (§4): Expand, Flatten, Resolve, ComposeSteps, NeededAt, FindCycle, MatchReference, LinkCandidates, PickerOrder; the exported fuzzy score in `ingredient/search.go` | `internal/recipe/baserecipe/**` (new), `internal/ingredient/search.go` (one exported function) | none |
| **BR-B Recipe backend** | Migration 1540 and its test; kind, Yield unit and Needed at validation (`recipe.go`); the Base recipe Ingredient lifecycle; the store's `NeedTree`, `Cook` composition, total-time cache rewrite, cycle check, to-base / to-plannable; linking a line and undo (§3.7), link candidates, bulk link and unlink with the merge offer (§3.8), `linked_from_ingredient_id`, the `base-recipe:<id>` key; the API (§10) | `internal/db/migrations/1540_*`, `internal/db/base_recipes_migration_test.go`, `internal/recipe/{recipe.go,readymeal.go,base.go}`, `internal/recipe/store/**`, `internal/recipe/httpapi/**`, `internal/ingredient/{store,httpapi}/**`, `internal/modules/{recipes,ingredients}.go` | BR-A |
| **BR-C Recipe File and Recipe Assistant** | Schema, `recipe-file.md` (fields, rules 15 and 16), example, `check.go`, export, Import Review rows, decisions and commit; golden files; fake-anthropic fixture | `docs/spec/{recipe-file-v1.schema.json,recipe-file.md,examples/**,fixtures/**,spec_test.go}`, `internal/recipefile/**`, `internal/recipeassistant/{testdata/**,fakeanthropic/**}` and tests | BR-A; the commit half after BR-B |
| **BR-D Web recipes** | Editor switch and Yield, picker badge, Needed at, detail, list kind filter, Ingredients page badge; **Link to a Base recipe** and **Use as a plain Ingredient** on lines (editor and detail), `BaseRecipePicker`, `LinkCandidatesSheet` with the merge offer, Undo Toasts | `web/src/features/recipes/**`, `web/src/features/ingredients/**`, `web/src/lib/baseRecipes/**` (new), `web/src/ui/Select/IngredientSelect*` (not `ui/index.ts`; the export exists) | BR-B (API; can start on fixtures once BR-B's tests are red) |
| **BR-E Web import** | Base recipe line tile, convert dialog, Read it next, the bulk link sheet after Confirm (BR-D's sheet and `lib/baseRecipes`), Export picker | `web/src/features/import/**` | BR-C; BR-D's sheet merged |
| **BR-F Planning and shopping wiring** | `DBSources.Recipes` flatten + Exclusions (§5), the Base recipe Exclusion mapping; `shopping.Need.Made`, `derivedLines` Stock first, `plans.Meals` tree | `internal/plan/runner/sources.go`, new `internal/plan/runner/basetree.go`, `internal/shopping/shopping.go`, `internal/shopping/httpapi/wiring.go` | BR-B |
| **BR-G Cooked and Cook Mode backend** | `needsFor` with `Resolve` (Stock first, Used from), composed Steps in the cook adapter, labels in the cook payloads, notify facts on composed Steps | `internal/plan/runner/{snapshot.go,courses_c2.go,actions.go,stockport.go}`, `internal/cook/**`, `internal/notify/facts/facts.go` | BR-B, BR-F (`needsFor` reads the tree kept by `basetree.go`) |
| **BR-H Web Cook Mode** | Base recipe chips, "ready", hidden covered Steps | `web/src/features/cook/**` | BR-G (API; can build on a fixture once BR-G's tests are red) |
| **W-BR Docs** | Done on this branch: GLOSSARY entries marked (beta.6), spec decision 46 and §19 marked "Scheduled for beta.6", the Recipe File doc's beta.6 section, ADR 0015 Accepted. Left for the beta.6 release: drop the (beta.6) notes, fold §19 into the behaviour sections (§4, §6, §7.2, §8, §9, §11, §13) and the beta.6 fields into the Recipe File tables (BR-C) | `GLOSSARY.md`, `docs/spec/functional-spec.md` | the release, last |


### 14.2 beta.6 waves

| Wave | Parallel WPs | Why this order |
|---|---|---|
| 0 | **BR-A** | the pure package everything else calls |
| 1 | **BR-B**, **BR-C** (schema, prompt, Recipe Assistant, review rows on stubs) | BR-B and BR-C own disjoint files; both need BR-A's API |
| 2 | **BR-D**, **BR-F**, BR-C (commit half) | all need BR-B's store and API; disjoint files |
| 3 | **BR-E**, **BR-G** | BR-E needs BR-C and BR-D's sheet; BR-G needs BR-F's tree |
| 4 | **BR-H** | needs BR-G's cook payload |
| 5 | release (W-BR's remaining part, CHANGELOG), QA | |

Critical path: BR-A, BR-B, BR-F, BR-G, BR-H, release (BR-D and BR-E beside it). Migration 1540 is the number if no other beta.6 migration takes it first; BR-B takes the next free one otherwise (it is additive, so the order does not matter).

### 14.3 Estimate

Nine WPs, about the size of beta.5's planner features (SD, BO, LO, UF). BR-A, BR-B and BR-C are the large ones; BR-F, BR-G and BR-H are small adapters on top of a tested pure package. On its own, beta.6 needs about **five waves plus QA**. The QA round covers the planner, the Shopping List, Cooked, Cook Mode and Import.

---

## 15. Product decisions (the user's answers, final)

The user took the recommended option on every question except P4 = C and P7 = B. They are decided, and recorded in ADR 0015 and spec decision 46.

- **P1 = A. Step times.** Amounts scale with the Base recipe line; Step durations stay as written, as for Batches (§4.4 point 7).
- **P2 = A. Preferences.** A Base recipe has only an Exclusion, stored as the Exclusion of its Ingredient and counted inside every Recipe that uses it; no Favourite or Dislike (§8).
- **P3 = A. Import Review defaults.** Only an exact name match to an existing Base recipe, or to a Base recipe in the same file (a Feeder export), is preselected, and the User still confirms the review; every other marked line waits for an answer before Confirm (§11.3).
- **P4 = C. Schedule.** Base recipes are scheduled for beta.6 (§14). The GLOSSARY entries carry "(beta.6)" and the spec text says "Scheduled for beta.6" until then.
- **P5 = A. Making a Base recipe on purpose.** Not in this design: a jar or a batch is added on the Pantry page as a Lot of the Base recipe's Ingredient. A "Made it" action that deducts the Ingredients and adds the Lot is a later feature (§8).
- **P6 = A. Turning a plannable Recipe into a Base recipe.** Allowed after the confirm that names what goes: its Planned Meals from today (Pinned and Bought too) and its Slot Rules are removed, Cooked history stays, and its Leftovers stay until they are answered (§3.6).
- **P7 = B. A name an Ingredient already has.** Feeder asks whether the Base recipe takes over that Ingredient, naming the Recipes and Stock it affects. Yes: all its lines become Base recipe lines and Stock carries over. No: the Base recipe gets its own Ingredient (told apart by the badge), the old one is kept, and its lines are linked only when the User ticks them in the bulk link list or links them one by one. Once no Recipe line uses it, Feeder offers to merge it (§3.2, §3.7, §3.8). Follow-up answers (2026-11-12): with an Ingredient that is already another Base recipe's or a Ready Meal's there is no take-over and the new Base recipe needs another name; after a take-over a plain Ingredient of that name may exist again, because a Base recipe's Ingredient is keyed by its Base recipe, not its name (name matching in import and the picker offers both, the User confirms, only an exact name match is preselected, the Base recipe preferred); a Ready Meal can never become a Base recipe (`base_recipe_ready_meal`).

Decided by the design, not asked: Base recipes hidden from the Recipes list by default with a **Base recipes** filter; no Last cooked for them; Tags allowed; Delete in use refused and Archive offered, archived ones keep working inside Recipes that use them; an empty Base recipe counts as its own Ingredient (on the Shopping List as itself) until it has Ingredients; the planner's scores treat a Base recipe as made from scratch; nutrition stays out of v1.

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
- `LinkCandidates`: same-key plain lines only (case, accents, plural); the Base recipe and Recipes inside its own tree left out; `unit_unconvertible` and `cycle` reasons; archived Recipes included. `PickerOrder`: exact name match first, then close, then by name; the plannable group after the Base recipes.

**Go, recipe and ingredient stores and API** (BR-B): migration 1540 test; create a Base recipe creates its Ingredient with Base Unit and `batch` conversion; Yield change rewrites `batch`; rename follows; a Base Unit change refused with Stock; field rules (`base_recipe_field`, `yield_unit_invalid`, `base_recipe_ready_meal`, `needed_at_step_invalid`); cycle `422` with path; delete in use `409` with `usedBy`; archive keeps expansion; to-base dry run and apply (Planned Meals, Slot Rules, Leftovers, preferences); to-plannable refused in use; total-time cache of users rewritten on a Base recipe edit; `kind` filter and sort; Ingredient guards (delete, merge away, merge into with cycle); a Base recipe named like a plain Ingredient asks first: Yes takes that Ingredient over (re-keyed to `base-recipe:<id>`, all its lines become Base recipe lines), No gives the Base recipe its own Ingredient (`base-recipe:<id>` key); the same ask on a rename to such a name, with No leaving two same-name Ingredients and no key collision; a plain Ingredient of that name can be created after a Yes; name matching never returns a Base recipe Ingredient by the plain key, and the picker and Import Review offer both; a Base recipe named like another Base recipe's or a Ready Meal's Ingredient is refused (`base_recipe_name_taken`, `ready_meal_name_taken`); saving a Recipe as a Ready Meal, or renaming a Ready Meal, to a name a Base recipe holds is `422 base_recipe_name_taken` (and `ChooseReadyMealIngredient` does not create a same-name plain Ingredient); to-plannable with a plain Ingredient of that name is `409 ingredient_name_taken`. **Link a line** (§3.7): re-point keeps quantity, unit, optional and note and remembers the old Ingredient; an unconvertible unit answers the `UnknownUnitError` shape; a cycle is `422`; `create` and `convertRecipeId` variants (the latter with the to-base effects, one transaction); `line_not_plain` / `line_not_base`; unlink restores the old Ingredient and clears Needed at; unlink after that Ingredient was merged (column rewritten) or deleted (needs `ingredientId`); the editor PUT path does the same. **Bulk link** (§3.8): candidates are same-key plain lines on other Recipes, archived ones included, never the Base recipe itself; unconvertible and cycle lines come back `linkable: false` with a reason; `link` is all or nothing and refuses a non-candidate line id; `mergeOffer` lists only Ingredients left on no line; `unlink` reverses a bulk link; nothing is linked by create or to-base alone.

**Go, wiring** (BR-F, BR-G): the planner never places a Base recipe; Exclusion of milk inside béchamel excludes lasagne; Exclusion of Béchamel excludes lasagne and Review Exclusions names it; Advance Step of a Base recipe blocks a too-late cell; Shopping List: jar covers part, the rest's Ingredients only, nested, past-meal hint on child lines, empty Base recipe listed as itself (pure `shopping` tests plus a wiring test); Cooked deducts the jar first then the made part; Used from on the Base recipe Ingredient; Mark all Cooked sharing one jar across Courses; cook timeline with labels; covered block hidden; timers on a Base recipe Step; Start cooking reminder earlier by the Base recipe's time.

**Go, import** (BR-C): schema accepts the new fields and an old file unchanged (`spec_test.go`); `check.go` rules; export includes Base recipes transitively and round-trips; review rows from a model mark and from a name match only; an import line named like a Base recipe (and a plain Ingredient of that name) gets the tile with both answers and Keep it as an Ingredient, the exact match preselected on the Base recipe; each decision's commit (use, file, create, convert, keep); convert inside the commit transaction; cycle at Confirm; replace keeps id and Ingredient. Recipe Assistant: `OutputSchema` golden; `pruneNone` on `recipe: null`, `cue: ""`, `yieldUnit: ""`, `neededAtStep: null`; prompt golden; the fake-anthropic fixture end to end (read → review with a tile).

**Web unit (vitest)**: `lib/baseRecipe.ts` (fields shown per kind, line label "500 ml Béchamel (Base recipe)", Needed at options), list kind in the URL, `IngredientSelect` badge, `lib/baseRecipeLines.ts` (answers, Confirm blocked), `lib/baseSteps.ts`; `lib/baseRecipes` (`pickerRows`: name matches first, new-Base-recipe row, plannable group, self and archived left out, cycle rows disabled; `linkCandidateRows`: nothing ticked at first, disabled rows with reasons, the Link N count; `mergeOffer`); components for the tile, the convert dialog, the Needed at menu, the line menu actions, `BaseRecipePicker`, `LinkCandidatesSheet` and its merge step, the Undo Toasts, Cook Mode chips. Plus the whole-suite run and `scripts/check-ui.sh` (rule 6 for the new strings).

**BDD (Gherkin)**, `bdd/features/recipes/base-recipes*.feature`, `planning/`, `shopping-scan/`, `cook-board/`, `import-export/`, `recipe-assistant/`:

- Recipe editor: mark a Recipe as a Base recipe with Yield 1 l; call for 500 ml of it in Lasagne; the detail reads "500 ml Béchamel (Base recipe)" and links to it; a cycle is refused with "Béchamel calls for Roux, which calls for Béchamel".
- Planning: a Base recipe is never planned and cannot be chosen for a Course; Sam excludes milk, so Lasagne is not planned for a Course Sam eats; Review Exclusions names milk.
- Shopping: with a 300 ml jar of Béchamel in the Pantry, the list asks for the Ingredients of 200 ml only; with 600 ml, nothing for Béchamel.
- Cooked: marking Lasagne Cooked takes the jar first and the rest from milk, butter and flour.
- Cook Mode: Béchamel's Steps are labelled and end before "Layer the lasagne"; with a full jar they are not shown.
- Import Review, one scenario per answer: use an existing Base recipe; use one from this import; add it as a new Base recipe (Fill in later, Read it next); choose a plannable Recipe and confirm turning it into a Base recipe; cancel that confirm; keep it as an Ingredient; Confirm waits while a line has no answer.
- Recipe File round trip of Lasagne with Béchamel and Roux.
- Link a line (BR-B API, BR-D web), `bdd/features/recipes/base-recipe-link.feature`: on Lasagne's detail, "500 ml béchamel" is linked to the Base recipe Béchamel and then reads "500 ml Béchamel (Base recipe)" with 500 ml kept; the picker lists Béchamel first when searching from that line; linking adds a new Base recipe named from the line; choosing the plannable Recipe Pesto asks to turn it into a Base recipe, and Cancel links nothing; Undo, and later **Use as a plain Ingredient**, bring back the plain béchamel line; a link that would make a cycle is refused; Sam's Exclusion of milk now rules Lasagne out after the link.
- Bulk link (BR-B API, BR-D web, BR-E after import), `bdd/features/recipes/base-recipe-bulk-link.feature`: marking Béchamel as a Base recipe offers "3 Recipes use an Ingredient named béchamel" with nothing ticked; Not now links nothing and the list stays on Béchamel's detail; ticking 2 links exactly those 2; a line in cups is listed but cannot be ticked; after linking the last one, Feeder offers to merge béchamel into Béchamel and Keep it leaves it; Merge moves its Stock Lot; a Base recipe created by Import Review gets the same offer after Confirm.

## 17. Follow-ups

- **BR-C: `baserecipe.MatchReference`.** Import Review (`internal/recipefile/base_review.go`) matches names with its own `refKey` and `accentFold`, which duplicate BR-A's `MatchReference` normalisation. Switch to `baserecipe.MatchReference` and drop the copies once BR-A merges into this line.
