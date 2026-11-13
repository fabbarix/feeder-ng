# b5-low: Leftovers by hand, web

Team b5-low. Sources: [beta5-plan.md](beta5-plan.md) 2.3, [beta5-reconcile.md](beta5-reconcile.md) 3, 9 (Q13 to Q16), 12 (LOW row), 13 (U4, U5), [ADR 0012](../../adr/0012-leftovers-stay-leftovers.md). The backend is team b5-lo (not merged); the API below is the plan's shape and is the contract this web work assumes.

This step (designer / test author) adds the shared parts only: `web/src/lib/leftovers/**`, `web/src/ui/LeftoverActions/**` and `web/src/features/stock/lib/pantryLeftovers.ts`, each with failing tests and stubs. Wiring into other features is section 5, to be done by the developer step when those features are merged (reconcile 12: LOW depends on LO, BOW, D, G, ST, F1, R).

## 1. What is built

| Piece | File | Notes |
|---|---|---|
| Types | `lib/leftovers/types.ts` | `Leftover` (plan fields plus `storagePlaceId/Name`, `frozen`, `frozenOn`, `toAnswer`, `plannedPortions`), `PlannedMealRef` (`date, mealSlotId, mealSlotName, courseId?, recipeName?`), `LeftoverRequest`, `LeftoverAnswer`, results. No `LeftoverClaim` |
| API client | `lib/leftovers/api.ts` | `leftoversApi.{list,hadIt,threwOut,freeze,takeOut,answer,preview}` over `lib/http`. Shapes are b5-lo.md section 4: had-it and threw-out `{leftover, replanned}`; freeze `{frozen, left, replanned}`; take-out a flat Leftover; `preview(id, request)` is the `?dryRun=1` call (had-it, threw-out, freeze) and returns the `replanned` list |
| Query key | `lib/leftovers/queryKeys.ts` | `['plan','leftovers']`, the key `features/plan` already uses, so both lists refresh together |
| Dates | `lib/leftovers/dates.ts` | UTC day maths, `weekdayShort`, `shortDate` ("10 Feb"), `dateWord` |
| Defaults and rules | `lib/leftovers/portions.ts` | portion defaults and bounds, `defaultFreezer`, `freezeUseBy`, `takeOutUseBy` (`freezeDefaultPortions` rounds the spare portions down to a 0.5 step) |
| Copy | `lib/leftovers/copy.ts` | every string below, as pure functions |
| Sheet view model | `lib/leftovers/sheetModel.ts` | pure: `sheetDefaults(input)`, `sheetRequest(action, draft)`, `placeChoices(action, places)`, `sheetNotes(input)`, `replannedNotes(refs)` (unique keys). `LeftoverSheet` keeps only the draft state and renders what these return |
| Row models | `lib/leftovers/rows.ts` | `tileRows` (questions first, frozen questions included, with a `badge`), `menuActions`, `freezerChoices` |
| Frozen Use-by field | `lib/leftovers/frozenUseBy.ts` | `parseFrozenUseBy`, helper line |
| Hooks | `lib/leftovers/useLeftoverActions.ts` | `useLeftovers()`, `useLeftoverActions({today})`, `useReplanPreview(leftoverId, request \| null)` (the dry run as a query keyed on the draft; `[]` while loading, for no request and for Take out) |
| Components | `ui/LeftoverActions/{LeftoverRow,LeftoverQuestion,LeftoverSheet}.tsx` | presentational; they get data and callbacks as props |
| Pantry rules | `features/stock/lib/pantryLeftovers.ts` | frozen only, groups, filters, row text |

No component calls the API or computes a domain value; sheets keep only the draft (portions, chosen place) in local state, with defaults and bounds from `portions.ts`.

## 2. Behaviour rules

- **Where a Leftover shows.** Today's Leftovers tile and the Plan: Leftovers that are not frozen (`!frozen`), plus frozen ones that are to answer (`toAnswer`): those are question rows on Today's tile too, with a badge naming their Storage Place ("Not sorted" if the place is gone), because the question must not hide in the Pantry. The Pantry page: frozen Leftovers only (U4), inside their Freezer's group after its Lots, never in By Ingredient. A taken-out Leftover has `frozen=false`, so it leaves the Pantry and is a normal Leftover (its Storage Place, if any, is just informational). If its Freezer was deleted, `storagePlaceId` is null or unknown to the places list and it goes under "Not sorted" (`leftoverGroups`). "Frozen" is the `frozen` flag, never the kind of the place.
- **Row menu** (`menuActions`): Had it, Threw it out, then Freeze it (not frozen and Use-by today or later) or Take out (frozen). A question row has no menu: it has the three answer buttons.
- **Freeze it** with no Freezer Storage Place: the sheet shows "Add a Freezer first" and a "Storage Places" link (`storagePlacesHref`), no confirm button. The link is a react-router link inside a router (the `ListRow` pattern: `useInRouterContext`, `useLinkClickHandler`; no page reload) and a plain anchor outside one.
- **Take out default** (PM decision 6): the Household's default Storage Place when it is not a Freezer, else "Not sorted".
- **Default Freezer** (Q14): the default Storage Place if it is a freezer, else the first freezer by name. No new table.
- **Portions**: stepper 0.5 steps from 0.5 to what is left. Had it default 1 (or what is left); Threw it out default all; Freeze it default what no Planned Meal is planned to use (`portions - plannedPortions`), all if that is below half a portion.
- **Planned Meals that lose portions** (PM decision 5: adopt the server dry run). `had-it`, `threw-out` and `freeze` accept `?dryRun=1` (b5-lo.md section 4) and answer `{replanned: [PlannedMealRef]}` without writing. The sheet calls it through `useReplanPreview` for the draft (on open and whenever portions or the place change) and shows one note per Planned Meal (`replannedNote`: "Fri Lunch was going to have it; it is planned again."; note keys are unique per Planned Meal: date, slot and Course). It needs no plan data, so it works on the Pantry too. The sheet has no `claims` prop; there is no `lostClaims` and no `LeftoverClaim`. The server does the unpin and replan on the real call; `replanned` in the answer is only informative. Take out never asks.
- **Use-by notes**: Freeze it "Use by 10 Feb in the freezer (90 days)" (Recipe Frozen Use-by, else the Household's); Take out "Use by Sun once out (3 days)" (the Recipe's Use-by days).
- **U5** (Cooked takes only the portions the meal uses and the rest stays frozen) is server behaviour; the web only has to show a frozen Leftover chosen in Choose a Recipe as "From the freezer: take it out the day before" and not require Take out first.
- **Refreshing**: after any success `useLeftoverActions` invalidates `['plan']` (list, plan, tiles) and `['stock']` (Pantry, waste); when waste is recorded (Threw it out by hand, or the Threw it out answer) also `['today','streak']` and `['board']`. After a failure nothing is refreshed.
- **Question accessibility**: the three answer buttons sit in `role="group"` with `aria-labelledby` pointing at the question text.

## 3. Copy (GLOSSARY words)

| Where | Text |
|---|---|
| Had it sheet | title "How many portions of Chilli did you have?"; stepper "Portions"; buttons **Had it**, Cancel |
| Threw it out sheet | title "Throw out Chilli?"; stepper "Portions" (default all); note "This counts as waste: the zero-waste streak starts again today."; buttons **Threw it out** (danger), Cancel |
| Freeze it sheet | title "Freeze Chilli"; Select "Storage Place" (freezers only); stepper "Portions"; note "Use by 10 Feb in the freezer (90 days)"; buttons **Freeze it**, Cancel |
| Freeze it, no Freezer | "Add a Freezer first"; link "Storage Places" |
| Take out sheet | title "Take Chilli out of the freezer?"; Select "Storage Place" (non-freezer places and "Not sorted"); note "Use by Sun once out (3 days)"; buttons **Take out**, Cancel |
| Planned Meal loses portions (from the dry run) | "Fri Lunch was going to have it; it is planned again." |
| Question | "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?" with **Had it**, **Threw it out**, **Wasn't there** |
| Row meta | "3 portions · Use by tomorrow" (Use by today, tomorrow, a weekday within 6 days, else "19 Nov") |
| Toasts | "Noted: 2 portions of Chilli. 1 left." / "Noted: 1 portion of Chilli. None left." / "Threw out 3 portions of Chilli." / "Chilli is in Garage Freezer. Use by 10 Feb." / "Chilli is out of the freezer. Use by Sun." / "Noted: Chilli was had." / "Threw out Chilli." / "Chilli removed: it wasn't there." |
| Errors | `leftover_past_use_by` "Chilli is past its Use-by, so it cannot be frozen."; `leftover_frozen`; `leftover_not_frozen`; `leftover_not_to_answer`; `portions_invalid`; `storage_place_not_freezer`; `storage_place_freezer`; `storage_place_unknown` "That Storage Place is gone. Pick another."; `leftover_too_small` "There are too few portions of Chilli left for that Planned Meal."; 404 "Chilli is gone."; else "Couldn't save that for Chilli. Try again." |
| Planned Meal sheet link | "From Mon's Chilli" (the day it was cooked, short) |
| Choose a Recipe | section "From the freezer"; row "Chilli", meta "3 portions · Garage Freezer" (or "Not sorted") |
| Freezer Planned Meal row | "From the freezer: take it out the day before" |
| Recipe editor | field "Frozen Use-by" (days, optional), helper "Blank uses the Household's 90 days."; error "Enter whole days from 1 to 365." |
| Settings > Household | field "Frozen Use-by" (days, Admin), same error |
| Pantry | filter chip "Leftovers"; row "Chilli", "3 portions · Use by 10 Feb"; group header is the Storage Place name or "Not sorted" |

No word under `_Avoid_` (consume, discard, bin, expiry, stash, scrapped, dumped, phantom) appears in copy or identifiers; the pure copy lives in `lib/leftovers/copy.ts`, not in a `strings.ts`, because it takes arguments.

## 4. Components

- `LeftoverRow({leftover, today, onAction})`: a `ListRow` (title the Recipe name, meta from the row model, `snowflake` icon and the Storage Place name when frozen, `spoil` meta tone from tomorrow back) with a trailing `Menu` labelled "Actions for Chilli", entries from `menuActions`; Threw it out has `tone: 'danger'`. `onAction(kind, leftover)` makes the parent open the sheet.
- `LeftoverQuestion({leftover, today, busy, onAnswer})`: `data-testid="leftover-question-<id>"`, `data-tone="info"`, `question` glyph, `questionText`, a Storage Place badge when `leftover.frozen` ("Not sorted" without a place), three `Button`s in a `role="group"` labelled by the question text. `onAnswer(answer, leftover)`.
- `LeftoverSheet({action, leftover, today, storagePlaces, recipeFrozenUseBy, householdFrozenUseBy, recipeUseByDays, busy, onConfirm, onClose, storagePlacesHref})` (needs a `QueryClientProvider` for the dry run; defaults, request, notes and choices come from `sheetModel`): `BottomSheet` + `StepperField` (label "Portions", `step` 0.5) + shared `Select` (label "Storage Place") + footer `Button`s. `action = null` renders nothing. `onConfirm(LeftoverRequest)`.
- The owner screen holds `{action, leftover}` state, passes `useLeftoverActions().run` result handling: `onConfirm={async (r) => { if (await actions.run(l, r)) close() }}`.

## 5. Wiring plan (after the owning teams merge)

| Owner file(s) | Change |
|---|---|
| `web/src/ui/index.ts` | export `LeftoverRow`, `LeftoverQuestion`, `LeftoverSheet` and their prop types (`ui/index.exports.test.ts` lists the barrel) |
| `features/plan/types.ts`, `plan/lib/leftovers.ts`, `plan/api.ts`, `plan/hooks/useTodayTiles.ts` | replace the plan `Leftover` type and `leftoverRows` with `lib/leftovers` (keep `useLeftovers` returning the same shape, now with the new fields, key already `['plan','leftovers']`) |
| `features/plan/components/TodayTiles.tsx` (`LeftoversTile`) | `tileRows(...)`: a `LeftoverQuestion` for each question, then a `LeftoverRow` for each Leftover; one `LeftoverSheet` per tile; tile tone info while a question is open |
| Planned Meal sheet (`features/plan`) | link `fromLeftoverLabel(...)` opens the same sheet for `servedFromLeftover.leftoverId`; the sheet gets its notes from the dry run |
| Choose a Recipe (`features/plan/lib/choose*`, sheet) | section `leftoverStrings.fromTheFreezer` built from `freezerChoices`; choosing one pins it as a Leftover Planned Meal; its Planned Meal row shows `fromTheFreezerHint` |
| `features/stock` (Pantry) | `pantryLeftovers` + `leftoverGroups` add rows after a place's Lots using `LeftoverRow` (menu: Had it, Threw it out, Take out); a `Leftovers` filter chip shows only them (`filterPantryLeftovers` for the other filters); not in By Ingredient; Storage Place delete dialog names frozen Leftovers (reconcile 3.2 point 8) |
| `features/recipes` editor | `Frozen Use-by` `NumberField` after Use-by, `parseFrozenUseBy(raw, {required:false})`, helper `frozenUseByHelper(household)`, `frozenUseByDays` on read and write |
| `features/settings` `HouseholdSettingsForm`, `strings.ts`, `types.ts` | `Frozen Use-by` field (Admin), `parseFrozenUseBy(raw, {required:true})`, `frozenUseByDays` |
| `features/board` | read-only line "Chilli, Use-by passed" for questions (no actions); pure helper in the developer step |

## 6. Tests written (red)

| File | Covers |
|---|---|
| `lib/leftovers/dates.test.ts` | `addDays`, `dayDiff`, names, `dateWord` |
| `lib/leftovers/portions.test.ts` | defaults (Freeze it rounds to 0.5), bounds, freezer choice (Q14), Use-by after Freeze it / Take out |
| `lib/leftovers/sheetModel.test.ts` | defaults per sheet (Take out place), request building, place choices, notes, replanned notes and keys |
| `lib/leftovers/copy.test.ts` | titles, notes, question, toasts, errors, From link |
| `lib/leftovers/rows.test.ts` | questions first, frozen not on Today, menu per state, freezer choices |
| `lib/leftovers/frozenUseBy.test.ts` | 1 to 365, blank rules, helper |
| `lib/leftovers/api.test.ts` | routes, bodies, unwrapping, `replanned` default |
| `lib/leftovers/useLeftoverActions.test.tsx` | list, each action, toasts, refresh, failure, busy |
| `ui/LeftoverActions/*.test.tsx` | row menu per state, question buttons and tone, each sheet (defaults, bounds, Select options, notes, dry-run notes, router link, payloads), question group and badge |
| `features/stock/lib/pantryLeftovers.test.ts` | frozen only, groups, Not sorted, filters, row text |

BDD for this feature stays with the backend's `bdd/features/beta5/leftovers.feature`; the Playwright/UI scenario for the Pantry "Leftovers" chip is added in the developer step if the repo has a UI BDD layer for it.

## 7. Open questions for the PM

1. **Settled by the PM (interim review).** Response shapes follow b5-lo.md section 4 (had-it and threw-out `{leftover, replanned}`, freeze `{frozen, left, replanned}`, take-out a flat Leftover, `PlannedMealRef.mealSlotName`); claims come from the server dry run, not from the plan; Take out defaults to the Household's default Storage Place when it is not a Freezer.
2. **Dry-run notes carry no portion counts.** `PlannedMealRef` has none, so the note reads "was going to have it" rather than "2 portions of it". Raise with b5-lo if the count is wanted.
3. **Where Take out puts a Leftover that is then shown.** A taken-out Leftover may keep a non-freezer Storage Place; Today and the Plan ignore it. Confirm that is intended (U4 says it leaves the Pantry).
4. **Icons.** `snowflake` and `question` already exist in `ui/icons.ts` (WP D merged), so no new glyph is needed.
