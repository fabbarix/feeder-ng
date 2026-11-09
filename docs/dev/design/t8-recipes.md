# T8 recipes: design

Scope: functional-spec §4, recipe-file.md (Recipes, Steps and timing, Images), GLOSSARY Recipe / Yield / Ready Meal / Step / Passive Step / Advance Step / Tag / Favourite / Dislike / Exclusion / Cool-down / Use-by. Contract: [../architecture.md](../architecture.md), foundation [t0-foundation.md](t0-foundation.md). Imports `internal/units` and `internal/recipe/schedule` ([t4-domain-libs.md](t4-domain-libs.md)); never copies them. Depends on T2 (Ingredients, `ReferenceMover`, migration 0200) and T1 (Members, migration 0100). **Store tests, mover registration and the BDD scenarios only run after main contains T1 and T2** (the PM syncs the branch before the Developer starts). Copy Agent Prompt, import and export belong to a later team; the Recipes screen leaves a slot (`strings.copyAgentPromptSlot`, an empty `<div data-slot="agent-prompt">` next to the "New Recipe" button).

## Decisions taken
- **Everyone signed in** may create, edit, archive and delete Recipes and edit any Member's preferences (all routes `r.User`). A User's linked Member (`members.user_id`) is the default target; a body `memberId` names another (kids have no sign-in). No linked Member and no `memberId` -> 422 `no_member`; unknown Member -> 422 `unknown_member`.
- **One state per (Member, Recipe)**: `favourite | dislike | exclusion | none` (a Favourite cannot also be an Exclusion). Setting replaces; `none` clears. Ingredient Exclusion is a separate per-Member flag. Archiving keeps preferences.
- **Validation order**: field errors first, then unit convertibility (so a typo beats a prompt). Only the first problem is reported. Field errors are 422 `validation_failed` with `error.field` (path like `lines[2].quantity`, `steps[1]`, `tags[0]`) and `error.reason` (code from `recipe.Code*` or `schedule.Code*`). An unconvertible unit is 422 `unknown_unit` with `error.{field, ingredientId, ingredient, unit, baseUnit}`; the editor shows the inline Unit Conversion prompt, saves it with `PUT /api/ingredients/{id}/conversions/{unit}`, then resubmits. Extra keys inside `error` are carried to the SPA by `ApiError.details` (small shared change in `web/src/lib/http.ts`, done by the Designer, with a test).
- **Limits** (not fixed by the spec): name 1-100 runes; description <= 4000; Yield in (0, 100], fractions allowed; <= 20 Tags of <= 40 runes; Cool-down 0-365, Use-by 0-30 (`0` = same day; both stored NULL = household default, so `0` and blank differ); line quantity > 0; note <= 200; Step text 1-2000; minutes <= 10080; `source.url` http(s) only. At least one ingredient line (schema `minItems: 1`). The same Ingredient may appear on several lines.
- **Tags** are household-defined, created on first use, matched by `recipe.TagKey` (lower case, trimmed, collapsed); the first spelling is kept. A Tag stays when no Recipe uses it (Slot Rules may refer to it).
- **Ready Meal** = `readyMeal: true` with exactly one line (`ready_meal_lines`); Steps optional.
- **Timing** is recomputed on every save from `schedule.Compute` and cached in `recipes.total_minutes / advance_minutes` for the list; the detail reads Steps and recomputes. Advance Steps are returned separately (`advance`, `advanceMinutes`).
- **Hard delete** asks every registered `store.PlannedChecker` (planning registers one later: `store.RegisterPlannedChecker(name, checker)` from its `init()`); none registered = never planned. Planned -> 409 `already_planned`. Delete cascades lines, Steps, uses, Tag links, preferences; Tags remain.
- **Images** (`internal/imaging`): upload `POST /api/images` as JSON `{"dataUrl": "data:image/...;base64,..."}` (the Recipe File form, exactly `data:image/(jpeg|png|webp);base64,`; multipart is refused by the CSRF guard, so no multipart), accept JPEG/PNG/WebP only (GIF is dropped, as in recipe-file.md), scale so the longest side is <= 1600 px (never upscale), encode lossless WebP with `nativewebp`, store `FEEDER_DATA_DIR/images/<32 hex>.webp`; the request body is capped at 16 MB, the decoded photo at 8 MB. `GET /api/images/{id}` is behind `RequireUser`, `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=31536000, immutable` (ids are never reused). > 8 MB (decoded) -> 413 `image_too_large`; undecodable, a type other than jpeg/png/webp, or a format that differs from the declared type -> 422 `unsupported_image`; a decompression bomb -> 422 `image_too_large_pixels` (see below). Recipes and Steps store the image id; unknown id -> 422 `validation_failed` field `image` / `steps[i].image`. Files no longer referenced after a save or delete are removed best-effort. EXIF orientation is not applied in v1 (known limit).
- **Ingredient references**: the store registers two `ingredient/store.ReferenceMover`s from `init()`: `"recipe lines"` (lines + Step uses; also implements `UnitGuard`: a unit written on a line or use vetoes removing that Unit Conversion) and `"ingredient exclusions"` (Move drops a duplicate when the Member already excludes the target).
- **IngredientSource**: the store needs `units.Ingredient` for validation through the small interface `store.IngredientSource`; `httpapi` adapts T2's ingredient store (`Get` -> `ingredient.Ingredient.Units()`, T2 `ErrNotFound` -> ok=false).
- Events: writes publish topic `recipes` `{"id":n}` (SPA invalidates `['recipes']`, `['tags']`); preference writes publish `recipes` with `{"preferences":memberId}`.

## Data (migration `0300_recipes.sql`, written in this commit)
`recipes`, `tags(key UNIQUE, name)`, `recipe_tags(position)`, `recipe_lines`, `recipe_steps(PK recipe_id+position, after_json)`, `recipe_step_uses`, `member_recipe_preferences(PK member_id+recipe_id, state)`, `member_ingredient_exclusions(PK member_id+ingredient_id)`. Quantities are stored as typed (value + normalised unit), converted to Base Units at use time. References `ingredients` (0200) and `members` (0100).

## API (JSON camelCase; errors `{"error":{"code","message",...}}`)
Recipe = `{id, name, description, yield, readyMeal, tags[], cooldownDays|null, leftoverUseByDays|null, source:{url,attribution}, image, imageUrl, archived, lines:[{ingredientId, ingredient, quantity, unit, optional, note}], steps:[{text, kind, durationMinutes, leadTimeMinutes, after[], uses:[{ingredientId,quantity,unit}], image, imageUrl}], totalMinutes, advanceMinutes, advance:[{step, leadTimeMinutes}], createdAt, updatedAt}`. `imageUrl` is `/api/images/<id>` or `""`. Summary = `{id, name, yield, readyMeal, tags, imageUrl, archived, totalMinutes, advanceMinutes}`.

| Route | Result |
|---|---|
| `GET /api/recipes[?q=&tag=&archived=no\|yes\|all]` | Summaries by name (case-insensitive); default active only |
| `POST /api/recipes` | 201 Recipe; 422 `validation_failed` / `unknown_unit` |
| `GET /api/recipes/{id}` | Recipe; 404 `not_found` |
| `PUT /api/recipes/{id}` | 200 Recipe (full replace, archived flag kept); 404; 422 |
| `POST /api/recipes/{id}/archive`, `/unarchive` | 200 Recipe (idempotent) |
| `DELETE /api/recipes/{id}` | 204; 404; 409 `already_planned` |
| `GET /api/tags` | `[{name, recipes}]` by name |
| `POST /api/images` | 201 `{id, url, width, height}`; 413; 422 |
| `GET /api/images/{id}` | the WebP; 404 |
| `GET /api/recipe-preferences[?memberId=]` | `{memberId, recipes:{"<id>":"favourite"\|"dislike"\|"exclusion"}, excludedIngredients:[ids]}` |
| `PUT /api/recipes/{id}/preference` `{state, memberId?}` | 200 same shape; 422 `validation_failed` (bad state), `no_member`, `unknown_member`; 404 |
| `PUT /api/ingredient-exclusions/{ingredientId}` `{excluded, memberId?}` | 200 same shape; 404 |

## Go layout
- `internal/recipe` (pure): `Input.Validate(IngredientLookup)`, `TagKey`, `TimingOf`, `ParseState`, types `Recipe Summary Line Step Use Source State Timing`, `ValidationError` (`ErrInvalid`), `UnknownUnitError` (`ErrUnknownUnit`). Tests `recipe_test.go`.
- `internal/imaging` (no HTTP): `ScaledSize`, `Process`, `Store` (`Save Open Delete`, `ValidID`). Tests `imaging_test.go`, `store_test.go`.
- `internal/recipe/store`: `Store` (`Create Get Update List SetArchived Delete Tags SetRecipeState SetIngredientExclusion Preferences MemberForUser`), `IngredientSource`, `PlannedChecker`/`PlannedCheckers` (implemented now; trivial), movers (Developer). Tests `store_test.go`, `planned_test.go`, `mover_test.go`.
- `internal/recipe/httpapi` (module `recipes`) + `internal/modules/recipes.go`. Currently a stub answering 501.
- BDD: `bdd/features/recipes/{recipes,recipe_units,recipe_archive,recipe_images,recipe_preferences}.feature`, steps `bdd/steps_recipes_test.go` (`RegisterSteps("recipes")`; registers a stand-in `PlannedChecker` and uses the Ingredients and Members HTTP APIs of T1/T2 for fixtures; JSON placeholders `<id:flour>`, `<image:last>`).

## Frontend (`web/src/features/recipes`)
- `index.ts` routes `/recipes`, `/recipes/new`, `/recipes/:id`, `/recipes/:id/edit` (Recipes is a fixed bottom-bar item; no navItem).
- `lib/` (pure, tested): `time.formatMinutes`, `tileArt` (initial + Tag icon + stable accent tone), `lineUnits` (units picker/feedback mirror of recipe-file.md), `steps` (insert/remove/move/changeKind with `after` remapping, `afterOptions`), `draft` (form state <-> API body, `parseNumber`, `validateDraft`), `unitPrompt` (reads `unknown_unit` details), `preference` (`nextState`).
- `hooks/`: `useRecipes`, `useRecipe`, `useRecipeEditor` (client + server validation, Unit Conversion prompt flow), `useRecipePreferences`. All fetching and cache invalidation lives here and in `api.ts`.
- `components/` (render + wire only, from `ui/` Tile, BentoGrid, Chip, BottomSheet, Button, EmptyState): `RecipeTile` (photo or generated tile; total time; "+4 h advance" Chip), `UnitConversionPrompt` (BottomSheet), `PreferenceToggles` (Chips with aria-pressed), `StepsEditor`, `IngredientLineRow` (Ingredient search via `recipesApi.findIngredients`, unit select from `selectableUnits`), `PhotoPicker`, `TagInput`, `TagChips`, `RecipeDetailsFields`, `IngredientLinesList` and `StepsList` (detail view; quantities via `lineUnits.quantityText` in the User's display system). Hooks added: `useIngredientRefs` (['ingredients']), `useIngredientSearch`, `usePhotoUpload`, `useRecipeLiveUpdates`.
- `screens/`: `RecipesScreen` (BentoGrid of RecipeTiles, search, Tag Chips, archived toggle, the agent-prompt slot), `RecipeDetailScreen` (tiles: photo, total time + Advance Steps, Yield, ingredient lines, Steps, preference toggles, per-line Ingredient Exclusion toggle, archive/delete), `RecipeEditorScreen`.
- `strings.ts` holds all copy; glossary words only.

## Shared files touched
`web/src/lib/http.ts` (+ `http.test.ts`): `ApiError.details`. Nothing else outside the owned paths; `go.mod` already has nativewebp and `golang.org/x/image` (the latter is marked `// indirect`; `go mod tidy` will fix it once code imports it directly).


## Image safety (review items)

- **Decompression bombs.** `imaging.Process` runs `image.DecodeConfig` on the bytes first and refuses (`ErrTooManyPixels`, HTTP 422 `image_too_large_pixels`) when the longest side is > `MaxSidePixels` (12000) or width x height > `MaxPixels` (50 000 000). Only then does it call the full decode, so a tiny file declaring 30000x30000 is refused fast and without allocating. Constants and the error exist as stubs in `internal/imaging/imaging.go`; `internal/recipe/httpapi` maps the error.
- **Declared type.** `ProcessDataURL` accepts only `image/jpeg`, `image/png` and `image/webp` as the declared type, and the format `DecodeConfig` reports must equal it (a PNG declared as jpeg -> `ErrUnsupportedFormat`). GIF is neither registered nor accepted (`Process` on a GIF is `ErrUnsupportedFormat`). The message becomes "That is not a JPEG, PNG or WebP image".
- Tests: `internal/imaging/imaging_test.go` (bomb PNG built with zlib, time and allocation bounds, declared-type table) and the scenarios in `bdd/features/recipes/recipe_images.feature`.

## Editor draft operations (no logic in components)

Pure functions, unit-tested, called only from `useRecipeEditor` (which wraps `setDraft`); `RecipeEditorScreen` and `StepsEditor` just render and call the hook's callbacks.

- `lib/draft.ts`: `newLineDraft()`, `addLine(draft)`, `updateLine(draft, key, patch)`, `pickIngredient(draft, key, ingredientRef)` (sets id, name and unit = Base Unit, keeps quantity/optional/note), `removeLine(draft, key)`. All return new drafts, never mutate, leave untouched lines as the same objects.
- `lib/steps.ts`: `newStepDraft()` (blank Active Step, fresh key), `toggleAfter(steps, i, j, on)` (dedupes and sorts ascending, same objects for other Steps).
- Tile icon key `dish` is renamed `plate` (GLOSSARY); `tileArt.ts` and the `TagIcon` type follow.
