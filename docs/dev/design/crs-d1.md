# CRS D1: Course lib, CoursePicker and CourseSelect

Team D1 of [crs-plan.md](crs-plan.md) (workstream D, wave 1). Spec: functional-spec 3.1, 4, 7.5 and 16. Decision: [ADR 0008](../../adr/0008-courses.md). Look and feel: Bento, built from the existing primitives; no new icon and no new colour.

D1 builds the shared parts only. It calls no API: the lib and the components take plain data in the shapes of spec section 16. The API client and `useCourses` belong to D2.

## 1. `web/src/lib/courses` (plain TypeScript, no React)

| File | Exports |
|---|---|
| `types.ts` | `Course` (the `GET /api/courses` row), `CourseChoice` (`{ id, name, main }`), `COURSE_NAME_MAX` 40, `MAX_COURSES` 20, `COURSES_EMPTY_MESSAGE` "Choose at least one Course" |
| `names.ts` | `courseNameKey` (trim, collapse inner whitespace, lower-case, accents count: the same rule as Go `course.NameKey`), `validateCourseName(name, others, selfId?)` answering `{ ok, name }` or `{ ok: false, reason: empty \| too_long \| taken, message }`, `courseNameMessages` |
| `order.ts` | `activeCourses` (household order, archived left out), `mainCourse`, `defaultCourseIds` (the main Course alone), `inHouseholdOrder`, `dropUnknownCourses`, `toggleOrdered`, `toggleUnordered`, `moveCourse`, `validateCourseIds`, `courseListLabel` ("Main · Side") |
| `fit.ts` | `fitsCourse`, `recipesForCourse` (Course fit for pickers), `includesMainCourse` (the Whole meal switch is shown only then), `removedCourseIds` (what a save takes off, for the "this removes" copy) |

Rules the tests pin: the household order is `position`; a Meal Slot keeps its own order; the main Course is found by its flag, never by its name; every function leaves its input alone; `moveCourse` answers the same array at an edge.

Planner Course fit (placing a Recipe in a Course) is Go (`internal/planner`); `fit.ts` is only the client-side filter for pickers.

## 2. `CoursePicker` (`web/src/ui/CoursePicker/CoursePicker.tsx`)

```ts
interface CoursePickerProps {
  label: string                      // "Courses": the group's visible and accessible name
  courses: readonly CourseChoice[]   // active Courses in household order
  value: readonly number[]           // ordered form: the slot's order
  onChange: (ids: number[]) => void
  ordered?: boolean                  // default true
  required?: boolean                 // default true
  disabled?: boolean
  helper?: string
  error?: string                     // replaces the built-in message
  renderRowExtras?: (row: CoursePickerRowContext) => ReactNode  // ordered form only
}
interface CoursePickerRowContext { course: CourseChoice; index: number; count: number }
```

**Structure.** A `role="group"` named by the label, described by the helper and the error. Inside:

1. One toggle chip per Course in household order (the shared `Chip` as a filter chip: a real `<button>` with `aria-pressed`, a tick when on). Every chip is a tab stop, Space and Enter toggle. The main Course chip has an accessible description "main Course" (a visually hidden span, `aria-describedby`), so the marker is not colour alone.
2. Ordered form only: an `<ol>` named "Courses in order" (`<label> in order`) built on the shared `Sortable` (`as="ol"`). Each `<li>` holds, in tab order: the drag handle ("Reorder Side", from Sortable, with its keyboard moves), the name (`data-testid="course-name"`), a "main Course" text marker on the main Course, the row extras, **Move Side up**, **Move Side down** and **Remove Side** as `IconButton`s (icons `moveUp`, `moveDown`, `close`, all existing). The first row's Move up and the last row's Move down are `disabled`.
3. A polite live region (`role="status"`) for the button moves: "Side moved to position 1 of 3." (`sortableStrings.moved`). Drag moves are announced by Sortable itself.
4. The helper, then the error (`role="alert"`).

**Behaviour.**
- Ordered form: choosing a chip adds the Course **last**; choosing a chosen chip or pressing Remove takes it off; reorder (handle, Move buttons) keeps the rest. The user can reach an empty choice (so switching Main for Side needs no detour); an empty choice shows the error "Choose at least one Course" (`COURSES_EMPTY_MESSAGE`) while `required`. The main Course is never required.
- Unordered form (a Recipe's Courses): no list, no handles, no Move or Remove buttons; `onChange` always answers in **household order**; same empty-choice error.
- Ids in `value` that `courses` does not list (archived, unknown) are not shown and are dropped from the next `onChange`.
- `disabled` disables every control.
- No native control: no `<select>`, no `<input>`, no `draggable`. Icons are decorative (`aria-hidden`).
- Pure rules come from `lib/courses` (`toggleOrdered`, `toggleUnordered`, `moveCourse`, `validateCourseIds`). The component renders and wires events.

**Files.** `CoursePicker.tsx` (props, composition), `CoursePicker.css` (Bento tokens only), a small `CourseRow.tsx` for one chosen row, and `strings.ts` for the copy. Gallery gets samples in both schemes.

## 3. `CourseSelect` and `CourseMultiSelect` (`web/src/ui/Select/CourseSelect.tsx`)

Thin wrappers on `Select` and `MultiSelect`, like `MealSlotSelect`. Both take `courses: readonly CourseChoice[]` (the caller passes fewer to limit them, e.g. a Meal Slot's Courses) and `SelectFieldProps`; `entityName="Course"`.

- `courseOptions(courses)`: household order kept, `value` the numeric id, `label` the name, `meta: "main Course"` on the flagged Course.
- `CourseSelect { value: number | null; onChange(id) }`: the replacement Course in the Delete dialog (default the main Course), the Slot Rule's Course.
- `CourseMultiSelect { values; onChange(ids) }`: `onChange` answers in household order. Used for filters. A Recipe's own Courses use the unordered `CoursePicker`, as the spec says (section 4); the plan's "CourseSelect for a Recipe" is that field.

## 4. Where D2 plugs in: the row extras slot

The user has decided that a Meal Slot Course gets an **optional** flag and an **attendance default** per Course (set in the Meal Slot editor). D1 does **not** build either. It only leaves the place:

- `renderRowExtras(row)` renders inside each chosen row between the name and the Move buttons, so a switch "Optional" and an attendance control can sit there.
- The value stays `number[]` (Course ids in the slot's order). Per-row data (`optional`, attendance) is **owned by the caller** and keyed by `row.course.id`; the picker never sees it. D2 keeps a map next to `value`, drops entries when a Course is removed and adds defaults when one is added (it can do that in the `onChange` of the form, by diffing with `removedCourseIds`).
- Moving or removing a row keeps the extras attached to the Course, because rows are keyed by Course id, so a control inside an extra keeps its focus and state when the order changes.
- Layout: the row wraps on a phone (name and extras on a second line, actions stay on the first); the extras container is a flex wrap with a gap, so D2 can add several controls.
- Extras must be accessible by themselves (label them with the Course name: "Optional: Side"); the picker does not name them.

If the design ends up needing the picker to own a richer value (`{ courseId, optional, attendance }[]`), D2 will change `value` and `onChange` then, with its own tests. Nothing in D1 blocks that.

## 5. Tests (red first)

- `lib/courses/{names,order,fit}.test.ts`
- `ui/CoursePicker/CoursePicker.test.tsx`: chips and ARIA, main marker, add last, remove, reorder by buttons and by keyboard handle, disabled edges, live region, unordered form, at least one required, row extras, native-free.
- `ui/Select/CourseSelect.test.tsx`
- `ui/index.courses.test.ts` (barrel) and `ui/Gallery.courses.test.tsx` (Gallery sections `CoursePicker` and `CourseSelect` in both schemes, including a sample with `data-testid="course-row-extra-sample"` in a row extra).

Components and lib functions are typed stubs that throw `not implemented`, so typecheck passes and only these tests fail.

## 6. For the developer

- Reuse `Chip`, `IconButton`, `Sortable`, `Select`/`MultiSelect`; copy no markup. No new icon: all names used exist in `icons.ts`.
- Class names follow `Name__element`, CSS uses tokens only (guards `colour-literals`, `sizing`, `class-hooks`).
- Keep strings in a `strings.ts`; use GLOSSARY terms ("Course", "main Course", "Meal Slot").
- Export from `ui/index.ts` (already added with the stubs) and add the Gallery samples.
