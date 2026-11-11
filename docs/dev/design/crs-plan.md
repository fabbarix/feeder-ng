# CRS: Courses (plan, migration and teams)

Design step 1 for the Courses feature. Decision: [ADR 0008](../../adr/0008-courses.md). Spec: functional-spec §3.1, §4, §7.1 to §7.5, §8, §9, §11, §12, §13, §16 and decision 29. Glossary: **Course**, **main Course**, **Whole meal**, and the updated **Meal Slot**, **Planned Meal**, **Recipe**, **Ready Meal**, **Leftover**, **Slot Rule**, **Couldn't plan**, **Archived**, **Recipe File**.

The short version: a Planned Meal is keyed by `(date, Meal Slot, Course)` instead of `(date, Meal Slot)`. Everything keyed by a Planned Meal gains the Course. An upgraded Household gets one Course per slot (the main Course) and plans exactly as before.

## 1. Migration plan

### 1.1 One migration: `internal/db/migrations/1400_courses.sql`

It rebuilds tables whose keys change, so its first line is `-- feeder:foreign-keys=off` (the runner then checks `foreign_key_check` before commit, as for 1100). It follows the 12-step rebuild of 1100: create `*_new` with the current definition plus the new columns, copy, drop, rename, recreate indexes. Row ids are kept everywhere (clients cache them). `MAIN` below is `(SELECT id FROM courses WHERE is_main = 1)`, not a literal id.

| Object | Change | Backfill |
|---|---|---|
| `courses` (new) | `id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, position INTEGER NOT NULL, is_main INTEGER NOT NULL DEFAULT 0 CHECK (is_main IN (0,1)), archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)), created_at TEXT NOT NULL, CHECK (NOT (is_main = 1 AND archived = 1))`; `CREATE UNIQUE INDEX courses_one_main ON courses (is_main) WHERE is_main = 1` | Seed `Main` (position 0, main), `Side` (1), `Starter` (2), `Dessert` (3). `name_key` is the same key function as Tags (`recipe.TagKey`), so the Go code and the SQL agree. |
| `recipe_courses` (new) | `recipe_id REFERENCES recipes(id) ON DELETE CASCADE, course_id REFERENCES courses(id), PRIMARY KEY (recipe_id, course_id)`; index on `course_id` | One row per Recipe (archived ones included) with `MAIN`. |
| `recipes.whole_meal` | `ALTER TABLE recipes ADD COLUMN whole_meal INTEGER NOT NULL DEFAULT 0 CHECK (whole_meal IN (0,1))` | `UPDATE recipes SET whole_meal = 1 WHERE ready_meal = 1`. |
| `meal_slot_courses` (new) | `meal_slot_id REFERENCES meal_slots(id) ON DELETE CASCADE, course_id REFERENCES courses(id), position INTEGER NOT NULL, PRIMARY KEY (meal_slot_id, course_id), UNIQUE (meal_slot_id, position)` | One row per Meal Slot: `MAIN`, position 0. |
| `planned_meals` (rebuild) | adds `course_id INTEGER NOT NULL REFERENCES courses(id)` and `from_course_id INTEGER`; `UNIQUE (date, meal_slot_id, course_id)` replaces `UNIQUE (date, meal_slot_id)`; the check becomes `(from_date IS NULL) = (from_meal_slot_id IS NULL) AND (from_date IS NULL) = (from_course_id IS NULL)`; new index `planned_meals_course (course_id)` | `course_id = MAIN`; `from_course_id = MAIN` where `from_date` is set. |
| `leftovers` (rebuild, ids kept) | adds `from_course_id INTEGER NOT NULL REFERENCES courses(id)` (the Course of the Cooked Planned Meal that made it) | `MAIN`. A rebuild, because SQLite cannot add a `NOT NULL REFERENCES` column with a default. |
| `plan_unfilled` (rebuild) | adds `course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE`; primary key `(date, meal_slot_id, course_id)`; reason check adds `'no_course_recipes'` | `MAIN`. (The startup replan rewrites these anyway.) |
| `slot_rules` (rebuild, ids kept) | adds `course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE`; `UNIQUE (meal_slot_id, course_id, recipe_id, tag)` | `MAIN`. |
| `cook_timers.scope`, `advance_step_marks.scope` | the Planned Meal scope becomes `meal:<date>/<mealSlotId>/<courseId>` | `UPDATE … SET scope = scope \|\| '/' \|\| MAIN WHERE scope LIKE 'meal:%'` (the unique indexes stay valid: one old scope maps to one new scope). |
| `push_sent.key` | Start cooking identity `<date>/<slot>` becomes `<date>/<slot>/<course>`; Advance Step identity `<date>/<slot>/<stepId>` becomes `<date>/<slot>/<course>/<stepId>`; Confirm Cooked stays `<date>/<slot>` | Rewrite in SQL. Keys are `<type>:<identity>@<RFC 3339>`, the date is 10 characters, so for `startCooking:` insert `'/' \|\| MAIN` before the `@`, and for `advanceStep:` insert `'/' \|\| MAIN` after the slot id (the first `/` after the date). Team G owns the format; team A writes this SQL and its test. |

No column is dropped. Nothing else is keyed by a Planned Meal (checked: `0100`, `0500`, `0600`, `0800`, `0900`, `1000`, `1100`, `1230`; Attendance stays per slot).

### 1.2 Idempotency

- The runner records `1400_courses.sql` in `schema_migrations` and does not apply it twice; the file itself uses plain `CREATE`/`ALTER`, as every other migration.
- Every backfill reads `MAIN` by the flag, so the file gives the same result on a fresh install (no rows to backfill) and on an upgrade.
- The startup replan (reason Startup, spec §7.4) follows it, so Couldn't plan reasons are rewritten under the new keys straight away.

### 1.3 Snapshot and going back

- Migrations cannot be undone. Before applying 1400 on a database that already has `planned_meals` rows, Feeder takes a verified snapshot with `internal/backup.Snapshot` into the snapshot folder as `feeder-pre-1400.db` (a name the daily retention does not match, so it is kept until the Admin removes it). A failure to take it stops start-up with a clear log line; a fresh install takes none.
- Going back: stop Feeder, restore `feeder-pre-1400.db` as `feeder.db`, start the previous image (1.0.0-beta.3). The CHANGELOG upgrade note says so (team H).
- If 1400 fails, its transaction rolls back and start-up stops naming the file (runner behaviour); the database is unchanged.

### 1.4 Migration tests (`internal/db/courses_migration_test.go`, team A)

Seed a database migrated `upTo(t, "1400_")` with: two Meal Slots, three Recipes (one Ready Meal, one archived), a Pinned, a Cooked and a Not cooked Planned Meal, a Planned Meal served from a Leftover (both a planned source and an actual Leftover), a Couldn't plan reason, a Slot Rule by Recipe and one by Tag, a Planned Meal scoped and a Recipe scoped cook timer, an Advance Step mark, and `push_sent` rows of each type. Then `MigrateEmbedded` and assert:

1. four Courses in order, exactly one main (Main), none archived;
2. every Recipe and Meal Slot has exactly the main Course; the Ready Meal is Whole meal, the others are not;
3. every Planned Meal, Leftover, reason and Slot Rule kept its id and fields and has `course_id = MAIN`; `from_course_id` is set exactly where `from_date` is;
4. `UNIQUE (date, meal_slot_id, course_id)` holds and a second Course on the same slot and date can be inserted;
5. Planned Meal scopes gained `/MAIN`, the Recipe scope did not; `push_sent` keys are rewritten per type and Confirm Cooked keys are unchanged;
6. `PRAGMA foreign_key_check` is empty and every index exists (compare `sqlite_master`);
7. a fresh database migrates to the same schema (`sqlite_master` text) as the upgraded one;
8. the second `MigrateEmbedded` is a no-op.

## 2. Teams

Each team follows the CLAUDE.md pipeline: test author (Go and Vitest tests and Gherkin first), developer, reviewer. A team writes its check output to `<worktree>/build/check.log`. Nobody edits `web/src/features/recipes/components/TagInput.tsx` or its tests (another team owns them).

### 2.1 Teams, files and dependencies

| Team | Scope | Owns (files and directories) | Depends on |
|---|---|---|---|
| **A. Data** | Migration 1400, the Course domain and its persistence, Courses on Recipes, Meal Slots and the plan persistence, the snapshot before 1400, the cook scope format | `internal/db/**` (1400, tests); `internal/course/` (new: `course.go` pure rules: name key, order check, the main-flag move, what Delete or Archive changes; `store/`); `internal/recipe/recipe.go`, `internal/recipe/store/**` (`CourseIDs`, `WholeMeal`, defaults and codes of §4); `internal/household/{meals,batch}.go`, `internal/household/store/**` (slot `CourseIDs`, batch `set.courseIds`, `dryRun` removals); `internal/plan/types.go` (`Key.CourseID`, `Source`, `Leftover.From`, `SlotRule.CourseID`, `Unfilled`) and `internal/plan/store/**`; `internal/cook/scope.go` (+ test); the snapshot call in `cmd/feeder` | none |
| **B. Planner** | Cells, Course fit, covering, `no_course_recipes`, one Recipe per slot, Whole meal held back beside Pinned Courses, reservations per cell, jitter seed per cell; the adapter and the runner | `internal/planner/**`; `internal/plan/{plan,cook}.go` and their tests; `internal/plan/runner/**`; `internal/plan/plantest/**` | starts with A (pure package); merges after A |
| **C. API** | Every handler of §16 except Recipe File and notifications; event names; module wiring; the BDD steps that call these routes | `internal/course/httpapi/` (new); `internal/recipe/httpapi/**`; `internal/household/httpapi/**`; `internal/plan/httpapi/**`; `internal/cook/httpapi/**`, `internal/cook/service/**` (Cook view, board); `internal/today/httpapi/**`; `internal/modules` (register the course module); `bdd/features/courses/` (new), `bdd/steps_courses_test.go`, and the existing `bdd/steps_{planning,cook_board,household,recipes,r13,r15,reheat,reheat_time,ready_meal}_test.go` | C1 (courses, recipes, meal slots) after A; C2 (plan, cook, today, board) after B |
| **D. Settings and primitives** | Shared Course primitives, the Courses page, the Meal Slot editor's Course picker, routes | `web/src/ui/CoursePicker/` (new: ordered and unordered), `web/src/ui/Select/CourseSelect.tsx` (new), `web/src/ui/index.ts`, `web/src/ui/icons.ts`, `web/src/ui/Gallery.tsx`, `web/src/ui/galleryData.ts`; `web/src/lib/courses/` (new: types, API client, `useCourses`); `web/src/features/settings/**` (`CoursesPage`, `CourseRow`, `CourseRemoveDialog`, `MealSlotEditor`, `MealSlotWeek`, `MealSlotGrid`, `lib/` for order moves and the removal summary); `web/src/app/{features,breadcrumbs,pageWidths,breadcrumbStrings}.ts`; `scripts/check-page-layout.modes` (`/settings/courses` to `fail_routes`) | D1 (primitives, `lib/courses`) none, against the §16 contract; D2 (pages) after D1 and C1 |
| **E. Recipes and Recipe File** | Recipe editor Courses and Whole meal, Course chips and filter, Recipe File `courses`/`wholeMeal`, Import Review for unknown Courses, Agent Prompt `{{COURSES}}`, Recipe Assistant projection | `docs/spec/recipe-file.md`, `docs/spec/recipe-file-v1.schema.json`, `docs/spec/examples/**`, `docs/spec/spec_test.go`; `internal/recipefile/**`; `internal/recipeassistant/**` (`outputschema_test` golden, `none_test`, `addendum_test`, `prompt.go`); `web/src/features/recipes/**` except `TagInput.tsx` and its tests; `web/src/features/import/**`; `bdd/features/import-export/`, `bdd/features/recipe-assistant/` and their steps | E1 (backend, docs) after A; E2 (web) after D1, C1 and E1 |
| **F. Today, Plan, Cook Mode, board** | §7.5 on every screen, the Planned Meal sheet per Course, Not cooked: whole slot, Mark all Cooked, Swap per Course, Slot Rule Course, Cook Mode switcher, board rows | `web/src/features/plan/**` except `components/CouldntPlan*` and `lib/couldnt*`; `web/src/features/today/**` except `setupSeam*`; `web/src/features/cook/**`; `web/src/features/board/**` | after C2 and D1 |
| **G. Shopping, notifications, Couldn't plan** | Per-Course Start cooking, Confirm Cooked per slot, the key format of §1.1, the new cause, Course names in the grouped summary, Shopping List tests over several Courses | `internal/notify/**`; `internal/shopping/**` (tests; code only if a test fails); `web/src/features/plan/components/CouldntPlan*`, `web/src/features/plan/lib/couldnt*`, `web/src/features/today/setupSeam*`; `web/src/features/notifications/**`; `bdd/features/notify-ops/`, `bdd/features/shopping-scan/` and their steps | G1 (notify, shopping) after A; G2 (web) after C2 and after F merges (shared `plan/strings.ts`, `plan/types.ts`, `plan/api.ts`) |
| **H. Release** | CHANGELOG, upgrade note (1400, the snapshot, going back), deploy guide, a last GLOSSARY and spec pass, removal check of the transition aliases | `CHANGELOG.md`, `docs/dev/deploy.md`, `GLOSSARY.md`, `docs/spec/functional-spec.md` | last |

### 2.2 Order and parallelism

```
Wave 1:  A ─────────────┐   B (develops in parallel) ─┐   D1
Wave 2:  C1 · E1 · G1 · B merges (all after A)        D2 (after D1, C1)
Wave 3:  C2 (after B) ── F (after C2, D1) · E2 (after D1, C1, E1)
Wave 4:  G2 (after F) · C3 clean-up (after F, G2)
Wave 5:  H
```

- In parallel, no shared files: **A, B and D1** in wave 1; **C1, E1, G1 and D2** in wave 2 (each owns different packages; C1 touches only `httpapi` packages, E1 only `recipefile`, `recipeassistant` and `docs/spec/recipe-file*`, G1 only `notify` and `shopping`); **F and E2** in wave 3.
- Serialised: B merges after A (it uses A's `plan.Key`); G2 after F (same `plan/strings.ts`); anything that needs `web/src/ui/index.ts`, `web/src/ui/icons.ts` or `scripts/check-page-layout.modes` goes through D (or waits until D has merged); GLOSSARY, CHANGELOG and the functional spec are edited only by H after this design, and a team that finds a gap asks the Project Manager, who batches the change into H (or into one short serial slot).
- **main stays green at every merge.** Two transitions keep it so:
  1. *Persistence shim (A).* Until B and C2 merge, a `plan.Key` with `CourseID == 0` means the main Course in `internal/plan/store`, so the current adapter and handlers keep working on the new schema.
  2. *Route aliases (C2).* C2 adds the `{courseId}` routes and keeps the course-less plan and cook routes, plus `slotOut.meal` and `slotOut.unfilled`, as aliases for the main Course while F and G2 move the SPA over. Both the old `POST …/{slotId}/not-cooked` and `…/cooked` keep their old meaning (the main Course) until then.
  **C3** (one small task for team C) removes the aliases and the shim, gives `…/{slotId}/not-cooked` and `…/{slotId}/cooked` their new whole-slot meaning (§16), and greps that nothing still sends a course-less key. H checks C3 merged before the release.
- `internal/modules` and `internal/app` wiring are C's only. Each BDD feature keeps its own `steps_<feature>_test.go`; `bdd/registry_test.go` does not change.

### 2.3 What each team tests first

- **A**: §1.4; the Course rules as pure tests (name key and clash, at most 20, order is a permutation, Make main moves exactly one flag, main and last cannot go, `planned` decides Delete or Archive, the replacement goes only to Recipes and Meal Slots left without a Course); Recipe and Meal Slot defaults and validation codes of §4 and §16; persistence round trips; the shim.
- **B**: Course fit (fresh and Leftover); covering by a fresh and by a Leftover Whole meal in the main Course, and none in another Course or a slot without the main Course; covered cells have no reason and lose unpinned Planned Meals but keep Pinned and Cooked ones; a Whole meal is held back beside a Pinned Side; one Recipe per slot; Cool-down, recency and Variety Rules across Courses; Slot Rule per Course and its reservation (other Courses of the same slot count as gap 0); `no_course_recipes`; jitter differs per Course; walk order (main Course first); an upgraded single-Course Household gives the same plan as before (golden from today's tests).
- **C**: every row of §16 as BDD scenarios (Admin and User, each error code), including `dryRun`, `impact`, the cook scope and the removed course-less routes after C3.
- **D**: CoursePicker (toggle, order, keyboard moves, at least one, ARIA: `group` with `aria-pressed` chips and a list with move buttons), CourseSelect (listbox), Courses page (reorder, rename, Make main, Delete and Archive dialogs with replacement), Meal Slot editor (Courses field, multi-day preview of removals); the page-layout guard on `/settings/courses`.
- **E**: schema accepts and rejects `courses`/`wholeMeal`; import defaults (old files, Ready Meal); unknown names in Import Review (map, skip, Add for Admin only); Agent Prompt `{{COURSES}}`; Recipe File round trip; `OutputSchema` golden gains both properties as required; `pruneNone` drops `[]` and keeps `false`; editor Courses field and Whole meal switch rules of §4.
- **F**: one-Course slots look exactly as before (existing snapshots unchanged); several Courses; covered slot; history rows; Swap per Course with the Whole meal chip; Not cooked: whole slot; Mark all Cooked; Cook Mode switcher keeps timers; Slot Rule Course select; board rows.
- **G**: notifications per §12 (keys per Course, Confirm Cooked once per slot, nothing for a covered Course, nothing re-sent after 1400); the new cause tile and fix; summaries that name Courses; Shopping List over a Main and a Side sums both.

## 3. Open product questions

Only questions without an obvious default. Each has the default the teams build if nobody answers.

1. **Cool-down for Sides.** Sides are few and repeat often (rice, salad), but the household Cool-down (7 days) applies to them too, so a Household with three Sides and seven dinners would see Sides as Couldn't plan (Cool-down) most nights. *Recommended default:* each Course gets an optional default Cool-down in Settings > Courses (blank = the household default); a Recipe's own Cool-down still wins, and a Recipe uses the default of the Course it is being planned in. Seeded blank, so nothing changes on upgrade. (Not built unless confirmed; without it, Households set Cool-down per Side Recipe.)
2. **Portion size per Course.** A soup planned as a Starter is a smaller serving than the same soup as a Main, but Yield is per Recipe. *Recommended default:* no per-Course portion size now; each Course cooks for the slot's full portions. Households mark such a Recipe in one Course, or set the Batches by hand.
3. **Attendance per Course** ("Sam skips dessert"). *Recommended default:* not now; Attendance stays per Meal Slot and every Course needs the same portions.
4. **Optional Courses.** Should a slot be able to serve a Course only when a fitting Recipe is available (a Dessert that may simply be left out), without Couldn't plan? *Recommended default:* no; every listed Course is planned or shows Couldn't plan. A Household that wants Dessert only on Sundays lists it only on Sunday's Meal Slots.
5. **One cooking timeline for several Courses.** Cook Mode could merge the Steps of the Main and the Side into one schedule that ends at the slot time. *Recommended default:* not now; one Course at a time with the Course switcher and shared timers (spec §11). Start cooking reminders per Course already tell the cook when each one starts.
