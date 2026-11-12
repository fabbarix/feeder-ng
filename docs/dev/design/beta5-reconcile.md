# Beta.5: reconciling the plan with main

Step 1 (design, docs only) for **1.0.0-beta.5**. Branch `team/b5-design`, from main `37de57e`.

[beta5-plan.md](beta5-plan.md) was written against `cd39ff1`, before Courses ([ADR 0008](../../adr/0008-courses.md), [ADR 0009](../../adr/0009-soft-cool-down-and-variety.md)), Tags as entities ([ADR 0010](../../adr/0010-tags-as-entities.md)), the Pantry page with Storage Places, the Pantry in the primary nav and the beta.4.1 photo read were on main. This document records what main has, where the plan conflicts with it or says nothing, what is safe to build as it stands, and what needs an answer first. **Where the plan and main conflict, this document treats it as a question, not a decision.** The plan's own recorded user answers (the "decided" items in its §2) stay decided; the questions below only reopen one where main makes it ambiguous, and then say so.

Terms in **bold** are [GLOSSARY](../../../GLOSSARY.md) terms. Everything here was read from the tree at `37de57e`.

---

## 0. Summary

| # | Feature | State on main | Verdict |
|---|---|---|---|
| 1 | Per-date slot controls | Date Attendance (Members, Course opt-outs) exists, any User, but only in Settings > Meal Slots. No per-date time, no Not served action. The slot menu is hidden for one-Course slots. | Buildable in part. Blocked on Q1 to Q6. |
| 2 | Guests | Nothing. Portions = Members of the Course Attendance. | Blocked on Q7 to Q9. |
| 3 | Leftovers by hand | `leftovers` rows carry a Course of origin; no place, no hand actions; the 03:00 job discards and counts waste (spec §8). | Blocked on Q10 to Q16. |
| 4 | Plan stability (Bought) | Nothing. ADR 0009 keep check and Slot Rule reservations replan every unpinned Planned Meal. | Blocked on Q17, Q18; needs an ADR. |
| 5 | Shopping List | Past unconfirmed Planned Meals are **already** on the list (`Meals(ctx, "", to)`, `derivedLines`). No Not needed, no hint. | Not needed buildable now. Q19 asks what was actually seen, Q20 the lifetime of a mark. |
| 6 | Stock Lots | Pantry lists every Lot by Storage Place; a Lot sheet with Move exists; no edit, no delete, no inline Lots in By Ingredient, no Used from. | Lot edit/delete/inline buildable after Q21, Q22. Used from after Q23. |
| 7 | Recipe sort by last cooked | No sort; no last cooked. | Buildable now (Q24 is cosmetic). |
| 8 | Settings grouped | Index already has Household / You / Admin; Courses, Tags, Shops, Storage Places are rows of Household; Ingredients and Products are still in the avatar menu. | Buildable after Q25, Q26. |

Release shape: Q27 (one tag or two) and Q28 (pre-migration snapshot).

### 0.1 Drift in the plan's numbers (fix when the plan's text is lifted into the spec)

| Plan says | Main has | Consequence |
|---|---|---|
| Spec decisions 33 to 39 | Decisions 33 to 36 are taken (Pantry nav, archived Course names, logo and list layout, photo read) | Beta.5 decisions are **37 to 43**. |
| New spec §18 for beta.5 API | §16 (Courses) and §17 (Tags) are the last | §18 is still free. |
| Migrations 1500 to 1530, `feeder-pre-1500.db`, generalise `NeedsPre1400Snapshot` | Highest is 1440 (1420 withdrawn). The snapshot is `backup.PreSnapshotFile = "feeder-pre-1400.db"` and `db.NeedsPre1400Snapshot`, called from `cmd/feeder/startup.go` | Numbers are free. The generalisation touches `internal/db/db.go`, `internal/backup/backup.go`, `cmd/feeder/startup.go` (Q28). |
| ADRs 0011 to 0013 | 0010 is the last | Free. The three drafts are in §5. |
| `Date Attendance sheet opened from Plan and Today (beta.4 already has it)` | `DateAttendancePanel` is used only by `features/settings/screens/MealSlotsPage.tsx`. A plain User opens it from a Meal Slot chip there; the Admin gets the slot sheet instead | Opening it from Plan and Today is new work. |
| `Menu ... beta.4 already has Add <Course> and Not cooked: whole slot there` | `features/plan/components/SlotMenu.tsx` renders nothing when `lib/courses.slotMenu` is null, which it is for a **one-Course slot** | The three new choices need the menu on every slot (Q3). |
| Ingredients, Products, Shops in the avatar menu | Shops already moved to Settings (route `/settings/shops`, row in Household), but `features/shops/index.ts` still registers a `navItems` entry for it | Ingredients, Products and the stale Shops nav item go (Q26). |
| `Not served` is a new term | Spec §7.2 step 0b and the API (`unserved: "optional" \| "no_course_attendance"`, `web/src/features/plan/types.ts`) already use "Not served" for a Course left empty on purpose. It is not in GLOSSARY yet | The glossary entry must cover both, or the two uses need separate names (Q1). |
| `Guests` in the Attendance `_Avoid_` list is dropped | It is there today: `_Avoid_: Guests, headcount`. `scripts/check-ui.sh` rule 6 flags every avoid word (and inflections) in a `strings.ts` | A Guests stepper cannot ship before GLOSSARY drops that word. |
| Spec §8 "Leftovers past their Use-by are discarded automatically and count as waste", §1 "a freezer for Leftovers" out of v1, `internal/plan/runner.DiscardExpired` | As the plan says | The plan's spec changes stand; they also touch `internal/plan/runner/runner.go`, `plan.ExpiredLeftovers`, `cook/zerowaste` and the BDD for waste. |
| Slot time read through one function | Real readers: `internal/plan/runner/snapshot.go` (`instant`, `add`), `plan/runner/courses_c2.go`, `plan/runner/actions.go`, `internal/notify/facts/facts.go` (`slotTime` map), `internal/cook/service/adapters.go` (`ms.time` in `mealSelect`), `internal/shopping/httpapi/wiring.go` (`slot.Time`), `plan/httpapi/{shapes,exclusions}.go`, `today/httpapi` | The guard test the plan proposes (no direct `meal_slots.time` outside `household`) must also cover the `ms.time` SQL join in `cook/service`. |

---

## 1. Per-date slot controls (plan 2.1)

### 1.1 What main has

- **Date Attendance** (any User): `GET/PUT/DELETE /api/meal-slots/{id}/attendance?date=` (`internal/household/httpapi/httpapi.go:57-59`, `meals.go`), stored in `attendance_overrides` / `attendance_override_attendees` (0100) and, for Course opt-outs, `course_attendance_overrides` / `course_attendance_override_opt_outs` (1400). The sheet is `features/settings/components/DateAttendancePanel.tsx` with `DateCoursesSection`.
- An **empty** date list is stored as an override with no attendees (spec §3: "an explicit empty list means nobody, a deliberate choice"); the planner then records `no_attendance` for each Course of the slot (**Couldn't plan**, Nobody attends, fix **Choose who attends**, spec §7.4).
- A Course nobody eats on a date (every attendee opts out of it) is left empty silently: `unserved: "no_course_attendance"` (spec §7.2 step 0b; `plan/runner/courses_c2.go`).
- The slot time is `meal_slots.time`, read in the places listed in §0.1. Reminders are keyed `<type>:<identity>@<due instant>` (`internal/notify/compute.go`, `candidateKey`), so a moved time gives a new key, as the plan says.
- Slot menu: `SlotMenu.tsx`, entries Mark all Cooked, Not cooked: whole slot, Add <Course>; null for a one-Course slot.
- Cooking timeline, Start cooking, Advance Step marks and timers are per slot / per Course (`meal:<date>/<slotId>/<courseId>`); Confirm Cooked is one per slot.

### 1.2 Conflicts and ambiguities

1. **Slot or Course?** Main already has a per-Course "left out on a date" state (opt-outs, `no_course_attendance`) with no user action named for it. The plan's Not served is slot-wide and a user action. Same word, two levels (Q1).
2. **Who's eating = Date Attendance + Course Attendance?** Yes in the plan, and main's sheet already has the Courses section. What changes is the entry point (Plan and Today), the Guests row, and the emptied-date rule (Q2, Q5).
3. **Emptied date.** The plan turns "Members empty and Guests 0" into Not served. Main (and spec §3, §7.4) makes it Couldn't plan with a fix. This reverses documented behaviour (Q2).
4. **One-Course slots** have no menu today (Q3).
5. **Time and the Courses.** One slot, one cooking timeline, one Start cooking: a per-date time is naturally per slot. Per-Course times do not exist and the plan does not ask for them. No conflict, but stated so nobody adds a Course time.
6. **Offline.** The plan says the three choices show "Needs a connection". Main's `useConnectivity` exists; no conflict.

### 1.3 Proposed design (the parts not in question)

**Domain / data.** New table `meal_slot_dates (slot_id, date, not_served, time, guests, updated_at)` as in plan 2.1 (migration 1500). It stays separate from `attendance_overrides` on purpose: an override row owns an attendee list and is deleted by "Reset to usual Attendance", while `not_served` and `time` are not attendance. Guests are stored here too (plan 2.2). A row back to all defaults is deleted; rows before today are kept.

Pure rules in `internal/household/slotdate.go`: `EffectiveTime(usual, row)`, `IsNotServed(row, dateAttendance, guests)` (final form depends on Q2), `PortionsNeeded(courseAttendance, factors, guests)`. `plan/runner` reads them through the `Sources` port (new method `SlotDate(ctx, slotID, date)`); `internal/planner` stays pure and receives `SlotInfo.Time` already effective, plus `Guests int` and `NotServed bool`.

**Planner.** Step 0b gains a first bullet (the slot is Not served: every cell empty, `unserved: "not_served"` added to the existing enum, unresolved Planned Meals removed, Pinned included after the confirm). Slots are walked by effective time. The new Not served value is sent to the SPA as both the slot flag and each Course's `unserved`, so `Unserved` in `web/src/features/plan/types.ts` grows to `'optional' | 'no_course_attendance' | 'not_served'` and old consumers that iterate Courses still see a reason.

**API.**

| Route | Notes |
|---|---|
| `GET /api/meal-slots/{id}/dates/{date}`, `PATCH ...` | As plan 2.1 (`notServed`, `time`, `usualTime`, `guests`; `?dryRun=1` lists what Not served removes, now **per Course**: `courseId`, `courseName`, `recipeName`, `pinned`, `bought`). `422 reason: date_past`, `time_invalid`, `slot_resolved`. Every User. Publishes `household {"changed":"slotDates"}` and a new replan reason. |
| Plan, Today, board payloads | The slot gains `time` (effective), `usualTime`, `notServed`, `guests`. Courses keep their existing shape. |

**UI composition** (all from shared primitives, CLAUDE.md):

- `features/plan/components/SlotMenu.tsx` gains the three choices and shows for every slot (Q3). New `NotServedRow` (a `Tile` row), `SlotTimeDialog` (`Dialog` + shared `TimeField`), confirm through `useConfirm`. Logic in `features/plan/lib/slotDate.ts` (which choices show, copy, the confirm list from the dry run) and `hooks/useSlotDate.ts`.
- **Who's eating** reuses `features/settings/components/DateAttendancePanel`. It is rendered from Plan and Today through the feature's public export (add an export in `features/settings/index.ts`; `features/plan` must not import settings internals). When opened from a slot block the `DateField` is read-only (the date is the block's date); from Settings it stays editable (Q5).
- Copy and glossary words: "Not served", "Who's eating", "Time today". The menu must not be confused with **Not cooked: whole slot** (the other menu entry); see Q1 for the label.

**Non-conflicting edge cases kept from the plan:** Cooked and Not cooked Planned Meals stay as history; Not served only while a Course is unresolved and only from today on; a time change after Start cooking sends one more Start cooking; two Users editing the same date: last write wins per field; deleting a Meal Slot cascades its date rows.

**Tests.** Plan 2.1 list stands, with the additions: dry run per Course; one-Course slot shows the menu; `unserved: "not_served"` does not appear as Couldn't plan; a slot with a Course opt-out plus Not served; the guard test for slot-time readers includes `cook/service` SQL.

---

## 2. Guests (plan 2.2)

### 2.1 What main has

Portions needed for a Course = Σ Portion Factors of its **Course Attendance** (spec §3, `internal/household/portions.go`, `plan/runner/sources.go` `CourseAttendance`). The planner's `SlotCourse.Attendance []Attendee` decides portions, Batches, Leftover, whose Exclusions, Dislikes and Favourites count. A Course nobody eats is left empty silently (ADR 0008, point 8). GLOSSARY: Attendance `_Avoid_: Guests, headcount`.

### 2.2 Conflicts and ambiguities

1. **Guests and a Course every Member opts out of.** The plan says the Course is then served for the Guests. ADR 0008 point 8 says a Course nobody eats is left empty. Both can be true only if "nobody" counts Guests; that changes `no_course_attendance` (Q7).
2. **Guests with no Member.** The plan says served, planned with no preferences. The planner's `no_attendance` test is "Attendance is empty" at slot and Course level; both need redefining (Q8).
3. **Batches follow portions** is decided for Guests. Main's cause for it is broader: Course Attendance opt-outs, a new Member, a Portion Factor change all change portions today, and an unpinned Planned Meal is dropped and replanned while a Pinned one under-cooks. A rule that fires only when Guests change would be a special case in the planner (Q9).
4. **Glossary.** "Guests" is an avoid word; and **Course Attendance** has `_Avoid_: Course guests`. See §6.

### 2.3 Proposed design

- Data: `meal_slot_dates.guests` (1500), 0 to 20.
- API: `GET/PUT /api/meal-slots/{id}/attendance?date=` gains `guests`; `DELETE` (Reset to usual Attendance) clears Guests, the date's Members and the date's Course opt-outs, and **not** Not served or the date's time (Q5 asks to confirm). `422 validation_failed`, `reason: guests_invalid`.
- Planner: `SlotInfo.Guests`; portions of a Course = Σ factors of its Course Attendance + Guests. Exclusions, Dislikes and Favourites still come from Members only.
- Plan payload: `mealOut.portions` includes Guests; the slot carries `guests`.
- UI: a Guests row in `DateAttendancePanel` with the shared `StepperField`; pill suffix "+2 Guests" in the slot block; the Planned Meal sheet attendees line. Preview maths in `features/settings/lib/dateAttendance.ts` (plain TS, unit-tested).
- Icon: a Phosphor glyph for the Guests stepper through `ui/icons.ts` (no new dependency; Phosphor already ships `users-three`, `user-plus`).

---

## 3. Leftovers by hand (plan 2.3)

### 3.1 What main has

- Table `leftovers` (rebuilt in 1400): `recipe_id`, `from_date`, `from_meal_slot_id`, **`from_course_id`** (the Course it was cooked in), `portions` (remaining), `cooked_on`, `use_by`, `status available|discarded`, `discarded_on`. A Leftover is not tied to the Course it was cooked in: it fills any Course its Recipe is marked with (ADR 0008, point 6; spec §7.2 step 1). Planned Meals reference it through `from_leftover_id` (`ON DELETE SET NULL`) and `from_date / from_meal_slot_id / from_course_id`.
- `GET /api/plan/leftovers` only; no hand actions. `plan/runner.DiscardExpired` discards past Use-by and records `stock_waste(reason='leftover_discarded')`. Today's Leftovers tile is `features/plan/components/TodayTiles.tsx` (`LeftoversTile`, `lib/leftovers.ts`); the board lists Leftovers read-only.
- **Storage Places** (1330) exist for Stock Lots only: `storage_places(kind pantry|fridge|freezer, is_default)`, `stock_lots.storage_place_id`, `ingredient_storage`. The Pantry (`features/stock`) lists **Lots**, with filters Use soon / Spoiled, places, kinds; By Ingredient mode shows totals. GLOSSARY **Stock** note: "the things on [the Pantry] are still Stock and Stock Lots".
- GLOSSARY **Frozen Shelf Life** already exists for an Ingredient (days a Lot keeps in a Freezer).
- Leftover Use-by push (10:00 on the Use-by) keys on the Leftover id (`notify/compute.go`).

### 3.2 Conflicts and ambiguities

1. **Pantry shows Leftovers** (Q10): contradicts the glossary's Stock note, mixes portions with Base Units, and the Pantry's filters, sort and By Ingredient mode are all Lot-shaped.
2. **Take out** and where a thawed Leftover goes (Q11).
3. **What a frozen Leftover costs when used.** The plan pins a frozen Leftover as a Planned Meal ("take it out the day before"), but never says when it leaves the Freezer or what happens to the portions not used (Q12).
4. **Naming** Frozen Use-by vs the existing Frozen Shelf Life (Q13).
5. **Remembered Freezer.** The plan defaults Freeze it to "the Freezer last used for a Leftover". Main remembers a place per Ingredient only (`ingredient_storage`); a Leftover has a Recipe, not an Ingredient. A new memory table is needed or the rule changes (Q14).
6. **Ask before waste visibility** (Q15): spec §8, the 03:00 job, `cook/zerowaste` and the board all assume automatic waste. The board is a wall display with no actions.
7. **Course.** Actions are per Leftover, and Leftovers are not tied to a Course, so no per-Course conflict; but "portions the Planned Meals need from it" (claims) are per Planned Meal = per Course, and Guests change them (Q7-Q9 feed this).
8. **Storage Place delete / re-kind.** Plan: frozen status is `frozen_on`, not the place kind. Settings > Storage Places's delete dialog must then also name frozen Leftovers ("Garage Freezer holds 2 Lots and 1 Leftover"); today it names Lots only. No question; a UI task.

### 3.3 Proposed design (not in question)

- **Model.** A Leftover stays a Leftover (draft [ADR 0012](../../adr/0012-leftovers-stay-leftovers.md)); it gains `frozen_on` and a storage place only if Q10 says the Pantry shows them. Hand actions record `leftover_events` as in plan 2.3. `Wasn't there` deletes the row (the FK sets planned meals' `from_leftover_id` to NULL, which the runner already handles as "Leftover gone, replan").
- **Waste.** Hand-recorded waste and answered waste reuse `stock_waste(reason='leftover_discarded')` with `wasted_on` = today or Use-by + 1; no CHECK change. **Zero-waste streak** (`cook/zerowaste.go`) already reads waste events by date.
- **03:00 job.** `DiscardExpired` no longer discards; it is replaced by "to answer" derivation (a pure `plan.IsToAnswer`). The planner's snapshot (`runner/snapshot.go`) drops frozen and to-answer Leftovers from the pending pool.
- **API** as plan 2.3 (`had-it`, `threw-out`, `freeze`, `take-out`, `answer`), all Users, CSRF, publishing `plan {"changed":"leftovers"}` and `stock {"changed":"waste"}`. Leftover payload fields: `frozen`, `frozenOn`, `toAnswer`, `plannedPortions` (and `storagePlaceId/Name` per Q10, Q11).
- **UI** (shared primitives): `web/src/lib/leftovers/` (types, API client, `useLeftoverActions`, pure copy and default portions) and `web/src/ui/LeftoverActions/` (`LeftoverRow` with `Menu`, `LeftoverSheet` on `BottomSheet` + `StepperField` + the shared `Select`, `LeftoverQuestion`). Today's `LeftoversTile` composes them. New glyphs `snowflake`, `question` in `ui/icons.ts`.
- **Settings.** Recipe editor field **Frozen Use-by** (days, optional) after Use-by; household default (90) next to Default Leftover Use-by in Settings > Household (Admin, like the other household defaults in `HouseholdSettingsForm`). No Recipe File change (decided).

---

## 4. Plan stability: Bought Planned Meals (plan 2.4)

### 4.1 What main has

- ADR 0009 point 4: **every** unpinned fresh Planned Meal is checked by the keep check on every replan and dropped if a strict candidate exists. Slot Rule reservation (spec decision 22, amended by 30) drops an unpinned Planned Meal of R inside the window. The planner's roles (`internal/planner/state.go`): `rolePinned`, `roleCooked`, `roleSkipped`, `roleKept`, `rolePlannedLeftover`, `roleEmpty`.
- Shopping: ticks are per Ingredient and `range_to` (`shopping_ticks`, 0800); the derivation draws Stock per Planned Meal in date and time order (`internal/shopping/shopping.go`, `derivedLines`) and **includes every uncooked, non-skipped fresh Planned Meal up to To, including those dated before today** (`shopping/httpapi/wiring.go` `plans.Meals`: `st.Meals(ctx, "", to)`).
- Purchases: Scan in Shop mode and Tick by hand add Lots through the shopping service.
- The plan's relaxed chip: stored `planned_meals.relaxed` and why chips (`why_json`), recomputed on each replan (ADR 0009, point 4: "the why chip is always true").

### 4.2 Conflicts and ambiguities

1. **ADR 0008 point 2 (Whole meal covering).** When the main Course holds a Whole meal, the planner removes unpinned, unresolved Planned Meals in the other Courses first. A Bought Side is unpinned. Held like Pinned means it stays and the Whole meal is "not covering" it, and a Whole meal must not be picked beside it (the "Whole meal held back" hard filter, spec §7.2 step 2). That is an ADR 0008 extension (Q17).
2. **ADR 0009 point 4 / "the chip is always true".** A held Planned Meal skips the keep check; its relaxed flag and chip would go stale unless they are recomputed without replacing it. Resolved in the ADR draft (recompute, never replace); no user question.
3. **Attribution order vs past unconfirmed meals.** `derivedLines` sorts meals by date, so a past, unconfirmed Planned Meal (usually not cooked at all) is first in line and absorbs a purchase, and is the one marked Bought. This is where feature 4 and the "unconfirmed past meals stay on the list" half of feature 5 collide (Q18).
4. **Planned Meals are rows with ids, written by delete-and-insert in places.** Plan 2.4 already notes the cascade risk for `planned_meal_bought`. Main's 1400 kept `planned_meals` AUTOINCREMENT; `plan/store` must be audited for every write path (team A asserts it).
5. **Courses and Bought.** Attribution is per Planned Meal = per Course, so a slot's Main and Side can be Bought independently. A Planned Meal not Bought still gets replanned while its sibling Course is held; the keep check's "own cook left out" history already works per cell. No conflict.
6. **Slot Rule reservations.** A Bought Planned Meal of R inside S's Cool-down is treated like ADR 0009 point 6(a): S gets a relaxed pick of R's alternative or R itself per the existing rules. Same extension as for Pinned; stated in the ADR draft.

### 4.3 Proposed design (not in question)

Plan 2.4 stands for: the "bought for" rule (before / after derivation in date order, optional lines excluded, Leftover-served excluded, any required line counts), what undoes it (Undo of a Scan, untick, Lot Delete), when it ends (resolved, removed, Recipe changes), the Bought chip and sheet line (shared `Chip`, Phosphor `shopping-cart`), the Regenerate confirm list (`features/plan/lib/regenerate.ts`), the hard-rule warn line (shared with Pinned), `planned_meal_bought` in migration 1520, `shopping.Attribute` as a pure function next to `derivedLines`, the `BoughtRecorder` port. The planner role `roleHeld` behaves as `rolePinned` except that Regenerate replaces it, the relaxed flag/chip is recomputed, and `clearAll` keeps it. Draft [ADR 0013](../../adr/0013-bought-planned-meals-held.md).

Two details added by this review:

- **Course payloads.** `mealOut.bought` / `mealOut.warning` live on the Course's meal, not the slot (`slotOut.courses[i].meal`).
- **Structural edits that already list Pinned Planned Meals** (taking a Course off a Meal Slot, archiving a Course, Not served, deleting a Meal Slot; `household/httpapi/removes.go`, `course` impact `plannedMeals[].pinned`) gain a `bought` list in their dry runs and dialogs.

---

## 5. Shopping List (plan 2.5)

### 5.1 What main has

The first half of the request already exists in the backend: `derivedLines` documents "Every uncooked meal up to To counts, including one whose slot has passed and that waits in To confirm" and `plans.Meals` ignores From. Not needed, the "Includes Tue Dinner, not marked Cooked yet" hint and **Mark it** do not exist. UI: `features/shop/{components,hooks,lib}` (`LineTile`, `ShoppingBody`, `useShoppingActions`, `lib/lines.ts`).

### 5.2 Conflicts and ambiguities

1. The user's wording ("unconfirmed past meals keep their Ingredients on the list") describes something main already does for a Planned Meal that stays in the plan. If the user saw it fail, the cause is elsewhere (for example the planner replacing an unpinned unresolved past Planned Meal, or the range) and needs a repro (Q19).
2. **Not needed per range.** The default range end is `today + 7`, capped (`shopping.DefaultTo`); a rolling end means a Not needed mark keyed by `range_to` would stop applying at midnight unless the SPA pins To. Ticks have the same property today (Q20 asks to confirm the consistency is what the user wants).
3. **Purchases of a Not needed Ingredient** add the Lot as an off-list Scan and the line stays Not needed; main's Scan flow treats an off-list Ingredient as an "extra Lot" already (0801/0802). No conflict.

### 5.3 Proposed design

Plan 2.5 stands: `shopping_not_needed (range_to, ingredient_id, needed, user_id, created_at)` in migration 1530, `POST /api/shopping/not-needed`, `DELETE /api/shopping/not-needed/{ingredientId}?to=`, `notNeeded` and `pastPlannedMeals` on the list, collapsed "Not needed (N)" group, progress/total/complete exclude them. `pastPlannedMeals` entries carry `courseName` (already in the plan), and the hint groups a slot's Courses ("Includes Tue Dinner: Roast chicken, green beans").

UI: `features/shop`: line `Menu` on `LineTile`, `NotNeededGroup`, pure `lib/lines.ts` additions, `useShoppingActions` gains `notNeeded` / `neededAfterAll`. **Mark it** navigates to the existing To confirm sheet for that slot (the plan feature's `useToConfirm` exports; `features/shop` must not import plan internals, so the link is a route, `/plan#to-confirm`, or a callback via the shell seam like `features/today/seams.ts`).

---

## 6. Stock Lots (plan 2.6)

### 6.1 What main has

- Pantry (`features/stock/screens/StockScreen.tsx`): two modes, `places` (default; Lots grouped by Storage Place via `PantryLotRow`, `usePantry`, filters in `lib/pantry.ts`, `lib/filter.ts`) and `ingredients` (`StockRow` totals; tapping opens a `BottomSheet` for the Ingredient with its Lots and **Set total**). `LotSheet.tsx`: facts, **Move to** (a Storage Place, how much), a link to the Ingredient sheet.
- Backend (`internal/stock/httpapi/httpapi.go`): `GET /api/stock`, `GET/POST /api/stock/lots`, `PUT /api/stock/ingredients/{id}/total`, `spoiled`, `throw-out`, `keep`, `POST /api/stock/cooked`, `projected`, `waste`, `POST /api/stock/lots/{id}/move`, Storage Place CRUD. `Service.RemoveLot` exists only as Scan Undo (`internal/stock/service/service.go`). Deduction: `stock.Deduct` with `consumptionLess` (soonest go-off, then oldest, then id), called via `StockService.DeductCookedTx` from the plan runner's cooked path (`plan/runner/stockport.go`).
- **Go-off bookkeeping**: `stock_go_offs` (1150) keeps a go-off event after a Lot leaves Stock by any means except Undo of a Scan (spec §6.1).
- **Cooked** is per Planned Meal = per Course; **Mark all Cooked** (`MarkAllCookedSheet`, `POST /api/plan/{date}/{slotId}/all/cooked`) confirms several Courses in one transaction.

### 6.2 Conflicts and ambiguities

1. **"Inline per Ingredient"** (Q21): the places view already lists Lots, and the Ingredient sheet already lists them. What exactly is missing is the user's call.
2. **Delete a Lot that has gone off** (Q22): spec §6.1 says a go-off persists however the Lot leaves Stock, "except Undo of a scan (a correction, not a go-off)". Plan 2.6 adds Delete to that exception and removes the go-off. That is a rule change to the streak, hence a question.
3. **Edit and Storage Places** (Q22 part b): "Bought on" suggests "Good until" from the Shelf Life of the Lot's Storage Place kind. For a Lot in a Freezer the spec has two rules (added straight into a Freezer: purchase + frozen Shelf Life; moved in: today + frozen). Edit must pick one.
4. **Used from and Storage Places** (Q23): lists Lots with their place; the default order ignores places. Whether to prefer an open pack in a fridge over a frozen Lot with an earlier go-off is not stated.
5. **Used from in Mark all Cooked.** Picks are per Course; two Courses may use the same Ingredient and the same Lot. The plan says the second is refused if the Lot is over-picked. In `all/cooked` (all or nothing) the sheet must validate across Courses before sending (UI lib) and the server must validate in the same transaction.
6. **Bought records on Lot Delete/Edit.** Delete removes `planned_meal_bought` rows of that Lot; Edit of quantity does not (the records are what was bought, not what remains).

### 6.3 Proposed design (not in question)

- **Pure functions** in `internal/stock/lot.go`: `ValidateEdit(lot, edit, today, shelfLife)` and `DeductPicked(lots, need, picks)`. Draft [ADR 0011](../../adr/0011-cooked-takes-from-picked-lots.md) amends ADR 0003.
- **API** as plan 2.6: `PATCH /api/stock/lots/{id}` (`quantity`, `purchased`, `goesOff`), `DELETE /api/stock/lots/{id}` (reuse `RemoveLot` plus the go-off and Bought cleanup in one transaction; the Q22 outcome decides the go-off part), cook preview `lots` per need in Deduction order (with `storagePlaceName`), `usedFrom` on `.../{courseId}/cooked` and on each `courses[i]` of `.../all/cooked`, `422 used_from_invalid`.
- **UI**: `features/stock`: `IngredientLotsRow` (an expandable `ListRow`; `ui/ListRow` gains `expanded` / `onToggle`), `LotEditSheet` (shared `NumberField`, `DateField`, `Switch`), Delete through `useConfirm`; pure `lib/pantry.ts`, `lib/lotEdit.ts`. `features/plan`: `UsedFromSection` in `MarkCookedSheet` and `MarkAllCookedSheet` (shared `Checkbox`), pure `lib/usedFrom.ts`, hook `useUsedFrom`. The Edit and Move actions live in the same `LotSheet`.
- **Events**: Lot writes publish `stock {"changed":"lots"}` (replan as a Stock-take; Bought Planned Meals stay).

---

## 7. Recipe sort by last cooked (plan 2.7)

### 7.1 What main has

`GET /api/recipes` orders by `lower(r.name), r.id` (`internal/recipe/store/store.go:381`) with filters `q`, `tag`, `course`, `notCourse`, `archived`. The Recipes screen keeps its filter state in the URL (`useSearchParams`), with `SearchField`, `TagChips` and `CourseFilter`. `RecipeTile` now shows Course chips and the first two Tags (ADR 0010). There is no last cooked anywhere.

### 7.2 Conflicts and ambiguities

1. **Persistence**: the plan says `localStorage`; main keeps list filters in the URL, so the sort should be a `sort` query param too (Q24, cosmetic).
2. **Package boundary**: Last cooked is a function of `planned_meals` (Cooked, fresh, any Course), owned by the plan store. `internal/recipe/store` must not read plan tables directly; the plan's partial index on `planned_meals (recipe_id, date)` is a plan-store concern. ADR 0010 set the pattern for such a dependency (a small port wired at mount, like `TagExists`).
3. **Density**: a third line on `RecipeTile` next to Course chips and Tags (Q24).

### 7.3 Proposed design

- `internal/plan/store`: new method `LastCooked(ctx) (map[recipeID]date, error)` in a new file (`lastcooked.go`); `internal/recipe/httpapi` takes a `LastCooked` dependency (nil-safe, wired in `internal/app`), merges it into the list and detail payloads (`lastCookedOn`) and sorts when `?sort=last_cooked_asc|last_cooked_desc`. No migration needed: `planned_meals_recipe` already indexes `recipe_id`; the plan's partial index is optional and left out.
- SPA: `RecipeSortSelect` (shared `Select`, no native control) placed with the filters; pure `lib/sort.ts` and `lib/lastCooked.ts` (copy: today / yesterday / weekday / date; "Not cooked yet"); `useRecipes` takes the sort in its filter key.
- Last cooked = latest date of a Cooked, fresh Planned Meal of that Recipe in any Course (a Leftover-served one does not count). The Planned Meal's date counts, not the day it was marked.

---

## 8. Settings grouped (plan 2.8)

### 8.1 What main has

`features/settings/lib/settingsSections.ts`: groups `household` (Household, Members, Meal Slots, Courses, Planning rules, Tags, Shops, Storage Places, Sign-in requests), `you` (Your preferences, Notifications), `admin` (Allowlist, Recipe Assistant; Admins only). Ingredients (`/ingredients`) and Products (`/products`) are menu items registered by their features' `navItems` (`features/ingredients/index.ts`, `features/products/index.ts`); `features/shops/index.ts` still registers a Shops menu item to `/settings/shops`; `app/nav.ts` `MENU_ICONS` maps `ingredients`, `products`, `shops`. `MENU_NAV` = Kitchen board, Settings. The Pantry is a primary destination (PN, decision 33), so the plan's note that the avatar menu keeps "Kitchen board, Settings, Sign-in requests" is right as far as the access badge goes (`app/accessMenu.ts`).

### 8.2 Conflicts and ambiguities

1. **Courses in Catalogue or Household** (Q25): Courses is Admin-edited and defines what Meal Slots serve; Tags and Storage Places are edited by every User.
2. **The Admin group** goes in the plan; Allowlist and Recipe Assistant become Admin-only rows of Household (Q25).
3. **Photo work**: no conflict. The photo read (decisions in `photo-read.md`) adds no Settings row; the Recipe Assistant row keeps its path. Stored photos are cleared on sign-out (`forgetStoredPhotos`), unrelated.
4. The Exclusions page is `/plan/couldnt-plan/excluded`, not a Settings page; no row.
5. **Nav tests and guards** to update: `app/nav.test.ts`, `features/*/index.test.ts`, `app/breadcrumbs*`, `pageLayoutRules*` (the layout guard lists routes), `features/settings/lib/settingsSections.test.ts`, `SettingsIndexPage*.test.tsx`.

### 8.3 Proposed design

As plan 2.8 for the mechanics (groups, rows, role table, breadcrumbs "Settings › Ingredients" on `/ingredients` and `/products`, routes unchanged, `MENU_ICONS` entries and the three `navItems` removed). The group and row placement waits on Q25.

---

## 9. Open product questions

Each: the question, the options, **recommended default** and why, and what it blocks. Q1 to Q9 gate the slot-date / Guests / planner team; Q10 to Q16 the Leftovers team; Q17, Q18 the Bought team.

### Slot controls

**Q1. Is Not served a slot-level user action only, and does it share its name with the Course-level "left empty" states?**
Main already says "Not served" (spec §7.2 step 0b, API `unserved`) for a Course that is left empty on purpose, with no user action for it. The plan adds a slot-wide action also called Not served, and a menu that already has **Not cooked: whole slot**.
- A. One term, **Not served**, covering the slot-wide action and the Course states; the menu entry reads "Not serving this slot"; a Course row reads "Not served" for any of the reasons. Per-Course control stays in Who's eating > Courses (opt-outs).
- B. Slot-wide action named differently ("Closed", "No meal") and Not served kept for Courses only.
- C. A per-Course **Not served** action too (a Course row menu), stored as a flag rather than as everyone's opt-out.
Default **A**: one word for one idea ("nobody is served this"), no second storage for Courses (opt-outs already do it), and no new vocabulary. The menu label avoids a lookalike of "Not cooked". Blocks: slot-date team (copy, enum, glossary).

**Q2. What does an emptied date mean?** Main: saving Who's eating with nobody is stored and the slot is **Couldn't plan** (Nobody attends) with the fix "Choose who attends" (spec §3, §7.4). The plan: it becomes **Not served** (a Meal Slot whose *usual* Attendance is empty stays Couldn't plan).
- A. As the plan: an emptied date is Not served (and Guests count: no Member and no Guest).
- B. Keep main: an emptied date is Couldn't plan; the User uses Not served on purpose.
- C. Refuse to save an empty date with "Use Not served for a date nobody eats" and offer the action in the error.
Default **A** (the plan, one gesture, matches the user's mental model "nobody is eating that day"), with the sheet saying "Nobody is eating: Dinner will be Not served." before **Save**. It reverses a documented rule, so it needs the spec §3, §7.4 edit and BDD change. Blocks: slot-date team.

**Q3. Where do the per-date controls live?** Today the slot menu hides for a one-Course slot, and Today's hero has its own menu.
- A. A menu on every slot block in Plan (all days from today) and on Today's Tonight hero; none on the board (read-only), none for past days.
- B. Plan only.
- C. A separate "This date" action on the day tile header.
Default **A**: Today is where a last-minute change happens, and a one-Course Household would otherwise never see the feature. Blocks: slot-date web team.

**Q4. Time today: limits.** One time per slot per date. May it be moved past another slot of the same day (Lunch at 19:00 after Dinner at 18:30)? The planner walks by effective time, so it would reorder the walk and the cooking Leftover order.
- A. Any time, the walk follows it; no check.
- B. Refuse a time that reorders the slots of that day ("Dinner is at 18:30").
Default **A**: refusing is a rule nobody asked for; reorder only affects tie-breaks. Blocks: nothing hard (slot-date team may proceed on A).

**Q5. Who's eating from Plan and Today: date locked? Reset scope?**
- Date: the sheet opened from a slot block has the date fixed (read-only `DateField`); from Settings it is editable. Default as stated.
- **Reset to usual** on the sheet resets Members, Course opt-outs and Guests, not Not served and not the date's time (those have their own **Plan Dinner again** and **Back to 19:30**). Alternative: Reset clears everything of the date.
Default **the narrower reset**: each control undoes itself; Reset to usual Attendance keeps its present meaning. Blocks: copy only.

### Guests

**Q6. Not served on a slot that is partly done.** Plan: Not served removes only unresolved Planned Meals; Cooked and Not cooked ones stay as history, and the action is offered while at least one Course is unresolved. With Courses a slot can have Main Cooked and Side still planned; a slot-level "Dinner · Not served" row next to a Cooked Main is contradictory.
- A. Not served is offered only while **no** Course of the slot is Cooked or Not cooked; afterwards the User uses Not cooked for the rest.
- B. As the plan: allowed, only unresolved Courses are removed, and the slot shows its Cooked Courses plus "other Courses not served".
Default **A**: a slot someone has started cooking was served; one clear rule, and no mixed state to draw. Blocks: slot-date team (menu rule; `slot_resolved` becomes `slot_started`).

**Q7. Guests and a Course every Member opts out of.** Plan: the Course is served, for the Guests (decided "no per-Course Guests"). ADR 0008 point 8: such a Course is left empty silently.
- A. As the plan: Guests keep the Course served (every Course the slot serves, required and optional).
- B. Guests only add portions to Courses at least one Member eats; a Course all Members opt out of stays empty.
Default **A**, as decided: the simplest rule to say aloud ("Guests eat everything the slot serves"). This changes the meaning of `no_course_attendance` (it needs Guests = 0) and ADR 0008 point 8 gets a sentence; if the user meant B, say so now. Blocks: planner changes.

**Q8. Guests with no Member.** Plan: served, planned with no preferences. Main's `no_attendance` is "no attendees".
- A. Served: `no_attendance` only when Members are empty **and** Guests are 0; the Course Attendance for Exclusions/Favourites is empty (nothing excluded, no score terms).
- B. Not allowed: at least one Member must attend for Guests to count.
Default **A** (plan). Note for the Admin copy: a slot whose usual Attendance is empty stays Couldn't plan until a date adds Guests or Members. Blocks: planner changes.

**Q9. Batches follow portions: Guests only, or every portion change?** Decided for Guests. The same code path also covers a Member joining, a Portion Factor edit and Course opt-outs; today an unpinned Planned Meal is dropped and replanned, a Pinned one under-cooks.
- A. One rule for every portion change: an unresolved fresh Planned Meal whose Batches no longer cover its portions gets Batches = ceil(portions / Yield), never fewer.
- B. Only when Guests change.
Default **A**: B would be a special case that leaves Pinned Planned Meals under-cooking for every other reason. The CHANGELOG then says it plainly. Blocks: planner changes, replay QA.

### Leftovers

**Q10. Does the Pantry show Leftovers?** (a) Not Stock by the glossary (**Stock** note); (b) portions, not Base Units; (c) only frozen ones can have a place (the plan's Freeze it is the only action that sets one).
- A. Frozen Leftovers appear in the Pantry under their Freezer group in the leftover tone, with a **Leftovers** filter chip; not in By Ingredient mode; excluded from Use soon / Spoiled and from quantity sort (they sort by Use-by). Glossary Stock note gains "frozen Leftovers also appear there".
- B. The Pantry shows only a link tile "2 frozen Leftovers" to a list on Today / Plan; Leftovers never mix with Lots.
- C. A Leftover becomes a Stock Lot (the plan rejects this; reasons in ADR 0012 draft).
Default **A, restricted to frozen**: the user asked for the freezer; a frozen thing nobody sees where they look is lost. Blocks: Leftovers team (Pantry web, glossary).

**Q11. Take out: where does the thawed Leftover go?** Plan: Take out asks for a non-freezer Storage Place or Not sorted, and the Leftover then shows in the Pantry in that place.
- A. Take out clears the place (back to Today / Plan only): a thawed Leftover is a 3-day Use-by item, not Stock.
- B. As the plan: it can sit in a fridge place and appear in the Pantry.
Default **A** (with Q10 = A, only frozen Leftovers are in the Pantry, which keeps one rule). Blocks: Leftovers team.

**Q12. A frozen Leftover chosen for a Planned Meal: when does it leave the Freezer, and what happens to the rest?** The plan pins it ("take it out the day before") but does not say.
- A. Cooked (Reheat) takes the portions used; the rest stays frozen with its Use-by; no Take out step is required.
- B. The User must press Take out first; Cooked consumes from the thawed Leftover (Use-by = today + the Recipe's Use-by).
- C. Picking it for a Planned Meal thaws the whole Leftover (as B, automatically on the day before).
Default **A**: portions are separable (Freeze it can split), it is what happens in a kitchen, and the Take out action stays for "I took it all out". Blocks: Leftovers team (cook/Reheat flow touches `cook` and `plan/runner`).

**Q13. Names: Frozen Use-by vs Frozen Shelf Life.** Both are "days in the Freezer", one for an Ingredient's Lots, one for a Recipe's Leftovers.
- A. Keep **Frozen Use-by** (Leftover, per Recipe + household default) and **Frozen Shelf Life** (Lot, per Ingredient), each with a `_Note_` pointing at the other.
- B. Reuse one term ("Frozen Shelf Life") for both.
- C. Rename the new one ("Freezer Use-by").
Default **A**: it keeps the Shelf Life / Use-by split the glossary already draws (Shelf Life is for Lots, Use-by for Leftovers). Blocks: glossary pass.

**Q14. Default Freezer for Freeze it.** The plan says "the Freezer last used for a Leftover, else the first by name". Main has no memory for that (the memory is per Ingredient).
- A. The default Storage Place if it is a Freezer, else the first Freezer by name (no new table).
- B. Add a small remembered-place setting for Leftovers.
Default **A**: no new storage for a convenience. Blocks: nothing.

**Q15. Ask before waste: who sees the question, and does it notify?** The plan: a row on Today's Leftovers tile ahead of Leftovers; unanswered keeps asking; no push.
- A. As the plan, plus the Pantry shows a badge only for frozen Leftovers past their Use-by; the board shows "Chilli, Use-by passed" with no actions and no waste.
- B. As A, plus a push (new notification type) once.
- C. The question also blocks the Planned Meals it serves (they are replanned at once, as the plan does).
Default **A**, with the replan as the plan says: no new push type (every new type needs a Settings > Notifications toggle). Blocks: copy and board payload.

**Q16. Leftover hand actions on a Leftover that a Planned Meal is served from.** Plan: the sheet names the Planned Meals that lose portions and unpins and replans them (a Pinned one included).
- A. As the plan.
- B. Refuse when a Pinned Planned Meal is served from it ("Unpin Thu Lunch first").
Default **A** (the User's hand action wins; the sheet names what moves). Blocks: nothing.

### Bought

**Q17. Bought beside a Whole meal (and Courses).** ADR 0008: a Whole meal in the main Course removes unpinned, unresolved Planned Meals in the other Courses.
- A. A Bought Planned Meal is kept like a Pinned one: the Whole meal is held back beside it by the planner, and a Whole meal set by hand leaves it as a not-covered Course.
- B. A Whole meal set by hand removes a Bought Side after the dialog names what was bought.
Default **A**: "Bought is held like Pinned" is one rule; the User who sets a Whole meal by hand is warned in the Swap sheet that "you bought X for the Side". Needs the ADR 0008 point 2 / hard-filter extension. Blocks: planner / Bought team.

**Q18. Purchases and past, unconfirmed Planned Meals.** `derivedLines` draws Stock in date order and includes past meals waiting in To confirm. A Scan then makes the oldest past meal Bought (and starves tonight's).
- A. Attribute purchases only to Planned Meals dated today or later; past unconfirmed meals still count on the list (feature 5) but cannot be Bought.
- B. Attribute in date order including past ones (the plan as written).
Default **A**: a past meal not marked Cooked is probably not cooked; holding it makes no sense. It needs the before / after derivation to give past meals no share. Blocks: Bought team (`shopping.Attribute`).

### Shopping List

**Q19. What was seen with past meals?** Main already keeps a past unconfirmed Planned Meal's Ingredients on the list. Is the request satisfied, or did the list lose them in a specific case?
- A. Satisfied: only the hint and **Mark it** are new (plan 2.5).
- B. A case failed; the user describes it (which meal, how it was missed), and the team writes a failing test first.
Default **A**, with a failing-case BDD ("A Planned Meal from Tuesday not marked Cooked keeps its Ingredients on the list", already in the plan) added to catch regressions. Blocks: nothing (the hint and Not needed go ahead).

**Q20. Not needed lifetime.** Marks are keyed by the list's range end, like ticks.
- A. Per range, like ticks (the plan). If the range end rolls each day, the mark goes with it.
- B. Per Ingredient until the next purchase of it or until midnight.
Default **A**, same as ticks (users already know that behaviour); the SPA keeps the chosen To for the day so a mark survives a refresh. Blocks: nothing.

### Stock Lots

**Q21. Inline Lots per Ingredient.** The Pantry's default view already lists Lots, and the Ingredient sheet lists them.
- A. Expand in place in By Ingredient (the plan): "Chicken thighs, 1300 g, 2 Lots" opens its Lots with Edit / Delete reachable from each.
- B. Keep the sheet and add Edit / Delete there; no expansion.
Default **A** (what was asked), with the same `LotSheet` for Edit, Delete and Move. Blocks: Pantry web.

**Q22. Delete of a Lot, and Edit details.**
(a) *Delete* of a Lot that has already gone off: spec §6.1 keeps a go-off however a Lot leaves Stock except Undo of a scan. A: Delete is a correction like that Undo (the go-off goes with it; the dialog says so); B: a Lot that has gone off unforgiven keeps its go-off event (Delete removes the quantity only); C: Delete is refused for a Lot that has gone off ("Throw out, or correct its dates").
(b) *Edit*: "Bought on" re-suggests "Good until" from the Shelf Life of the Lot's Storage Place kind; for a Freezer, use purchase + frozen Shelf Life (added-straight-in rule) not today + frozen. The suggestion never overwrites a Good until changed in the same edit.
(c) *Storage Place* is changed with **Move to**, not in Edit.
Default **(a) A, (b) as stated, (c) as stated**: the plan's own reading and consistent with the existing exception; the confirm names the effect. Blocks: stock team (`DeleteLot` and the streak tests).

**Q23. Used from: place and order.** Lots appear in Deduction order (soonest go-off, oldest, lowest id) with their Storage Place; picking is per Ingredient line, per Course (also in Mark all Cooked).
- A. Order unchanged; the Storage Place is shown on each row; frozen Lots are listed like any other.
- B. Prefer Lots outside a Freezer in the default order.
Default **A**: a frozen Lot's go-off date already sorts it late, and B changes ADR 0003 more than asked. Blocks: Used from team.

### Recipes

**Q24. Recipe list: sort placement and tile density.** (a) The sort goes in the URL (`?sort=`) with the other filters and the last choice is also kept on the device; (b) "Last cooked ..." replaces nothing on the tile: it joins the meta line below Course chips and Tags (the tile shows at most the first two Tags plus "+N"). Default as stated. Blocks: nothing.

### Settings

**Q25. Where do Courses, the Admin rows and Sign-in requests sit?**
- A. As the plan: Catalogue = Ingredients, Products, Shops, Tags, Courses, Storage Places; Household = Household, Members, Meal Slots, Planning rules, Sign-in requests, plus Allowlist and Recipe Assistant (Admins only); You = Your preferences, Notifications.
- B. As A but Courses under Household next to Meal Slots (Admin-edited, defines what a Meal Slot serves).
- C. Keep an "Admin" group.
Default **B**: Courses is an Admin-edited planning structure and sits with Meal Slots in people's heads; everything else as the plan; the Admin group dissolves (rows are Admin-only inside Household). Blocks: settings team.

**Q26. Avatar menu after Ingredients and Products leave.** The menu would keep Kitchen board and Settings (plus Sign-in requests when present). Confirm that no shortcut to Ingredients or Products remains in the menu, since both are reachable from the Recipe editor and the Pantry. Default **confirm**. Blocks: settings team.

### Release

**Q27. One tag or two?** The planner-touching work (Guests, Bought, Leftovers by hand, Batches follow portions) is the risky part. Recipes sort, Settings groups, Not needed and Lot edit are independent and small.
- A. One beta.5 with everything (the plan).
- B. Ship beta.5 with Settings groups, Recipes sort, Not needed, Lot edit/delete and Used from, and a beta.6 with the planner work.
Default **A with waves** (§11): QA happens once, and the planner work lands late in the wave order anyway. If a wave slips, cut to B. Blocks: the release checklist.

**Q28. Pre-migration snapshot `feeder-pre-1500.db`.** Beta.4 took one because 1400 rebuilt `planned_meals`. Migrations 1500 to 1530 are plain `CREATE` / `ALTER`.
- A. Take it again (the plan), generalising the helper.
- B. No snapshot: the migrations only add; going back means the nightly backup.
Default **A**, small and the established upgrade promise ("going back to the image you ran before"). Blocks: the foundation team only (a separate small work package).

---

## 10. GLOSSARY: proposed changes (not applied)

New terms (singular, as the glossary names them). `_Avoid_` words were checked against the SPA's `strings.ts` files: the UI guard (rule 6) flags an avoid word and its inflections everywhere, so the common UI words "off", "skip", "hide", "dismiss", "locked", "cancel(led)", "extra", "close(d)" must not be used as avoid words. Multi-word phrases are safe.

```diff
+**Not served**:
+A Meal Slot on one date, or one Course of it, that the plan leaves empty on purpose: the Household marked the slot Not served, nobody eats that Course that date, or it is an optional Course that nothing fits. It is not Couldn't plan and it is not Not cooked, which is said after the date.
+_Avoid_: Day off, blocked out, no meal
+_Note_: "skipped" stays the code's word for a Not cooked Planned Meal; Not served is never "skipped".

+**Guest**:
+Someone who is not a Member and eats at one Meal Slot on one date, counted only as a number. Each Guest is one standard portion of every Course the slot serves that date, with no name and no preferences.
+_Avoid_: Visitor, plus-one
+_Note_: the singular is the term; the UI says "Guests" for the count.

+**Frozen Use-by**:
+The number of days a Leftover keeps in a Storage Place of kind freezer, set per Recipe or by the Household's default; freezing a Leftover sets its Use-by to that many days from that day.
+_Avoid_: Freezer life, frozen expiry
+_Note_: not **Frozen Shelf Life**, which is how long an Ingredient's Stock Lot keeps in a Freezer.

+**Had it / Threw it out / Freeze it**:
+The choices a User makes on a Leftover by hand (and, once its Use-by has passed, "Wasn't there"): Had it records portions had outside the plan (not waste), Threw it out records waste on purpose, Freeze it moves it to a Freezer with its Frozen Use-by, Wasn't there removes it as a mistake.
+_Avoid_: Consume, discard, bin

+**Bought**:
+A fresh Planned Meal that a purchase from the Shopping List was bought for: a Scan or Tick by hand that covered part of its Ingredients. Automatic replans leave it as it is; Regenerate, Swap or choosing a Recipe changes it.
+_Avoid_: Reserved, committed, purchased
+_Note_: not **Pinned**: a Pinned Planned Meal is the User's choice and Regenerate keeps it; a Bought one is only held against automatic changes.

+**Not needed**:
+A Shopping List line the User took off the list for its current range, because nothing needs buying; it adds no Stock and is not a purchase.
+_Avoid_: Not required, crossed off

+**Used from**:
+The Stock Lots a User says a Cooked Planned Meal took an Ingredient from, when not the default order.
+_Avoid_: Source lots, override

+**Last cooked**:
+The latest date a Recipe was Cooked fresh (not served from a Leftover).
+_Avoid_: Last made, last eaten
```

Updates:

```diff
 **Attendance**:
 The Members who eat at a given Meal Slot, each with their Portion Factor. It starts as everyone, and people opt out; it can be changed for one date. The Members who eat each Course of the slot are that Course's **Course Attendance**.
-_Avoid_: Guests, headcount
+_Avoid_: Headcount
+_Note_: **Guests** are counted beside the Attendance, not in it: they add portions but no preferences.

 **Course Attendance**:
-_Avoid_: Course guests, skips, diners
+_Avoid_: Course diners, skips
+_Note_: (add) "Guests eat every Course the slot serves; they are not part of a Course Attendance."

 **Meal Slot**: "...with a usual time, which one date may change, ..."
 **Portion Factor**: "... A Guest's is always 1."

 **Leftover**: add "It may be frozen in a Storage Place of kind freezer; a frozen Leftover is not planned automatically."
 **Use-by**:
-The last date a Leftover may be served; after it the Leftover is discarded and never planned.
+The last date a Leftover may be served; after it the Leftover is not planned, and Feeder asks whether it was had, thrown out or not there.
 **Zero-waste streak**:  "(a Stock Lot going off, a Throw out, or a discarded Leftover)" -> "(a Stock Lot going off, a Throw out, or a Leftover thrown out)"
 **Throw out / Keep**: _Note_ (add): "A Leftover's equivalent is Threw it out."
 **Storage Place**: "Where the Household keeps Stock and frozen Leftovers (...)" (only if Q10 = A)
 **Stock**: _Note_ (add, if Q10 = A): frozen Leftovers also appear on the Pantry page; they are not Stock.
 **Stock Lot**: "... with its purchase date and go-off date, both of which a User may correct."
 **Cooked**: "... only then is Stock deducted, from the Lots the User picked (Used from) or else soonest to go off first."
 **Shopping List**: "... for uncooked Planned Meals up to a chosen date (earlier ones not yet marked Cooked included), less Stock, less lines Not needed, plus any extras."
 **Pinned**: _Note_ (add): "A Bought Planned Meal is held the same way by automatic replans, but Regenerate replaces it; it is not Pinned."
 **Frozen Shelf Life**: _Note_ (add): "Not Frozen Use-by, which is a Leftover's."
```

Renames: none. The definitions of **Use-by** and **Zero-waste streak** use "discarded", which is also in **Throw out / Keep** `_Avoid_: Discard`; the update above removes the inconsistency.

---

## 11. ADR candidates

Drafted as files, status **Proposed**; each lists the open questions that must be answered before it becomes Accepted.

| ADR | File | Amends | Waits on |
|---|---|---|---|
| 0011 Cooked takes from the Lots the User picks, else soonest to go off first | [0011](../../adr/0011-cooked-takes-from-picked-lots.md) | ADR 0003 | Q23 |
| 0012 Leftovers stay Leftovers: freezing, hand actions and asking before waste | [0012](../../adr/0012-leftovers-stay-leftovers.md) | spec §1, §6.1, §8 | Q10, Q11, Q12, Q15 |
| 0013 Bought Planned Meals are held by automatic replans | [0013](../../adr/0013-bought-planned-meals-held.md) | ADR 0008 point 2, ADR 0009 points 4 and 6, decision 22 | Q17, Q18 |

No ADR for per-date slot data (a table, no decision that reverses one), Guests (spec text) or Settings grouping.

---

## 12. Proposed work packages and order

Rules from CLAUDE.md apply: one team per feature, own worktree and branch, no two teams on the same file at once, designer / test author, developer, reviewer. File ownership below uses the real tree.

| WP | Scope | Owns (new or edited) | Depends on | Blocked on |
|---|---|---|---|---|
| **D Shared web** | Phosphor glyphs (`snowflake`, `question`, `shopping-cart`, a Guests glyph); expandable `ui/ListRow` (`expanded`, `onToggle`); Gallery rows | `web/src/ui/icons.ts`, `web/src/ui/ListRow*`, `web/src/ui/Gallery*`, `web/src/ui/galleryData.ts`, `web/src/ui/index.ts` | none | none |
| **G Settings and nav** (F8) | Groups, rows, role copy, avatar menu, breadcrumbs | `web/src/features/settings/lib/settingsSections*`, `settings/strings.ts`, `settings/screens/SettingsIndexPage*`, `web/src/app/{nav.ts,breadcrumbs*,pageWidths.ts}` (+tests), `web/src/features/{ingredients,products,shops}/index.ts` (+tests), `scripts/lib/page-layout-rules.mjs` if a route changes | none | Q25, Q26 |
| **R Recipes last cooked** (F7) | `LastCooked` in plan store, list/detail field, `?sort`, sort select, tile meta | `internal/plan/store/lastcooked.go` (new file), `internal/recipe/httpapi/**`, wiring in `internal/app`/`internal/modules`, `web/src/features/recipes/**` | none | Q24 (cosmetic) |
| **SH Shopping Not needed + hint** (F5) | Migration 1530, `internal/shopping/**`, `web/src/features/shop/**` | `internal/db/migrations/1530_*.sql`, `internal/shopping/{shopping.go,store/**,service/**,httpapi/**}`, `web/src/features/shop/**` | none | Q19 (can start), Q20 |
| **ST Stock Lots: edit, delete, inline** (F6) | `PATCH`/`DELETE` lot, `ValidateEdit`, Pantry expansion, `LotEditSheet` | `internal/stock/**`, `web/src/features/stock/**`, `stock` BDD | D (ListRow) | Q21, Q22 |
| **SD Slot dates + Guests backend** (F1, F2) | Migration 1500, `household/slotdate.go`, Sources port, planner (Guests, Not served, walk by time, Batches follow portions), notify, cook, shopping slot-time read, payloads | `internal/db/migrations/1500_*`, `internal/household/**`, `internal/planner/**`, `internal/plan/{plan.go,types.go,cook.go}`, `internal/plan/runner/**`, `internal/plan/store/**` (non-lastcooked), `internal/plan/httpapi/**`, `internal/notify/**`, `internal/cook/**`, `internal/today/**`, `internal/shopping/httpapi/wiring.go` | SH merged (shopping wiring) or a hand-off for that one file | Q1 to Q9 |
| **F1 Plan and Today web: slot controls, Guests** | Slot menu, Not served row, time dialog, Who's eating from Plan/Today, Guests stepper, pill suffix | `web/src/features/plan/**` (menu, hooks, lib), `web/src/features/today/**`, `web/src/features/board/**`, `web/src/features/cook/**` (time captions), `web/src/features/settings/components/DateAttendancePanel*`, `settings/lib/dateAttendance*`, `settings/index.ts` export | SD, D, G (settings files) | Q1 to Q6 |
| **BO Bought backend** | Migration 1520, `shopping.Attribute`, `BoughtRecorder`, planner `roleHeld`, runner, Regenerate dry run, structural dry runs list `bought`, ADR 0013 | `internal/db/migrations/1520_*`, `internal/shopping/**` (after SH), `internal/planner/**`, `internal/plan/**` | SD merged (planner/runner files), SH merged | Q17, Q18 |
| **BOW Bought web** | Chip, sheet line, Regenerate list, Swap note | `web/src/features/plan/**` | BO, F1 merged | Q17 |
| **LO Leftovers backend** | Migration 1510, `plan/leftover.go`, runner actions, no auto-waste, answers, zero-waste, API | `internal/db/migrations/1510_*`, `internal/plan/{leftover.go,runner/**,store/**,httpapi/**}`, `internal/cook/{zerowaste.go,...}`, `internal/recipe/**` (field), `internal/household/settings*` (default), `internal/notify` (none) | BO merged (runner / planner) | Q10 to Q16 |
| **LOW Leftovers web** | `lib/leftovers`, `ui/LeftoverActions`, Today tile, Planned Meal sheet link, "From the freezer", Pantry frozen rows, Recipe editor and Household fields | `web/src/lib/leftovers/**`, `web/src/ui/LeftoverActions/**`, `web/src/features/plan/**`, `web/src/features/stock/**`, `web/src/features/recipes/**` (editor field), `web/src/features/settings/components/HouseholdSettingsForm*` | LO, D, ST, F1 merged, R merged (recipes web) | Q10 to Q15 |
| **UF Used from** | `stock.DeductPicked`, cook preview `lots`, `usedFrom` on cooked routes, `UsedFromSection` in both Mark sheets | `internal/stock/lot.go` (after ST), `internal/plan/runner/{stockport.go,actions.go}`, `internal/plan/httpapi/**`, `web/src/features/plan/components/{MarkCookedSheet,MarkAllCookedSheet}*`, `hooks/{useMarkCooked,useMarkAllCooked}*`, `lib/cook*` | ST merged; plan runner files after LO merged (or granted a disjoint file list) | Q23 |
| **SNAP Snapshot** | Generalise `NeedsPre1400Snapshot` to a named snapshot, `feeder-pre-1500.db` | `internal/db/db.go`, `internal/backup/backup.go`, `cmd/feeder/startup.go`, `scripts/test/**` | none | Q28 |
| **W0 Doc** | Spec (decisions 37 to 43, §18, per-feature edits), GLOSSARY (§10), ADRs 0011 to 0013 to Accepted | `docs/spec/functional-spec.md`, `GLOSSARY.md`, `docs/adr/001[1-3]-*` | the answers | the answers |
| **H Release** | CHANGELOG, upgrade note, deploy guide, word check | `CHANGELOG.md`, `docs/dev/deploy.md`, `GLOSSARY.md` | last | |

**Shared hot spots** that force the order: `internal/planner/**` and `internal/plan/runner/**` are touched by SD, BO, LO and UF, so they run strictly SD, then BO, then LO, then UF (runner part). `web/src/features/plan/**` is touched by F1, BOW, LOW and UF web, so F1, then BOW, then LOW; UF web may run beside F1 only with a file list limited to the two Mark sheets and their hooks. `internal/shopping/**` is touched by SH, then BO. `web/src/features/stock/**` by ST, then LOW.

### 12.1 Waves

| Wave | Parallel teams | Needs |
|---|---|---|
| **0** | W0 (answers to glossary / ADR drafts), SNAP | the user's answers to Q27, Q28 |
| **1** | D, G, R, SH, ST | none of Q1 to Q18; Q19 to Q22, Q24 to Q26 (all with defaults) |
| **2** | SD (after Q1 to Q9), UF backend (after ST and Q23) | answers |
| **3** | F1 web, BO (after SD and SH), UF web | SD merged |
| **4** | BOW, LO (after BO) | BO merged; Q10 to Q16 |
| **5** | LOW | LO, F1, ST, R merged |
| **6** | H release, QA | all |

Critical path: SD, BO, LO, LOW, H. Everything in Wave 1 can start before any question in Q1 to Q18 is answered.

### 12.2 Dependencies on questions (what can start today)

- **Can start now:** D, G (with Q25 and Q26 defaults confirmed), R, SH, ST (Q21, Q22 defaults), SNAP (Q28).
- **Needs the user first:** SD (Q1, Q2, Q6, Q7, Q8, Q9 change the planner or the menu contract), BO (Q17, Q18), LO / LOW (Q10 to Q15), UF (Q23).

### 12.3 Tests and QA additions caused by main

- BDD feature directories already exist under `bdd/features/` (`planning`, `stock`, `shopping-scan`, `courses`, `tags`, ...); the plan's `bdd/features/beta5/` is acceptable but the step files follow the `steps_*_test.go` pattern in `bdd/`.
- Planner golden tests: every replan reason with a Bought cell; Guests with Course opt-outs; Not served with a Whole meal in the main Course; Batches follow portions for a Course opt-out change.
- The before / after planner replay on a copy of `/data` (plan §5) must include Course data from the beta.4 migration.
- The word check also runs `scripts/check-ui.sh` rule 6 against the new `_Avoid_` lists in §10 before the glossary lands.
