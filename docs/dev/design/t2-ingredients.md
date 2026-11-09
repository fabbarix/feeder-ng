# T2 ingredients: design

Scope: functional-spec §5 *Ingredient*, recipe-file.md *Ingredients* / *Units*. Contract: [../architecture.md](../architecture.md), foundation: [t0-foundation.md](t0-foundation.md). Unit maths (`units.NormalizeName`, `NormalizeUnit`, `Factor`, `ToBase`, `Base`, `Conversion`) comes from `internal/units` (team T4); this team **imports** it and never copies it. **The branch compiles only after T4 is merged in** (the PM merges main with T4 before the Developer starts).

## Decisions taken
- **Identity** is `units.NormalizeName(name)` (`name_key`, UNIQUE). The display `name` keeps its case; whitespace is trimmed/collapsed. Rename and re-casing keep the row id, so every reference survives.
- **Everyone signed in** can manage Ingredients (all routes `r.User`).
- **Base Unit** changes only while nothing references the Ingredient (else `409 in_use`): quantities elsewhere are stored in it and cannot be converted between g, ml and piece.
- **Delete** is refused while referenced (`409 in_use`).
- **Merge direction**: `POST /api/ingredients/{source}/merge {into: target}`; the target keeps its id and name, the source is deleted. Different Base Units block the merge (`base_unit_mismatch`, not resolvable; change the unreferenced one's Base Unit first). Same-Unit conversions with different `toBase` (relative 1e-9) and two different Shelf Lives are **conflicts**; none is auto-resolved. The caller answers every conflict (any valid value, including "no Shelf Life"), else `409 merge_conflicts` and nothing changes. Equal conversions merge silently.
- **References hook** (the way later teams plug in): `store.ReferenceMover { Name; Count(ctx, q, id); Move(ctx, tx, from, to) }`, registered with `store.RegisterMover(m)` from the owning store's `init()`. Merge runs all movers in the merge transaction (one failure rolls everything back); Delete, Base Unit change and the Ingredient page use `Count`. Optional `store.UnitGuard.UnitInUse` vetoes removing a Unit Conversion a mover still uses (recipe lines in "clove"). Movers must handle uniqueness collisions themselves (e.g. Stock Lots simply re-point; a duplicate Exclusion is dropped). Recipe lines (T3), Products (T5), Stock Lots, shopping extras, Exclusions, planner pins must each register one. BDD registers a stand-in (`bdd test references`).
- **Fuzzy search** (pure, `ingredient.Search`): exact = same normalised key. Suggestions score >= `MinScore` 0.6 from whole-string edit distance, token-order-insensitive comparison, per-token plural folding (tomatoes/tomato, thighs/thigh, strawberries/strawberry) and token containment (olive oil in extra virgin olive oil; basmati in basmati rice). Ordered score desc then name; default limit 5.
- Conversions are entered in the metric Base Unit even when the display is imperial (the stored value is metric; display only converts).
- Events: the store publishing is left to the Developer: topic `ingredients` with `{id}` on any change (optional, SPA invalidates `['ingredients']`).

## Data (migration `0200_ingredients.sql`)
`ingredients(id, name, name_key UNIQUE, base_unit CHECK g|ml|piece, shelf_life_days NULL CHECK >=1, created_at, updated_at)`; `ingredient_conversions(ingredient_id -> ingredients ON DELETE CASCADE, unit, to_base REAL > 0, PRIMARY KEY(ingredient_id, unit))`, unit stored via `units.NormalizeUnit`. Timestamps RFC 3339 UTC from the injected clock.

## API (JSON camelCase; errors `{"error":{"code","message"}}`)
Ingredient = `{id, name, baseUnit, shelfLifeDays|null, conversions:[{unit,toBase}] (sorted by unit)}`.

| Route | Result |
|---|---|
| `GET /api/ingredients[?q=]` | array ordered by normalised name; `q` filters by normalised substring |
| `GET /api/ingredients/search?q=&limit=` | `{exact: Ingredient\|null, suggestions:[{ingredient, score}]}`; blank q -> empty |
| `POST /api/ingredients` `{name, baseUnit, shelfLifeDays?, conversions?}` | 201 Ingredient; 400 `invalid_ingredient` / `bad_request`; 409 `name_taken` |
| `GET /api/ingredients/{id}` | Ingredient + `references: {<mover name>: count}` (only counts > 0); 404 `not_found` |
| `PATCH /api/ingredients/{id}` `{name?, baseUnit?, shelfLifeDays? (null clears)}` | 200 Ingredient; 409 `name_taken`, `in_use` |
| `PUT /api/ingredients/{id}/conversions/{unit}` `{toBase}` | 200 Ingredient (add or replace) |
| `DELETE /api/ingredients/{id}/conversions/{unit}` | 200 Ingredient; 409 `in_use` if a UnitGuard vetoes |
| `DELETE /api/ingredients/{id}` | 204; 409 `in_use` |
| `GET /api/ingredients/{id}/merge-preview?into=` | `{source, target, blocked:""\|"base_unit_mismatch", conversions, shelfLifeDays, conflicts:[{kind:"conversion"\|"shelfLife", unit, source, target}], sourceReferences, targetReferences}` |
| `POST /api/ingredients/{id}/merge` `{into, resolutions?:{conversions?:{unit:toBase}, shelfLifeDays?: n\|null}}` | 200 surviving Ingredient; 400 `merge_self`; 404; 409 `base_unit_mismatch`, `merge_conflicts` |

`shelfLifeDays` present-but-null in `resolutions`/`PATCH` means "none" (distinguish from absent: decode into a presence-aware type).

## Go layout
- `internal/ingredient` (pure; imports `internal/units`): `Ingredient`, `Input.Validate`, `DisplayName`, `ValidationError`/`ErrInvalid`; `Search`, `Similarity`, `Candidate`, `Suggestion`, `Result`, `MinScore`; `PlanMerge`, `MergePlan`, `Conflict`, `Resolution`, `Merged`, `MergePlan.Apply`, `UnresolvedError`, `ErrBaseMismatch`. Tests: `ingredient_test.go`, `search_test.go`, `merge_test.go`.
- `internal/ingredient/store`: `Store` (`Create Get ByName List Search Update SetConversion RemoveConversion Delete References MergePreview Merge`), `Patch`/`ShelfLifePatch`, errors `ErrNotFound ErrNameTaken ErrInUse ErrMergeSelf`, `ReferenceMover`, `UnitGuard`, `Movers`, `RegisterMover`. `Movers` is already complete (trivial). Tests: `store_test.go` (temp SQLite, fake mover).
- `internal/ingredient/httpapi` (`app.Register("ingredients")`) and `internal/modules/ingredients.go`. Error mapping: `ErrInvalid`->400 `invalid_ingredient`, `ErrNameTaken`->409, `ErrInUse`->409, `ErrNotFound`->404, `ErrMergeSelf`->400, `ErrBaseMismatch`->409 `base_unit_mismatch`, `*UnresolvedError`->409 `merge_conflicts`.
- BDD: `bdd/features/ingredients/{ingredients,ingredient_search,ingredient_merge}.feature`, steps in `bdd/steps_ingredients_test.go` (`RegisterSteps("ingredients")`, step text all about "Ingredient").

## Frontend
- `web/src/lib/units.ts`: `formatQuantity(amount, base, system)`, `baseUnitLabel`, `formatConversion`, constants; rules in its doc comment (metric never promotes to kg/l; imperial g -> oz / lb+oz; ml -> tsp / tbsp / fl oz / cups; pieces unchanged). It takes `UnitSystem` as a parameter.
- `web/src/features/ingredients/`: `index.ts` (routes `/ingredients`, `/ingredients/:id`; one **menu** nav item "Ingredients", no bottom-bar item), `api.ts`, `types.ts`, `strings.ts`, `lib/{names,conversionForm,mergeResolution}.ts`, `hooks/{useIngredients,useIngredient,useIngredientForms,useMergeFlow,useDisplayUnitSystem}.ts`, `components/{IngredientList,NewIngredientSheet,ConversionEditor,ShelfLifeEditor,MergeConflictList,MergeSheet}.tsx`, `screens/{IngredientsScreen,IngredientScreen}.tsx`.
- Built from shared primitives only: `Tile`/`BentoGrid` (list + Ingredient page tiles: Base Unit, Shelf Life, Unit Conversions, Merge/Delete), `Chip` (Base Unit, Shelf Life, selecting g/ml/piece), `BottomSheet` (New Ingredient, Merge, delete confirm), `Button`, `EmptyState`, `Toast`.
- `useDisplayUnitSystem` is the single seam for T1's metric/imperial preference (returns `'metric'` until T1 merges; the PM/Developer swaps in the preference hook).
- Hooks (react-query) hold fetching and cache invalidation (`['ingredients']`, `['ingredients', id]`); the merge answers state and request building are in `lib/mergeResolution.ts`; components only render and wire.
- Reachable from the avatar menu ("Ingredients"). Later teams link to `/ingredients/:id`; Import Review and the scan sheet reuse `ingredientsApi.search`.
