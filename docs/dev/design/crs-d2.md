# CRS D2: web Settings for Courses (design note)

Step 1 of the pipeline (designer / test author) for team D2 of [crs-plan.md](crs-plan.md) (workstream D, wave 2). Decision: [ADR 0008](../../adr/0008-courses.md). Spec: functional-spec 3 (Meal Slots, Course Attendance), 3.1 and 16. Builds on [crs-d1.md](crs-d1.md) (`lib/courses`, `CoursePicker` with `renderRowExtras`, `CourseSelect`) and on the API of [crs-c1.md](crs-c1.md). Look and feel: Bento, built from the existing primitives; no new icon and no new colour. Branch `team/crs-d2`, from main `cd39ff1`.

The tests are red on purpose and only the new ones fail. New logic is a stub that throws `not implemented`; new components render `null`; typecheck passes.

## 1. Scope and files

| Area | Files (new unless noted) |
|---|---|
| API client and query | `web/src/lib/courses/{api,queryKeys,useCourses}.ts` (`index.ts` stays the pure barrel: `useCourses` is imported from `lib/courses/useCourses`) |
| Pure logic | `settings/lib/{courseList,courseRemoval,slotCourses,dateCourses}.ts`; changed: `slotForm.ts`, `multiDay.ts`, `errors.ts`, `liveUpdates.ts`, `settingsSections.ts` |
| Hooks | `settings/hooks/{useCourseRemoval,useSlotPreview,useCoursesPage}.ts`; changed: `useSlotForm`, `useMealSlots` (`preview`), `useAttendance`, `useMealSlotsPage`, `useHouseholdLiveUpdates` |
| Components | `settings/components/{CourseRow,CourseRemoveDialog,CourseEaters,SlotCoursesField,DateCoursesSection}.tsx`; changed: `MealSlotEditor`, `DateAttendancePanel`, `MealSlotWeek`, `MealSlotGrid` |
| Screen | `settings/screens/CoursesPage.tsx` (+ `settings.css` rules, tokens only) |
| Wiring (D2 goes first, TG-S adds `/settings/tags` after) | `settings/index.ts`, `app/breadcrumbs.ts`, `app/pageWidths.ts`, `scripts/lib/page-layout-rules.mjs` (`ROUTES`), `scripts/check-page-layout.modes` (`fail_routes`) |
| Copy | `settings/coursesStrings.ts` (written, final), `settings/strings.ts` (`index.sections.courses`, written) |

Not in: Go, GLOSSARY, CHANGELOG, the spec, `features/{plan,today,cook,recipes,shop}`.

## 2. `lib/courses` additions

- `coursesApi` (`api.ts`): `list(includeArchived)` unwraps `{ courses }` (`?archived=1` when asked); `create(name)`; `update(id, { name?, main?: true })`; `reorder(ids)` (every **active** Course once, answers the list unwrapped); `impact(id)`; `remove(id, replacement?)` (`?replacement=` only when given); `archive(id, replacementId?)` (the key left out when none); `unarchive(id)`.
- `courseKeys` (`queryKeys.ts`, written): `all = ['courses']` is the prefix every household `courses` event invalidates; `lists = ['courses','list']` is the prefix of the two list queries that every write invalidates (`list(false) = ['courses','list','active']`, `list(true) = ['courses','list','all']`). **Exception:** `impact(id) = ['courses','impact',id]` is not under `lists`, so a write never refetches it (a deleted Course's impact answers 404); the impact query does not retry a 404.
- `useCourses({ includeArchived })`: one query (`/api/courses` or `?archived=1`). Returns `courses` (as served), `active`, `archived`, `choices` (active, as `CourseChoice`), `main`, `isPending`, `isError`, the writes (`add`, `rename`, `makeMain`, `reorder`, `loadImpact`, `remove`, `archive`, `unarchive`) and `saving`. Every write invalidates `courseKeys.lists` (rename too, by plain invalidation: the lists come from the server); `remove` and `archive` also invalidate the Meal Slots query (`settingsKeys.slots`), because the Course leaves the slots. A refused write rejects with the `ApiError`.

## 3. Settings > Courses (`/settings/courses`)

`CoursesPage` composes the shared `ListPage` (header `PageHeader` with the Settings breadcrumb, the intro, then the list). It mounts `useHouseholdLiveUpdates()` so another User's write shows. One query: `useCourses({ includeArchived: true })`.

- **Admin** sees: `Sortable` (`as="ul"`, `aria-label="Courses"`) of the active Courses; one `CourseRow` each; the Add Course field at the end; the archived section. **A plain User** sees the same list read-only ("Only an Admin can change the Courses."): no handle, no menu, no Add Course, no Unarchive.
- `CourseRow` (`<li>`; the Sortable's `itemProps` when sortable): drag handle (from Sortable, first), name (`data-testid="course-name"`; while renaming, the field takes the place of the name and chip), a "Main" chip on the main Course (`data-testid="course-main-chip"`, the shared `Chip`), the meta `courseMeta` ("12 Recipes · 5 Meal Slots"), and the shared `Menu` named "Actions for <name>" with `courseActions`. An archived row has "Unarchive <name>" (a button) instead of handle and menu.
- **Rename** is inline: the name becomes a `TextField` "Rename <name>" (focused, no `maxLength`: the 40-character rule is the validator's message) with Save and Cancel; Enter saves, Escape cancels; the same `validateCourseName` as adding (archived names count). A server `course_name_taken` shows its own sentence.
- **Make main**: `PATCH { main: true }`, toast "<name> is now the main Course.". **Reorder**: Sortable `onReorder` -> `reorderedIds` -> `PUT /api/courses/order` with the active ids; a drop in place sends nothing.
- **Add Course**: `TextField` "New Course" + "Add Course"; Enter adds; client validation first (`validateCourseName` against all Courses, archived included), then `POST`; toast "Added <name>.", field emptied. At 20 active Courses the field and button are disabled and `coursesStrings.atLimit` explains. `422 too_many_courses` (also from Unarchive) shows the same sentence.
- **Archived section**: a disclosure button "Archived Courses (n)" (`aria-expanded`, collapsed), absent when none; rows with Unarchive (Admin); toast "<name> is back in the list, last.".
- **Focus** (never `<body>`): after a rename is saved (Enter or Save) or cancelled (Escape or Cancel), focus returns to the row's "Actions for <name>" button (with the new name after a save). After a successful Delete or Archive the row leaves the list and focus goes to the "Actions for <name>" button of the row that takes its place (the next row); if it was the last row, the previous row; if no active row is left, the list itself (`tabIndex=-1`, named "Courses"). The main Course cannot be removed, so the list is never empty in practice.
- Errors: other failures show `coursesStrings.actionFailed` in an error toast; loading is a `role="status"` line, a failed load "Could not load the Courses.".

### 3.1 Delete / Archive: `useCourseRemoval` and `CourseRemoveDialog`

`useCourseRemoval(courses, onDone)` is the state machine: `open(course)` loads the impact (`loadImpact`); `mode` starts `delete`; `choices = replacementChoices(courses.choices, course)`; `replacementId` starts at `defaultReplacement(choices)` (the main Course); `needsReplacement = needsReplacement(impact)`. `confirm()`:

1. `delete`: `remove(id, needsReplacement ? replacementId : undefined)`. `409 course_planned` (`isPlannedRefusal`) switches `mode` to `archive`, keeps the dialog open with the same replacement and no error.
2. `archive`: `archive(id, needsReplacement ? replacementId : undefined)`.
3. Success closes and calls `onDone({ mode, course })` (the page toasts "Deleted <name>." or "Archived <name>."). Any other refusal stays open with `removalErrorMessage` (`course_main`, `course_last`, `replacement_invalid`, else the generic sentence). The replacement is sent only when somebody needs it; a stale count is answered by `replacement_invalid`.
4. `loadFailed` (the impact could not be loaded) disables confirm.

`CourseRemoveDialog` is built on the shared `Dialog` (a `<dialog>`), `tone="danger"` with initial focus on Cancel in Delete mode; the body, in order: the planned-refusal sentence (Archive only), `usageLine`, the replacement block (`CourseSelect` "Replacement Course" and `replacementLine`, only when needed), the "Planned Meals that go, from today on" list (Pinned first, each marked "Pinned" in words; `plannedMealLines`), the "Slot Rules that go" list (`slotRuleLines`), the planned-refusal sentence is `role="status"` so a Delete that turns into Archive is announced, the error as `role="alert"`, a `role="status"` line while loading. Actions: Cancel, then "Delete Course" or "Archive Course". No `ConfirmDialog` (it takes a plain-text body).

## 4. Meal Slot editor

New optional props on `MealSlotEditor`: `courses?: CourseChoice[]` (the household's active Courses; **absent or empty: no Courses field, no `courses` key anywhere**, so every existing test and caller is unchanged) and `onPreview?: (request) => Promise<SlotBatchResult>`.

- **Data.** `MealSlotInput.courses?: SlotCourseInput[]` (`{ id, optional, optOutMemberIds }`, in the slot's order). `slotDraft(slot, members, courses)`: a new slot starts with `newSlotCourses` (the main Course, required, nobody opting out), an existing one with `slotCourseInputs(slot)`. `slotInputsForWeekdays` copies the Courses per weekday. `MealSlot.courses` and `DateAttendance.courses` are optional **in the type only** so older fixtures compile; the server always sends them (a later tidy can make them required).
- **`SlotCoursesField`** = the shared ordered `CoursePicker` (label "Courses", required) with `renderRowExtras` rendering, per chosen Course: the `Switch` "Optional" (accessible name "Optional: <Course>") and `CourseEaters` (the group "Who eats <Course>", visible label "Who eats it") over the draft's attendees (`attendeesOf`; "Choose who attends first." when nobody). The picker `helper` is the Optional sentence of the spec, once. Per-row data is keyed by Course id, so it follows its Course through moves (D1 section 4). `withCourseIds` (picker `onChange`) keeps Optional and opt-outs of kept Courses and starts a new one required with nobody opting out; `withOptional`, `withEater` edit one Course. Opt-outs of a Member who stops attending are kept and not shown (spec 3.1).
- **`CourseEaters`**: `role="group"` with one toggle `<button aria-pressed>` per Member (the shared `MemberPill` inside; name = the full name, the pill shows the first name), pressed = eats. Below it, in words, `eatersSummary` ("Dessert · without Sam"; the names follow the Members' own order, not the order of the opt-outs), so the state is not only a pill state. No native control.
- **Problems.** `coursesProblem`: none -> "Choose at least one Course"; all optional -> "Keep at least one Course that is not optional". It blocks the save (add and edit) and is shown **once**, as the picker's `error` (so there is one `role="alert"`). A server `422 validation_failed` with `reason: courses_all_optional | courses_empty | course_unknown` is mapped by `errors.ts` to the same sentences, whatever the server wording.
- **Multi-day edit.** `changedFields` adds `courses` only when `coursesChanged` (order, set, an Optional flag or an opt-out set; the opt-outs' own order ignored); `hasChanges` counts it; the batch `set.courses` is the whole list. A time-only edit sends none.
- **Preview.** While editing with `onApply`, `useSlotPreview(request, run)` is fed the live batch request **only when a Course is taken off a matching slot** (`courseRemovals(matched, draft).length > 0`; otherwise `null`). It runs `run({ ...request, dryRun: true })` (the page passes `useMealSlots().preview`, which sends the request as given and does not refetch; `useSlotPreview` is the one that sets `dryRun`), keyed by the request's JSON, latest answer only. The "What will change" list gains `removalPreview(...)` lines: "Removes Side from Tue and Thu: 3 Planned Meals and 1 Slot Rule go" ("goes" for a single item; "Removes Dessert from Tue." when nothing goes with it) and, under "Pinned Planned Meals that go", the Pinned meals ("Roast potatoes · Dinner · Thu 12 Nov"). A failed preview says "Could not check what goes." and **never blocks Save**.
- **Overview.** `MealSlotWeek` and `MealSlotGrid` show `courseOverviewLine` under each slot ("Main · Side · Dessert (optional) without Sam"; nothing for a slot with no `courses`).

## 5. Date Attendance sheet

`DateCoursesSection` (a `<section>` named "Courses", a `region`) opens with a **visible** heading "Courses" (the section's `aria-labelledby`). Each Course is a `role="group"` named by its **visible Course name** (a text element above the pills, referenced by `aria-labelledby`; no `aria-label`), so sighted users can tell the pill rows apart. The group's accessible name is the Course name; the pills' summary and "Reset <Course> to usual" keep their text. It is is shown when `attendance.courses.length > 1`. Per Course (the slot's order): `CourseEaters` over the **sheet's current draft** attendees, the summary line, and a "Reset to usual" button (`aria-label` "Reset <Course> to usual"), enabled only while that Course is an override. State is `DateCourseDraft[]` (`dateCourseDrafts`, `withDateEater`, `resetDateCourse` with the usual opt-outs from `slot.courses`); the sheet's `key` includes the Courses' override flags so a server answer renews the draft.

`onSave(attendance | undefined, courses?)`: `courses` is `dateCourseChanges(served, drafts)` (a list for a Course that now has its own opt-outs, `null` for one that was reset, a Course not changed or changed back is not named) and is **left out entirely** when empty; `attendance` is `undefined` when only the Courses changed (the API then leaves the date's Attendance alone, crs-c1 3.4); an Attendance-only change is `onSave(entries)` exactly as before. `settingsApi.saveAttendance` leaves undefined keys out of the body. "Reset to usual Attendance" is enabled by `hasDateOverride` (Attendance or any Course override).

## 6. Wiring

- Routes: `/settings/courses` -> `CoursesPage` after `/settings/meal-slots` in `index.ts`. Settings index: section `courses` ("Courses", "What a Meal Slot serves, and which Course is main", icon `dinner`, not `adminOnly`) right after Meal Slots. Breadcrumb: `{ path: '/settings/courses', label: sections.courses.title, parent: '/settings' }`.
- `pageWidths.ts`: an explicit `{ path: '/settings/courses', width: 'narrow' }` row (the `/settings/*` fallback already says narrow; the row is for the contract), and the same pair in `ROUTES` of `scripts/lib/page-layout-rules.mjs`; `pageLayoutRules.test.ts` proves they agree. `scripts/check-page-layout.modes`: `/settings/courses` into `fail_routes`, so the page must pass the layout guard (narrow column, no horizontal scroll, ListPage gaps).
- Live updates: `liveUpdates.ts` maps `changed: 'courses'` to `[['courses'], ['household','meal-slots']]` (the Courses query and the slots that name them); the reconnect handler in `useHouseholdLiveUpdates` also invalidates `['courses']`.

## 7. Tests (red) and where they live

| What | File |
|---|---|
| API client, hook | `lib/courses/{api.test.ts,useCourses.test.tsx}` |
| Pure logic | `settings/lib/{courseList,courseRemoval,slotCourses,dateCourses,slotForm.courses,multiDay.courses,errors.courses}.test.ts`, `liveUpdates.test.ts` (changed) |
| Hooks | `settings/hooks/{useCourseRemoval,useSlotPreview,useHouseholdLiveUpdates.courses}.test.tsx` |
| Components (keyboard, ARIA) | `settings/components/{CourseEaters,SlotCoursesField,CourseRow,CourseRemoveDialog,MealSlotEditor.courses,DateAttendancePanel.courses,MealSlotWeek.courses}.test.tsx` |
| Screens | `settings/screens/{CoursesPage,MealSlotsPage.courses}.test.tsx` |
| Wiring and guard routes | `settings/{index,failRoutes,settingsWidths}.test.ts`, `settings/lib/settingsSections.test.ts`, `settings/screens/SettingsIndexPage.test.tsx`, `app/{breadcrumbs,pageWidths,pageLayoutRules}.test.ts` (each gains the Courses rows) |
| Fixtures | `settings/components/courseFixtures.ts` |

Green on purpose (guards): `MealSlotEditor` without `courses`, `DateAttendancePanel` and the week/grid without Courses, `/settings/courses` is narrow through the `/settings/*` wildcard.

## 8. For the developer

- Reuse `ListPage`, `PageHeader`, `Sortable`, `Menu`, `Chip`, `Switch`, `MemberPill`, `CoursePicker`, `CourseSelect`, `Dialog`, `TextField`, `Button`, `useToast`; copy no markup. Icons only through `Icon`/`IconButton`; no new icon (`dinner` for the index row).
- Logic stays out of components: every rule above is a function in `settings/lib` or `lib/courses`; hooks only wire state and the API (CLAUDE.md). Class names `Name__element`, tokens only in CSS (guards `colour-literals`, `sizing`, `class-hooks`); CSS goes in `settings.css`.
- Course names, copy and pluralisation are in `coursesStrings.ts` and the lib functions; the test literals are the contract.
- Keep the word list of the GLOSSARY: Course, main Course, Meal Slot, Planned Meal, Slot Rule, Recipe, Attendance, Pinned.
- Add the page hook `useCoursesPage` (not stubbed: the screen tests pin the behaviour, not the hook).

## 9. Gaps and decisions for the spec / plan

1. **List answers.** The design assumes `PUT /api/courses/order` answers `{ courses: [...] }` like `GET` (§16 says "the list"); the client unwraps both.
2. **Replacement sent only when needed.** The dialog shows and sends a replacement only when `recipesOnlyThis + mealSlotsOnlyThis > 0`; a count that went stale is answered by `422 replacement_invalid`, shown as "Choose a replacement Course.".
3. **`MealSlot.courses` and `DateAttendance.courses` are optional in the types** so the 30-odd existing fixtures compile untouched; the UI treats absent as "no Courses". A follow-up can make them required once the fixtures carry them.
4. **The overview shows a Courses line on every slot**, a single "Main" included (spec 3.1: "each slot's Courses under its name"); upgraded Households will see "Main" everywhere until they add Courses. The team lead may prefer to hide a lone main Course.
5. **Preview only on removal.** The dry run is asked only when a Course is taken off a matching slot; the spec's "Pinned ones are listed before saving" is the only reason for it (adding or reordering needs no preview).
6. **A plain User and archived Courses.** Archived rows are readable by a plain User but cannot be unarchived (spec: Admin edits, every User opens read-only).
7. **Unarchive on a full list** (`too_many_courses`) shows the 20-Course sentence as an error toast.
8. **Layout guard on `/settings/courses`** cannot be run here (`PAGE_LAYOUT` is not set for the red run); the developer or reviewer should run `PAGE_LAYOUT=quick scripts/check.sh` once the page exists, since the route becomes a `fail` route.
