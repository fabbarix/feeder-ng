# C-RX: the Review Exclusions API

Design note for team C-RX. The route's shape and its reason are in `rx-pt.md` §3 and §4 (the page's grouping key, which
includes `courseId`); the stored detail is in `crs-brx.md` (`plan.Unfilled.Exclusions` / `MoreExclusions`, migration
1430). Spec: §7.4.1 and §16. This note fixes what those leave open and how the Developer wires it. Everything is
additive: no existing payload changes, and TG-R adds `tag_unknown` to `plan/httpapi` after this team.

## 1. The route

`GET /api/plan/couldnt-plan/exclusions`, `r.User(...)`: every signed-in User (plain or Admin), `401` when signed out.
Read only; no event. Registered in `httpapi.go` next to `GET /api/plan/couldnt-plan`.

The mux prefers it. Go's ServeMux picks the most specific pattern; `GET /api/plan/couldnt-plan/exclusions` has two
literal segments where the `{date}/{slotId}` routes have wildcards, and those routes are `PUT`/`POST` (or have a
third segment), so there is no conflict and no shadowing. A test fixes it: the answer is `{ "cells": [...] }`, never
a plan error, and `PUT` on the same path still reaches `setMeal` (`404 unknown_slot`), so only `GET` is taken.

## 2. Which cells

The cells `GET /api/plan/couldnt-plan` answers (today's slots not yet over, to the end of the Planning Horizon, one
per Course, plan order: date, slot time, the slot's Course order), **kept** when the stored reason is `no_candidates`
and `eliminated.exclusion > 0`. A Slot Rule cell with an Exclusion count is included (`slotRuleClaimed: true`); the page
filters by cause (rx-pt §4.3). `no_attendance`, `no_course_recipes` and a `no_candidates` cell with no Exclusion
count are not listed.

## 3. The answer

```json
{ "cells": [{
  "date": "2026-11-13", "mealSlotId": 4, "mealSlotName": "Dinner", "time": "19:30",
  "courseId": 2, "courseName": "Side",
  "slotRuleClaimed": false,
  "eliminated": { "considered": 4, "exclusion": 4, "coolDown": 0, "varietyRule": 0, "advanceStep": 0 },
  "attendance": [memberRef], "optOuts": [memberRef],
  "exclusions": [{ "member": memberRef, "ingredient": {"id": 12, "name": "garlic"} | null,
                   "recipes": [{"id": 4, "name": "Bolognese"}], "recipeCount": 4 }] | null,
  "moreExclusions": 0
}] }
```

- `cells` is `[]`, never `null`. `courseId` is the real Course id: the store's 0 (the transition shim's main Course) is
  mapped through `table.course`, as `couldnt-plan` does. `memberRef` is `{id, name, colour, photoUrl?, avatar?}`, the
  plan payload's attendee fields (`photoUrl`/`avatar` omitted when empty, as `attendeeOut`).
- `attendance`: the Course Attendance of that cell on that date, Portion Factor above zero, in the plan's order.
  `optOuts`: the Members attending the slot who do not eat this Course on that date, in Member id order. Both come
  from the runner's `CourseView` (`Attendance`, `OptOutMemberIDs`), the source of `GET /api/plan`'s
  `optOutMemberIds`, so a per-date override is honoured. Both are `[]` when empty, never `null`.
- `exclusions` is `null` when nothing is stored: `Unfilled.Exclusions == nil` **and** `MoreExclusions == 0` (the store
  reads `NULL` as both). Otherwise it is a non-nil list, empty when every record was dropped.
- Names are resolved **at read time** through `names.load` (one snapshot per request). The stored ids have no foreign keys:
  - a record whose Member is gone is dropped;
  - an Ingredient record (`ingredientId > 0`) whose Ingredient is gone is dropped (it is not turned into a direct
    record);
  - a Recipe that is gone is dropped from `recipes` and `recipeCount` is lowered by one for each (the stored count
    minus the dropped ids; the ids are capped at 5, so `recipeCount` can still exceed `len(recipes)`);
  - a record left with no Recipe is dropped;
  - `ingredientId == 0` is a direct record: `"ingredient": null` (present, not omitted).
- `recipes` are in name order (case-insensitive, then id). Records keep the planner's stored order (count, Member id,
  Ingredient id). `moreExclusions` is the stored `more`, unchanged by dropped records.

## 4. Developer wiring (all in `internal/plan/httpapi`, new file `exclusions.go`)

1. `couldntExclusions(w, r)`: `entries := a.run.CouldntPlan(ctx)` for the cell list (same dates and order as
   `couldnt-plan`, Course keys already real); keep those whose `Unfilled` is `no_candidates` with
   `Eliminated.Exclusion > 0`. `a.run.View(ctx, "", "")` once, indexed by (date, slot, course), gives each cell's
   `CourseView` (Attendance, OptOutMemberIDs). A slot without Courses (the shim) has no `CourseView`: use the slot's
   `Attendance` and no opt-outs, with `courseId` mapped by `t.course`. `t, _ := a.names.load(ctx)` (no meals).
2. The pure helpers, unit-tested in package `httpapi`: `memberRefFor`, `attendanceFor`, `optOutsFor`,
   `exclusionsFor(plan.Unfilled, table)`. The handler only parses, calls and responds.
3. No runner, store or planner change; `slotFor`/`unfilledFor` are untouched (the existing payloads stay as they are).

## 5. Tests (red)

- `internal/plan/httpapi/crs_crx_names_test.go` (package `httpapi`): `exclusionsFor` resolution, direct record, name
  order, stored order, gone Member / Ingredient / Recipe / empty record, null vs `[]`; `attendanceFor`, `optOutsFor`,
  `memberRefFor`.
- `internal/plan/httpapi/crs_crx_test.go` (package `httpapi_test`, fixture `crsc2`): names resolved; plan order and
  real Course ids; `exclusions: null`; `moreExclusions`; gone names; direct record `ingredient: null`; only cells with an
  Exclusion count; the dates of `couldnt-plan` (over, past and beyond-horizon cells are not listed); Course Attendance
  and opt-outs, including a per-date override; empty answer; access (User, Admin, `401`); the route is not shadowed;
  no existing payload carries the detail.
- `bdd/features/planning/couldnt_plan_exclusions.feature` with `bdd/steps_crx_test.go`, through the real planner: Sam
  excludes garlic and every Side has it; a direct Dessert Exclusion (`ingredient: null`); a Member who opts out of the
  Course is not counted and the Dessert is planned; attendance and opt-outs shown; removing the Exclusion replans and
  the cell goes; other reasons and an Exclusion-free count are not listed; a reason without stored detail answers
  `exclusions: null`; signed out is `401`.

## 6. Out of scope

The page and tile action (G2), TG-R's `tag_unknown`, the planner, GLOSSARY, CHANGELOG, the spec and `web`.
