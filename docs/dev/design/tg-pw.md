# TG-PW: Tag colours on the Planning rules; Course on Slot Rules

Task of [tg-plan.md](tg-plan.md) 4.1 plus crs-f gap 3 (the Slot Rule form has no Course select). Pipeline step 1 (design and red tests). Sources: spec 4.1, 16, 17 and "Slot Rules targeting a Course"; [tg-ui.md](tg-ui.md); [crs-d1.md](crs-d1.md).

## 1. Behaviour

**Tags.** Rules store a Tag by **key** (`tagKey`); the screen shows the Tag's **name** and **colour**.
- Both Tag selects (Slot Rule by Tag, Variety Rule) become `TagSelect` (dots, counts, search). Its value is the Tag id; the form keeps the **key**, so `onAdd` / `onSave` still carry `tag: <key>` (equal to the old value for lower-case Tags).
- A Slot Rule row by Tag shows a `Chip kind="tag" tagColour` with the Tag's name, replacing the "Tag: pizza" meta. A Variety Rule row shows the pill in place of the bare key. Recipe rows keep "Recipe: Curry".
- A key no Tag has (deleted, or Tags not loaded yet) renders a **neutral pill** (no `tagColour`) with the key as label.
- The editors take `tags: Tag[]` (`lib/tags`) instead of the plan-local `TagChoice`. The screen reads them with `useTags()` (so a `tags` SSE event refreshes it) in place of `useTagChoices`.
- `variety_relaxed` chips: `PhraseContext` gains optional `tagName(key)`; the chip says the Tag's name ("3rd Fish this week") or the key when unknown or no lookup is given.

**Course.** Needs `MealSlotChoice.courses` (already typed by F).
- The Slot Rule form shows `CourseSelect` (label "Course") **only when the chosen Meal Slot has several Courses**, listing just that slot's Courses; default the main Course; choosing another Meal Slot resets to that slot's main Course.
- Several Courses: `courseId` is always sent (the main Course's id if none picked). One Course, or a slot without `courses`: no select, no `courseId` (the server takes the main Course), exactly as today.
- Row title is `slotRuleTitle(slotLabel, ruleCourseName(slot, rule.courseId))`: "Friday Dinner · Starter"; a rule without `courseId` is the main Course; a one-Course slot reads "Friday Dinner" as before.

## 2. Code

| File | Change |
|---|---|
| `plan/lib/tagPill.ts` (new) | `tagPill(tags, keyOrName): {label, colour?}`; pure, by `tagKey`. |
| `plan/lib/rules.ts` | add `slotCourseChoices(slot)`, `defaultCourseId(slot)`, `ruleCourseName(slot, courseId)`. `toTagOptions` goes (TagSelect replaces it); `toSlotRuleBody` and `slotRuleTitle` already exist (F). |
| `plan/lib/phrase.ts` | `PhraseContext.tagName`; `variety_relaxed` uses it. |
| `plan/hooks/useRuleForms.ts` | `useSlotRuleForm`: `courseId`, `courses`, `showCourse`, `setCourseId`; resets on slot change; adds `courseId` to the body. |
| `plan/hooks/useRules.ts` | `add` body type gains `courseId`. |
| `plan/components/RulesEditors.tsx` | `TagSelect`, `CourseSelect`, pills via `tagPill`, row titles with the Course; `tags: Tag[]`. |
| `plan/screens/PlanningRulesScreen.tsx` | `useTags()` (done in the stub commit). |
| `plan/hooks/useTagChoices.ts` | **delete**, with its `describe` in `hooks/wp6.hooks.test.tsx`. `planApi.tags` and `TagChoice` stay: `plan/{api,types}.ts` are G2's. |
| `plan/lib/rulesStrings.ts` (new) | only if a string is needed: `courseField: 'Course'`. Not `plan/strings.ts`. |
| `plan/plan.css` | only if the pill in a row needs spacing. |

Wiring `tagName` into the four `PhraseContext` callers (`MealTile`, `TonightHero`, `PlannedMealSheet`, `CourseRow`) is **not** in the file list of tg-plan; the library support and its tests are here, and the Project Manager decides who touches those four components (a `useTagName()` hook built on `useTagLookup`, one line each).

No Go, spec, GLOSSARY, CHANGELOG, settings, recipes or Tags-page changes. Nothing in `plan/{index,types,api,strings}.ts`.

## 3. Tests (all red against the stubs, unless noted)

- `lib/tagPill.test.ts`: key lookup, key rule (case, spaces), gone Tag.
- `lib/rules.course.test.ts`: `slotCourseChoices`, `defaultCourseId`, `ruleCourseName`.
- `lib/phrase.tagname.test.ts`: name, adjacent day, gone Tag, no lookup (passes today).
- `hooks/useRuleForms.course.test.tsx`: default main, reset on slot change, sent / not sent.
- `components/RulesEditors.tags.test.tsx`: pills (colour, name, neutral), dots in both selects, the key is what is saved.
- `components/RulesEditors.course.test.tsx`: select shown / hidden, options, `onAdd` bodies, row titles.
- `screens/PlanningRulesScreen.tg.test.tsx`: end to end with `/api/tags`, `/api/meal-slots` and the POST body.
- Changed existing tests (fixtures now full `Tag`s; the row text is a pill, not "Tag: pizza"): `RulesEditors.test.tsx`, `PlanningRulesScreen.test.tsx`. Their behaviour is otherwise untouched.
