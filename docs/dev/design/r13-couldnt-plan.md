# R13: Couldn't plan redesign and Attendance defaults to everyone

Team R13, pipeline step 1 (design and red tests). Spec: functional-spec §3 (Attendance defaults), §7.4 (Couldn't plan), decision 23. Glossary: **Couldn't plan**, **Attendance**. Evidence: the Today screenshot with nine identical pink lines (ui-review-2 K4, L-05, L-07 for Today and Plan).

## 1. Why the screen was wrong

Every unfilled slot had its own sentence in one `danger` tile. The cause was the same nine times ("nobody is attending") because a new Meal Slot started with no attendees: a fresh install was a wall of red. Two fixes, one product decision each:

1. Stop creating the situation: Attendance defaults to everyone.
2. When something genuinely cannot be planned, say it once per cause, in a calm tone, with one thing to do.

## 2. Backend: Attendance defaults to everyone

Rules (all in `internal/household/store`, so every caller gets them):

| Action | Result |
|---|---|
| `CreateSlot` with `Attendance == nil` | all current Members, no Portion Factor override |
| `CreateSlot` with an explicit empty list | nobody (a deliberate choice, and what Admins send to make a slot nobody attends) |
| `CreateSlot` with a list | that list (validated as today) |
| `CreateMember` | the new Member is inserted into `meal_slot_attendees` of every existing Meal Slot, override NULL, including slots left empty |
| `UpdateSlot`, `UpdateMember`, date Attendance | unchanged; adding a Member never touches `attendance_overrides` (a date already edited keeps its list) |
| `DeleteMember` | unchanged (cascade) |

HTTP: `attendeesIn` must keep `nil` (field omitted or `null`) apart from `[]`. `POST /api/meal-slots` documents that difference. No new endpoint.

A new Member changes Attendance, so the existing `household` event `changed: members` already triggers `ReasonAttendanceChanged` (`ReasonForEvent`) and a replan. A new slot likewise (`mealSlots`). No planner change: `planner.UnfilledReason` stays `no_attendance` / `no_candidates` with the same `Eliminations` (guard scenarios in `bdd/features/planning/couldnt_plan.feature`).

### Migration 1230 (`1230_attendance_default.sql`)

For each Meal Slot with zero rows in `meal_slot_attendees`, insert every Member (override NULL). Slots with attendees, per-date overrides and per-date attendees are untouched; a Household with no Members is left alone. 1220 is the latest on main, A1 uses 1200/1210 and the Recipe Assistant reserves 1300.

**Recommendation: apply automatically, once.** The migration runner records it, so it never re-runs. The case it changes (a slot nobody attends) is exactly the broken state the Household sees today, and a slot that was left empty on purpose is rare and one tap to fix in the Meal Slots editor. The alternative, asking at first launch, would be a modal about a technical state. State it in the release notes.

Red tests: `internal/db/attendance_default_test.go`, `internal/household/store/store_test.go` (R13 block), `internal/household/httpapi/slots_test.go` (R13 block), `bdd/features/household/attendance_default.feature`, `bdd/features/planning/couldnt_plan.feature` (+ `bdd/steps_r13_test.go`).

Existing tests edited for the new default (they meant "nobody", now they say so): `mustSlot` in `internal/household/httpapi/helpers_test.go` sends `[]` when no Attendance is given.

## 3. Couldn't plan: causes, copy and actions

The API gives two reasons plus counts. A slot is filed under **one** cause (`lib/couldntGroups.ts causeOf`): `no_attendance`; else `slotRuleClaimed`; else `considered == 0`; else the filter that removed the most options (ties: Exclusion, Cool-down, Variety Rule, Advance Step); else "no fit".

| Cause | Tone | Icon (existing) | Headline (`N meals couldn't be planned.` + ...) | Fix action (target) |
|---|---|---|---|---|
| `nobody_attending` | info | `attendance` | Nobody is set to attend. | **Choose who attends** (`/settings/meal-slots`) |
| `no_recipes` | info | `recipes` | There are no Recipes to choose from. | **Add Recipes** (`/recipes`) |
| `slot_rule` | warn | `slotRule` | Nothing that matches its / their Slot Rule(s) is available. | **Review Slot Rules** (`/settings/planning`) |
| `excluded` | warn | `exclusion` | Every Recipe is excluded for someone who attends. | **Review Exclusions** (`/settings/preferences`) |
| `cool_down` | warn | `duration` | Every Recipe is in Cool-down. | **Review Cool-down** (`/settings/household`) |
| `variety_rule` | warn | `varietyRule` | Every Recipe is blocked by a Variety Rule. | **Review Variety Rules** (`/settings/planning`) |
| `advance_step` | warn | `advanceStep` | Every Recipe needs an Advance Step that is already too late. | **Choose a Recipe** (Plan: the chooser for the first affected meal; Today: opens the Plan) |
| `no_fit` | warn | `info` | No Recipe fits. | **Choose a Recipe** (as above) |

Each cause also has a one-sentence hint under the summary (what happened, how to fix it), e.g. "Pick the Members who eat at each Meal Slot, and the planner will fill it." and "The planner picks from your Recipes. Add a few, or import a Recipe File.". Short reasons for the day-tile chip: "Nobody is set to attend.", "No Recipes to choose from.", "Its Slot Rule can't be met.", "Every Recipe is excluded.", "Every Recipe is in Cool-down.", "Variety Rules block every Recipe.", "Too late for an Advance Step.", "No Recipe fits.".

No new icon glyph is needed: every icon above is already in `ui/icons.ts` (UF1 can rename freely as long as these names survive, or tell us the new names). `lib/couldntGroups.ts` imports `IconName` from `ui/icons`; it never imports Phosphor.

### Tone tokens

Existing tokens only; no change to `styles.css`. `toneStyle`:

- **info** (setup is missing): `Tile variant="soft"`, neutral `tag` Chip.
- **warn** (a rule conflict): `Tile variant="status" status="spoil"` (the amber "needs attention" token of the status palette), `status` Chip with `spoil`.
- **danger** is never used here; it stays for real failures (a request that failed, spoiled food).

If the team later wants a distinct blue "info" token, it is a `styles.css` + `Tile.css` + `Chip.css` change (R2-L); only `toneStyle` would change.

### Summary text (`lib/couldntSummary.ts summarizeSlots(affected, all)`)

Per Meal Slot name (lower-cased, plural with `s` or `es` after s, ch, sh, x), in descending order of count:

1. Exactly Saturday and Sunday: "weekend breakfasts".
2. Exactly Monday to Friday: "weekday lunches".
3. Every slot of that name in the plan (at least two) is affected: "every dinner".
4. Up to three days: "Tuesday and Thursday dinners", "Thursday dinner".
5. Otherwise a count: "4 dinners".

The first clause is capitalised, a leading "every" clause is followed by "this week" (plan of 7 days or fewer) or "in the next N days", then ", plus " and the rest joined by "and": "Every dinner this week, plus weekend breakfasts and Tuesday lunch". `all` is the whole plan; Today gets it from the plan view (`planSlots`), so "every" is accurate.

## 4. Screens

### Today

- Tile id `couldntPlan` keeps its place in `composeToday` (after Throw out or keep). Its node is `CouldntPlanNotice`: a wrapper with `display: contents` (so its tiles are Bento grid items, like `.today__slot`) holding one `CouldntPlanTile` per cause, **span 2** (a wide tile: a full row on the phone's 2 columns, half the 4-column desktop row).
- Tile: overline icon + "Couldn't plan", `h2` headline, the summary line, the hint, a tertiary "Show all N meals" / "Hide the list" toggle (`aria-expanded`; only with two or more meals) that expands a list of "Tue 10 Nov · Dinner", and one secondary fix button. One meal: the summary line is the meal ("Tuesday dinner") and there is no toggle.
- It is a section named by its headline, not `role="status"` or an alert: nothing is on fire.

### Plan

- The same `CouldntPlanNotice` sits at the top, a `group` named "Couldn't plan", above the week grid. Groups are derived from the plan view the screen already has (`unplannedOf(plan.slots)`): no extra request. The "Choose a Recipe" fix opens the Recipe chooser for the first affected meal instead of navigating.
- Each affected `MealTile` replaces the danger chip and the sentence with a small "Not planned" chip (info: neutral `tag`; warn: `status` `spoil`), the short reason (not on the compact 7-column tile, where the reason is the block's `title`), and the existing tertiary "Choose a Recipe".

### Board (read-only)

The board has no free cell (12 of 12 used), so no new tile. The Tomorrow tile also lists meals the planner could not plan, as "Lunch" plus a neutral "Not planned" chip (`tomorrowSlots` in `board/lib/tiles.ts`; `tomorrowMeals` is unchanged). No actions, no danger colour: a kitchen wall display is not where setup is fixed.

### First run: the setup checklist

`composeToday` gets `needsSetup`. When it is true the `setup` tile (full width, soft) shows first and Couldn't plan does not. `lib/setup.ts setupChecklist(facts)`:

- Steps: **Add your Members** (Members), **Set up Meal Slots and attendance** (a Meal Slot with at least one attendee), **Add Recipes**, **Get your first plan** (a Planned Meal exists). The current step is the first not done; only it has a button (Add Members, Set up Meal Slots, Add a Recipe, Open the Plan).
- Visible while `plannedMeals == 0`, except when the first three steps are done and the planner is held back by rules (`unplannedMeals > 0`): then Couldn't plan explains it. Unknown facts (loading or a failed request) show nothing, never a false first run.
- Facts come from `today/setupSeam.ts useSetupFacts()` (counts from `/api/members`, `/api/meal-slots`, `/api/recipes`, `/api/plan`), the one place Today reads those features. `useToday` is `loading` while they load, so the "Nothing on the menu" empty state never flashes.

## 5. Code structure (CLAUDE.md rules)

Pure TypeScript, no React, unit tested:

- `plan/lib/couldntGroups.ts`: `causeOf`, `unplannedOf`, `groupByCause`, `slotLine`, `shortReason`, `toneStyle`, the `CauseGroup` and `FixAction` types.
- `plan/lib/couldntSummary.ts`: `summarizeSlots`.
- `today/lib/setup.ts`: `setupChecklist`.
- `board/lib/tiles.ts`: `tomorrowSlots`.
- Copy in `plan/strings.ts` and `today/strings.ts` (Glossary terms only).

Hooks: `plan/hooks/useCouldntPlanNotice.ts` (`useCouldntPlanNotice(unplanned, all) -> { groups, total }`, memoised, `NoticeGroup = CauseGroup & { summary }`), `useCauseExpansion.ts` (which tiles are expanded), `useCouldntFix.ts` (`useCouldntFix(onChoose?) -> (group) => void`: navigate or choose); `today/hooks/useSetupChecklist.ts`; `today/setupSeam.ts`.

Components (render and wire events only): `plan/components/CouldntPlanTile.tsx` (shared primitive composed of `Tile`, `Chip`, `Button`, `Icon`), `CouldntPlanNotice.tsx` (one tile per cause), `today/components/SetupChecklistTile.tsx`. `MealTile` and the board `TomorrowTile` change. `CouldntPlanNotice` moves out of `TodayTiles.tsx` and is still exported from `features/plan/index.ts`; `TodayScreen` also imports `useCouldntPlanNotice`, `useCouldntFix` and `useSetupChecklist`. The old `couldntPlanText` sentences are no longer shown (it may stay for accessible names; the Developer decides).

New optional fields: `TodayData.needsSetup`, `TileId 'setup'` (type stubs already in `today/types.ts`), `TodayTileData.planSlots?` (seams), `board SlotLike.unfilled?` (stub already in `board/types.ts`).

## 6. Test map (all red now, except the guard scenarios that depend on the default)

| Area | File |
|---|---|
| Migration | `internal/db/attendance_default_test.go` |
| Store | `internal/household/store/store_test.go` (R13 block) |
| HTTP | `internal/household/httpapi/slots_test.go` (R13 block) |
| BDD (API) | `bdd/features/household/attendance_default.feature`, `bdd/features/planning/couldnt_plan.feature` |
| Grouping, tone, copy | `plan/lib/couldntGroups.test.ts` |
| Summary | `plan/lib/couldntSummary.test.ts` |
| Hooks | `plan/hooks/couldntHooks.test.tsx`, `today/hooks/useSetupChecklist.test.tsx`, `today/setupSeam.test.tsx`, `today/hooks/useToday.setup.test.tsx` |
| Components | `plan/components/CouldntPlanTile.test.tsx` (tile and notice), `plan/components/MealTile.test.tsx` (Not planned chip), `today/components/SetupChecklistTile.test.tsx`, `board/components/TomorrowTile.notplanned.test.tsx` |
| Screens | `plan/screens/PlanScreen.couldnt.test.tsx`, `plan/screens/PlanScreen.test.tsx`, `today/components/TodayScreen.couldnt.test.tsx` |
| Layout | `today/lib/compose.setup.test.ts`, `board/lib/tomorrowSlots.test.ts` |

The repository's BDD runner (godog) drives the HTTP API only, so the UI scenarios are Vitest integration tests written Given/When/Then in `TodayScreen.couldnt.test.tsx`:

```gherkin
Scenario: A new household opens Today
  Given no Members, Meal Slots or Recipes
  Then Today shows the setup checklist (Members, Meal Slots and attendance, Recipes, first plan) and no failures

Scenario: Nobody is set to attend nine meals
  Given Members exist and no Meal Slot has an attendee
  Then Today shows one tile: "9 meals couldn't be planned. Nobody is set to attend."
  And "Every dinner this week, plus weekend breakfasts" with "Choose who attends" going to the Meal Slots

Scenario: A new Member attends every Meal Slot   (API: attendance_default.feature)
```

## 7. Open points for the Project Manager

- The R15 team owns the Meal Slots attendance editor; "Choose who attends" only links to `/settings/meal-slots`. If R15 gives each slot an anchor, the link can carry it.
- Existing tests that changed meaning: `MealTile.test.tsx` (unfilled block), `PlanScreen.test.tsx` (one assertion), `TodayTiles.test.tsx` (the `CouldntPlanNotice` block moved), `httpapi/helpers_test.go` (`mustSlot`). R13's Developer should not need to touch any other existing test; if a `vi.mock('../seams')` test in Today fails because `useToday` now reads `setupSeam`, mock `../setupSeam` there too.
