# R12 Reheat

Status: design and red tests (step 1 of the pipeline). Branch `team/r12-reheat`. **Revision 2 (user decisions R3, R4):** a per-Recipe reheat time and a dedicated `reheat` icon; they supersede decisions 3 and 6 below and the Product questions 3 and 4.

## Decision (user)

Revision 2 adds the per-Recipe reheat time and the `reheat` icon (see "Reheat time of a Recipe" below).

When today's hero shows a Planned Meal served from a Leftover, it offers a **Reheat** button. Reheat opens a screen
with a short reheating timer (adjustable), then lets the User mark the meal as done, which consumes the Leftover.
Today the hero shows only the "Leftover from <day>" chip for such a meal.

## What exists today (checked in code)

- `lib/hero.ts` `heroSelection` gives `action: 'leftover'` for any meal with `servedFromLeftover`; `TonightHero` then
  renders only the chip (before the slot time) or `Yes, Cooked` / `Adjust` (after it).
- **Cooked of a Leftover meal already does what is needed.** `runner.Cooked` for a non-fresh meal (`!m.Fresh()`):
  marks the meal Cooked, takes the portions the meal needed off the source Leftover (floor 0), unpins misfits, and
  does **not** touch Stock. Stock was deducted when the source Batch was Cooked, and spec section 6 says Leftover
  meals need nothing. So "updates Stock as Cooked does for Leftover meals" means: Stock is left alone. Reheat reuses
  Cooked unchanged. `OnResolved` (`internal/plan/httpapi`) then calls `CancelScope(meal:<date>/<slot>)`, which deletes
  every timer of that Planned Meal (any state), so the Reheat timer is cancelled exactly as for Cooked (N4).
- The `yes, Cooked` quick path (`useCookFlow.quickCook`) already sends no Leftover portions for `preview.fresh === false`.
- `cook.Service.MealView` returns `ErrNotCookable` (409 `not_cookable`) for a meal with `Batches <= 0`. A Leftover meal
  has no Steps, so Cook Mode (`/cook/meal/...`) cannot open it, and `internal/cook/service/service.go` is off limits
  this round (R11c). Timers do not need it: a free timer with a `meal:` scope is accepted by `StartTimer` without a view.

Conclusion: **no backend change.** The BDD feature below pins the behaviour Reheat depends on.

## Decisions

1. **Name.** "Reheat" is a new verb for an action, not a state, so it is a new GLOSSARY entry (see Docs to apply).
   The meal is still finished with **Mark as Cooked**, because GLOSSARY `Cooked` says `_Avoid_: Done, eaten, completed`.
   The button on the Reheat screen is therefore "Mark as Cooked"; the hero's after-slot-time question stays "Yes, Cooked".
2. **A screen of its own, not Cook Mode.** A Leftover meal has no Steps (above), so a new route
   `/cook/reheat/:date/:slotId` (chromeless: the `/cook` prefix already hides the bars) in `features/cook`. It is
   the "Cook Mode for that Leftover" of the user decision, as a timer-only view. Shared primitives only (`Tile`,
   `Button`, `Chip`, `Icon`, `EmptyState`); the timer face reuses Cook's timer formatting.
3. **Reheating duration.** *(Revision 2)* A Recipe may carry an optional **reheat time**: whole minutes, 1 to 30
   (`reheatMinutes`). Reheat's timer defaults to it when the Recipe has one, whatever the number of portions
   (`defaultReheatSeconds(portions, reheatMinutes)`: `reheatMinutes * 60`). Without one it falls back to the formula:
   `120 s` for one portion, `+60 s` per further portion (fractions rounded up), capped at `600 s`. Either default is
   adjustable by 30 s steps between 30 s and 30 min (`adjustReheatSeconds`) before the timer starts. An unusable value
   (0, negative, NaN, absent, null) means "no reheat time". The formula's 10 minute cap does not apply to a Recipe time.
   No new household setting.
4. **Timer.** A free timer (`step: null`) with label "Reheat", `scope = meal:<date>/<slot>`, created through the
   existing `POST /api/cook/timers`. Free timers do not dedupe by Step, so the hook looks for the meal's existing
   Reheat timer first (`reheatTimerOf`) and never starts a second one; reopening the screen resumes the same timer.
   It syncs between devices and fires the existing alarm like any timer.
5. **Hero rules (`heroSelection`).** `action: 'reheat'` when the hero meal is served from a Leftover and its day is
   `today`; a Leftover meal tomorrow or later stays `'leftover'` (chip only: it may not be marked Cooked yet and
   reheating it today is pointless). Before the slot time the one primary button is `Reheat` (icon `timer`). After the
   slot time the hero asks "<Recipe> cooked?": `Yes, Cooked` (primary) plus `Reheat` (secondary) **in place of `Adjust`**,
   because a Leftover meal has no Leftover portions to adjust.
6. **Icon.** *(Revision 2)* A dedicated Phosphor **`Fire`** glyph is registered as `reheat` in `web/src/ui/icons.ts`
   (per-icon import `@phosphor-icons/react/dist/csr/Fire`, like every other entry; `Microwave` does not exist in the
   installed package). The Reheat button on the Today hero (both the primary and the secondary one) and the Reheat
   screen's tile overline use `reheat`. The `Start timer` and `Resume` buttons keep `timer`/`pause`: they start or
   resume a timer, they are not "Reheat". Bundle impact: **+928 B gz** (64,577 to 65,505 B against the 65,536 B
   budget): **31 B of headroom is left**, so the next glyph must raise the budget (docs/dev/design/wp2-icons.md, the
   script's `BUDGET` and `MIN_MODULES`, which stays valid at 93 modules) or drop an unused glyph.
7. **Reheat then Exit/back.** Exit goes to Today and leaves a running timer running (like Cook Mode: timers are
   household-wide). The meal stays planned and the Leftover untouched. `Cancel timer` deletes the timer and stays on the
   screen. Nothing is consumed until Mark as Cooked.
8. **Mark as Cooked.** One tap: `quickCook(key)` (preview, then `POST .../cooked` with `{}`), success toast "Cooked, nice
   one!", then navigate to Today. On failure the existing error toast shows, the screen stays and nothing changes. The
   developer may make `quickCook` resolve `true`/`false` (or return the result) so the screen knows whether to leave.
   Cooked removes the Reheat timer on the server; the timers query is invalidated by the `timers` SSE topic.
9. **Not a Leftover meal / already resolved.** The screen shows an `EmptyState`: "This Planned Meal is not served from a
   Leftover" or "This Planned Meal has already been cooked or skipped" (existing `cookStrings.notCookable`).

## Flow

```
Today hero (Leftover meal, today)  --Reheat-->  /cook/reheat/:date/:slot
   [Exit] ........................... Today (timer, if started, keeps running)
   time  3:00  [- 30 s] [+ 30 s]      (before start)
   [Start timer]  ->  3:00 counts down   [Pause|Resume] [Cancel timer]
   [Mark as Cooked] -> POST .../cooked {} -> Leftover portions consumed, Stock untouched,
                       meal timers cancelled (OnResolved) -> Today
```

## Reheat time of a Recipe (Revision 2)

One optional integer on the Recipe, **`reheatMinutes`**, 1 to 30, `null`/absent = not set.

| Layer | Change |
| --- | --- |
| Migration | `internal/db/migrations/1220_recipe_reheat.sql`: `ALTER TABLE recipes ADD COLUMN reheat_minutes INTEGER CHECK (reheat_minutes IS NULL OR (reheat_minutes BETWEEN 1 AND 30));`. Existing rows stay NULL. (Test: `internal/db/recipe_reheat_test.go`.) |
| Domain | `recipe.Input.ReheatMinutes *int` (stub already in the tree), `MinReheatMinutes = 1`, `MaxReheatMinutes = 30`, `CodeReheatInvalid = "reheat_invalid"`. `Validate` checks it right after the Use-by override (`leftoverUseByDays`): outside 1..30 gives `ValidationError{Field: "reheatMinutes", Code: "reheat_invalid", Message: "the reheat time must be 1 to 30 minutes"}`; the cleaned Input owns a copy of the pointer. |
| Store | `recipe/store`: `CreateTx`, `ReplaceTx` write `reheat_minutes` (`nullInt`), `getRecipe` reads it, `List` selects it into `Summary.ReheatMinutes int` (0 = none; stub field in the tree). |
| Recipes API | `recipeBody`/`recipeJSON` get `ReheatMinutes *int `json:"reheatMinutes"``; the response always has the key (`null` when not set); the body `input()` copies it. Error 422 `reheat_invalid` with field `reheatMinutes` through the existing validation path. |
| Plan API | `GET /api/plan` meals: `mealOut.ReheatMinutes int `json:"reheatMinutes,omitempty"`` (stub field in the tree), set from a new `table.recipeReheat` (stub field in the tree; `names.load` fills it from `Summary.ReheatMinutes`) **only for a meal served from a Leftover** (`m.From != nil`), omitted when the Recipe has none. The Reheat screen reads it from the plan it already loads. |
| Recipe File | optional `reheatMinutes` on a Recipe: `integer | null`, `minimum 1`, `maximum 30`. Schema already edited (`docs/spec/recipe-file-v1.schema.json`, which also gives the published `/schema/recipe-file-v1.json`), the example gets `"reheatMinutes": 4` on the traybake (already edited). `recipefile.Recipe.ReheatMinutes *int `json:"reheatMinutes,omitempty"`` (stub in the tree); `Build` copies it (`copyInt`), `review.go recipeInput` copies it. |
| Agent Prompt | `docs/spec/recipe-file.md`: a row in the Recipes table and a **rule 12** in the template (exact text under Docs to apply). Rule 11 keeps its text (a test pins `11. Several recipes`). |
| Web | `Recipe`/`RecipeInput.reheatMinutes: number | null`, `RecipeDraft.reheatMinutes: string` (stubs are optional; make them required), `PlannedMeal.reheatMinutes?: number`. |

**Schema versioning decision.** The field is an **additive, optional, backwards compatible change inside Recipe File v1**:
`version` stays `1`, the schema `$id` stays `recipe-file-v1.json`, files without the field remain valid and import
unchanged. Rationale: the format's own rule says a *breaking* change bumps the version; this one breaks nothing for
files. The one-way caveat is documented in recipe-file.md: a Feeder older than this field validates with
`additionalProperties: false` and therefore rejects a file that carries `reheatMinutes`; export writes the key only
for Recipes that have a time, so files from Recipes without one are unchanged. Export then import keeps the time;
Import Review needs no new question (it is a plain Recipe field, so *replace*/*keep both* copy it).

## Other API changes

None for Cook Mode, timers or Cooked. Uses `GET /api/plan` (the meal, its `portions`, `servedFromLeftover` and now
`reheatMinutes`), `GET/POST/DELETE /api/cook/timers`, `POST /api/cook/timers/{id}/pause|resume`,
`GET /api/plan/{date}/{slot}/cook`, `POST /api/plan/{date}/{slot}/cooked`.

## Files (developer)

Stubs and red tests are already in the tree; replace the `throw new Error('R12: ...')` stubs.

| File | Change |
| --- | --- |
| `web/src/features/cook/lib/reheat.ts` | implement `defaultReheatSeconds`, `adjustReheatSeconds`, `reheatTimerOf`, `cookReheatPath` |
| `web/src/features/cook/hooks/useReheat.ts` | implement `useReheat(key, portions)` over `useTimers()` and `lib/reheat` |
| `web/src/features/cook/screens/ReheatScreen.tsx` | the screen (render and wire only); data from `usePlan()` (find the slot by date and slot id), `useReheat`, `useCookFlow().quickCook`, `useNavigate` |
| `web/src/features/cook/strings.ts` | `reheat`, `startTimer`, `pause`, `resume`, `cancelTimer`, `add30`/`remove30` ("Add 30 seconds", "Remove 30 seconds"), `notALeftover` |
| `web/src/features/cook/index.ts` | add the route `/cook/reheat/:date/:slotId`; export `cookReheatPath` |
| `web/src/features/cook/cook.css` | small `.reheat-*` rules (tokens only, no native controls) |
| `web/src/features/plan/lib/hero.ts` | `heroSelection`: `'reheat'` for a Leftover meal today |
| `web/src/features/plan/components/TonightHero.tsx` | render `Reheat` (icon `reheat`, see revision 2) per the rules above; `onReheat` already declared as an optional prop |
| `web/src/features/plan/strings.ts` | `reheat: 'Reheat'` |
| `web/src/features/plan/hooks/useCookFlow.ts` | `quickCook` resolves a success flag |
| `web/src/features/today/components/TodayScreen.tsx` | pass `onReheat={(k) => navigate(cookReheatPath(k))}` |
| `web/src/ui/icons.ts` | **done** (`reheat: FireIcon`); `TonightHero.tsx` and `ReheatScreen.tsx` switch `icon="timer"` to `icon="reheat"` for the Reheat button(s) and the tile `overlineIcon` |
| `web/src/features/cook/lib/reheat.ts`, `hooks/useReheat.ts`, `screens/ReheatScreen.tsx` | `defaultReheatSeconds(portions, reheatMinutes?)`, `useReheat(key, portions, reheatMinutes?)`, the screen passes `meal.reheatMinutes` (signature stubs in the tree ignore the new parameter) |
| `web/src/features/recipes/{types.ts,lib/draft.ts,components/RecipeDetailsFields.tsx,strings.ts}` | field `reheatMinutes` through draft, `draftToInput` (`overrideOf`: blank gives `null`), `validateDraft` (`reheat_invalid`: blank, or a whole number 1..30), a `NumberField` after the Use-by field, strings (Docs to apply) |
| `web/src/features/plan/types.ts` | `PlannedMeal.reheatMinutes?: number` (**done**, optional) |
| `internal/recipe`, `internal/recipe/store`, `internal/recipe/httpapi`, `internal/plan/httpapi`, `internal/recipefile`, `internal/db/migrations/1220_recipe_reheat.sql` | per the table above |
| `docs/spec/recipe-file.md` | the `reheatMinutes` row and rule 12 (Docs to apply) |
| `GLOSSARY.md`, `docs/spec/functional-spec.md` | see Docs to apply (after R11c merges) |

Revision 2 does touch `internal/` (Recipe, store, API, Recipe File, plan shape, migration 1220) and `web/src/ui/icons.ts`; the off-limits features and files stay untouched. The original "no backend change" conclusion still holds for Cooked, Cook Mode and timers.

## Tests

Red (need production code):

- `plan/lib/hero.reheat.test.ts`: today's Leftover meal gives `reheat` (also after the slot time); tomorrow's stays `leftover`; a fresh meal stays `cook`. Needs the `heroSelection` change.
- `plan/components/TonightHero.reheat.test.tsx`: primary Reheat button with an icon and `onReheat(key)`, no Cook, chip kept; after slot time `Yes, Cooked` + secondary `Reheat`, no `Adjust`; none for `leftover`. Needs the TonightHero rendering.
- `cook/lib/reheat.test.ts`: default time (2 min, +1 min per portion, cap 10 min, bad input, fractions), adjust clamps, `reheatTimerOf` filtering, path. Needs the lib.
- `cook/hooks/useReheat.test.tsx`: default and adjust, start posts `{scope, label: 'Reheat', durationSeconds}`, no second timer, ignores other timers, pause/resume/cancel. Needs the hook.
- `cook/screens/ReheatScreen.test.tsx`: content, +/- 30 s, Start posts the scoped timer, running state controls, Cancel timer, Mark as Cooked one-tap with `{}` body then Today, failure stays, Exit keeps the timer, not-a-Leftover and already-Cooked explanations. Needs the screen.
- `today/components/TodayScreen.reheat.test.tsx`: Reheat on the Today hero opens `/cook/reheat/...` and no Cook button. Needs the Today wiring.

Red, added in revision 2 (reheat time and icon):

- Go: `internal/recipe/recipe_reheat_test.go` (bounds 1..30, `reheat_invalid` on `reheatMinutes`), `internal/recipe/store/store_reheat_test.go` (round trip, replace, clear to NULL, rejected value writes nothing, `Summary.ReheatMinutes`), `internal/db/recipe_reheat_test.go` (migration 1220 keeps rows, NULL), `internal/recipefile/reheat_test.go` (export writes it only when set and the file validates, export then parse, import commit carries it, Agent Prompt template and `recipe-file.md` mention it), `internal/plan/httpapi/shapes_test.go` (`reheatMinutes` on a Leftover-served meal only).
- BDD: `features/recipes/recipe_reheat.feature` (null by default, save, replace/clear, refused 0/-1/31), `features/import-export/reheat_time.feature` (export writes it, export then import keeps it, old files without it import, 45 is a schema error with its path), `features/import-export/schema_and_prompt.feature` (Agent Prompt mentions it), `features/planning/reheat_time.feature` (the plan hands the Recipe's time to its Leftover meal). Steps in `bdd/steps_reheat_time_test.go`.
- Web: `recipes/lib/draft.reheat.test.ts`, `recipes/components/RecipeDetailsFields.reheat.test.tsx`, `recipes/hooks/useRecipeEditor.reheat.test.tsx`, `cook/lib/reheat.recipe.test.ts`, `cook/hooks/useReheat.recipe.test.tsx`, `cook/screens/ReheatScreen.recipe.test.tsx` (Recipe time as default, 30 s steps from it, formula fallback, no 10 min cap, tile icon is `reheat`), `plan/components/TonightHero.reheatIcon.test.tsx` (both Reheat buttons use `reheat`). Helper: `web/src/test/iconPaths.ts` (`isIcon(svg, name)` compares glyph paths at every weight). `ui/icons.test.tsx` has the `['reheat', 'Fire']` row (green).

Green regression guards (backend already behaves this way): `app/chromeless.test.ts` row for `/cook/reheat/...`, and `bdd/features/planning/reheat.feature` (steps in `bdd/steps_reheat_test.go`): a Leftover meal is `not_cookable` in Cook Mode; the Reheat timer is scoped to the meal; Cooked consumes the Leftover, leaves Stock alone and cancels the meal's timers (not free timers); cancelling the timer changes nothing else; Not cooked cancels it too.

## Docs to apply (after R11c merges, except where marked; do not edit GLOSSARY.md or functional-spec.md now)

**GLOSSARY.md**, in the Cook Mode area, after `Cook Mode`:

```
**Reheat**:
Warming a Leftover for the Planned Meal it is served at, with a short timer before the meal is marked Cooked; a Leftover has no Steps, so it uses its own screen rather than Cook Mode. The timer starts at the Recipe's Reheat time when it has one.
_Avoid_: Microwave, warm up

**Reheat time**:
The optional number of minutes (1 to 30) a Recipe says its Leftover takes to reheat; Reheat starts its timer there. Without one, Reheat works the time out from the portions.
_Avoid_: Warm-up time, microwave time
```

**docs/spec/functional-spec.md**, section 4 "Recipes": add `Reheat time` to the list of fields that mirror the Recipe File ("... Cool-down and Use-by overrides, **Reheat time** (optional, 1 to 30 whole minutes), image, source, ..."), and a bullet: "A Recipe's **Reheat time** is optional. It is a whole number of minutes from 1 to 30; blank means not set. The Recipe editor shows it as a compact number field after the Use-by field."

**docs/spec/functional-spec.md**, section 8 "Cooked and Leftovers", add as a bullet after the Not cooked bullet:

```
- A Planned Meal served from a Leftover that is due today offers **Reheat** on Today. Reheat opens a screen with a reheating timer scoped to that Planned Meal. The timer starts at the Recipe's Reheat time when it has one; otherwise at 2 minutes for one portion plus 1 minute for each further portion, at most 10 minutes. Either start is adjustable by 30 seconds, from 30 seconds to 30 minutes. Mark as Cooked then takes the portions off the Leftover and leaves Stock unchanged (Stock was deducted when the Batch was Cooked); like any Cooked or Not cooked, it cancels the Planned Meal's timers, the Reheat timer included. Leaving the screen early keeps the timer running and consumes nothing.
```

and in section 11 after the Cook Mode bullet: "A Planned Meal served from a Leftover has no Steps and does not open Cook Mode; it uses Reheat (section 8)."

and in section 13 "Import and export" a sentence: "A Recipe's Reheat time travels in the Recipe File as the optional `reheatMinutes`; files without it stay valid (the format is still version 1)."

**docs/spec/recipe-file.md** (not under review elsewhere; the developer applies it, the test `TestRecipeFileMDDocumentsReheatMinutes` and `TestTheAgentPromptTellsTheAgentAboutReheatMinutes` pin it). In the Recipes table, after the `leftoverUseByDays` row:

```
| `reheatMinutes` | Optional. Whole minutes (1 to 30) to reheat a portion of this Recipe's Leftover; Reheat uses it as its default timer. Omit it (or `null`) when unknown: Reheat then uses its own formula. An optional, backwards compatible addition to version 1: files without it stay valid, so the version stays `1`; only a Feeder older than this field rejects a file that has it (unknown properties are not allowed). |
```

In the Agent Prompt template, after rule 11 (rule 11 stays as is):

```
12. If the source says how long the dish takes to reheat (a ready-meal pack, "reheat for 3 minutes"), set the recipe's "reheatMinutes" to a whole number of minutes from 1 to 30, the time to reheat one Leftover portion. Omit it when the source does not say; never guess.
```

**web/src/features/recipes/strings.ts** (exact strings the tests use): `fields.reheat: 'Reheat time (minutes)'`, `fields.reheatHint: 'Blank: Reheat works it out from the portions'`, `codeMessage` `reheat_invalid: 'Reheat time must be 1 to 30 minutes.'`.

**docs/dev/design/wp2-icons.md**: add the row `reheat` -> Phosphor `Fire` (R12) and the new size, 65,505 B gz of the 65,536 B budget (93 modules).

## Product questions (defaults taken)

1. After the slot time, Reheat replaces Adjust (a Leftover meal has nothing to adjust). Say if Adjust should stay.
2. Reheat is offered only for today's meal, not tomorrow's Leftover meal.
3. *(Answered by the user, R3)* A Recipe may carry its own reheat time; the formula (2 min + 1 min per extra portion, cap 10) is only the fallback.
4. *(Answered by the user, R4)* Dedicated `reheat` icon (Phosphor `Fire`); done.
5. A Recipe time is flat for the Planned Meal: it does not grow with the number of portions. Say if it should (the time is for one portion today).
