# R14 Recipe editor features: quick-create Ingredient, Ready Meal Ingredient, New Ingredient sheet

Spec: [functional-spec.md](../../spec/functional-spec.md) sections 4 and 5, [recipe-file.md](../../spec/recipe-file.md), [GLOSSARY.md](../../../GLOSSARY.md) (Ready Meal),
[ui-review-2.md](../../design/ui-review-2.md) F-09 (High), E-01, L-02 and the R2-1 list, [wp9-recipes-import.md](wp9-recipes-import.md) (G2 inline Unit Conversion).
Scope: `web/src/features/recipes/**`, `web/src/features/ingredients/components/NewIngredientSheet.*`, `ingredients/{strings.ts,ingredients.css,lib/newIngredient.ts}`,
`web/src/ui/Select/IngredientSelect.tsx` (+ the create row in `Select`/`SelectPanel`/`buildList`), `internal/recipe` (Ready Meal rule), `internal/recipefile` (Import Review), spec and GLOSSARY.
This note is the Designer step: tests, copy, spec and type-only stubs. The Developer makes the red tests green.

## Findings that shaped the design

1. **The picker already has most of it.** `IngredientSelect` takes `onCreate` and `Select` appends `Create Ingredient "<query>"` (`buildList`: only when the query is non-empty and no label equals it after `normalise`). Missing: the screen never passes `onCreate`; whitespace inside a name is not collapsed in `normalise` comparisons ("crème   fraîche" must count as an exact match); no disabled-with-reason row. Copy keeps the existing typographic double quotes (`Create Ingredient "saffron"`), which `DomainSelects.test` already pins; the brief's single quotes are not used.
2. **Near duplicates: the matcher is server side** (`internal/ingredient/search.go`, used by Import Review's `classify` and by `GET /api/ingredients/search`, wire `{exact, suggestions[{ingredient, score}]}`, `ingredientsApi.search`, min score 0.6). The sheet calls that endpoint, so quick create and Import Review cannot disagree. A BDD scenario pins the parity.
3. **The editor is online-only.** The service worker never caches or queues `/api/*` (`sw/cache.ts`: `api` is network only); only Scans queue offline (spec 10.3). Saving a Recipe offline already fails, so inline Ingredient creation is online-only too: the option is shown **disabled with the reason** "Needs a connection to create an Ingredient" (`useConnectivity` / `navigator.onLine`). No offline queue is added.
4. **`reheatMinutes` already has `minimum: 1, maximum: 30`** in `docs/spec/recipe-file-v1.schema.json` (R12) and `internal/recipefile/reheat_test.go` pins 0, -1, 31, 2.5 and "four" as schema errors. Requirement 4 is satisfied; nothing to change.
5. **BDD is API-level only** (`bdd/` runs Gherkin against the in-process server; there is no UI runner, and `registry_test.go` is T0-owned). The server-side scenarios are real Gherkin; the editor scenarios ("the draft survives creating an Ingredient", ...) are written as vitest screen tests whose titles carry the scenario wording (`RecipeEditorScreen.quickCreate.test.tsx`), and are listed under "Acceptance scenarios" below.
6. **The Ready Meal data model already exists** (`recipes.ready_meal`, `readyMeal` in API and Recipe File; validation `ready_meal_lines`: exactly one line). GLOSSARY: "a Recipe made from exactly one Ingredient (a bought pack)". What was missing is who creates that Ingredient.

## Decisions

### D1 Quick create (the picker, the nested sheet, the draft)
- `IngredientLineRow` gets `onQuickCreate(query)`, `quickCreateDisabledReason`, `focusAmount`/`onAmountFocused`. It passes `onCreate={onQuickCreate}` and `createDisabledReason` to `IngredientSelect`. No create row without `onQuickCreate` (other callers: AddLotSheet, ExtraSheet, StepsEditor keep today's behaviour).
- The **nested sheet is the existing `NewIngredientSheet`**, opened by the screen from `useQuickCreateIngredient` (`request: {lineKey, query, unit}`). It is a second `<dialog>` over the editor page, so there is **no navigation and the draft (state of `useRecipeEditor`) is never unmounted or touched**: open, cancel and a failed create change nothing.
- On success `useQuickCreateIngredient.select(ingredient)` calls `pick(lineKey, IngredientRef)` (= `editor.pickCreatedIngredient`), closes the sheet and sets `focusLineKey`; the row focuses its Quantity field once (`focusAmount`), then `amountFocused()`.
- `pickCreatedIngredient` **keeps the unit the line already has** (the Ingredient was made to fit it; Base Unit only when the unit was empty). `needsConversion(unit, ingredient)` then shows the existing hint and **Save runs the existing G2 flow** (`parseUnknownUnit` -> `UnitConversionPrompt`). No second prompt implementation; the sheet is not asked to collect conversions.
- Sheet inputs from the line: `initialName = query`, `unitHint = line.unit` -> `defaultBaseUnit(unit)`.
- **Did you mean**: `NewIngredientSheet` runs `findSimilar(name)` (default `ingredientsApi.search`) on the first Create press. `duplicateGuard`: exact -> "Garlic already exists" + `Use Garlic` (no create-twin button); suggestions -> "Did you mean Garlic?" with `Use <name>` per suggestion and `Create '<typed>' anyway` (second submit skips the lookup); none or a failed lookup -> create. `onUseExisting` (quick create: `select`) closes the sheet. The Ingredients screen passes none, so the rows only warn there (its create button stays "anyway" only).
- Offline: `disabledReason` disables the sheet's Create too (belt and braces if connectivity drops while it is open).

### D2 Ready Meal and its Ingredient
Rule (spec 4): the Ready Meal's single line is the Ingredient **named like the Recipe**: existing same normalised name (`units.NormalizeName`) -> use it, never duplicate; none -> create (Base Unit `piece`, no Shelf Life, display name = collapsed spaces, case kept); line = 1 piece. An existing same-name Ingredient counted in g or ml is selected but the quantity is left blank in the editor (the User types the pack size; "1 g" would corrupt Stock maths), and the API answers 422 `ready_meal_unit` instead of inventing a quantity.

**Where it runs.** Creation is **deferred to Save and done by the server**, so cancelling an edit never leaves an orphan Ingredient and the Ingredient and Recipe are written in one transaction.
- **Domain** (`internal/recipe/readymeal.go`, pure, tested): `NeedsReadyMealIngredient(Input)` (Ready Meal, no lines), `ChooseReadyMealIngredient(name, []ReadyMealCandidate) ReadyMealChoice{ReuseID, Create, Conflict, Line}`, `CodeReadyMealUnit`. `Input.Validate` stays strict (derivation happens before it).
- **API** (`internal/recipe/httpapi` + store, thin): on POST/PUT, if `NeedsReadyMealIngredient`: list Ingredients, `Choose...`; `Conflict` -> 422 `validation_failed`, `field: lines`, `reason: ready_meal_unit`; `Create` -> `ingredient store CreateTx` in the same `sql.Tx` as the Recipe (a Recipe that fails validation creates nothing: BDD scenario); then the Recipe saves with the derived line. Developer detail: the recipes store gets the ingredient store (or a small `ReadyMealIngredients` port) injected; `CreateTx`/`ReplaceTx` already take a caller transaction.
- **Import Review** (`internal/recipefile/review.go`): a row used by a Ready Meal's `ingredients[0]`, whose normalised name equals that Recipe's normalised name, not defined in the file and not existing, is `StatusNew` (not `StatusUndefined`) and `createTarget` uses Base Unit `piece` without a definition or decision. Existing same name -> `StatusExact` as today (a guard test). A line named differently (the spec example's "lasagne ready meal" is defined in the file) and any normal Recipe behave as before (guard tests). Agent Prompt rule 7 is **not** edited here (its golden file belongs to the Recipe Assistant team); `recipe-file.md` documents the naming and flags it for them: "name that Ingredient like the Recipe".
- **Editor** (`lib/readyMeal.ts`, pure): `readyMealLine(name, ingredients)` -> `none | reuse | create`; `syncReadyMealLine(draft, ingredients)` keeps the draft's one `auto` line in step with `name`, `readyMeal` and the known Ingredients (reuse selects the Ingredient, create makes the **pending line**: `ingredientId: null`, `ingredientName` = display name, `1 piece`, `auto: true`). `useRecipeEditor(recipeId, ingredients)` runs it inside `setDraft` and when `ingredients` change. `LineDraft.auto` is cleared by any User edit (`pickIngredient`, quantity, unit; not note, not optional). A User's own line is never replaced. `draftToInput` sends `lines: []` for a pending line; `validateDraft` accepts it only while `readyMeal` and `auto`.
- **Row**: a pending line renders a read-only summary (name, "New Ingredient" chip, "1 piece", the helper "Feeder adds an Ingredient called '<name>' so you can stock and buy it", Remove, and "Choose another Ingredient" which sets `{auto: false, ingredientName: '', quantity: '', unit: ''}` = an ordinary blank line). A reused Ingredient is an ordinary editable row without helper.
- **Unmarking**: pending line dropped (nothing exists); selected Ingredient stays as an ordinary line with `auto` cleared; the Ingredient is never deleted (also on the server: replacing with `readyMeal:false` and the same line is a plain PUT; BDD pins it).
- **Rename offer**: `renameOffer(before, draft, ingredients)` (stored Ready Meal, still Ready Meal, one line, line Ingredient name has the old Recipe name's key, new key differs, no other Ingredient has the new key). `useRecipeEditor` exposes `renameOffer` (kept after save) and `renameLinkedIngredient()` (`recipesApi.renameIngredient` = `PATCH /api/ingredients/{id}`, existing endpoint, refreshes `['ingredients']`). After a successful `save()` with an offer the screen shows a `ConfirmDialog` "Rename the Ingredient too?" (`Rename Ingredient` / `Keep the old name`) before navigating; a failed rename still navigates (the Recipe is saved) and shows `renameFailed`. The server never renames silently (BDD pins it).

### D3 New Ingredient sheet (F-09)
- Order and spacing: form `ui-stack` with `gap: var(--space-5)` (`.new-ingredient__form`), sections **Name** (TextField, label to control `--space-1` by the field primitive), **Base Unit** (`Segmented`, visible label "Base Unit", helper "How Stock and Shopping Lists count it. It can't change once the Ingredient is used."), **Shelf Life** (`NumberField` label "Shelf Life", `unit="days"`, helper "Leave blank if it keeps."). Space left for the later **picture** (`ImagePicker` + Ingredient `image` field, a later team; the sheet renders nothing for it now and the CSS keeps a `.new-ingredient__picture` slot unused until then).
- Base Unit icons: g `weigh` (Scales, exists), ml `liquid` (Drop), piece `piece` (Cube). **`liquid` and `piece` are new registry keys** (UF1 owns `ui/icons.ts`; bundle headroom ~1.7 kB = ~4 glyphs, so two fit). `baseUnitIcon` is pinned against `icons` keys, red until they land.
- Selected state: not only colour (R2-F `Segmented`: accent fill, on-accent text, check).
- Default: `defaultBaseUnit(unitHint)`, g unless a Recipe line/Scan unit is known (kg/oz/lb -> g; l/dl/cl/tsp/tbsp/cup/fl oz -> ml; piece -> piece; custom unit such as clove -> g). Create is therefore enabled whenever a name is typed; **Create is never disabled for validation**: an empty name shows "Give the Ingredient a name" under the field and focuses it; a bad Shelf Life shows its error; `name_taken` is the Name field's error (not a loose `role="alert"`). Disabled only while saving ("Creating…") or with `disabledReason` (offline).
- Action bar: Cancel (tertiary) then primary Create Ingredient in the sheet's `footer`; right-aligned from 600 px, full width on phone. Until R2-F's `FormActions` exists the Developer uses a plain `Button` pair in a `.new-ingredient__actions` wrapper; the tests only pin order and siblinghood, so switching to `FormActions` is a one-line change.
- Height: content-height (BottomSheet already is on phone; check at 768+ that no empty block follows the actions).

## Component and file map

| File | Status | Notes |
|---|---|---|
| `internal/recipe/readymeal.go` | new (stub) | types, `CodeReadyMealUnit`, `NeedsReadyMealIngredient`, `ChooseReadyMealIngredient` |
| `internal/recipe/httpapi`, `internal/recipe/store` | Developer | derive the line in the Recipe transaction; 422 `ready_meal_unit` |
| `internal/recipefile/review.go` | Developer | Ready Meal same-name default (`classify`, `createTarget`) |
| `docs/spec/{functional-spec,recipe-file}.md`, `GLOSSARY.md` | edited by the Designer | sections 4, 5; readyMeal row; Import Review step 2; Ready Meal term |
| `web/src/features/ingredients/lib/newIngredient.ts` | new (stub) | `defaultBaseUnit`, `baseUnitIcon`, `checkNewIngredient`, `duplicateGuard` |
| `.../components/NewIngredientSheet.tsx` | rewrite | props `initialName`, `unitHint`, `findSimilar`, `onUseExisting`, `disabledReason` (types added); `onCreate` resolves the created Ingredient |
| `.../ingredients/strings.ts`, `ingredients.css` | strings added; CSS Developer | `strings.sheet.*`; `.new-ingredient__{form,section,picture,actions}` on tokens. **Serialise with R2-3 on `ingredients.css`.** |
| `web/src/ui/Select/{IngredientSelect,Select,SelectPanel,buildList,lib}` | Developer | `createDisabledReason` (aria-disabled create row with a second line); collapse inner whitespace in the exact-match test. `Select.css` is also in R2-F's list: keep to a new modifier class or coordinate. |
| `web/src/features/recipes/lib/readyMeal.ts` | new (stub) | `nameKey`, `readyMealLine`, `syncReadyMealLine`, `renameOffer` |
| `.../lib/draft.ts` | stub + Developer | `LineDraft.auto`, `pickCreatedIngredient`; `pickIngredient`/`updateLine` clear `auto`; `draftToInput`/`validateDraft` pending line |
| `.../hooks/useQuickCreateIngredient.ts` | new (stub) | request state, create, select, focus, offline reason |
| `.../hooks/useRecipeEditor.ts` | stub + Developer | 2nd arg `ingredients`; `pickCreatedIngredient`, `renameOffer`, `renameLinkedIngredient` |
| `.../components/IngredientLineRow.tsx` | stub + Developer | props above; pending summary |
| `.../screens/RecipeEditorScreen.tsx` | Developer | wires the hook, the sheet, the rename `ConfirmDialog`; passes `ingredients` to the editor hook |
| `.../recipes/api.ts`, `strings.ts` | done | `renameIngredient`; `quickCreate`, `readyMealIngredient` copy |

## Tests (all red now unless marked guard)

Go: `internal/recipe/readymeal_test.go` (rule, 4 red + 2 guards); `internal/recipefile/readymeal_test.go` (1 red: creates its piece Ingredient and is ready; 5 guards: reuse, file definition wins, differently named stays undefined, normal Recipe untouched, same name with another Base Unit asks the Unit Conversion).
BDD: `bdd/features/recipes/ready_meal.feature` (Ready Meal creates its Ingredient; reuses an existing Ingredient; never invents a pack size; keeps a named line; failed validation creates nothing; replacing reuses; unmarking keeps; renaming does not rename silently) and `bdd/features/import-export/ready_meal_import.feature` (creates on import, reuses on import, differently named needs a definition, normal Recipe never defaults, quick create and Import Review find the same near duplicate); one new step in `bdd/steps_ready_meal_test.go`.
Web: `ingredients/lib/newIngredient.test.ts`, `ingredients/components/NewIngredientSheet.test.tsx` (rewritten: layout, default unit, inline validation, duplicates, offline; the old "disabled until a Base Unit" test is gone by design), `ingredients/ingredients.css.test.ts`, `ui/Select/IngredientSelect.create.test.tsx`, `recipes/lib/{readyMeal,draft.readyMeal}.test.ts`, `recipes/hooks/{useQuickCreateIngredient,useRecipeEditor.readyMeal}.test.tsx`, `recipes/components/IngredientLineRow.quickCreate.test.tsx`, `recipes/screens/RecipeEditorScreen.quickCreate.test.tsx`.

## Acceptance scenarios (wording = test titles)

- *The draft survives creating an Ingredient.* Given a new Recipe "Paella" with a blank line; when I type "saffron" in the Ingredient picker and choose Create Ingredient "saffron"; then the New Ingredient sheet opens with "saffron", the page is still `/recipes/new` and the name is still "Paella"; when I create it, the sheet closes, the line shows Saffron, Quantity has focus and nothing was saved; cancelling instead leaves the line blank and the draft intact.
- *Create Ingredient appears only without an exact match*, as the last option; disabled with a reason offline.
- *Did you mean Garlic?* A close name asks first; "Use garlic" selects it without creating.
- *Unit Conversion prompt reuse.* A line unit that does not convert for the new Ingredient shows "Feeder will ask how much 1 clove is when you save." and Save opens "Unit Conversion needed".
- *Ready Meal creates its Ingredient.* Ticking Ready Meal for "Fish pie pack" shows the pending line and the helper; saving sends no line, the server creates the piece Ingredient (BDD).
- *Ready Meal reuses an existing Ingredient.* "lasagne PACK" selects "Lasagne pack"; no duplicate on the server (BDD).
- *Renaming offers to rename the Ingredient*; *unmarking keeps it*; *import is consistent* (BDD).

## Dependencies

- **R2-F** (`/opt/mrwho/Projects/feeder-ng.worktrees/r2f-fields/docs/dev/design/` has no R2-F note yet; this is what R14 needs, to be matched when it lands): `FormActions` (Cancel + primary, right-aligned from 600 px, full width on phone, usable in `BottomSheet footer`); `Segmented` with a visible label (fieldset reset), an optional **`icon` per option** (`SegmentedOption.icon?: IconName`, rendered `aria-hidden` before the text), a selected state that is more than colour, and `aria-describedby` for its helper; the single focus ring. If R2-F ships without `icon`, the PM serialises a one-line change to `Segmented` (R14 does not edit `ui/fields`). `IngredientSelect`/`Select` edits above overlap R2-F only in `Select.css`.
- **UF1**: registry keys `liquid` (Phosphor `Drop`) and `piece` (`Cube`); `icons.test.tsx` rows are UF1's file, so R14 pins the keys from `newIngredient.test.ts` instead. Nothing needed for g (`weigh` exists).
- **Later**: shared `ImagePicker` (IP1) and an Ingredient `image` backend field for the picture; the Scan "what is this?" sheet may pass `unitHint` and `findSimilar` (R14 does not edit `features/scan`).

## R2-1 items (E-01, L-02, ...) and what waits for R2-L

Not done here, because they need R2-L's `Page`/`StickyActionBar`/layout primitives or R2-F's `FieldRow` and field sizes: **L-02** (`<Page width="default">`, drop the 760 px rule), **E-01** (centred 840 px column with section cards, sticky section index, `StickyActionBar`, Details `FieldRow`, `IngredientLineRow` as one row from 720 px with `xs`/`sm` fields), **E-02**, **E-03**, **D-01**, **D-02**, F-01 adoption in the editor, S-02 (recipes part). The visible "Optional" label (R2-1 decision) is already satisfied (checkbox with a visible label). R14 keeps R2-1 unblocked: the pending-line summary and the quick-create wiring are row-internal and must survive the one-row layout; R2-1 owns `recipes.css` and `RecipeEditorScreen` layout after R14 merges.

## Product questions (defaults chosen, change if wrong)

1. Existing same-name Ingredient counted in g/ml: the editor selects it and leaves the pack size blank; the API refuses with `ready_meal_unit`. Alternative: always require a piece Ingredient and suggest a new one with a different name.
2. Unticking Ready Meal before the first save drops the pending line (nothing exists to keep); after a reuse the line stays. Alternative: keep the pending line as an ordinary new-Ingredient line (more server surface).
3. Quick create "Use <existing>" selects the existing Ingredient and keeps the line's unit; if the unit does not convert, the same G2 prompt appears on save.
4. The Recipe Assistant's Agent Prompt rule 7 should say "name the pack Ingredient like the Recipe" (golden file, RA-owned); until then files that name it differently keep working through their definition.
5. The Scan "what is this?" sheet could adopt `unitHint`/`findSimilar`; left to the Scan owner.
