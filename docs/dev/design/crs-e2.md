# CRS E2: Recipe editor Courses and Whole meal, Course filter, Import Review for Courses

Team E2 of [crs-plan.md](crs-plan.md) (workstream E, wave 3, web). Spec: functional-spec 4 and 13. Decision: [ADR 0008](../../adr/0008-courses.md). Builds on: D1 ([crs-d1.md](crs-d1.md): `CoursePicker` unordered form, `CourseMultiSelect`/`CourseSelect`, `lib/courses`), D2 (`useCourses`), C1 ([crs-c1.md](crs-c1.md): the Recipe API) and E1 ([crs-e1.md](crs-e1.md): Import Review rows, answers, Admin-only).

E2 owns `web/src/features/recipes/**` and `web/src/features/import/**`, plus one small addition to `web/src/ui/fields/Switch.tsx` (a `description`). It does not touch Tag code (TG-RW adds Tag colours to `TagChips`, `TagInput`, `lib/tags.ts`), `features/{settings,plan,today,cook}`, GLOSSARY, CHANGELOG, the spec or Go. Look and feel: Bento, built from existing primitives; no new icon, no new colour.

The tests are red on purpose; only the new ones fail. New logic is a stub that throws `not implemented`; new components render `null`. Existing tests were adjusted only to keep passing (3.5).

## 1. Shapes

`recipes/types.ts`: `RecipeInput` gains `courseIds: number[]` and `wholeMeal: boolean`; `Recipe` has `courses: {id, name}[]` (household order) and `wholeMeal` (no `courseIds`); `RecipeSummary` has `courseIds` and `wholeMeal`; `RecipeFilter.course?: number`. New: `RecipeSlotRule` (`id, mealSlotId, courseId, recipeId?, recipeName?, tag?`), `SlotName`, `LostRule {id, label}`, `CourseLoss {courseNames, rules}`.

`import/types.ts`: `Decisions.courses: CourseDecision[]` (`{key, action: 'use'|'skip'|'add'|'unarchive', courseId?}`), `Plan.courses: CourseMatch[]` (`name, key, status: exact|archived|unknown, match?, effective?, resolved, usedBy`), `ImportResult.coursesCreated?/coursesUnarchived?`. A `too_many_courses` Problem arrives in `plan.problems`.

## 2. Recipe editor: logic

### 2.1 API client
`recipesApi.list` sends `?course=<id>` (after `archived`, so `q, tag, archived, course`). New `slotRules()` (`GET /api/slot-rules`, every rule, each with `courseId`) and `mealSlots()` (`GET /api/meal-slots`, only `id`, `weekday` and `name` are read; `SlotName` is `{id, weekday, name}`). The Slot Rule label comes from the shared `mealSlotLabel(weekday, name)` ("Friday Dinner"), moved from `plan/lib/rules.ts` to a shared lib, not from the name alone.

### 2.2 Draft (`lib/draft.ts`)
`RecipeDraft` gains `courseIds` (household order), `wholeMeal` and `wholeMealSet` (the User set Whole meal in this edit; never sent). `emptyDraft`: `[]`, `false`, `false`. `draftFromRecipe`: ids of `recipe.courses` in order, the stored `wholeMeal`, `wholeMealSet` false. `draftToInput` sends `courseIds` (a copy) and `wholeMeal` **as the draft holds it**: this is what makes the hidden switch "send back the stored value" and a new Recipe send `false`, with no special case. `serverErrorKey('courses', …)` is `courses`.

### 2.3 `lib/recipeCourses.ts` (pure)
`showsWholeMeal` (the ids include the active main Course, found by flag: `includesMainCourse`), `defaultWholeMeal(readyMeal, ids, courses)` (same function as the server's `DefaultWholeMeal`), `reconcileWholeMeal(prev, next, courses)`, `withDefaultCourse`, `validateCourses` (`courses: 'courses_empty'`), `courseNamesOf`, `joinNames` ("Side, Starter and Dessert") and `lostSlotRules`.

`reconcileWholeMeal` is run on every `setDraft` step: a change of `wholeMeal` the step did not make itself is the User's (`wholeMealSet` true); Ready Meal off to on, with the main Course among the Courses and `wholeMealSet` false, makes `wholeMeal` true (spec 4: "unless the User already set Whole meal in this edit"); unticking Ready Meal and changing Courses never touch `wholeMeal`. The default applies at the moment of marking only, so taking Main off a Ready Meal and putting it back changes nothing.

`lostSlotRules({recipeId, storedIds, draftIds, rules, slots, courses})`: Slot Rules **by this Recipe** (`rule.recipeId === recipeId`; Tag rules are never touched) on a Course that `draftIds` takes off; rules on a Course `courses` no longer lists are ignored (archiving already removed them). Label `<Meal Slot> · <Course> = <Recipe>` with the Meal Slot from `mealSlotLabel(weekday, name)` ("Friday Dinner · Side = rice"), in the API's order. `courseNames` are the taken-off Courses that lose a rule, household order. `null` for a new Recipe, nothing lost or no rules. The brief says "use `GET /api/slot-rules` with `courseId`": the rules carry `courseId` and the filter is done here, so the editor needs one cached request and no backend filter.

## 3. Recipe editor: hooks, components, screen

### 3.1 `useRecipeEditor(recipeId?, ingredients?, courses = [])`
`courses` are the household's active choices. New behaviour:
- A **new** Recipe whose `courseIds` is empty gets `[main]` when the choices arrive (`withDefaultCourse`), once; a later change of the list never overwrites a choice.
- `setDraft` runs `reconcileWholeMeal` after the existing Ready Meal sync.
- Save validates `validateCourses` **only once `courses` is non-empty** (before that the picker cannot be used either, and the server answers `courses_empty` anyway). A 422 `validation_failed` `field: courses` lands on the key `courses` through the existing path.
- `courseLoss: CourseLoss | null`: for a stored Recipe only, two queries `['recipes','slot-rules']` and `['recipes','slot-names']` (so every `recipes` invalidation, including the one after a save, refreshes them) feed `lostSlotRules` with the stored ids (from `existing.data.courses`) and the draft's. A failed query leaves it `null`: the server still decides.

### 3.2 Components
- `RecipeDetailsFields` gets `courses?: readonly CourseChoice[]`. After the Ready Meal checkbox: `CoursePicker` (`label` "Courses", `ordered={false}`, `required`, `error` from `errors.courses`), emitting `{ courseIds }` in household order. Under it, only while `showsWholeMeal(draft.courseIds, courses)`, the shared `Switch` "Whole meal" with `description` `Planned as <main name>, it leaves the slot's other Courses empty` (main found by its flag), emitting `{ wholeMeal }`.
- `Switch` gains `description?: string`: a `<p>` linked by `aria-describedby`; the accessible name stays the label.
- `CourseLossDialog {open, loss, onConfirm, onCancel}`: the shared `Dialog` (modal `<dialog>`); title `Taking <names> off removes a Slot Rule | N Slot Rules`; the rules in a `<ul>`; actions Cancel (first focus; Escape cancels) and "Save and remove" (danger tone). No native `confirm`.
- `RecipeEditorScreen`: `useCourses().choices` goes to `useRecipeEditor` and `RecipeDetailsFields`. Save: `editor.courseLoss` set means open the dialog instead of saving; "Save and remove" runs the normal save (and navigation); Cancel closes it and returns focus to Save Recipe.

### 3.3 Strings
`courseStrings` and the `courses_empty` / `course_unknown` codes are in `recipes/strings.ts` (real values, the tests use them).

### 3.4 Order of work for the developer
Pure lib first, then `useRecipeEditor`, then the components, then the screen.

### 3.5 Existing tests changed (they stay green)
Recipe fixtures and two `Recipe` literals gained `courses`/`wholeMeal`; every existing screen test that renders `RecipesScreen`, `RecipeDetailScreen` or `RecipeEditorScreen` has a trailing `vi.mock` of `lib/courses/useCourses` (the screens will read it, and those tests have no QueryClient), and the four Import screen tests mock `useImportCourses`; `emptyDecisions()` expectations gained `courses: []`; `UseImportReview` mocks gained `courseExtras()`.

## 4. Import Review

### 4.1 Pure (`lib/courseRows.ts`)
`questionRows(rows)` (unknown and archived, plan order; matched rows ask nothing and get no tile), `usedByRecipes(usedBy, recipes)` (the Recipe of each `$.recipes[i]…` path found by `RecipeStatus.index`, each once, first-seen order), `splitProblems(problems)` (`{courseLimit, others}` by code `too_many_courses`). `reviewSteps` gains the step `courses` between `units` and `recipes`: `total` = question rows, `open` = those with `resolved` false; `openCount` sums it. Defaults are resolved (use the main Course), so a file with unknown names is Ready straight away.

### 4.2 Answers and hook
`lib/decisions.ts`: `chooseCourseUse(d, key, courseId)`, `chooseCourseSkip`, `chooseCourseAdd`, `chooseCourseUnarchive` (each replaces the answer of the same key in place), `dropAdminCourseAnswers` (takes out `add` and `unarchive`). `useImportReview` exposes the four `chooseCourse*` (each re-plans like the other answers) and `courseForbidden`.

Confirm and Courses:
- Success: when `coursesCreated` or `coursesUnarchived` is above 0, also invalidate `['courses']` (Recipes, Ingredients and Tags as today).
- `403 forbidden` **with an `add` or `unarchive` answer in the decisions**: the Review stays open (`phase` reviewing, no `error`, not `stale`), those answers are dropped (`dropAdminCourseAnswers`), the plan is asked again, `courseForbidden` is true until the next answer, `reset` or `adopt`. A 403 without such an answer is the generic error as today. E1 keeps the server session open on 403, so a second Confirm with `use` or `skip` works.
- `import_not_ready` replaces the plan as today; a `too_many_courses` Problem is in it.

### 4.3 `CourseMatchTile {match, usedBy, courses, isAdmin, onUse, onSkip, onAdd, onUnarchive}`
A `Tile` section named by the name: h2, a status chip ("Not one of your Courses" or "Archived Course"), the sentence ("Soup is not one of your Courses", "Brunch is an archived Course"), "Used by …" when known, the shared `CourseSelect` labelled "Use this Course instead" (value = the `use` answer in force, empty while the answer is Skip, Add or Unarchive; options = active Courses, so an archived Course is never offered), then a group "Answer for <name>" of filter chips (`aria-pressed` from `effective`): "Skip <name>", and for an Admin "Add <name> as a Course" (unknown) or "Unarchive <name>" (archived). A non-Admin sees no such chip and the line "Only an Admin can add a Course." / "…unarchive a Course.". Strings: `importStrings.courses`.

### 4.4 `useImportCourses(): {courses, isAdmin, isPending}`
`useCourses().choices`, `useMe().data?.isAdmin`, and the live refresh: a household `courses` event or a reconnect invalidates `['courses']` (no EventSource: nothing).

### 4.5 `ImportScreen`
Between the Unit Conversions and the Recipe conflicts: a `BentoGrid` labelled "Courses" of `CourseMatchTile`s (nothing when there are no question rows). `courseForbidden` shows a danger `Tile` with `role="alert"` and `importStrings.courses.forbidden`. The `too_many_courses` Problem is shown as an alert with `courses.tooMany(20)` next to the Course tiles and is left out of the generic Problems list (the other Problems stay). The done tile adds "Added N Course(s)" and "Brought back N Course(s)" when above 0.

## 5. Recipes list, tiles, detail, live updates

- `CourseChips {names, wholeMeal?}`: a `<ul aria-label="Courses">` of non-interactive tag `Chip`s, then "Whole meal"; nothing for no names. Shared by the tile and the detail.
- `RecipeTile` gets `courseNames?` and `wholeMeal?` and renders `CourseChips`. `RecipesScreen` resolves names with `courseNamesOf(summary.courseIds, choices)` and passes `wholeMeal = summary.wholeMeal && showsWholeMeal(summary.courseIds, choices)`.
- `RecipeDetailScreen`: `CourseChips` in the hero tile from `recipe.courses`; Whole meal chip by the same rule.
- `CourseFilter {courses, selected, onSelect}`: group "Filter by Course" of filter chips ("All Courses" pressed when none, then one per Course in household order); pressing the selected Course clears it; nothing with fewer than two Courses. `RecipesScreen` keeps `course` in state next to `q`, `tag` and `archived`, passes it in the `RecipeFilter`, and shows the filter beside `TagChips` in the `filters` slot (a fragment, so TG-RW's change to `TagChips` is a separate line). `useRecipes` counts a Course as a filter, so an empty answer is "no match" and not "no Recipes yet".
- `useRecipeLiveUpdates` also subscribes to the household topic: `{changed: 'courses'}` invalidates `['courses']` and `['recipes']` (chip names, Whole meal); a reconnect invalidates `['courses']` too. The `recipes` topic handler (C1 sends `{"changed":"courses"}` there after an archive or delete) also invalidates `['courses']`.

## 6. Tests (red, written first)

| File | Pins |
|---|---|
| `recipes/lib/recipeCourses.test.ts` | the rules of 2.3 |
| `recipes/lib/draft.courses.test.ts` | 2.2 |
| `recipes/api.courses.test.ts`, `strings.courses.test.ts` | 2.1, copy |
| `recipes/hooks/useRecipeEditor.courses.test.tsx` | 3.1 |
| `recipes/hooks/useRecipes.course.test.tsx`, `useRecipeLiveUpdates.courses.test.tsx` | 5 |
| `recipes/components/{CourseChips,CourseFilter,CourseLossDialog,RecipeTile.courses,RecipeDetailsFields.courses}.test.tsx` | components, keyboard and ARIA |
| `recipes/screens/{RecipeEditorScreen.courses,RecipesScreen.course,RecipeDetailScreen.courses}.test.tsx` | screens |
| `ui/fields/Switch.description.test.tsx` | 3.2 |
| `import/lib/{decisions.courses,courseRows,reviewSummary.courses}.test.ts` | 4.1, 4.2 |
| `import/hooks/{useImportReview.courses,useImportCourses}.test.tsx` | 4.2, 4.4 |
| `import/components/CourseMatchTile.test.tsx`, `import/screens/ImportScreen.courses.test.tsx` | 4.3, 4.5 |

BDD: the import scenarios (unknown Course, Admin add, non-Admin 403) are E1's Gherkin; E2 adds none, and the web has no browser-driven suite.

## 7. Open points for the Reviewer
- The Courses check in `useRecipeEditor` is skipped while the household's Courses are unknown (3.1); the server is the backstop.
- Course chips are shown even with a single Course (spec 4); the filter is hidden then.
- The Whole meal default applies at the moment of marking Ready Meal only (spec 4), not when Main is added to a Ready Meal later.
- `GET /api/slot-rules` is read whole and filtered in the editor; if it grows large a `?courseId=` filter on the server would be the optimisation.
