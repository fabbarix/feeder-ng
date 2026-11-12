# CRS G2: Couldn't plan per Course, the setup checklist and the Review Exclusions page

Step 1 of the pipeline (designer / test author) for team G2 of [crs-plan.md](crs-plan.md), branch `team/crs-g2` from main `1516fce` (F is merged). Decisions: [ADR 0008](../../adr/0008-courses.md), [ADR 0009](../../adr/0009-soft-cool-down-and-variety.md). Spec: functional-spec §7.4, §7.4.1, §7.5, §9 and §16. Page design: [rx-pt.md](rx-pt.md) §4 (this note fixes what it leaves open and where it differs). API: `GET /api/plan/couldnt-plan/exclusions` is on `team/crs-crx` (design `crs-crx.md` there); the web is built against its documented shape.

The tests are red on purpose and only the new ones fail. Existing tests stay green except where they pinned behaviour this task removes or changes (below). The commit adds: tests, types (real), one fixture file (`plan/couldnt-fixtures.ts`), the few strings the compile needs, and stubs that throw `CRS G2: not implemented` or render `null`.

Not in G2: Settings, Recipes, Tags web, GLOSSARY, CHANGELOG, the spec, Go, the alias removal (C3). G2 changes no payload.

## 1. What changes, in one list

1. **Per-Course cells.** Couldn't plan works on *cells* (one Course of one slot on one date), not slots. The plan view's `slots[].courses[]` is expanded into flat cells with the same shape as the API's flat entries (`GET /api/plan/couldnt-plan` already answers one entry per Course, with `courseId`, `courseName`, `meal: null`, `unfilled`).
2. **New cause `no_course_recipes`** ("No Recipes for this Course"), info tone, fix **Mark Recipes as <Course>**.
3. **Cool-down and Variety are gone** as causes: their `Cause` values, copy, icon entries, the Review Cool-down fix and its Admin-only entry. Old stored `eliminated.coolDown` and `varietyRule` counts are ignored (the cell is filed by the other counts, or No fit).
4. **Review Exclusions** becomes a link to the new page `/plan/couldnt-plan/excluded`, and the lines of the Excluded tile's "Show all" link to their cell on it.
5. **The Review Exclusions page** (route, page width, breadcrumbs, layout guard, screen, hook, lib, two Tiles, live updates).
6. **The Course row on the Plan** shows its own cause on the "Not planned" chip (spec §7.4 "On Plan").
7. **The setup checklist** reads the plan per Course (a slot has `courses`; after C3 it has no `meal` or `unfilled` of its own).

## 2. Couldn't plan per Course

### 2.1 Cells (`lib/couldntGroups.ts`)

- `courseCells(slots)`: every Course of every slot that holds a Planned Meal or a reason, as a flat cell in plan order (slots as given, the slot's Course order): `{ ...slot, courseId, courseName, meal, unfilled }`. Covered and not-served Courses hold neither, so they give no cell. An entry that already has a `courseId` is a cell and is kept as it is (so the API's flat entries pass through, and so does `courseCells(courseCells(x))`). A slot without `courses` is one cell, itself (before C3, and for older fixtures). A slot whose time has gone gives nothing.
- `unplannedOf(slots)` = `courseCells(slots)` with `meal === null` and a reason. `usePlanScreen`, Today and the hooks need no other change.
- `causeOf(x)` takes anything with `unfilled` (a cell, a `PlanCourse`). Order: `no_attendance`; `no_course_recipes`; Slot Rule claimed; `considered === 0` is No Recipes; then the largest of `exclusion` and `advanceStep` (ties: Exclusion); else No fit.

### 2.2 Counting and naming

A cell knows how many Courses its slot has from `all`, the whole plan (`courseCells(all)`; a cell expanded from a slot also carries `courses`). `groupByCause(cells, all = cells)`:

| Cause | `count` is | Noun in the headline |
|---|---|---|
| Nobody attends | distinct Meal Slots (date, slot id) | "Meal Slot(s)" (Attendance is per slot) |
| Every other cause | cells (Courses) | the Course name pluralised on its last word ("5 Sides", "1 Side", "2 Side dishes") when every cell is one Course; "Course(s)" when they differ; "Meal Slot(s)" when no cell's slot serves several Courses (a Household with one Course per slot reads exactly as before) |

`headline` is `Couldn't plan <count> <noun>. <text>`. `no_course_recipes` text is "No Recipes are marked as <Course>." for one Course, else "Some Courses have no Recipes marked for them." (also when a cell has no Course name). Copy for the Excluded text reads "Every Recipe is excluded for someone who eats it." (Course Attendance is per Course; spec §7.4.1 repeats it on the page).

`items` are the lines of "Show all N" (N = `items.length`; no button for one line). A cell is named, "Fri 13 Nov · Dinner · Side", unless every Course the slot has (its counting cells) is in the group, in which case the slot gets one line, "Fri 13 Nov · Dinner". Each item has `id` `cell-<date>-<mealSlotId>-<courseId>` (its first cell) and, for the Excluded cause only, `to` = `/plan/couldnt-plan/excluded#<id>`. Decision: N counts lines, not Courses, so the button always matches what it opens.

`summarizeCells(cells, all)` (`lib/couldntSummary.ts`): slots with every Course affected are summarised once by Meal Slot with `summarizeSlots`; the rest per Course, "Side at every dinner this week", the Course's own clauses measured against that Course's counting cells in `all` (so a Main-only Lunch does not stop "every dinner"). Joined with ", plus ", whole-slot part first, then Courses by number of cells. `summarizeSlots` gains `{ capitalise: false }` for the inside-a-sentence form (weekday names keep their capitals). Without Courses it equals `summarizeSlots`.

### 2.3 Fixes

| Cause | Fix | Admin only |
|---|---|---|
| Nobody attends | Choose who attends, `/settings/meal-slots#meal-slot-<first slot>` (unchanged) | yes (the only one left) |
| No Recipes | Add Recipes, `/recipes` | no |
| **No Recipes for this Course** | **Mark Recipes as <Course of the earliest cell>**, `/recipes?notCourse=<id>` (`s.markRecipesAs`, F's `relaxedLine` uses the same link); no Course known: "Mark Recipes", `/recipes` | no |
| Slot Rule unmet | Review Slot Rules (unchanged) | no |
| Excluded | **Review Exclusions, `/plan/couldnt-plan/excluded`** | no, never "Ask an Admin" |
| Advance Step, No fit | Choose a Recipe (unchanged); `useCouldntFix` now passes the cell's `courseId` to the chooser so it lists that Course's Recipes (`GET /api/recipes?course=<id>`) | no |

`ORDER`: nobody_attending, no_recipes, no_course_recipes, slot_rule, excluded, advance_step, no_fit. `META`: `no_course_recipes` is info with the `recipes` icon. `shortReason('no_course_recipes')` is "No Recipes for this Course." Strings: `couldntCauseText`, `couldntHint`, `couldntShort`, `couldntFix` have exactly the seven causes (a test pins it); `couldntInCoolDown` and `couldntVarietyRule` go with `lib/couldnt.ts`' Cool-down and Variety branches (`couldntPlanText` is unused; the Developer removes those branches and, if nothing uses it, the file and its test).

### 2.4 The Course row on the Plan (`components/CourseRow.tsx`)

An empty Course row with a reason shows the "Not planned" chip in the cause's tone (`toneStyle(toneOf(causeOf(course)))`: warn is amber `data-status="spoil"`, info is blue) and the short reason as a line (compact rows: as a `title`). Nobody attends offers no "Choose a Recipe" (as a lone slot does). An empty Course with no reason keeps the plain chip. Optional and not-served Courses have no row, as F did.

### 2.5 Tile (`components/CouldntPlanTile.tsx`)

Renders `group.items` instead of `slotLine(slot)`; an item with `to` is a router `Link` (the text is the link), others plain text. The button reads `Show all <items.length>` and shows only for two or more items. Everything else (section named by the headline, tone, fix button, `canFix`, `Ask an Admin`) is unchanged. The list keeps `list-style: none`.

### 2.6 Today

`useCouldntPlanNotice(cells, all, isAdmin)` is unchanged in shape: Today passes the API's flat entries and the plan view. Its `summary` is `summarizeCells`. `needsSetup` and `compose` are untouched (`couldntPlan` is still the entry count).

## 3. The Review Exclusions page

Route `/plan/couldnt-plan/excluded`, page width `default`, breadcrumbs Plan > Review Exclusions, title "Review Exclusions", registered in `plan/index.ts`. Every User may open it. Entries to add (data, the Developer's): `pageWidths.ts` (`default`), `scripts/lib/page-layout-rules.mjs` `ROUTES`, `breadcrumbs.ts` (a `/plan` root, label "Plan", and the route) with `breadcrumbStrings.ts`, `scripts/check-page-layout.modes` `fail_routes`. `app/couldntPlanExcludedRoute.test.ts` pins all of them; the existing "every feature route has an explicit width" test fails until `pageWidths.ts` has it.

### 3.1 Types and API

`types.ts` (real): `MemberRef`, `ExclusionRecord`, `ExclusionCell` (the documented payload); `planApi.couldntExclusions()` (real, one line). The hook's query key is `['plan', 'couldnt-plan', 'exclusions']`, a child of `['plan']`, so `usePlanLiveUpdates` (SSE `plan`, reconnect, `household` changes) already refetches it.

### 3.2 Lib (`lib/couldntExclusions.ts`)

| Function | Contract |
|---|---|
| `excludedCells(cells)` | the cells the tile files under Excluded (`causeOf` on the cell's reason): drops Slot Rule cells and cells where an Advance Step removed more; ties stay; stored Cool-down counts are ignored |
| `cellsAsEntries(cells)` | flat entries for the tile code (`name` = `mealSlotName`, reason `no_candidates`, `courseId`, `courseName`) |
| `excludedSummary(cells, slots)` | the Excluded group's headline over `excludedCells`, or `null` ("Couldn't plan 3 Sides. Every Recipe is excluded for someone who eats it.") |
| `explanationGroups(cells, slots)` | one `ExplanationGroup` per explanation, in the order of each group's first cell. Key: `courseId`, `exclusions`, `moreExclusions`, `attendance` ids, `optOuts` ids; `exclusions: null` groups together. Each carries `summary` (`summarizeCells`), `items` (as §2.2, no `to`, always from `cellItems`) |
| `recordText(record)` | first line as `RecordPart[]` (`text`, `strong`, `to`): "Sam excludes garlic" (Member and Ingredient strong); "Alex excludes Fish pie"; "Alex excludes 3 Recipes: Fish pie, Lasagne and Paella". Each Recipe is a link `/recipes/<id>#preference-member-<memberId>`. First names only. More than three Recipes: the first three, then "and N more" with N = `recipeCount` minus the names shown |
| `recordDetail(record)` | second line of an Ingredient record: "Rules out 4 Recipes: Bolognese, Garlic bread, Pesto pasta and 1 more" ("1 Recipe" singular); `null` for a direct one |
| `recordAction(record)` | "Review garlic" to `/ingredients/<id>#exclusions` for an Ingredient; `null` for a direct one |
| `optOutLine(cell)` | "Kim opts out of Side, so Kim's Exclusions don't count here." Two: "Kim and Ada opt out of Side, so their Exclusions don't count here."; three or more "Kim, Ada and Sam opt out of ..."; `null` for none |

rx-pt §4.4 named `recordText` and `recordLinks`; the links are split between `recordText` (Recipes) and `recordAction` (the Ingredient) because the Recipe links sit inside the first line.

### 3.3 Hooks

- `useCouldntExclusions()` → `{ cells, groups, headline, isLoading, failed, refetch }`: the query, joined with `usePlan().slots`; loading while either is; `failed` when either failed with no data.
- `useExplanationExpansion(groups, hash)` → `{ isOpen(key), toggle(key), targetId }`: the group holding the cell the hash names starts open and `targetId` is that cell's id; a hash naming nothing opens nothing; it opens the target when the groups arrive after the hash.

### 3.4 Components and screen

- `CouldntPlanExclusionSummary({ headline })`: warn status Tile (`exclusion` icon), section named by the headline, "Change an Exclusion below, or choose a Recipe by hand on the Plan.", a link **Open the Plan** to `/plan` (a router `Link` styled as the tertiary Button, as the Tiles' text links are).
- `CouldntPlanExclusionTile({ group, expanded, onToggle, focusId })`: warn status Tile, `section` named by an `h2` with the group's `summary`; **Who eats it** (`list` named "Who eats it" of `MemberPill`s); the opt-out line when present; **Exclusions** (`ListGroup` named "Exclusions", one `ListRow` per record with the Member's `Avatar` as `leading`, `recordText` as the title, `recordDetail` as the meta, `recordAction` as a trailing link); `moreExclusions > 0` ends the list with "and 2 more Exclusions" ("and 1 more Exclusion"); `exclusions: null` replaces the list with "Feeder is still working out which Exclusions these are. Check again in a moment."; the cells in a `list` named "Where this applies", each `<li id="cell-…" tabindex="-1">`, behind a **Show all N** disclosure (`aria-expanded`, `aria-controls`; "Hide the list" when open). A Tile of one cell always shows its line and has no button, so a link from the tile can land on it. `focusId` of a cell in this Tile focuses that `<li>` after render and scrolls it into view.
- `CouldntPlanExclusionsScreen`: `PageHeader` (h1 "Review Exclusions", breadcrumbs from `useBreadcrumbs()`), then in a `BentoGrid`: summary Tile, one Tile per group; empty state `EmptyState` "No Course is held back by Exclusions now." with **Open the Plan**; loading "Loading the Exclusions…"; failure `ErrorState` "The Exclusions could not be loaded." with Try again. `useLocation().hash` feeds `useExplanationExpansion`. Composition only.
- New CSS in `plan.css` with tokens only; every `<ul className>` has `list-style: none` and the focus target (`[tabindex="-1"]:focus`) has a visible ring or highlight (`couldntExclusionsCss.test.ts`). Icons only through `Icon`; no native controls (`native-controls.test.ts` already globs the new files).

## 4. The setup checklist

`today/lib/setup.ts` gains `planFacts(slots)`: `plannedMeals` and `unplannedMeals` counted over every Course (a Course with a Planned Meal; a Course with a reason and no Planned Meal); a slot without `courses` counts its own `meal` and `unfilled`; covered and not-served Courses count nowhere, so an optional Course or a Course nobody eats never makes a step look missing; an empty `courses` list counts nothing. `setupSeam.useSetupFacts` calls it (its local `PlanView` type gains `courses`). `setupChecklist` and `needsSetup` do not change: the Recipes step is done when any Recipe exists, and a Course with no Recipes marked for it is an unplanned meal, so Today shows Couldn't plan ("Mark Recipes as Dessert"), not the checklist.

## 5. Tests (all under `web/src`; `couldnt-fixtures.ts` has the data)

| File | Covers |
|---|---|
| `features/plan/lib/couldntGroups.test.ts` (edited) | Cool-down and Variety rows removed; Excluded fix is the page link |
| `features/plan/lib/couldnt.test.ts`, `components/CouldntPlanTile.test.tsx`, `hooks/couldntHooks.test.tsx`, `screens/PlanScreen.couldnt.test.tsx` (edited) | Cool-down and Variety examples replaced by Advance Step and Exclusion; still green |
| `lib/couldntGroups.courses.test.ts` | `causeOf`, strings of the seven causes, `courseCells`, `unplannedOf`, counts and nouns, lines, order, the two fixes, old stored counts |
| `lib/couldntSummary.courses.test.ts` | `summarizeSlots` without capital; `summarizeCells` |
| `lib/couldntExclusions.test.ts` | every function of §3.2 |
| `hooks/couldntHooks.courses.test.tsx`, `hooks/useExplanationExpansion.test.tsx`, `hooks/useCouldntExclusions.test.tsx` | notice, fix and expansion hooks; the query, loading, failure, live refetch |
| `components/CouldntPlanTile.courses.test.tsx` | Course in headline and lines, links, fixes, keyboard (Tab, Enter, Space), `aria-controls` |
| `components/CouldntPlanExclusionTile.test.tsx`, `CouldntPlanExclusionSummary.test.tsx` | roles and names, links by accessible name, the states, focus, keyboard |
| `components/CourseRow.unfilled.test.tsx` | cause chip and reason on the Course row |
| `screens/CouldntPlanExclusionsScreen.test.tsx` and `.live.test.tsx` | layout, grouping, links, hash, empty, loading, error, plain User, live refetch |
| `screens/PlanScreen.couldnt.courses.test.tsx`, `today/components/TodayScreen.couldnt.courses.test.tsx` | end to end through the stubbed API, Plan and Today |
| `features/plan/couldntExclusionsCss.test.ts` | list bullets, focus ring |
| `app/couldntPlanExcludedRoute.test.ts` | route, width, crumbs, layout guard |
| `features/today/lib/setup.courses.test.ts`, `today/setupSeam.courses.test.tsx` | the checklist per Course |

Scenarios the screen tests tell: (1) every Side is excluded for Sam's garlic: one tile "Couldn't plan 7 Sides", Review Exclusions opens the page with one Tile; (2) Kim opts out of the Side on Saturday: that day has its own Tile with the opt-out line; (3) Sam's garlic Exclusion is removed in another tab: the page refetches and shows "No Course is held back by Exclusions now."; (4) a Dessert has no Recipes: the info tile's Mark Recipes as Dessert opens `/recipes?notCourse=3`; (5) a plain User sees the Exclusions and Mark Recipes fixes, and "Ask an Admin" only on Nobody attends.

## 6. Decisions to confirm (defaults built)

1. **"Show all N" counts lines** (§2.2), not Courses, so it matches the list; a slot whose every Course shares the cause is one line.
2. **The Excluded headline says "who eats it"**, not "who attends": per-Course attendance, and what spec §7.4.1 shows.
3. **A mixed `no_course_recipes` tile** fixes the earliest cell's Course; the next Course appears after it is fixed.
4. **The Course row on the Plan** (§2.4) is added to F's `CourseRow` (merged, no other team in it).
