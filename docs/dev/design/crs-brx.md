# B-RX: the planner records which Exclusions ruled a cell out

Design note for team B-RX. The data model, cap, order and storage rules are in `rx-pt.md` §2 and are not repeated;
this note fixes the test-visible choices and the developer's wiring.

## Types (stubbed in the test commit)
- `planner.ExclusionRecord`, `planner.Unfilled.Exclusions` / `MoreExclusions`, `MaxExclusionRecords` = 8, `MaxExclusionRecipes` = 5.
- `plan.ExclusionRecord` (json `memberId`, `ingredientId`, `recipeIds`, `recipeCount`), `plan.Unfilled.Exclusions` / `MoreExclusions`.

## Developer wiring
1. `evaluate` collects the ids its Exclusion case counts (not reserved Recipes: their `counts` is a throwaway) and returns them; `countExclusion` stays the only counting hook and `tally` reports the hit. The three callers (`state.go` 474 and 636, `planner.go` 47) are updated; Swap discards the slice.
2. `fill` calls `explainExclusions(i, removed)` only when it records `UnfilledNoCandidates` with `elim.Exclusion > 0` (and the cell is not optional: `noFit` drops optional cells, so call it after that check). Other reasons carry `nil` / 0.
3. `explainExclusions` (pure, `explain.go`): for each removed Recipe, for each attendee of `slots[i].Attendance` with Portion Factor above `eps` (Course Attendance is already the cell's), add the Recipe to the Member's direct record if the Member excludes it, and to a (Member, Ingredient) record for every Ingredient line (optional included) the Member excludes. No early exit. Then sort by `RecipeCount` desc, `MemberID`, `IngredientID` (0 first); keep 8, `more` = the rest; each record's ids ascending, first 5, `RecipeCount` = true number. Input maps are never ranged over unsorted.
4. `plan.Reconcile` copies both fields, converting ids to `int64`; empty detail stays `nil`.
5. Store: migration `1430_unfilled_exclusions.sql` (`ALTER TABLE plan_unfilled ADD COLUMN exclusions_json TEXT;`). Value `{"records":[...],"more":N}`; `NULL` when `Exclusions` is empty and `MoreExclusions` is 0. The upsert sets `exclusions_json = excluded.exclusions_json`; `Unfilled(...)` reads it back (`nil` for `NULL`).

## Tests (red)
- `internal/planner/explain_test.go`: Ingredient and direct records, two Members on one Recipe (count once, record twice), direct before Ingredient on equal counts, Ingredient-id tie order, unused Ingredient not recorded, optional line, Portion Factor 0 and absent Members, Course Attendance (Carl out of Side), caps (10 records keep 8 with More 2; 7 Recipes keep the 5 lowest ids), Course fit / Slot Rule / archived / zero Yield / reserved Recipes excluded from records, no detail for a zero count, Advance-Step-only, `no_attendance`, `no_course_recipes`, optional Course (not served), determinism over 20 runs.
- `internal/plan/reconcile_test.go`: `TestReconcileCarriesTheExclusionDetail`.
- `internal/plan/store/store_test.go`: round trip, `NULL` and stale-detail clearing, clear.
- `internal/db/unfilled_exclusions_migration_test.go`: column added, nullable, row unchanged, second run no-op, upgraded equals fresh.
- Golden plans and Swap are covered by the existing tests, which must stay green (Swap returns Placements only, so it cannot carry detail).
