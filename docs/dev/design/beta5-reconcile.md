# Beta.5: reconciling the plan with main

Step 1 (design, docs only) for **1.0.0-beta.5**. Branch `team/b5-design`, from main `37de57e`.

[beta5-plan.md](beta5-plan.md) was written against `cd39ff1` (the merge of crs-b). At `cd39ff1` main already had ADRs 0008, 0009 and 0010, migrations 1330 (Storage Places) and 1400 (Courses), the Pantry nav, `PantryLotRow` and `LotSheet`, the Date Attendance sheet and `shopping.derivedLines` with past unconfirmed meals. What landed **after** it (254 commits): crs-c2 (the Course API), crs-d2 (the Courses page and the Courses section of Date Attendance, `DateCoursesSection`), `SlotMenu` (c8ec4cb), tg-a and tg-api (Tags as entities: Settings > Tags, migration 1440), the Courses and Tags rows of the Settings index, and the beta.4.1 photo read. The plan's questions that depended on that gap (past meals on the list, inline Lots, Delete of a gone-off Lot, Settings placement) were re-checked on that basis; see §9.

This document records what main has, where the plan conflicts with it or says nothing, what is safe to build as it stands, and what needs an answer. **Where the plan and main conflict, it was a question, not a decision.** The product owner (PM) has since decided most of them (§9); seven remain for the user (§13). "Qn" in §1 to §8 is the first version's numbering: §9 says what was decided, §13 says which are still open ("was Qn").

Terms in **bold** are [GLOSSARY](../../../GLOSSARY.md) terms. Everything here was read from the tree at `37de57e`.

---

## 0. Summary

| # | Feature | State on main | Verdict |
|---|---|---|---|
| 1 | Per-date slot controls | Date Attendance (Members, Course opt-outs) exists, any User, but only in Settings > Meal Slots. No per-date time, no Not served action. The slot menu is hidden for one-Course slots. | Buildable in part. Buildable (decided in §13). |
| 2 | Guests | Nothing. Portions = Members of the Course Attendance. | Buildable (decided in §13). |
| 3 | Leftovers by hand | `leftovers` rows carry a Course of origin; no place, no hand actions; the 03:00 job discards and counts waste (spec §8). | Buildable (decided in §13). |
| 4 | Plan stability (Bought) | Nothing. ADR 0009 keep check and Slot Rule reservations replan every unpinned Planned Meal. | Buildable (decided in §13). |
| 5 | Shopping List | Past unconfirmed Planned Meals are **already** on the list (`Meals(ctx, "", to)`, `derivedLines`). No Not needed, no hint. | Not needed and the hint are buildable now. |
| 6 | Stock Lots | Pantry lists every Lot by Storage Place; a Lot sheet with Move exists; no edit, no delete, no inline Lots in By Ingredient, no Used from. | Buildable now (decided in §9). |
| 7 | Recipe sort by last cooked | No sort; no last cooked. | Buildable now. |
| 8 | Settings grouped | Index already has Household / You / Admin; Courses, Tags, Shops, Storage Places are rows of Household; Ingredients and Products are still in the avatar menu. | Buildable now (decided in §9). |

Release shape: one release (U7); the snapshot is decided (§9).

### 0.1 Drift in the plan's numbers (fix when the plan's text is lifted into the spec)

| Plan says | Main has | Consequence |
|---|---|---|
| Spec decisions 33 to 39 | Decisions 33 to 36 are taken (Pantry nav, archived Course names, logo and list layout, photo read) | Beta.5 decisions are **37 to 43**. |
| New spec §18 for beta.5 API | §16 (Courses) and §17 (Tags) are the last | §18 is still free. |
| Migrations 1500 to 1530, `feeder-pre-1500.db`, generalise `NeedsPre1400Snapshot` | Highest is 1440 (1420 withdrawn). The snapshot is `backup.PreSnapshotFile = "feeder-pre-1400.db"` and `db.NeedsPre1400Snapshot`, called from `cmd/feeder/startup.go` | Numbers are free. The generalisation touches `internal/db/db.go`, `internal/backup/backup.go`, `cmd/feeder/startup.go` (Q28). |
| ADRs 0011 to 0013 | 0010 is the last | Free. The three drafts are in §5. |
| `Date Attendance sheet opened from Plan and Today (beta.4 already has it)` | The sheet (`DateAttendancePanel`) is rendered only by `features/settings/screens/MealSlotsPage.tsx`. A plain User opens it from a Meal Slot chip; the Admin reaches it from the Meal Slot editor's "change date" button (`MealSlotEditor` `onChangeDate`). Plan and Today do not render it | Opening it from Plan and Today is new (a shared export). The Settings entry stays and gains the Guests row. |
| `Menu ... beta.4 already has Add <Course> and Not cooked: whole slot there` | `SlotMenu.tsx` (reused by `TonightHero` and `MealTile`) renders nothing when `lib/courses.slotMenu` is null. It is null for a slot with fewer than 2 Courses **and** for a multi-Course slot with no whole-slot action and nothing to add (past slots included) | The menu must show whenever a per-date choice applies (decided, §9 Q3). |
| Ingredients, Products, Shops in the avatar menu | Shops already moved to Settings (route `/settings/shops`, row in Household), but `features/shops/index.ts` still registers a `navItems` entry for it | Ingredients, Products and the stale Shops nav item go (Q26). |
| `Not served` is a new term | Spec §7.2 step 0b and the API (`unserved: "optional" \| "no_course_attendance"`, `web/src/features/plan/types.ts`) already use "Not served" for a Course left empty on purpose. It is not in GLOSSARY yet | The glossary entry must cover both, or the two uses need separate names (Q1). |
| `Guests` in the Attendance `_Avoid_` list is dropped | It is there today: `_Avoid_: Guests, headcount`. `scripts/check-ui.sh` rule 6 flags every avoid word (and inflections) in a `strings.ts` | A Guests stepper cannot ship before GLOSSARY drops that word. |
| Spec §8 "Leftovers past their Use-by are discarded automatically and count as waste", §1 "a freezer for Leftovers" out of v1, `internal/plan/runner.DiscardExpired` | As the plan says | The plan's spec changes stand; they also touch `internal/plan/runner/runner.go`, `plan.ExpiredLeftovers`, `cook/zerowaste` and the BDD for waste. |
| Slot time read through one function | Real readers: `internal/plan/runner/snapshot.go` (`instant`, `add`), `plan/runner/courses_c2.go`, `plan/runner/actions.go`, `internal/notify/facts/facts.go` (`slotTime` map), `internal/cook/service/adapters.go` (`ms.time` in `mealSelect`), `internal/shopping/httpapi/wiring.go` (`slot.Time`), `plan/httpapi/{shapes,exclusions}.go`, `today/httpapi` | The guard test the plan proposes (no direct `meal_slots.time` outside `household`) must also cover the `ms.time` SQL join in `cook/service`. It exempts the two ordering-only uses (`ORDER BY ... ms.time` in `internal/tag/store/store.go`, the slot list `SELECT` in `internal/household/store/batch.go`). |

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
4. **Slots with no menu today:** `slotMenu` is null for one-Course slots and for multi-Course slots with nothing to offer (Q3, decided: the menu shows whenever a per-date choice applies).
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
3. **Batches follow portions** is decided for Guests. Main's cause for it is broader: Course Attendance opt-outs, a new Member, a Portion Factor change all change portions today, and an unpinned Planned Meal is dropped and replanned while a Pinned one under-cooks. The plan decides it for every portion change (one code path); §9 Q9 adds a CHANGELOG note.
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
3. **Attribution order vs past unconfirmed meals.** `plans.Meals` ignores From (`st.Meals(ctx, "", to)`), so past, unconfirmed Planned Meals take the first place in `derivedLines`' date order and would absorb a purchase. Decided (§9 Q18, the plan): purchases are attributed to Planned Meals dated today or later; past ones still count on the list. `shopping.Attribute` must give them no share.
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

1. **Courses, Tags, Storage Places** are Household rows on main; the plan puts them under Catalogue. Decided: as the plan (§9 Q25).
2. **The Admin group** dissolves; Allowlist and Recipe Assistant become Admin-only rows of Household (§9 Q25).
3. **Photo work**: no conflict. The photo read (decisions in `photo-read.md`) adds no Settings row; the Recipe Assistant row keeps its path. Stored photos are cleared on sign-out (`forgetStoredPhotos`), unrelated.
4. The Exclusions page is `/plan/couldnt-plan/excluded`, not a Settings page; no row.
5. **Nav tests and guards** to update: `app/nav.test.ts`, `features/*/index.test.ts`, `app/breadcrumbs*`, `pageLayoutRules*` (the layout guard lists routes), `features/settings/lib/settingsSections.test.ts`, `SettingsIndexPage*.test.tsx`.

### 8.3 Proposed design

As plan 2.8 for the mechanics (groups, rows, role table, breadcrumbs "Settings › Ingredients" on `/ingredients` and `/products`, routes unchanged, `MENU_ICONS` entries and the three `navItems` removed). The group and row placement waits on Q25.

---

## 9. Decisions recorded (PM, on the review of 043f89d)

These were questions in the first version of this document. They are decided; old question numbers are kept so earlier sections still read. Where a decision is just "as the plan", the plan already settled it.

| Was | Decision |
|---|---|
| Q1 | **A.** One term, **Not served**, for the slot-wide action and the Course states. The menu label is "Not served" (not a lookalike of Not cooked). Per-Course control stays in Who's eating > Courses (opt-outs); no per-Course flag. |
| Q3 | **A.** The per-date choices show on every slot block in Plan (from today on) and on Today's Tonight hero; not on the board, not for past days. `slotMenu` (`features/plan/lib/courses.ts`) returns null today for a slot with fewer than 2 Courses and for a multi-Course slot with no whole-slot action and nothing to add (past slots included); `SlotMenu` is reused by `TonightHero` and `MealTile`. The menu must show **whenever a per-date choice applies**, so the null rule becomes "no entry applies". |
| Q4 | **A.** Any time; the walk follows the effective time; no check. |
| Q5 | The sheet opened from a slot block has a read-only date; from Settings it stays editable. **Reset to usual Attendance** resets Members, Course opt-outs and Guests, not Not served and not the date's time. The Settings > Meal Slots date entry stays (an Admin reaches it through the Meal Slot editor's "change date", a plain User through a chip) and gains the Guests row, because it is the same sheet. |
| Q9 | Dropped. The plan already decides Batches follow portions for every portion change (it is one code path). Add a CHANGELOG note under Changed: "Planned Meals whose Batches no longer cover their portions are cooked with more Batches (never fewer), for Guests and for any change of Attendance or Portion Factor." |
| Q13 | **A.** Keep **Frozen Use-by** (a Leftover's, per Recipe plus household default) and **Frozen Shelf Life** (an Ingredient's Lots), each with a `_Note_` pointing at the other. |
| Q14 | **A.** Freeze it defaults to the default Storage Place if it is a Freezer, else the first Freezer by name. No new table. |
| Q15 | **A.** The question is a row on Today's Leftovers tile ahead of the Leftovers, with a Pantry badge for frozen ones and a read-only board line ("Chilli, Use-by passed", no actions, no waste). No push. |
| Q16 | Dropped. As the plan: the sheet names the Planned Meals that lose portions, and they are unpinned and replanned. |
| Q18 | **A, which is the plan:** purchases are attributed to Planned Meals dated today or later. The real gap on main is mechanical: `plans.Meals` (`internal/shopping/httpapi/wiring.go`) ignores From (it asks the store for `"", to`) so past unconfirmed meals sit first in date order inside `derivedLines`. `shopping.Attribute` must give meals dated before today no share (they still count on the list, feature 5). |
| Q19 | Dropped. As the plan: the list already keeps past unconfirmed meals (`derivedLines`, `plans.Meals`; both were already in `cd39ff1`); the hint and **Mark it** are new. Keep the regression BDD "A Planned Meal from Tuesday not marked Cooked keeps its Ingredients on the list". |
| Q20 | **A.** Not needed belongs to one range, like ticks. |
| Q21 | **A.** Expand in place in By Ingredient; one `LotSheet` for Edit, Delete and Move. |
| Q22 | (a) **as the plan:** Delete is a correction like the Undo of a Scan; the go-off of a Lot that had gone off goes with it, and the confirm says so. (b) Bought on re-suggests Good until from purchase date plus the Shelf Life of the Lot's Storage Place kind (frozen Shelf Life for a Freezer), never over a Good until changed in the same edit. (c) Storage Place is changed with Move to, not Edit. |
| Q23 | **A.** Used from keeps the default order; each row shows its Storage Place; frozen Lots are listed like any other. |
| Q24 | The Recipes sort is a `?sort=` URL parameter (the other filters live in the URL) and is also remembered on the device. "Last cooked ..." joins the tile's meta line. |
| Q25 | Dropped. As the plan: Catalogue = Ingredients, Products, Shops, Tags, Courses, Storage Places; Household = Household, Members, Meal Slots, Planning rules, Sign-in requests, plus Allowlist and Recipe Assistant for Admins; You = Your preferences, Notifications. The Admin group dissolves. (Tags and Courses rows landed after `cd39ff1`; the plan listed them already.) |
| Q26 | Dropped. As the plan: the avatar menu keeps Kitchen board, Settings and Sign-in requests. |
| Q28 | **A.** Take the snapshot again (`feeder-pre-1500.db`), generalising the helper. The user chose one release (U7 = A); the snapshot stays.. |

---

## 10. GLOSSARY: proposed changes (not applied)

The UI guard (`scripts/check-ui.sh` rule 6) flags an avoid word and its inflections in any `strings.ts`, so the common UI words "off", "skip", "hide", "dismiss", "locked", "cancel(led)", "extra", "close(d)" are not used as avoid words; multi-word phrases are safe. Avoid words are not repeated across terms, and the five Leftover choices are separate terms.

New terms (singular, as the glossary names them):

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
+_Avoid_: Freezer use-by, freezer date
+_Note_: not **Frozen Shelf Life**, which is how long an Ingredient's Stock Lot keeps in a Freezer.

+**Had it**:
+A User's record that portions of a Leftover were had outside the plan; the portions go down and it is not waste.
+_Avoid_: Consumed

+**Threw it out**:
+A User's record that portions of a Leftover were thrown away: waste dated the day of the action, or, when answering the question after the Use-by, the day after the Use-by.
+_Avoid_: Scrapped, dumped
+_Note_: a Stock Lot's equivalent is **Throw out**.

+**Freeze it**:
+Moving a Leftover, or part of it, to a Storage Place of kind freezer; its Use-by becomes today plus its Frozen Use-by.
+_Avoid_: Stash

+**Wasn't there**:
+The answer that removes a Leftover that Feeder thought was left but never was (a mistake, like Delete on a Stock Lot); it is not waste.
+_Avoid_: Phantom leftover

+**Take out**:
+Taking a frozen Leftover out of the Freezer; it is no longer frozen and its Use-by becomes today plus the Recipe's Use-by days.

+**Bought**:
+A fresh Planned Meal that a purchase from the Shopping List was bought for: a Scan or Tick by hand that covered part of its Ingredients. Automatic replans leave it as it is; Regenerate, Swap or choosing a Recipe changes it.
+_Avoid_: Reserved, committed, purchased
+_Note_: not **Pinned**: a Pinned Planned Meal is the User's choice and Regenerate keeps it; a Bought one is only held against automatic changes. Not the "Bought today" / "Bought on" of a Stock Lot's purchase date, which is plain copy for **Stock Lot**.

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
-_Avoid_: Guests, headcount
+_Avoid_: Headcount
+_Note_: **Guests** are counted beside the Attendance, not in it: they add portions but no preferences. In the UI, "Who's eating" is the sheet that edits one date's Attendance, its Course Attendance and its Guests; it is a label, not a second term. "Time today" and "Time on Thu" are labels for one date's time of a **Meal Slot**.

 **Course Attendance**:
-_Avoid_: Course guests, skips, diners
+_Avoid_: skips, diners
+_Note_: (add) "Guests eat every Course the slot serves; they are not part of a Course Attendance." ("Course guests" is dropped from _Avoid_: Guest is now a term and a "Course Guest" would be what the Household decided not to have; "diners" stays.)

 **Allowlist**:
-_Avoid_: Invite list, guest list, whitelist
+_Avoid_: Invite list, whitelist
+(reason: "guest list" would now read as a list of Guests; "Invite list" already covers the avoided sense)

 **Meal Slot**: "...with a usual time, which one date may change, ..."
 **Portion Factor**: "... A Guest's is always 1."
 **Leftover**: add "It may be frozen in a Storage Place of kind freezer; a frozen Leftover is not planned automatically."
 **Use-by**:
-The last date a Leftover may be served; after it the Leftover is discarded and never planned.
+The last date a Leftover may be served; after it the Leftover is not planned, and Feeder asks whether it was had, thrown out or not there.
 **Zero-waste streak**: "(a Stock Lot going off, a Throw out, or a discarded Leftover)" -> "(a Stock Lot going off, a Throw out, or a Leftover thrown out)"
 **Throw out / Keep**: _Note_ (add): "A Leftover's equivalent is Threw it out."
 **Storage Place**: "Where the Household keeps Stock and frozen Leftovers (...)"
 **Stock**: _Note_ (add): frozen Leftovers also appear on the Pantry page; they are not Stock.
 **Stock Lot**: "... with its purchase date and go-off date, both of which a User may correct."
 **Cooked**: "... only then is Stock deducted, from the Lots the User picked (Used from) or else soonest to go off first."
 **Shopping List**: "... for uncooked Planned Meals up to a chosen date (earlier ones not yet marked Cooked included), less Stock, less lines Not needed, plus any extras."
 **Pinned**: _Note_ (add): "A Bought Planned Meal is held the same way by automatic replans, but Regenerate replaces it; it is not Pinned."
 **Frozen Shelf Life**: _Note_ (add): "Not Frozen Use-by, which is a Leftover's."
```

(The Storage Place and Stock updates follow U4 = A.)

---

## 11. ADRs

Drafted as files and **Accepted** with the user's decisions (§13); the decisions are recorded in the ADRs.

| ADR | File | Amends |
|---|---|---|
| 0011 Cooked takes from the Lots the User picks, else soonest to go off first | [0011](../../adr/0011-cooked-takes-from-picked-lots.md) | ADR 0003 |
| 0012 Leftovers stay Leftovers: freezing, hand actions and asking before waste | [0012](../../adr/0012-leftovers-stay-leftovers.md) | spec §1, §6.1, §8 |
| 0013 Bought Planned Meals are held by automatic replans | [0013](../../adr/0013-bought-planned-meals-held.md) | ADR 0008 points 2 and 8, ADR 0009 points 4 and 6, decision 22, spec §7.2 steps 0 and 0b |
| 0014 A Meal Slot on one date: Not served, an emptied date, Guests and Batches following portions | [0014](../../adr/0014-meal-slot-on-one-date.md) | ADR 0008 point 8 |

Back-references: the status lines of ADR 0003, 0008 and 0009 point at the amending ADRs (in the pattern ADR 0008 uses for ADR 0009).

No ADR for Recipes sort, Settings grouping, Not needed or Lot edit (no decision that reverses one).

---

## 12. Proposed work packages and order

Rules from CLAUDE.md apply: one team per feature, own worktree and branch, no two teams on the same file at once, designer / test author, developer, reviewer. `internal/modules/*.go` is the wiring; each team names the file it edits.

| WP | Scope | Owns | Depends on |
|---|---|---|---|
| **D Shared web** | Phosphor glyphs (`snowflake`, `question`, `shopping-cart`, a Guests glyph); expandable `ui/ListRow` (`expanded`, `onToggle`); Gallery rows | `web/src/ui/icons.ts`, `web/src/ui/ListRow*`, `web/src/ui/Gallery*`, `web/src/ui/galleryData.ts`, `web/src/ui/index.ts` | none; **before ST and LOW** |
| **NAV Bottom nav** | User decision: a 7th top-level button, **Settings**, on the right of the bottom bar and the side rail. Seven equal slots, Scan exactly centred, equal inner padding so the highlights at both ends have room. The avatar menu keeps the account items: sign out and Kitchen board | `web/src/app/{nav.ts,nav.test.ts,AppShell*,YourMenu*,accessMenu*,shell.css,shell.css.test.ts,chromeless*}`, `scripts/check-shell-layout.mjs` and the shell guard (`scripts/lib/page-layout-rules.mjs`, `scripts/check-page-layout.modes` if a route changes) | none |
| **MS Settings > Meal Slots redesign** | User decision: option B, one card per Meal Slot, from `docs/dev/design/meal-slots-redesign.md`. "Dates that differ" is kept and read-only. "Usual" is the most common value, ties to the earliest weekday. A plain User sees the cards read-only except for "Change a date" | `web/src/features/settings/screens/MealSlotsPage*`, `settings/components/{MealSlotEditor,MealSlotGrid,MealSlotWeek,SlotCourseLine,SlotCoursesField,AttendeePills,AttendanceEditor}*`, `settings/lib/{weekGrid,weekdays,slotGroups,slotForm,slotAnchor,multiDay,slotCourses}*` plus a new pure `settings/lib/mealSlotCards.ts`, its own CSS file (not `settings.css`), and `settings/strings.ts` for its copy | none; **before G and F1** |
| **G Settings and nav** (F8) | Groups, rows, copy, breadcrumbs. The Settings top-level button (NAV) changes the avatar-menu plan: Ingredients and Products leave the avatar menu for Settings > Catalogue, as the plan says | `web/src/features/settings/lib/settingsSections*`, `settings/strings.ts`, `settings/screens/SettingsIndexPage*`, `web/src/app/{breadcrumbs*,pageWidths.ts}` (+tests) and, after NAV merges, the `MENU_ICONS` entries of `web/src/app/nav.ts`, `web/src/features/{ingredients,products,shops}/index.ts` (+tests), `scripts/lib/page-layout-rules.mjs` if a route changes | **NAV** and **MS** merged (nav.ts, the avatar menu and `settings/strings.ts` are theirs first); **before F1 and LOW** |
| **R Recipes last cooked** (F7) | `LastCooked` in the plan store, list/detail field, `?sort`, sort select, tile meta | `internal/plan/store/lastcooked.go` (new file), `internal/recipe/httpapi/**`, `internal/modules/recipes.go`, `web/src/features/recipes/**` | none; **before LO** (LO adds the Recipe field and `internal/modules/recipes.go`) |
| **SH Shopping Not needed + hint** (F5) | Migration 1530, shopping, hint, Not needed | `internal/db/migrations/1530_*.sql`, `internal/shopping/{shopping.go,store/**,service/**,httpapi/**}`, `internal/modules/shopping.go`, `web/src/features/shop/**` | none. **Mark it** needs an anchor on the plan side (`/plan#to-confirm` handled by Plan); F1 provides it. Until F1 merges, SH ships the hint without the button. |
| **ST Stock Lots: edit, delete, inline** (F6) | `PATCH`/`DELETE` lot, `ValidateEdit`, Pantry expansion, `LotEditSheet` | `internal/stock/**` (all of it, `lot.go` included), `internal/modules/stock.go`, `web/src/features/stock/**` | **D** merged (ListRow) |
| **SD Slot dates + Guests backend** (F1, F2) | Migration 1500, `household/slotdate.go`, Sources port, planner (Guests, Not served, walk by time, Batches follow portions), notify, cook, shopping slot-time read, payloads | `internal/db/migrations/1500_*`, `internal/household/**`, `internal/planner/**`, `internal/plan/{plan.go,types.go,cook.go}`, `internal/plan/runner/**`, `internal/plan/store/**` (other than `lastcooked.go`), `internal/plan/httpapi/**`, `internal/notify/**`, `internal/cook/**`, `internal/today/**`, `internal/shopping/httpapi/wiring.go`, `internal/modules/{household,planning,notify,cook,today}.go` | SH merged (or hand-off of `wiring.go`) |
| **F1 Plan and Today web: slot controls, Guests** | Slot menu (every slot), Not served row, time dialog, Who's eating from Plan/Today, Guests stepper, pill suffix, the `/plan#to-confirm` anchor | `web/src/features/plan/**` **except** the Mark-cooked set below, `web/src/features/today/**`, `web/src/features/board/**`, `web/src/features/cook/**` (time captions), `web/src/features/settings/{components/DateAttendancePanel*,lib/attendanceDate*,lib/dateCourses*,hooks/useAttendance*,api.ts,types.ts,strings.ts,index.ts}` | SD, D, **G** and **MS** merged |
| **BO Bought backend** | Migration 1520, `shopping.Attribute`, `BoughtRecorder`, planner `roleHeld`, runner, Regenerate dry run, structural dry runs list `bought` | `internal/db/migrations/1520_*`, `internal/shopping/**` (after SH), `internal/planner/**`, `internal/plan/**`, `internal/modules/{shopping,planning}.go` | SD and SH merged |
| **BOW Bought web** | Chip, sheet line, Regenerate list, Swap note | `web/src/features/plan/**` (except the Mark-cooked set) | BO, F1 merged |
| **LO Leftovers backend** | Migration 1510 (the columns **and** `leftover_events`), `plan/leftover.go`, runner actions, no auto-waste, answers, zero-waste, API, Recipe and household fields | `internal/db/migrations/1510_*`, `internal/plan/{leftover.go,runner/**,store/**,httpapi/**}`, `internal/cook/zerowaste.go` and related, `internal/recipe/**` (field), `internal/household/settings*`, `internal/modules/{planning,recipes,household}.go` | BO merged, **R merged** |
| **UF-stock** | `stock.DeductPicked`, stock service picks in `DeductCookedTx`, preview Lots per need | `internal/stock/{lot.go,service/**}` and tests | **ST merged** |
| **UF-runner/httpapi** | `usedFrom` through `plan/runner/{stockport.go,actions.go}` and the cooked routes, preview `lots` | `internal/plan/runner/{stockport.go,actions.go}`, `internal/plan/httpapi/**`, `internal/cook/**` | UF-stock and **LO** merged |
| **UF-web** | `UsedFromSection` in both Mark sheets | the Mark-cooked set: `web/src/features/plan/components/{MarkCookedSheet,MarkAllCookedSheet,CookFlowSheets,AllCookedSheets}*`, `hooks/{useMarkCooked,useMarkAllCooked,useCookFlow,useAllCookedFlow}*`, `lib/{cook,usedFrom}.ts`, new `usedFromStrings.ts` and `api.usedFrom.ts` in `features/plan/` | **UF-runner/httpapi** merged |
| **LOW Leftovers web** | `lib/leftovers`, `ui/LeftoverActions`, Today tile, Planned Meal sheet link, "From the freezer", Pantry frozen rows, Recipe editor and Household fields | `web/src/lib/leftovers/**`, `web/src/ui/LeftoverActions/**`, `web/src/ui/index.ts`, `web/src/features/plan/**` (except the Mark-cooked set), `web/src/features/stock/**`, `web/src/features/recipes/**` (editor field), `web/src/features/settings/{components/HouseholdSettingsForm*,strings.ts}` | LO, **BOW**, D, G, ST, F1, R merged |
| **SNAP Snapshot** | Generalise `NeedsPre1400Snapshot` to a named snapshot, `feeder-pre-1500.db` | `internal/db/db.go`, `internal/backup/backup.go`, `cmd/feeder/startup.go`, and its **own** new test file under `scripts/test/` (not the shared release test) | none |
| **W0 Doc** | Spec (decisions 37 to 43, §18, per-feature edits), GLOSSARY (§10), ADRs 0011 to 0014 to Accepted, status-line back-references | `docs/spec/functional-spec.md`, `GLOSSARY.md`, `docs/adr/001[1-4]-*`, `docs/adr/0003-*`, `0008-*`, `0009-*` | none (the answers are recorded in §13) |
| **H Release** | CHANGELOG (including the Batches note, §9 Q9), upgrade note, deploy guide, word check | `CHANGELOG.md`, `docs/dev/deploy.md`, `GLOSSARY.md` | last |

**Mark-cooked carve-out.** F1, BOW and LOW own `web/src/features/plan/**` except `components/{MarkCookedSheet,MarkAllCookedSheet,CookFlowSheets,AllCookedSheets}*`, `hooks/{useMarkCooked,useMarkAllCooked,useCookFlow,useAllCookedFlow}*` and `lib/cook.ts`, which belong to UF-web. `plan/strings.ts`, `types.ts`, `api.ts` and `plan.css` are shared by F1, BOW and LOW and so stay strictly in that order; UF-web adds its own strings and API calls in new files.

**Shared hot spots** that force the order: planner and runner: SD, BO, LO, then UF-runner; plan web: F1, BOW, LOW (UF-web beside them on its own files); shopping: SH, then BO; stock: D, ST, then UF-stock, then LOW; recipes: R, then LO (backend) and LOW (editor field); settings strings: G, then F1, then LOW; `ui/index.ts`: D, then LOW.

### 12.1 Waves

| Wave | Parallel teams (each after what it depends on) |
|---|---|
| **0** | SNAP, D, NAV, MS, R, SH |
| **1** | G (after NAV and MS), ST (after D) |
| **2** | SD (after SH), UF-stock (after ST) |
| **3** | F1 web (after SD, D, G, MS), BO (after SD, SH) |
| **4** | BOW, LO (after BO and R) |
| **5** | UF-runner/httpapi (after LO), LOW (after BOW, LO, F1, ST, G, R) |
| **6** | UF-web (after UF-runner) |
| **7** | W0 (spec, GLOSSARY, ADR status), H release, QA |

Critical path: SD, BO, LO, UF-runner, UF-web, H (LOW runs beside UF-runner and UF-web). W0 can start at once: no answer is open.

**No file has two owners at once.** `web/src/app/nav.ts` and the avatar menu: NAV, then G. `web/src/features/settings/strings.ts`: MS, then G, then F1, then LOW. The Meal Slots components and DateAttendancePanel: MS, then F1 (F1 adds Guests to the sheet and the Settings date entry). `ui/index.ts`: D, then LOW.

### 12.2 What can start today

Wave 0 and, behind it, G and ST: no open question. If the coordinator ever cuts to a second release (U7), the planner packages (SD, F1, BO, BOW, LO, LOW, UF-*) move to it, after telling the coordinator.

### 12.3 Tests and QA additions caused by main

- BDD feature directories already exist under `bdd/features/` (`planning`, `stock`, `shopping-scan`, `courses`, `tags`, ...); the plan's `bdd/features/beta5/` is acceptable but step files follow the `steps_*_test.go` pattern in `bdd/`.
- Planner golden tests: every replan reason with a Bought cell; Guests with Course opt-outs; Not served with a Whole meal in the main Course; Batches follow portions for a Course opt-out change.
- The before / after planner replay on a copy of `/data` (plan §5) must include the Course data from the beta.4 migration.
- The slot-time guard test (§0.1) exempts the two ordering uses of `ms.time` in `internal/tag/store/store.go` and `internal/household/store/batch.go`, which read the usual time on purpose.
- The word check runs `scripts/check-ui.sh` rule 6 against the new `_Avoid_` lists in §10 before the glossary lands.

---

## 13. Decisions by the user

The user answered the seven questions of the first review, taking the recommended option each time. They are decided; the ADRs and the spec follow them.

- **U1. An emptied day (was Q2): A.** Saving Who's eating for a date with no Member and no Guest makes that slot **Not served** for the date (no warning, with "Plan Dinner again" to bring it back). A slot whose usual Attendance is empty stays Couldn't plan. A date with Guests and no Members is served.
- **U2. Not served on a partly cooked meal (was Q6): A.** Not served is offered only while no Course of the slot is Cooked or Not cooked; afterwards the User uses Not cooked for the rest.
- **U3. Guests and dishes no Member eats (was Q7 and Q8): A.** Guests eat every Course the slot serves, including one every Member opts out of, and a date with Guests and no Members is planned (no preferences apply). With no Member and no Guest, the warning stays.
- **U4. Frozen Leftovers on the Pantry page (was Q10 and Q11): A.** Frozen Leftovers show in their Freezer on the Pantry page, with a Leftovers filter and not in By Ingredient. A taken-out Leftover leaves the Pantry and is a normal Leftover on Today and the Plan with a short Use-by. If its Freezer is deleted it shows under "Not sorted".
- **U5. When a frozen Leftover leaves the Freezer (was Q12): A.** Cooked takes the portions the meal uses; the rest stays frozen with its date; Take out is not required first.
- **U6. Bought side beside a Whole meal (was Q17): A.** A Bought Planned Meal is kept like a Pinned one; Feeder does not pick a Whole meal beside it, and the User can still swap it.
- **U7. One release or two (was Q27): A.** One release, beta.5, built in waves with one round of testing at the end. Cut to beta.6 only after telling the coordinator.
