# b5-bow: Bought Planned Meals on the Plan (web)

Sources: beta5-plan §2.4 (UI), beta5-reconcile §4, §9 (U6), §12 (BOW row), ADR 0013. Backend: team b5-bo.
Terms follow GLOSSARY (**Bought**, **Pinned**, **Planned Meal**, **Stock**, **Regenerate**, **Swap**). Never: locked, purchased, shopped, committed.

## 1. API shapes (from the plan, coded against)

- `mealOut` (the Course's meal, `slotOut.courses[i].meal`) gains
  `bought: null | { ingredients: { id: number; name: string }[] }` and
  `warning: null | { code: 'excluded' | 'archived' | 'course_lost'; memberId?: number; ingredientId?: number }`.
- `POST /api/plan/regenerate?dryRun=1` answers `{ replaces: number; bought: { date; mealSlotName; courseName; recipeName; ingredients: string[] }[] }` and writes nothing.
- Both fields are optional in the web types until the API ships (older fixtures omit them): treat `undefined` as `null`.

## 2. New files (this team; all in `web/src/features/plan`)

| File | Role |
|---|---|
| `lib/bought.ts` | Pure TS, no React. Types `BoughtInfo`, `MealWarning`, `RegenerateDryRun`, `RegenerateBoughtRow`; `boughtNames`, `addBoughtChip`, `boughtLine`, `swapBoughtNote`, `warningLine`, `regenerateBoughtLines`. |
| `boughtStrings.ts` | All Bought copy (below). |
| `components/BoughtChip.tsx` | Shared `Chip` (`kind="why"`, neutral) with icon `shoppingCart` (Phosphor shopping-cart via the shared `Icon`), text "Bought". |
| `components/BoughtLine.tsx` | The sheet line. Renders nothing when not Bought. |
| `components/RuleWarningLine.tsx` | The warn line for a Pinned or Bought meal that breaks a hard rule. Renders nothing without a `warning`. |

Each has a `*.test.ts(x)` beside it.

## 3. Behaviour

**Chip.** `addBoughtChip(chips, bought, 'row' | 'sheet')`:
- `row` (day tile, Course row): the Bought chip is added only when the row has no other chip (like the relaxed chip), so `chips` empty and `bought` set gives `[Bought]`.
- `sheet`: always shown when Bought, placed after the leading state chips (Cooked, Not cooked, Pinned), so Pinned and Bought show both facts. Overflow counting stays in `sheetChips` (wiring below).
- A Bought chip is `{ key: 'status:bought', kind: 'why', label: 'Bought' }` (a `PlanChip`; the component maps it to `BoughtChip`).

**Sheet line** `boughtLine`: "Bought for it: chicken thighs, cream. Automatic plan changes leave it as it is." Names in server order, joined ", ".

**Warn line** `warningLine(warning, ctx)` (shared by Pinned and Bought; the same copy):
- `excluded`: "Sam now excludes garlic, which this uses. Swap it to change it." (member and Ingredient names looked up from ids by `ctx`; a missing name reads "A Member" / "an Ingredient").
- `archived`: "This Recipe is archived. Swap it to change it."
- `course_lost`: "This Recipe is no longer a Side Recipe. Swap it to change it." (`ctx.courseName`; "This Recipe is no longer a Recipe for this Course. Swap it to change it." when absent).

**Regenerate confirm** `regenerateBoughtLines(rows)`: intro "These have Ingredients you already bought and are replaced too:" and one line per row "Tue Dinner · Roast chicken (chicken thighs, cream)." (weekday short, slot name, Recipe, Ingredients). No "keep them" action. Empty rows: no intro, no lines.

**Swap note** `swapBoughtNote`: "You bought chicken thighs for this; it stays in Stock." Shown in the Swap sheet when the meal is Bought.

**U6.** Bought Side beside a Whole-meal main behaves like a Pinned one: the server keeps it; the web only shows the Bought chip and stays swappable. No web logic.

## 4. Copy table (`boughtStrings.ts`)

| Key | Text |
|---|---|
| `chip` | Bought |
| `line(names)` | Bought for it: {names}. Automatic plan changes leave it as it is. |
| `swapNote(names)` | You bought {names} for this; it stays in Stock. |
| `regenerateIntro` | These have Ingredients you already bought and are replaced too: |
| `regenerateRow(day, slot, recipe, names)` | {day} {slot} · {recipe} ({names}). |
| `warnExcluded(member, ingredient)` | {member} now excludes {ingredient}, which this uses. Swap it to change it. |
| `warnArchived` | This Recipe is archived. Swap it to change it. |
| `warnCourseLost(course)` | This Recipe is no longer a {course} Recipe. Swap it to change it. |

## 5. Later wiring (after b5-f1 merges; developer step on existing files)

- `types.ts`: `PlannedMeal.bought?: BoughtInfo | null`, `warning?: MealWarning | null` (import types from `lib/bought`).
- `api.ts`: `regenerateDryRun()` -> `POST /api/plan/regenerate?dryRun=1` returning `RegenerateDryRun`.
- `lib/regenerate.ts` / `usePlanActions`: fetch the dry run when the confirm opens; the confirm body appends `regenerateBoughtLines` after the count.
- `lib/chips.ts`: `dayChip` and `sheetChips` call `addBoughtChip`; `MealTile`, `CourseRow`, `TodayTiles` render the chip via `BoughtChip`.
- `PlannedMealSheet`: `<BoughtLine>` under the chips; `<RuleWarningLine>` for `meal.warning` (member and Ingredient names from the household and Ingredient lookups the sheet already has).
- `SwapSheet`: note from `swapBoughtNote` when the swapped meal is Bought.
- `plan.css`: `.bought-line`, `.rule-warning-line` styles (token-based, warn tone for the warning).
- CHANGELOG `[Unreleased]` entry (developer).

## 6. Tests (red now)

`lib/bought.test.ts`, `components/BoughtChip.test.tsx`, `components/BoughtLine.test.tsx`, `components/RuleWarningLine.test.tsx`. BDD for the visible flows lives with the backend team's scenarios and the later wiring (PlanScreen tests).

```gherkin
Scenario: A Bought Planned Meal shows a Bought chip
  Given Tuesday's roast chicken is Bought for chicken thighs and cream
  When I open the Plan
  Then Tuesday's roast chicken shows the Bought chip
Scenario: The sheet explains what was bought
  When I open the Planned Meal sheet of Tuesday's roast chicken
  Then I see "Bought for it: chicken thighs, cream. Automatic plan changes leave it as it is."
Scenario: Regenerate names Bought Planned Meals
  When I choose Regenerate
  Then the confirm lists "Tue Dinner · Roast chicken (chicken thighs, cream)."
Scenario: Swap notes what stays in Stock
  When I swap Tuesday's roast chicken
  Then I see "You bought chicken thighs for this; it stays in Stock."
```
