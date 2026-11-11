# RX and PT: Review Exclusions explains the Exclusions; preferences on a Recipe as a table

Design for two follow-up requests of 2026-11-11. Spec: functional-spec §4 (*Preferences on a Recipe*), §5 (*Who excludes an Ingredient*), §7.4 (the Excluded fix), §7.4.1 (*Review Exclusions*), §16 (the new Plan route) and decision 31. Glossary: no new term (**Exclusion**, **Favourite**, **Dislike**, **Member**, **Avatar**, **Course Attendance** and **Couldn't plan** cover both). Plan: [crs-plan.md](crs-plan.md) §2.5 and the wave table in §2.2.

- **RX** (Courses follow-up): the Couldn't plan tile's **Review Exclusions** opens a page that names the Exclusions that left each Course empty ("Sam excludes garlic: rules out 4 Recipes (Bolognese, ...)"; "Alex excludes Fish pie"), each with a link to where it is changed. Teams **B-RX** (the planner records the detail, migration 1430), **C-RX** (the route) and **G2** (the page and the tile action).
- **PT** (independent of Courses): the Recipe detail's "Preferences for" Member select and its three toggles become one table, a row per Member, so the whole Household is seen and changed at once. One team, **PT**, which can start now.

## 1. What the code does today (checked on 934f9b9)

- **Ingredient Exclusions are computed, in one place.** `planner.state.excludes(att, r, withIngredients)` (`internal/planner/candidates.go:98`) returns true when any attendee with a Portion Factor above zero has the Recipe in `ExcludedRecipes` or any of its Ingredient lines (optional lines included) in `ExcludedIngredients`. It stops at the first hit, so it cannot say *who* or *why*. The SPA has the same inputs (each Member's `excludedIngredients` from `GET /api/recipe-preferences?memberId=` and the Recipe's `lines`), so a Recipe page can work out "via garlic" itself.
- **A reason stores counts only.** `planner.Unfilled{Eliminated: Eliminations{Considered, Exclusion, CoolDown, VarietyRule, AdvanceStep}}`, copied by `plan.Reconcile` (`internal/plan/plan.go:296`) into `plan.Unfilled` and stored by `internal/plan/store` as `plan_unfilled.eliminated_json`. A Recipe is counted once, under the first filter that removed it (after B: Exclusion, then Advance Step, then the soft rules).
- **Preference changes replan.** `PUT /api/recipes/{id}/preference` and `PUT /api/ingredient-exclusions/{id}` publish `recipes` with `preferences`, which `plan.ReasonForEvent` maps to `ReasonRecipeChanged`; every replan rewrites the reasons of every cell it considers. So a stored explanation is never older than the last preference change.
- **Review Exclusions** today links to `/recipes` (`web/src/features/plan/lib/couldntGroups.ts:48`).
- **Preferences on the Recipe detail**: `MemberPicker` (a single `MemberSelect`, "Preferences for"), `PreferenceToggles` (three filter Chips, `nextState`), and per Ingredient line an Exclusion `IconButton` for the chosen Member (`IngredientLinesList`). `useRecipePreferences(memberId)` loads one Member. Any signed-in User may set any Member's preferences (`memberFor` takes an explicit `memberId`; `bdd/features/recipes/recipe_preferences.feature`).

## 2. RX: the data recorded

### 2.1 What and when

The planner records, for each cell it leaves Couldn't plan with `no_candidates` and an Exclusion count above zero, **which Exclusions removed which Recipes**: for every Recipe the cell's Exclusion filter removed (the same Recipes the count counts: after the Slot Rule narrowing, not reserved, not archived, Yield above zero), every attendee of the cell (its Course Attendance, Portion Factor above zero) whose Exclusion hits it, and through what: the Recipe itself, or an Ingredient. Grouped into **records**, one per (Member, Ingredient) and one per Member for Recipes excluded directly:

```go
// internal/planner/types.go (B-RX)
type ExclusionRecord struct {
    MemberID     MemberID
    IngredientID IngredientID // 0: the Member excludes the Recipes themselves
    RecipeIDs    []RecipeID   // ascending, at most MaxExclusionRecipes
    RecipeCount  int          // every Recipe of the cell this record rules out
}
type Unfilled struct {
    // ... as today
    Exclusions     []ExclusionRecord // nil unless Reason is no_candidates and Eliminated.Exclusion > 0
    MoreExclusions int              // records left out by MaxExclusionRecords
}
const (
    MaxExclusionRecords = 8
    MaxExclusionRecipes = 5
)
```

- A Recipe hit by two Exclusions appears in both records (Sam's garlic and Alex's direct one); the Exclusion **count** still counts it once, so the records' counts may add up to more than `Eliminated.Exclusion`. The page shows the count once at the top and each record's own count.
- Leftovers are not explained: Leftover first never records a reason.
- Only `no_candidates` cells get it. `no_attendance`, `no_course_recipes`, covered and not-served cells have nothing to explain; a Slot Rule cell (`SlotRuleClaimed`) whose Recipes were excluded gets it too (it is the same filter), though only the Excluded cause links to the page (§4.5).
- **Course Attendance** needs no extra rule: the planner already passes the cell's Course Attendance as `slot.Attendance` (B, spec §7.2), so a Member who opts out of the Course, or eats with a Portion Factor of zero, never appears in a record.

### 2.2 Cap and order

- **Order** (total, so the planner stays deterministic): `RecipeCount` descending, then `MemberID`, then `IngredientID` (0, the direct record, before any Ingredient).
- **At most 8 records** per cell (`MoreExclusions` counts the rest), **at most 5 Recipe ids** per record (the lowest ids; `RecipeCount` keeps the true number). The page names the Recipes and says "and N more".
- **Size.** One record is about 90 bytes of JSON (`{"memberId":3,"ingredientId":12,"recipeIds":[4,7,9,11,15],"recipeCount":9}`); a full cell under 800 bytes. A 7-day horizon with 3 Meal Slots and 3 Courses has at most 63 cells, under 50 KB in the worst case and usually a few hundred bytes.

### 2.3 Where it is computed

- New pure file `internal/planner/explain.go` (B-RX): `func (st *state) explainExclusions(i int, removed []RecipeID) ([]ExclusionRecord, int)`. `evaluate` (`candidates.go:59`) appends to a `removed` slice the ids its Exclusion case counts (one slice append per excluded Recipe; no extra work on cells that end up filled). `fill` (`state.go:376`) calls `explainExclusions` only when it records `no_candidates` with `elim.Exclusion > 0`. `explainExclusions` walks the cell's attendees and each removed Recipe's direct Exclusion and Ingredient lines **without** stopping at the first hit (unlike `excludes`).
- Swap (`planner.go:46`) discards the slice and never explains.
- `plan.Unfilled` gains `Exclusions []ExclusionRecord` (`json:"exclusions,omitempty"`, ids as `int64`) and `MoreExclusions int`; `plan.Reconcile` copies both (`internal/plan/plan.go:296`).

### 2.4 Storage: migration 1430

`internal/db/migrations/1430_unfilled_exclusions.sql` (B-RX; after A's 1400 and G1's 1410, which it does not touch; 1420 was withdrawn with task CD, so the number stays free):

```sql
ALTER TABLE plan_unfilled ADD COLUMN exclusions_json TEXT;
```

- Plain SQL, no foreign-key pragma, no backfill. `NULL` means "nothing recorded" (an old reason, or a cell with no Exclusion); the startup replan (§7.4) rewrites every reason straight after the migration, so `NULL` on an Excluded cell lasts until then at most.
- The value is `{"records":[{"memberId","ingredientId","recipeIds","recipeCount"}],"more":N}`, ids only. **No foreign keys**: names are resolved when the API reads it, and an id that no longer exists is dropped there (§3). A removed Member, Ingredient or Recipe also replans (`members`, `recipes` events), which rewrites the row anyway.
- Why a column and not a child table: the detail is written and replaced with its reason row in the one upsert `internal/plan/store` already does (`store.go:313`), and read with it; a child table would need its own delete per replan and per `ClearUnfilled` key, for data that is never queried on its own. Why not inside `eliminated_json`: that object is sent as `eliminated` to every SPA, cached old ones included, and stays exactly as it is.
- `internal/plan/store` (A's, granted to B-RX after A merges): the upsert writes `exclusions_json` (`NULL` when `Exclusions` is empty), `Unfilled(...)` reads it back.
- Migration test `internal/db/unfilled_exclusions_migration_test.go` (B-RX; the Project Manager grants these two files in `internal/db/**`, as for G1's 1410): at `upTo(t, "1430_")` seed a `plan_unfilled` row; after `MigrateEmbedded` the column exists, is nullable and `NULL` on the old row, the row is otherwise unchanged, a second `MigrateEmbedded` is a no-op, and a fresh database has the same `sqlite_master` text as the upgraded one.

## 3. RX: the API (C-RX)

`GET /api/plan/couldnt-plan/exclusions` (every User; read only, no event). It answers every cell from today to the end of the horizon (the same dates as `GET /api/plan/couldnt-plan`) whose stored reason is `no_candidates` with `eliminated.exclusion > 0`, in plan order (date, slot time, the slot's Course order):

```json
{ "cells": [{
  "date": "2026-11-13", "mealSlotId": 4, "mealSlotName": "Dinner", "time": "19:30",
  "courseId": 2, "courseName": "Side",
  "slotRuleClaimed": false,
  "eliminated": { "considered": 4, "exclusion": 4, "coolDown": 0, "varietyRule": 0, "advanceStep": 0 },
  "attendance": [memberRef],
  "optOuts": [memberRef],
  "exclusions": [{
    "member": memberRef,
    "ingredient": { "id": 12, "name": "garlic" } | null,
    "recipes": [{ "id": 4, "name": "Bolognese" }],
    "recipeCount": 4
  }] | null,
  "moreExclusions": 0
}] }
```

- `memberRef` is `{ "id", "name", "colour", "photoUrl", "avatar" }`, as the plan payload's attendees (the Avatar needs all of it).
- `attendance` is the cell's Course Attendance on that date (`household.CourseAttendance`, Portion Factor above zero); `optOuts` the Members attending the slot who opt out of this Course on that date (empty when nobody does). Both come from the same source as `GET /api/plan`'s `optOutMemberIds`.
- `exclusions` is `null` when the row has no `exclusions_json` (before the startup replan); otherwise the stored records with names resolved through the handler's `names` table (`internal/plan/httpapi/names.go`). A record whose Member is gone is dropped; a Recipe or Ingredient that is gone is dropped from its record (an Ingredient record whose Ingredient is gone is dropped). `recipes` are in name order (the ids are capped by the planner, the order is the API's).
- Route registration: the literal `GET /api/plan/couldnt-plan/exclusions` is more specific than any `{date}/{slotId}` pattern, so Go's ServeMux picks it; a test asserts it.
- Old SPAs are unaffected: no existing payload changes.

## 4. RX: the page (G2)

### 4.1 Route and links to it

- Route **`/plan/couldnt-plan/excluded`**, page width `default`, breadcrumbs Plan > Review Exclusions, title "Review Exclusions". Registered in `web/src/features/plan/index.ts`.
- The Excluded tile's fix (`couldntGroups.ts`, `excluded`) becomes a link to it, on Today and on the Plan. It stays open to every User (preferences are not Admin-only), so the tile never says "Ask an Admin".
- In the tile's "Show all" list of the Excluded tile, each Meal Slot line links to its cell on the page: `/plan/couldnt-plan/excluded#cell-<date>-<mealSlotId>-<courseId>`.

### 4.2 Layout (Bento)

A single column of Tiles in a `BentoGrid` (two columns from 1024 px), no native controls:

1. **Summary Tile** (warn tone, `exclusion` icon, the Couldn't plan tile's styling): the Excluded group's headline ("Couldn't plan 3 Sides. Every Recipe is excluded for someone who eats it.") and the line "Change an Exclusion below, or choose a Recipe by hand on the Plan." with a tertiary link **Open the Plan**.
2. **One Tile per explanation.** Cells with exactly the same `exclusions`, `moreExclusions`, `attendance` and `optOuts` share one Tile (Sam's garlic usually empties every dinner Side the same way):
   - overline: the cells as the tile's summary line names them ("Side at every dinner this week", lib `couldntSummary`), and a "Show all N" disclosure listing each cell ("Fri 13 Nov · Dinner · Side"), each `<li>` with `id="cell-<date>-<mealSlotId>-<courseId>"` (a hash scrolls to it and opens the disclosure);
   - **Who eats it**: Member pills (`MemberPill`) for `attendance`, then, when `optOuts` is not empty, one muted line: "Kim opts out of Side, so Kim's Exclusions don't count here.";
   - **The Exclusions**: a list (`ListGroup` of `ListRow`s), one row per record:
     - Ingredient record: Avatar, "**Sam** excludes **garlic**", second line "Rules out 4 Recipes: Bolognese, Garlic bread, Pesto pasta and 1 more", and a trailing link **Review garlic** to `/ingredients/12#exclusions` (the Ingredient page's *Excluded by* Tile, PT, §5.4);
     - direct record: Avatar, "**Alex** excludes **Fish pie**" (one Recipe) or "**Alex** excludes 3 Recipes: Fish pie, Lasagne and Paella", where each Recipe name is a link to `/recipes/<id>#preference-member-<memberId>` (that Member's row of the Recipe's preference table, PT, §5.3);
     - `moreExclusions > 0` ends the list with "and 2 more Exclusions";
   - `exclusions: null`: "Feeder is still working out which Exclusions these are. Check again in a moment." (live updates refresh it).
3. **Empty state** (no cell filed under Excluded any more, say after the fix): `EmptyState` "No Course is held back by Exclusions now." with **Open the Plan**.

Links are router `Link`s styled as the tertiary Button; Avatars come from the shared `Avatar` through `MemberPill` or `ListRow`'s leading slot; icons only through the shared icon component. Live updates: the page's query (`['plan', 'couldnt-plan', 'exclusions']`) is invalidated by the same `plan` events as `useCouldntPlan`, so fixing an Exclusion in another tab empties the page.

### 4.3 Which cells it shows

The cells the SPA files under Excluded (`causeOf(slot) === 'excluded'`, the one rule of `lib/couldntGroups.ts`). The API returns every cell with an Exclusion count, Slot Rule cells included; the page filters, so cause logic stays in one place. A cell filed under Advance Step that also lost some Recipes to Exclusions is not shown (its tile's fix is Choose a Recipe).

### 4.4 Copy and code

- Strings in `web/src/features/plan/strings.ts` (`couldntExclusions.*`); phrasing, grouping and links in a pure lib, `web/src/features/plan/lib/couldntExclusions.ts`: `explanationGroups(cells, slots)`, `recordText(record)`, `recordLinks(record)`, `optOutLine(cell)`. The hook `useCouldntExclusions()` (`web/src/features/plan/hooks/useCouldntExclusions.ts`) fetches and joins with `usePlan`'s slots; the screen `web/src/features/plan/screens/CouldntPlanExclusionsScreen.tsx` and its Tiles (`components/CouldntPlanExclusionTile.tsx`) only render.
- Lists of names: "A, B and C"; with more than three, "A, B, C and N more" (`summaryAnd`, as `couldntSummary`).

### 4.5 The other causes: not now (decided)

The user asked for Exclusions only. The others are left as they are, because each already has a fix that names its cause, and explaining them would need new recorded data:

- **Nobody attends** and **No Recipes for this Course**: the fix goes straight to the Meal Slot or the Recipes filter; there is nothing more to say.
- **Slot Rule unmet**: the tile lists the cells and **Review Slot Rules** opens the rules; its Exclusion detail is recorded anyway (§2.1), so linking its tile to this page later is a G2-sized change with no new data.
- **Advance Step too late**: would need each Recipe's lead time and how late it is (a second kind of record and a column). Its fix is to choose a Recipe by hand; left for later.
- Cool-down and Variety Rule are not causes (ADR 0009).

## 5. PT: preferences on a Recipe as a table

### 5.1 Decision: one column per state

The table has a **Member** column and one column each for **Favourite**, **Dislike** and **Exclusion**; each cell is a toggle. Within a row the existing `nextState` rule still holds (a Member has one state per Recipe): tapping the pressed state clears it, tapping another replaces it. Why columns rather than one cell per Member that steps through the states with `nextState`:

- *It reads at a glance:* the state is a pressed icon in a named column, so "who excludes this Recipe" is one column down, not a word to read per row.
- *One tap, no unseen order:* a cycling cell needs up to three taps to reach Exclusion and passes through states on the way (each a save and a replan); with columns, every state is one tap and nothing is set by accident.
- *Accessible names stay simple:* each toggle is a real button with `aria-pressed` and the name "Sam: Dislike"; a cycling button would need its name to change as it is pressed.
- *It costs one column of width:* three 48 px icon columns fit beside the Member column at 360 px (§5.5).

### 5.2 Data and hooks (the existing API)

- No API change. `GET /api/recipe-preferences?memberId=<id>` is called once per Member (`useQueries`, key `['recipe-preferences', memberId]`), and writes use the existing `PUT /api/recipes/{id}/preference` and `PUT /api/ingredient-exclusions/{ingredientId}` with an explicit `memberId`. A Household has a handful of Members, so N small reads is fine.
- `useHouseholdPreferences()` (new, `web/src/features/recipes/hooks/useHouseholdPreferences.ts`) replaces `useRecipePreferences` and `useMemberPicker`: Members (`useMembers`) and the signed-in User (`useMe`), each Member's preferences, and `toggleRecipe(memberId, recipeId, tapped)` and `toggleIngredient(memberId, ingredientId)`, both optimistic (applying `nextState`) and rolled back on failure with a Toast ("Couldn't save Sam's Dislike. Try again."). The optimistic `commit` of `useRecipePreferences` moves into it unchanged, keyed per Member.
- Pure lib `web/src/features/recipes/lib/preferenceRows.ts` (no React): `preferenceRows(members, prefsByMember, recipeId, lines, meUserId)` gives one row per Member: `{ member, you, state, via: string[] }`. Order: the Member linked to the signed-in User first (with "You"), then the rest in Members order. `via` is the names of the Recipe's Ingredients, optional lines included (the planner counts them), that the Member excludes, in line order, without repeats. `lib/preference.ts` keeps `nextState`, `stateOf` and `isExcluded`; `lib/memberPick.ts` (`singleMember`) goes, `selectedMemberId` moves into `preferenceRows`.

### 5.3 The table (`PreferenceTable`)

`web/src/features/recipes/components/PreferenceTable.tsx`, in the existing **Preferences** Tile of the Recipe detail (title "Preferences", was "Your preferences"). It replaces `MemberPicker` and `PreferenceToggles`, which are removed with their tests.

- A real `<table>`, not `role="grid"`: every cell holds at most one button, so Tab order (row by row) is enough and no arrow-key roving is needed. `<caption>` (screen-reader-only) "Preferences for Bolognese"; `<thead>` with `<th scope="col">` Member, Favourite, Dislike, Exclusion, each state header with its icon (`favourite`, `dislike`, `exclusion`) above its short name; `<tbody>` with one `<tr id="preference-member-<memberId>">` per Member, whose `<th scope="row">` holds the Avatar (photo, else emoji, else initials, the shared `Avatar`) and the name, plus a "You" `Chip` on the linked Member's row.
- Each state cell holds an `IconButton` with `pressed`, the state's icon, and the accessible name "Sam: Dislike". Pressed uses the selected look of filter Chips; at least 44 by 44 px.
- **An Exclusion via an Ingredient is read-only.** When `via` is not empty and the Member has no direct Exclusion of the Recipe, the Exclusion cell holds no button but the exclusion icon (filled) and the text "via garlic" ("via garlic, peanut"), with a screen-reader-only "Excluded" before it, so a screen reader reads "Excluded via garlic". When the Member also excludes the Recipe directly, the button stays (pressed) and the cell adds "also via garlic". The Favourite and Dislike buttons stay usable in that row: they are kept, and apply again if the Ingredient Exclusion is removed. Under the table, when any row has `via`: "An Exclusion via an Ingredient is changed on that Ingredient's line, under Ingredients."
- A hash `#preference-member-<id>` (the RX page's links) scrolls that row into view and highlights it briefly (`useHashTarget`, recipes hook; respects reduced motion).
- No Members: `EmptyState` "No Members yet", with **Add Members** (`/settings/members`) for an Admin and "Ask an Admin to add Members" otherwise. A failed load: `ErrorState` with retry, in the Tile.

### 5.4 Ingredient Exclusions without the Member select

The Ingredient lines' Exclusion toggle acted for the chosen Member; with the select gone it acts on the whole Household:

- Each Ingredient line shows the Avatars of the Members who exclude that Ingredient (at most 3, then "+N"; nothing when nobody does) and an `IconButton` "Exclusions for garlic" that opens a `Dialog` titled "Who excludes garlic?".
- The Dialog holds `IngredientExclusionList` (new, `web/src/features/recipes/components/IngredientExclusionList.tsx`): one row per Member (Avatar, name) with a toggle button, `aria-pressed`, accessible name "Sam: excludes garlic". Changes save at once (optimistic, as above), and the table's *via* cells follow.
- The same `IngredientExclusionList` is the **Excluded by** Tile on the Ingredient page (`/ingredients/<id>`, `id="exclusions"`), exported from `web/src/features/recipes/index.ts`, so the RX page's "Review garlic" link lands where garlic is changed for every Member.

### 5.5 Phone

At 360 px wide (16 px gutters, Tile padding) the Member column takes what the three state columns (48 px each) leave; a long name truncates with an ellipsis after the Avatar (the full name is in the buttons' accessible names and the Avatar's title). State headers show the icon with its name under it at the caption size. No horizontal scroll of the page or the Tile (a layout test at 360 px).

## 6. Tests each team writes first

**B-RX** (Go):
- `internal/planner/explain_test.go`: Sam excludes garlic and every Side Recipe has garlic: one record (Sam, garlic, the 4 ids, `RecipeCount` 4); a direct Exclusion is one record per Member with `IngredientID` 0; a Recipe excluded by Sam's garlic and Alex directly is in both records while `Eliminated.Exclusion` counts it once; an optional Ingredient line counts; **Course Attendance**: Kim opts out of Side, so Kim's Exclusions are in no Side record, and the Main cell lists them; an attendee with Portion Factor 0 is never listed; caps: 10 records keep 8 in order (count, Member id, Ingredient id) with `MoreExclusions` 2, and 7 Recipes keep the 5 lowest ids with `RecipeCount` 7; Slot Rule narrowing and reserved Recipes are not in any record (as `Considered`); a cell whose Exclusion count is 0, a `no_attendance` cell, a covered or not-served cell, and Swap carry no detail; same Input, same detail.
- Golden plans unchanged (placements identical; only `Unfilled` gains the detail).
- `internal/plan/reconcile_test.go`: `Unfilled` carries `Exclusions` and `MoreExclusions` through.
- `internal/plan/store/store_test.go`: round trip of the detail; an `Unfilled` without it writes `NULL` and reads `nil`; a replan that clears a reason clears it.
- `internal/db/unfilled_exclusions_migration_test.go` (§2.4).

**C-RX** (Go, Gherkin):
- `bdd/features/planning/couldnt_plan_exclusions.feature` (+ `bdd/steps_rx_test.go`): Sam excludes garlic and every Side Recipe has garlic: the Side cells list "Sam / garlic" with the Recipes by name and `recipeCount`; Alex excludes the only Dessert directly: a record with `ingredient: null`; Kim opts out of Dessert and excludes it: Kim's Exclusion is not listed and Dessert is planned for the others; a Course with no Exclusion count is not in `cells`; removing Sam's garlic Exclusion replans and the cells go; a plain User may read it; signed out is `401`.
- `internal/plan/httpapi` unit tests: name resolution drops a missing Member, Recipe and Ingredient; `exclusions: null` for a row without detail; `attendance` and `optOuts` match `household.CourseAttendance`; `recipes` in name order; the route is not shadowed by `{date}/{slotId}` patterns.

**G2** (Vitest):
- `lib/couldntExclusions.test.ts`: grouping (identical explanations share a group, a different attendance splits it), record text for one, three and five Recipes ("and 1 more"), direct with one and several Recipes, `moreExclusions`, the opt-out line, links (`/ingredients/12#exclusions`, `/recipes/4#preference-member-3`), the `null` case.
- `lib/couldntGroups.test.ts`: the Excluded fix is `/plan/couldnt-plan/excluded`; Show all lines link to their cell.
- Screen tests: headings and landmarks, a list per Tile, links by accessible name, hash opens the disclosure and focuses the cell, empty state, live refetch on a `plan` event; `native-controls.test.ts` covers the new files (no `<select>`, `alert`, `confirm`, native checkboxes).
- Page-layout guard: `/plan/couldnt-plan/excluded` in `scripts/check-page-layout.modes` (set to fail).

**PT** (Vitest, Gherkin):
- `lib/preferenceRows.test.ts`: linked Member first with `you`; Members order after; `via` from optional lines too, in line order, without repeats; a direct Exclusion with `via`; no Members.
- `hooks/useHouseholdPreferences.test.tsx`: one query per Member with an explicit `memberId`; `toggleRecipe` applies `nextState` (replace, clear) and sends `memberId`; optimistic update and rollback with a Toast on failure; `toggleIngredient` per Member.
- `components/PreferenceTable.test.tsx`: `table`, `caption`, column and row headers; every Member is a row; buttons named "Sam: Favourite" etc. with `aria-pressed`; Tab reaches every button in row order and Enter and Space toggle; pressing another state replaces; a via-Ingredient Exclusion has no button and reads "Excluded via garlic"; "also via garlic" beside a direct one; the hash highlights its row; empty and error states.
- `components/IngredientExclusionList.test.tsx`, the Ingredient line Dialog, and the Ingredient page *Excluded by* Tile (`IngredientScreen.exclusions.test.tsx`).
- `RecipeDetailScreen` tests: no Member select, the table in the Preferences Tile; layout at 360 px without horizontal scroll; `native-controls.test.ts` passes.
- Gherkin (`bdd/features/recipes/recipe_preferences.feature`, guarding what the table relies on; no new route): a plain User sets a Favourite for another Member who has a sign-in; each Member's preferences read with `memberId` include `excludedIngredients`.

## 7. File ownership

| Team | Owns (new or granted) | When |
|---|---|---|
| **PT** | `web/src/features/recipes/{screens/RecipeDetailScreen*, components/PreferenceTable*, components/IngredientExclusionList*, components/IngredientLinesList*, components/MemberPicker* (removed), components/PreferenceToggles* (removed), hooks/useHouseholdPreferences*, hooks/useRecipePreferences* and useMemberPicker* (removed), hooks/useHashTarget*, lib/preference*, lib/preferenceRows*, lib/memberPick* (removed), strings.ts, recipes.css, index.ts}`; `web/src/features/ingredients/screens/IngredientScreen*` and `ingredients/strings.ts`; `bdd/features/recipes/recipe_preferences.feature` and its steps | granted from E (whose E2 has not started); returned to E when PT merges |
| **B-RX** | `internal/planner/explain.go` and `explain_test.go` (new), `internal/planner/{types,candidates,state}.go`; `internal/plan/{types,plan}.go` and `reconcile_test.go`; `internal/plan/store/**`; `internal/db/migrations/1430_unfilled_exclusions.sql` and `internal/db/unfilled_exclusions_migration_test.go` (new, granted in `internal/db/**`) | after B merges (B's files) and after A merges (A's `types.go` and `internal/plan/store`) |
| **C-RX** | `internal/plan/httpapi/**`; `bdd/features/planning/couldnt_plan_exclusions.feature`, `bdd/steps_rx_test.go` (new) | after C2 merges (C2 edits `plan/httpapi`) and after B-RX |
| **G2** (adds RX to its scope) | as in crs-plan §2.1, plus `web/src/features/plan/{screens/CouldntPlan*, hooks/useCouldnt*, index.ts, types.ts, api.ts, strings.ts}` (granted after F merges); `web/src/app/{breadcrumbs,breadcrumbStrings,pageWidths}.ts` and `scripts/check-page-layout.modes` for the route (granted after D2 merges) | wave 4, after F and C-RX |

## 8. Waves

```
Wave 1:  A0 → A   B   D1   K   PT (starts now)
Wave 2:  C1 · E1 · G1 · B merges   D2   PT merges (before E2 starts)
Wave 3:  C2 ── F · E2 (after PT)   B-RX (after B; with C2, F and E2: no shared files)
Wave 4:  C-RX (after C2, B-RX) → G2 (after F, C-RX; RX page included) · C3 (after F, G2)
Wave 5:  H
```

- **PT can start now.** It touches no Course code and no file of A, B, D1 or K. It shares the recipes feature with E2 (Recipe editor, Course chips on Recipe detail, `strings.ts`, `recipes.css`), so it must **merge before E2 starts**; E2 already waits for D1, C1 and E1 (wave 3), which leaves PT about two waves. If PT is late, the Project Manager holds E2 until PT merges rather than splitting the files. E1 (backend, wave 2) and PT share nothing.
- **B-RX** needs B's planner (hard filters first, per-Course attendance) and A's `plan_unfilled` with the Course, so it waits for both; its test author can start once this design is reviewed.
- **C-RX** is one route; it follows C2 because both edit `internal/plan/httpapi`.
- **G2** already follows F (shared `plan/strings.ts`); RX adds the page and the link. C3 follows G2 as planned. H's CHANGELOG gains "Review Exclusions now says which Exclusions left a Course empty" and "Every Member's preferences on a Recipe in one table".

## 9. Open questions (with the default the teams build)

1. **Who may change another Member's preferences.** Today any User may set any Member's Favourites, Dislikes and Exclusions (spec §2, the BDD feature). The table shows that openly, one tap away, for the whole Household. *Default:* unchanged, every User edits every row. The alternative is that a User edits only their linked Member's row unless they are an Admin (the other rows read-only).
2. **A page of one Member's preferences** (all of Sam's Exclusions in one place), as a target for RX's links. *Default:* not now; RX links each Exclusion to the Recipe row or the Ingredient where it is changed.
