# Beta.5: plan, data model and teams

Planning document for **1.0.0-beta.5**. It builds on beta.4 (Courses, Tags as entities, the Exclusions page, the Preferences table, Pantry in the primary nav) as specified in [functional-spec](../../spec/functional-spec.md) §3.1, §4.1, §7.4.1, §16 and §17, and does not plan beta.4 again. Terms in **bold** are [GLOSSARY](../../../GLOSSARY.md) terms; new terms are listed per feature and collected in §2.9.

Code facts this plan relies on were checked on `main` at `cd39ff1`:

| Fact | Where |
|---|---|
| Deduction order: Lots with a go-off date first (soonest), then undated; ties oldest purchase, then lowest id | `internal/stock/lot.go`, `consumptionLess`, `Deduct` |
| Moving a Lot (part splits it); Freezer changes the go-off date | `internal/stock/store/storage.go`, `MoveLot`; `internal/stock/storage.go`, `GoOffAfterMove` |
| Deleting a Lot exists only as the Undo of a Scan | `internal/stock/service/service.go`, `RemoveLot` |
| A Leftover is its own row (`leftovers`: Recipe, portions, Use-by, `available`/`discarded`); it is not a Stock Lot | `0600_planning.sql`, 1400 |
| The 03:00 job throws away Leftovers past their Use-by and records waste | `internal/plan/runner/runner.go`, `DiscardExpired` |
| Replan triggers map events to reasons | `internal/plan/plan.go`, `ReasonForEvent` |
| Unpinned Planned Meals are dropped on read when Batches no longer cover the cell, on a rule change (`clearAll`), by the keep check, or when no longer valid | `runner/snapshot.go` `invalidOnRead`; `planner/state.go` `classify`, `validPlannedFresh`, `keepCheck` |
| Shopping List Need: every fresh Planned Meal not yet Cooked or Not cooked up to To, past ones still to confirm included; Stock drawn per Planned Meal in date order | `internal/shopping/shopping.go`, `derivedLines` |
| Ticks are per Ingredient and list range (`shopping_ticks`, `range_to`), not per Planned Meal | `0800_shopping_scan.sql` |
| Date Attendance is already open to every User | `internal/household/httpapi/httpapi.go` |
| Settings index groups Household, You, Admin; Ingredients, Products, Shops sit in the avatar menu | `features/settings/lib/settingsSections.ts`, `features/{ingredients,products,shops}/index.ts` |
| Migrations apply in name order, each file once | `internal/db/db.go` |

---

## 1. Goals and scope

**Goal.** Make the plan match what the Household actually does on a given date, keep it from changing under the Household once it has shopped, and make Leftovers and Stock Lots correctable by hand.

**In beta.5**

| # | Feature | Kind |
|---|---|---|
| 1 | Per-date slot controls from the slot menu: **Not served**, **Who's eating**, **Time today** | planner, API, Plan, Today |
| 2 | **Guests** for a date (count only, one standard portion each) | planner, API, Who's eating |
| 3 | Leftovers by hand: **Had it**, **Threw it out**, **Freeze it**, and asking before waste | data, planner, streak, Today, Pantry |
| 4 | Plan stability: **Bought** Planned Meals are left alone by automatic replans | data, shopping, planner |
| 5 | Shopping List: **Not needed** on a line; past unconfirmed Planned Meals keep their Ingredients | shopping, Shop |
| 6 | Stock Lots: per-Ingredient Lot list, Lot edit and Delete, **Used from** at Mark as Cooked | stock, Pantry, Cooked sheet |
| 7 | Recipes: sort by last cooked; "Last cooked" on rows and tiles | recipes |
| 8 | Settings grouped: Catalogue, Household, You | settings, nav |

**Out of beta.5**

- Everything beta.4 plans.
- The five review points in §3.1 (Candidates, not decided).
- Per-Course Guest counts, named Guests, Guest preferences.
- A defrost reminder for frozen Leftovers (decided: frozen Leftovers are used only when picked, §2.3).
- Throw out on a Lot that has not gone off (see §2.6 edge cases).
- Any change to the Recipe File or the Recipe Assistant schema: the new Recipe field `frozenUseByDays` is not exported in beta.5 (decided: no Recipe File change).

---

## 2. Features

### 2.1 Per-date slot controls

**Behaviour**

The slot block's menu (Plan and Today; beta.4 already has **Add <Course>** and **Not cooked: whole slot** there) gains three choices for that Meal Slot on that date. Any User may use them. Settings > Meal Slots keeps the weekly set-up (Admin) and shows nothing of these.

| Menu choice | Opens | Result |
|---|---|---|
| **Who's eating** | The Date Attendance sheet (beta.4: Member pills, a **Courses** section when the slot serves several Courses) plus **Guests** (§2.2) | Saves that date's Attendance, Course opt-outs and Guests; replans |
| **Not served** | A confirm when something is planned there; else applies at once | The slot is left out of the plan on that date |
| **Time today** (today) / **Time on Thu** (another date) | A dialog with the shared `TimeField` | That date's time; reminders, Start cooking and Cook Mode follow it |

*Not served*

- Confirm title: "Not serving Thu Dinner?" Body: "Thu Dinner is left out of the plan, the Shopping List and reminders." When there are Planned Meals: "These go: Roast chicken (Pinned), Green beans." A **Bought** Planned Meal adds what was bought: "Green beans (Bought: green beans). What you bought stays in Stock." Actions: **Not served** (primary), **Cancel**.
- Toast after: "Thu Dinner is not served. **Undo**". Undo marks it served again and replans; the removed Planned Meals are planned afresh (not restored).
- The slot block then shows one compact row: "Dinner · Not served" with **Plan Dinner again**. No Course rows, no why chips, no Couldn't plan chip. The kitchen board shows "Dinner · Not served" for tonight and tomorrow.
- Cooked and Not cooked Planned Meals of that slot and date stay as history and still show; **Not served** is offered only while at least one Course of the slot is unresolved, and only from today on.
- **An emptied date is Not served.** When **Who's eating** is saved with no Member and no Guest, the date is saved as Not served (same confirm when something is planned there, same toast). A Meal Slot whose *usual* Attendance is empty stays **Couldn't plan** (Nobody attends): that is set-up, not a date choice.

*Time today*

- Dialog title: "Time for Thu Dinner". Field caption "Time"; helper "Usually 19:30". Actions: **Save**, **Back to 19:30** (shown only when the date has its own time), **Cancel**.
- The slot block then shows "20:15 · usually 19:30". The board and Today's hero ("start 19:55") use the date's time.
- Everything that reads a slot time reads the **date's time** when set: the planner's walk order and Advance Step lead-time check, Start cooking, Advance Step due, Confirm Cooked (2 h after), To confirm, the cooking timeline's end, the board, Today's "Tonight".

**Spec changes**

| § | Change |
|---|---|
| §3 | New paragraph **A Meal Slot on one date**: Not served, its own time, Who's eating (Attendance, Course opt-outs, Guests); every User; from today on. Portions needed gains "+ Guests" (§2.2). |
| §3.1 | Course Attendance on a date includes Guests (§2.2). |
| §7.1 | Triggers gain "a date marked Not served or served again, a date's time changed, Guests changed". |
| §7.2 | Step 0b gains a first bullet: **the date is Not served** (marked, or its date Attendance has no Member and no Guest): every cell of the slot on that date is left empty, `unserved: "not_served"`, and its unresolved Planned Meals are removed (Pinned and Bought included, after the confirm). Slots are walked in order of the date's time. |
| §7.4 | "Nobody attends" applies to the usual Attendance only; a date emptied by hand is Not served. |
| §7.5 | Slot menu gains the three choices; Not served row; time caption. |
| §11, §12 | Slot time = the date's time when set. Reminder keys already end in `@<RFC 3339>`, so a new time gives a new key (one more reminder at the new time is intended). |
| §15 | Decision 33. |
| §18 (new) | API for beta.5 (this section's API rows). |

**GLOSSARY**

- **Not served** (new): "A Meal Slot on one date, or one Course of it, that the plan leaves empty on purpose: the Household marked the date Not served, nobody eats at it that date (no Member and no Guest), nobody eats that Course, or it is an optional Course that nothing fits. It is not Couldn't plan and it is not Not cooked, which is said after the date." _Avoid_: Skipped, cancelled, off.
- **Meal Slot** (update): "…with a usual time, which one date may change…".

**Data model** (migration **1500**, `1500_slot_dates.sql`)

```sql
CREATE TABLE meal_slot_dates (
  slot_id    INTEGER NOT NULL REFERENCES meal_slots(id) ON DELETE CASCADE,
  date       TEXT    NOT NULL,                                   -- household date
  not_served INTEGER NOT NULL DEFAULT 0 CHECK (not_served IN (0,1)),
  time       TEXT CHECK (time IS NULL OR time GLOB '[0-2][0-9]:[0-5][0-9]'),
  guests     INTEGER NOT NULL DEFAULT 0 CHECK (guests BETWEEN 0 AND 20),
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (slot_id, date)
);
```

- The repository deletes a row that is back to all defaults. Rows before today are kept (history shows the time it was served at).
- Pure rules in `internal/household/slotdate.go` (new): `EffectiveTime(usual, date)`, `IsNotServed(row, dateAttendance)`, `PortionsNeeded(attendance, guests)`. The plan, notify, cook and today packages call them; nothing else computes an effective time.

**API**

| Route | Body / answer | Errors |
|---|---|---|
| `GET /api/meal-slots/{id}/dates/{date}` | `{ "date", "notServed", "time": "20:15" \| null, "usualTime", "guests" }` | `404` |
| `PATCH /api/meal-slots/{id}/dates/{date}` | `{ "notServed"?, "time"?: "HH:MM" \| null }`; `?dryRun=1` with `notServed: true` answers `{ "removes": { "plannedMeals": [{ "courseId", "courseName", "recipeName", "pinned", "bought": [ingredientName] }] } }` and writes nothing | `422 validation_failed`: `reason: date_past`, `time_invalid`, `slot_resolved` (every Course resolved) |
| `GET /api/plan`, Today, board | Slot gains `time` (effective), `usualTime`, `notServed`, `guests`; Course `unserved` may be `"not_served"` | |

Every User; CSRF as today; publishes `household {"changed":"slotDates"}`, which `ReasonForEvent` maps to a new `ReasonSlotDateChanged`.

**UI**

- `web/src/features/plan`: the slot menu (shared `Menu`) gains the three choices; `NotServedRow` (a `Tile` row); `SlotTimeDialog` (`Dialog` + `TimeField`); the confirm uses `useConfirm`. Logic in `hooks/useSlotDate.ts` and `lib/slotDate.ts` (copy, which choices show, the confirm list from `dryRun`).
- Who's eating is the beta.4 Date Attendance sheet (`features/settings/components/DateAttendancePanel`), opened from Plan and Today, with the Guests stepper added (§2.2).
- Offline: the three choices show as unavailable with "Needs a connection".

**Edge cases**

- A date with Cooked Courses: Not served removes only unresolved ones; the Cooked ones stay with their Leftovers.
- A Leftover planned from a fresh Planned Meal that Not served removes: the Planned Meals served from it are replanned (as for Not cooked, §8).
- Time moved later on today after Start cooking went out: one more Start cooking at the new start. Time moved earlier than now: reminders already in the past are not sent; Confirm Cooked counts 2 h from the new time.
- Time change makes an unpinned Planned Meal's Advance Step too late: replanned as today. A Pinned or Bought one stays and its Advance Step shows its existing warning.
- Two Users edit the same date: last write wins per field (`PATCH` is presence-aware).
- Removing a Meal Slot: its date rows cascade.

**Tests**

- Unit: `slotdate_test.go` (effective time, emptied date is Not served, usual empty is not); planner `notserved_test.go` (cells empty, `unserved: not_served`, no reason, Pinned removed only through the repository path, walk order by date time); notify (Start cooking, Advance Step, Confirm Cooked at the date time); cook timeline end at date time; `lib/slotDate.test.ts` (choices per state, confirm copy).
- BDD (`bdd/features/beta5/slot-dates.feature`):
  - Marking Thursday dinner Not served empties it without a Couldn't plan warning
  - Not served lists Pinned and Bought Planned Meals before removing them
  - Undo after Not served plans the slot again
  - Saving Who's eating with nobody marks the date Not served
  - A slot with no usual attendees is still Couldn't plan
  - Time today moves the Start cooking reminder and the cooking timeline
  - Back to the usual time removes the date's time
  - A User who is not an Admin can use every slot menu choice
  - Not served is not offered when every Course is resolved

---

### 2.2 Guests

**Behaviour**

- The Who's eating sheet gains a row after the Member pills: caption "Guests", the shared `StepperField` (0 to 20, step 1), helper "Each Guest eats one standard portion of every Course."
- Each Guest counts as one standard portion (Portion Factor 1). Guests have no name and no Favourites, Dislikes or Exclusions.
- Guests eat **every Course** the slot serves on that date (required and optional), including a Course every Member opts out of: such a Course is then served, for the Guests. Decided: there are no per-Course Guests.
- Guests count in portions, Batches, Leftover maths and so the Shopping List. Course Attendance stays the Members; portions needed for a Course = Σ Portion Factors of its Course Attendance + Guests.
- A date with Guests and no Member is served (planned with no preferences).
- Where shown: the slot block's Attendance pills end with "+2 Guests"; the Planned Meal sheet's attendees line "Anna, Sam + 2 Guests"; portions include them ("6 portions").
- **Reset to usual** on the sheet sets Guests to 0 too.

**Batches follow portions** (needed for Guests to mean anything): an unresolved fresh Planned Meal (unpinned, Pinned or Bought) whose Batches no longer cover its cell's portions keeps its Recipe and gets Batches = ceil(portions ÷ Yield). Today an unpinned one is dropped and replanned, and a Pinned one under-cooks. Fewer portions do not lower Batches (the extra becomes Leftover, as today). Decided: more Guests raise the Batches.

**Spec changes**: §3 (portions formula; Guests on a date), §3.1 (Course served for Guests), §7.2 step 4 and the keep rules (Batches follow portions), §7.5 ("+2 Guests"), §8 (proposed Leftover uses portions with Guests), decision 33.

**GLOSSARY**

- **Guest** (new): "Someone who is not a Member and eats at one Meal Slot on one date, counted only as a number. Each Guest is one standard portion of every Course the slot serves that date, with no name and no preferences." _Avoid_: Visitor, plus-one, extra.
- **Attendance** (update): _Avoid_ becomes "Headcount"; add _Note_: "Guests are counted beside the Attendance, not in it: they add portions but no preferences."
- **Portion Factor** (update): "…A Guest's is always 1."

**Data model**: `meal_slot_dates.guests` (1500). Planner `Slot` gains `Guests int`; `PortionsNeeded` takes it.

**API**: `GET /api/meal-slots/{id}/attendance?date=` gains `"guests"`; `PUT` takes `"guests"` (stored in `meal_slot_dates` in the same transaction); `DELETE` (Reset to usual Attendance) sets it to 0. `422 validation_failed`, `reason: guests_invalid`. Plan `mealOut.portions` includes Guests; slots carry `guests`.

**UI**: Guests row in `DateAttendancePanel` (shared `StepperField`), pill suffix in the slot block (`MemberPill` list + text), sheet line. Logic in `features/settings/lib/dateAttendance.ts` (portions preview "6 portions of each Course").

**Edge cases**

- Guests on a Not served date: Not served wins; Guests are kept and apply again if the date is served again.
- Guests added to a Pinned Planned Meal served from a Leftover that no longer covers: it is unpinned and replanned, as when a Cooked Leftover shrinks (§8 rule 3).
- Guests with an optional Course: still optional (planned only within the rules).
- A Member who is also a "guest" for one date is just added as a Member.

**Tests**

- Unit: `PortionsNeeded` with Guests; planner: Batches with Guests, Course served for Guests only, Batches follow portions (unpinned, Pinned, Bought), no Batch decrease; `dateAttendance.test.ts` preview.
- BDD (`slot-dates.feature`):
  - Two Guests add two portions to every Course of Saturday lunch
  - Guests raise the Batches of a Pinned Planned Meal and the Shopping List
  - A Course every Member opts out of is planned for Guests
  - Guests have no Exclusions
  - Reset to usual clears the Guests

---

### 2.3 Leftovers by hand

**Model decision: a Leftover stays a Leftover; it gains a Storage Place and a frozen Use-by.** A Leftover is not turned into a Stock Lot (new ADR 0012). Reasons:

- The planner plans Leftovers (Leftover first, Course fit, one Recipe per slot, Reheat, Use-by); Stock Lots are Ingredients deducted by Cooked Batches. A frozen chilli as a Stock Lot would need a Recipe-to-Ingredient link, portions as a Base Unit and a second path into the plan.
- A Leftover already has what freezing needs: portions and a Use-by. Freezing changes its Use-by and where it is, exactly as a Lot's move changes its go-off date.
- The Pantry can still show frozen Leftovers beside Lots by reading both.

Shelf life for a frozen Leftover is per Recipe: **Frozen Use-by** days (optional, 1 to 365), else the Household's default (new household setting, default 90 days, Admin).

**Behaviour**

Actions on a Leftover, from Today's **Leftovers** tile (each row gets a row menu), the Planned Meal sheet of a Planned Meal served from it ("From Mon's Chilli" opens it), and the Pantry (frozen ones):

| Action | Sheet / copy | Result |
|---|---|---|
| **Had it** | "How many portions of Chilli did you have?" `StepperField` (0.5 steps, 0.5 to what is left, default 1). Button **Had it** | Portions go down. Not waste. Toast "Noted: 2 portions of Chilli. 1 left." |
| **Threw it out** | "Throw out Chilli?" Portions stepper (default all). "This counts as waste: the zero-waste streak starts again today." Buttons **Threw it out** (danger), **Cancel** | Portions go down; a waste record dated today |
| **Freeze it** | "Freeze Chilli" with Storage Place (shared `Select`, Freezers only, default the Freezer last used for a Leftover, else the first by name), portions (default: what no Planned Meal is planned to use), note "Use by 9 Feb in the freezer (90 days)". Button **Freeze it** | The Leftover (or the part, split off) moves to that Freezer; Use-by = today + Frozen Use-by |
| **Take out** (frozen only) | "Take Chilli out of the freezer?" Storage Place (shared `Select`, non-freezer places and "Not sorted"), note "Use by Sat once out (3 days)". Button **Take out** | Not frozen any more; Use-by = today + the Recipe's Use-by days |

- Freeze it is offered only before the Use-by has passed. With no Freezer Storage Place: "Add a Freezer first" with **Storage Places** (any User).
- **Planned Meals served from it.** When Had it, Threw it out or Freeze it leaves fewer portions than the Planned Meals served from that Leftover need, the sheet names them before confirming ("Thu Lunch was going to have 2 portions of it; it is planned again.") and they are unpinned and replanned, as in §8 rule 3.
- **Frozen Leftovers are not planned automatically** (decided): they are used only when picked. They show in Choose a Recipe under "From the freezer" ("Chilli · 3 portions · Garage Freezer"); choosing one pins it as a Leftover Planned Meal; its row says "From the freezer: take it out the day before".
- **Ask before waste.** The 03:00 job no longer throws Leftovers away. A Leftover past its Use-by (frozen or not) with portions left is **to answer**: the planner ignores it, and it heads Today's Leftovers tile in the info tone: "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?" (decided copy) with **Had it**, **Threw it out**, **Wasn't there**.
  - **Had it**: every portion left was had; not waste.
  - **Threw it out**: waste, dated the day after the Use-by (like a Lot's go-off, §6.1 event 1). The streak is recomputed and may drop back to that day.
  - **Wasn't there**: the Leftover is removed; not waste (a mistake, like Delete on a Lot).
  - Until answered it does not count as waste and the streak is not reset by it. It stays until answered (decided: an unanswered Leftover keeps asking).
- Leftover Use-by push (10:00 on the Use-by) is unchanged.

**Pantry**: Leftovers that have a Storage Place are listed in that place's group, after its Lots, in the leftover tone: "Chilli · 3 portions · Use by 9 Feb". A filter chip **Leftovers** shows only them. Tapping one opens the same Leftover sheet. Leftovers with no Storage Place stay on Today only.

**Spec changes**

| § | Change |
|---|---|
| §1 | Remove "a freezer for Leftovers" from *Out of v1*. |
| §3 | Household setting **Frozen Use-by** (default 90 days, 1–365, Admin). |
| §4 | Recipe field **Frozen Use-by** (optional days, 1–365), after Use-by in the editor. |
| §6 | Storage Places hold Leftovers too; the Pantry lists them; `Leftovers` filter. |
| §6.1 | Waste event 3 for Leftovers becomes: a Leftover **thrown out** by hand counts on the day of the Throw; one answered **Threw it out** after its Use-by counts on the day after its Use-by; an unanswered one counts nothing. Had it and Wasn't there are not waste. |
| §8 | New subsection **Leftovers by hand** (the table above); the sentence on Leftovers past their Use-by is replaced by *ask before waste*. |
| §7.2 | Leftover first passes over frozen Leftovers and Leftovers to answer. |
| §15 | Decision 34. |

**GLOSSARY**

- **Frozen Use-by** (new): "The number of days a Leftover keeps in a Storage Place of kind freezer, set per Recipe or by the Household's default; freezing a Leftover sets its Use-by to that many days from that day." _Avoid_: Freezer life, frozen expiry.
- **Had it / Threw it out / Freeze it** (new): "The three choices a User makes on a Leftover by hand: Had it records portions had outside the plan (not waste), Threw it out records waste on purpose, Freeze it moves it to a Freezer with its Frozen Use-by." _Avoid_: Consume, discard, bin.
- **Leftover** (update): "…It may be in a Storage Place; a frozen Leftover is not planned automatically."
- **Use-by** (update): "The last date a Leftover may be served; after it the Leftover is not planned, and Feeder asks whether it was had, thrown out or not there."
- **Zero-waste streak** (update): "(a Stock Lot going off, a Throw out, or a Leftover thrown out)".
- **Storage Place** (update): "Where the Household keeps Stock and frozen Leftovers…".

**Data model** (migration **1510**, `1510_leftovers_by_hand.sql`; plain `ALTER`, no rebuild)

```sql
ALTER TABLE leftovers ADD COLUMN storage_place_id INTEGER REFERENCES storage_places(id) ON DELETE SET NULL;
ALTER TABLE leftovers ADD COLUMN frozen_on TEXT;            -- household date it went into a Freezer; NULL = not frozen
ALTER TABLE recipes ADD COLUMN frozen_use_by_days INTEGER
  CHECK (frozen_use_by_days IS NULL OR frozen_use_by_days BETWEEN 1 AND 365);
ALTER TABLE household_settings ADD COLUMN frozen_use_by_days INTEGER NOT NULL DEFAULT 90
  CHECK (frozen_use_by_days BETWEEN 1 AND 365);
CREATE TABLE leftover_events (                              -- history of hand actions; no FK, the Leftover may be gone
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  leftover_id      INTEGER NOT NULL,
  recipe_id        INTEGER NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('had_it','threw_out','froze','took_out','wasnt_there')),
  portions         REAL NOT NULL CHECK (portions >= 0),
  on_date          TEXT NOT NULL,
  storage_place_id INTEGER,
  user_id          INTEGER,
  created_at       TEXT NOT NULL
);
CREATE INDEX leftover_events_leftover ON leftover_events (leftover_id);
```

- "Frozen" is `frozen_on IS NOT NULL`, not the place's kind: deleting or re-kinding a Storage Place changes nothing about a frozen Leftover (as for Lots).
- Wasn't there deletes the `leftovers` row (`planned_meals.from_leftover_id` is `ON DELETE SET NULL`), with a `wasnt_there` event.
- Waste goes through the existing `stock_waste` row with `reason = 'leftover_discarded'`; only `wasted_on` differs (today, or Use-by + 1 for an answer). No `CHECK` change.
- Pure rules in `internal/plan/leftover.go` (new): `FreezeUseBy`, `TakeOutUseBy`, `IsToAnswer`, `ThrownOutOn(answer, useBy, today)`, `SplitForFreeze`, `PlannedClaims` (portions Planned Meals need from it).

**API** (all User, CSRF; publish `plan {"changed":"leftovers"}` → `ReasonLeftoversChanged`, plus `stock {"changed":"waste"}` for waste)

| Route | Body | Answer | Errors |
|---|---|---|---|
| `GET /api/plan/leftovers` | | Each Leftover gains `storagePlaceId`, `storagePlaceName`, `frozen`, `frozenOn`, `toAnswer`, `plannedPortions` | |
| `POST /api/plan/leftovers/{id}/had-it` | `{ "portions" }` | the Leftover, `replanned: [plannedMealRef]` | `404`, `422 portions_invalid` |
| `POST /api/plan/leftovers/{id}/threw-out` | `{ "portions" }` | as above | as above |
| `POST /api/plan/leftovers/{id}/freeze` | `{ "storagePlaceId", "portions"? }` | `{ "frozen": leftover, "left": leftover \| null, "replanned" }` | `409 leftover_past_use_by`, `409 leftover_frozen`, `422 storage_place_not_freezer` |
| `POST /api/plan/leftovers/{id}/take-out` | `{ "storagePlaceId": id \| null }` | the Leftover | `409 leftover_not_frozen`, `422 storage_place_freezer` |
| `POST /api/plan/leftovers/{id}/answer` | `{ "answer": "had_it" \| "threw_out" \| "wasnt_there" }` | `204` | `409 leftover_not_to_answer` |
| `GET/PUT /api/household/settings` | gains `frozenUseByDays` | | `422` (1–365) |
| Recipes | `frozenUseByDays` (null) on read and write | | `422 validation_failed`, `reason: frozen_use_by_invalid` |
| `GET /api/stock/lots` (Pantry) | unchanged; the Pantry also reads `GET /api/plan/leftovers` | | |

**UI**

- Shared: `web/src/lib/leftovers/` (types, API client, `useLeftoverActions`, pure copy and default portions) and `web/src/ui/LeftoverActions/` (`LeftoverRow` with its row `Menu`, `LeftoverSheet` built on `BottomSheet` + `StepperField` + `Select`, `LeftoverQuestion` row). Today, Plan and Pantry compose them; no screen copies their markup.
- Today: `LeftoversTile` lists questions first, then Leftovers. Plan: Planned Meal sheet link "From Mon's Chilli". Pantry: rows in Storage Place groups, `Leftovers` filter chip. Recipe editor: **Frozen Use-by** compact number field after Use-by. Settings > Household: **Frozen Use-by** field (Admin).
- New Phosphor glyphs in `ui/icons.ts`: `snowflake` (frozen), `question` (to answer).

**Edge cases**

- Had it more than is left: refused (`portions_invalid`); the stepper caps it.
- Freeze part of a Leftover: split; the part left keeps its Use-by and claims; ids are new for the frozen part (`leftovers` has a plain `INTEGER PRIMARY KEY`; a removed id may be handed out again, which is harmless as no client caches Leftover ids across sessions; the designer confirms).
- Take out after the frozen Use-by passed: allowed, then it is to answer at once.
- A Leftover to answer that a Pinned Planned Meal is served from: the Planned Meal stays Pinned (the User chose it); its Reheat still consumes portions; answering Wasn't there unpins and replans it.
- Upgrade: Leftovers that went past their Use-by since the last 03:00 job are to answer, not waste.
- The streak can go up after an answer of Wasn't there or Had it (nothing was counted yet), and down after Threw it out (dated back).

**Tests**

- Unit: `leftover_test.go` (freeze and take-out Use-by, to answer, thrown-out date, split, claims); runner: no auto-waste at 03:00, answer paths, replans after Had it below claims; `cook/zerowaste` (answered Threw it out dated Use-by + 1, unanswered not counted, Had it and Wasn't there not counted); `lib/leftovers` copy and defaults.
- BDD (`bdd/features/beta5/leftovers.feature`):
  - Had it takes two portions off a Leftover without counting waste
  - Threw it out counts waste today and starts the streak again
  - Freeze it moves a Leftover to the Garage Freezer with a 90-day Use-by
  - Freezing part of a Leftover keeps the portions Thursday's lunch needs
  - A frozen Leftover is not planned automatically
  - Choosing a frozen Leftover for a Course pins it
  - Take out gives the Leftover the Recipe's Use-by from today
  - A Leftover past its Use-by asks before it counts as waste
  - Answering Threw it out dates the waste the day after the Use-by
  - Answering Wasn't there removes the Leftover without waste
  - Freeze it is not offered without a Freezer

---

### 2.4 Plan stability: Bought Planned Meals

**Behaviour**

- A fresh, unresolved Planned Meal is **Bought** once at least one of its Ingredient lines was bought for it from the Shopping List (definition below).
- **Automatic replans leave a Bought Planned Meal alone**: its Recipe stays, whatever the trigger (Recipe edited or archived, a Member's preferences, Tag rename, merge or delete, Slot or Variety Rule changes, Stock-take, new Recipes, Attendance, the nightly plan, the startup replan, the keep check, Slot Rule reservations). It still consumes projected Stock and yields its Leftover like a Pinned one, and Batches follow portions (§2.2).
- **Only Regenerate, Swap or choosing a Recipe by hand changes it** (and the explicit structural edits that already remove Pinned Planned Meals after naming them: taking a Course off a Meal Slot, archiving or removing a Course, Not served, deleting a Meal Slot).
- Regenerate's confirm (`lib/regenerate.ts`) names them: "These have Ingredients you already bought and are replaced too: Tue Dinner · Roast chicken (chicken thighs, cream)." Actions unchanged (decided: no "keep them" option).
- Shown as a neutral chip **Bought** (Phosphor `shopping-cart`) on the Planned Meal row (only when the row has no other chip, like the relaxed chip) and always in the Planned Meal sheet, with the line: "Bought for it: chicken thighs, cream. Automatic plan changes leave it as it is." A Pinned Planned Meal that is also Bought shows both facts.
- When a Bought Planned Meal now breaks a hard rule (a Member's new Exclusion, an archived Recipe, the Recipe no longer has that Course), it stays and its sheet shows a warn line: "Sam now excludes garlic, which this uses. Swap it to change it." (the same check and copy for Pinned ones).

**"Bought", precisely**

| Question | Rule |
|---|---|
| What is bought? | A **purchase** is a Stock Lot added through the Shopping List in Shop mode: a Scan that matched a list line (ticked or not) or a Tick by hand (which adds a Lot). Stock-take, an add from the Pantry, Ingredient extras and free-text extras are not purchases. |
| For which Planned Meals? | At the moment of the purchase, the list is derived twice with the same range (From = today, To = the list's chosen date): without the new Lot and with it. For every Planned Meal in that range, the purchase is **bought for** it by the amount its own shortfall on that Ingredient went down. Stock is drawn per Planned Meal in date and time order (`derivedLines`), so a purchase covers the earliest Planned Meal still short first. |
| Per line | Recorded per Planned Meal, Ingredient and Lot, with the amount. Optional lines are not on the list and are not bought for. A Planned Meal served from a Leftover needs nothing and is not Bought. |
| Partially ticked lines | A Scan that lowers a line without ticking it is still a purchase: the Planned Meals whose shortfall it covered are Bought. A line ticked by hand with 0 adds no Lot and so buys nothing. |
| The range | Only Planned Meals inside the list range at the time of the purchase. Changing the range later changes nothing already recorded; a Planned Meal outside the range is not Bought by it. |
| Which line counts | Any required Ingredient line (decided; not limited to Ingredients with a Shelf Life). |
| What undoes it | Undo of the Scan, unticking a Tick by hand, or **Delete** of the Lot (§2.6) remove that Lot's records. **Not needed** (§2.5) is not a purchase. |
| When it ends | When the Planned Meal is resolved (Cooked, Not cooked), removed (Regenerate, Not served, structural edits) or its Recipe changes (Swap, choosing a Recipe): the records go with it (cascade, or removed by the repository when the Recipe changes). What was bought stays in Stock and feeds the next plan through projected Stock and Ingredient Overlap. |

**Spec changes**

| § | Change |
|---|---|
| §7.1 | The sentence on Pinned and Cooked Planned Meals gains "and leaves Bought ones alone except on Regenerate". |
| §7.2 | New *Held cells*: a Bought Planned Meal is walked like a Pinned one (applied, not checked) unless the walk is Regenerate; the keep check and Slot Rule reservations pass over it; `clearAll` keeps it. |
| §7.3 | Swap on a Bought Planned Meal: allowed; the sheet notes "You bought chicken thighs for this; it stays in Stock." |
| §7.5 | Bought chip and sheet line; hard-rule warn line on Pinned and Bought. |
| §9 | New *Bought for a Planned Meal* (the table above). |
| §15 | Decision 35. |

**GLOSSARY**

- **Bought** (new): "A fresh Planned Meal that a purchase from the Shopping List was bought for: a Scan or Tick by hand that covered part of its Ingredients. Automatic replans leave it as it is; Regenerate, Swap or choosing a Recipe changes it." _Avoid_: Locked, purchased, shopped, committed.
- **Pinned** (update): add _Note_: "A Bought Planned Meal is held the same way by automatic replans, but Regenerate replaces it; it is not Pinned."

**ADR**: new **ADR 0013** "Bought Planned Meals are held by automatic replans". It amends ADR 0009 point 4 (the keep check checks every unpinned fresh Planned Meal: now every unpinned one that is not Bought) and decision 22's reservation rule (an unpinned Planned Meal of R inside the Cool-down before the rule's cell is replanned: not when Bought).

**Data model** (migration **1520**, `1520_planned_meal_bought.sql`)

```sql
CREATE TABLE planned_meal_bought (
  planned_meal_id INTEGER NOT NULL REFERENCES planned_meals(id) ON DELETE CASCADE,
  ingredient_id   INTEGER NOT NULL REFERENCES ingredients(id),
  lot_id          INTEGER NOT NULL,                 -- no FK: the Lot may be used up later; the record stays
  quantity        REAL    NOT NULL CHECK (quantity > 0),
  bought_at       TEXT    NOT NULL,
  PRIMARY KEY (planned_meal_id, ingredient_id, lot_id)
);
CREATE INDEX planned_meal_bought_lot ON planned_meal_bought (lot_id);
CREATE INDEX planned_meals_recipe_cooked ON planned_meals (recipe_id, date)
  WHERE state = 'cooked' AND from_date IS NULL;    -- for §2.7
```

- No backfill: purchases before the upgrade have no per-Planned-Meal record (upgrade note).
- An Ingredient merge mover (`internal/plan/store`, registered like the others) moves `ingredient_id` and sums duplicates.
- `planned_meals` rows of a Bought Planned Meal must be **updated in place** by every path that writes them (Reconcile, portions, Batches): a delete-and-insert would cascade the records away. Team A asserts it.
- Planner: `ExistingMeal.Held bool`; new role `roleHeld` (= `rolePinned` behaviour) unless `regen`.

**API**

- `mealOut` gains `"bought": null | { "ingredients": [{ "id", "name" }] }` and `"warning": null | { "code": "excluded" | "archived" | "course_lost", "memberId"?, "ingredientId"? }`.
- `POST /api/plan/regenerate?dryRun=1` answers `{ "replaces": n, "bought": [{ "date", "mealSlotName", "courseName", "recipeName", "ingredients": [name] }] }`.
- Scan and Tick answers are unchanged; the shopping service records purchases through a `BoughtRecorder` port.

**UI**: `features/plan`: Bought chip (shared `Chip` + glyph), sheet lines, Regenerate confirm list (`lib/regenerate.ts`), Swap note. Phosphor `shopping-cart` in `ui/icons.ts`.

**Edge cases**

- Two Planned Meals short on the same Ingredient, one 400 g pack bought: the earlier one is covered (Bought); the later only if anything is left after it.
- A purchase covering Stock that a Planned Meal already had (no shortfall): nothing Bought.
- Undo of a Scan after the Planned Meal was Cooked: the records are already gone with the resolve; nothing to undo.
- A Bought Planned Meal whose cell becomes covered by a Whole meal set by hand: it is kept, like a Pinned one (spec §7.2 step 0).
- Attendance falls to nobody for that Course on a date: the cell is not served; a Bought Planned Meal in it is kept and shown (like a Pinned one, §7.2 step 0b).
- Offline Scans: the purchase is recorded when the Scan syncs, against the list as it is then.

**Tests**

- Unit: `shopping.Attribute` (pure: before and after, date order, partial, range, optional lines, leftover-served); planner held role (every trigger above keeps it, Regenerate replaces it, keep check passes over it, reservations pass over it, `clearAll` keeps it); runner `invalidOnRead` keeps Bought; store: records cascade on resolve, deleted on Recipe change, in-place updates keep them; mover.
- BDD (`bdd/features/beta5/plan-stability.feature`):
  - Scanning chicken thighs makes Tuesday's roast chicken Bought
  - A partial Scan makes only the earliest Planned Meal Bought
  - Editing a Recipe leaves a Bought Planned Meal in place
  - A Tag rename that moves a Slot Rule leaves a Bought Planned Meal in place
  - A Stock-take leaves a Bought Planned Meal in place
  - Adding Recipes does not replace a Bought relaxed pick
  - Regenerate names Bought Planned Meals and replaces them
  - Swap replaces a Bought Planned Meal and the Ingredients stay in Stock
  - Undo of the Scan makes the Planned Meal no longer Bought
  - A Planned Meal outside the list range is not Bought by a purchase

---

### 2.5 Shopping List: Not needed, past Planned Meals still to confirm

**Behaviour**

- **Past Planned Meals stay on the list** until marked Cooked or Not cooked (the current rule, now written in §9). A line whose need includes one shows "Includes Tue Dinner, not marked Cooked yet" with **Mark it**, which opens To confirm for that slot.
- **Not needed** on an Ingredient line (the line's menu): the line leaves the list for the current range; no Stock Lot is created; it is not a purchase (§2.4). Toast: "Passata is not needed on this list. **Undo**".
- A collapsed group at the end, "Not needed (2)", lists them, each with **Needed after all**.
- Not needed lines count neither in the progress nor in the estimated total, and do not stop **Shopping list complete**.
- Changing the range (a new To) shows the line again: Not needed belongs to one range, like ticks.
- A Scan of a Not needed Ingredient adds the Lot as an off-list Scan ("Passata +700 g · not needed on this list"); the line stays Not needed.
- Ingredient extras keep their own delete; Not needed is for plan lines only.

**Spec changes**: §9 *Range* says "including Planned Meals before today not yet marked Cooked or Not cooked"; new bullets **Not needed** and the line hint; §10.1 point 5 (Scan of a Not needed Ingredient); decision 36.

**GLOSSARY**

- **Not needed** (new): "A Shopping List line the User took off the list for its current range, because nothing needs buying; it adds no Stock and is not a purchase." _Avoid_: Skip, dismiss, hide.
- **Shopping List** (update): "…for uncooked Planned Meals up to a chosen date (earlier ones not yet marked Cooked included), less Stock, less lines Not needed, plus any extras."

**Data model** (migration **1530**, `1530_shopping_not_needed.sql`)

```sql
CREATE TABLE shopping_not_needed (
  range_to      TEXT    NOT NULL,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  needed        REAL    NOT NULL CHECK (needed >= 0),  -- the line quantity when it was set
  user_id       INTEGER,
  created_at    TEXT    NOT NULL,
  PRIMARY KEY (range_to, ingredient_id)
);
```

Purged with ticks (`PurgeBefore`); covered by the shopping Ingredient merge mover.

**API**

| Route | Body | Answer | Errors |
|---|---|---|---|
| `POST /api/shopping/not-needed` | `{ "ingredientId", "to" }` | the list | `404` unknown Ingredient, `409 not_on_list` |
| `DELETE /api/shopping/not-needed/{ingredientId}?to=` | | the list | `404` |
| `GET /api/shopping/list` | gains `"notNeeded": [line]`; each line gains `"pastPlannedMeals": [{ "date", "mealSlotId", "mealSlotName", "courseName" }]` | | |

Publishes `shopping {"changed":"list"}`; no replan.

**UI**: `features/shop`: line menu on `LineTile` (shared `Menu`), `NotNeededGroup` (collapsed `Tile` section), line hint; pure `lib/lines.ts` (grouping, progress without Not needed, hint copy); hook `useShoppingActions` gains `notNeeded`/`neededAfterAll`.

**Edge cases**: a line both ticked and Not needed: Not needed is offered only on open lines; a Not needed line whose need grows (a new Planned Meal) stays Not needed for that range and the group shows the new quantity; Not needed on a line with a past Planned Meal is allowed (the Planned Meal is still to confirm).

**Tests**

- Unit: `Derive` with Not needed (left out, progress, total, complete); `pastPlannedMeals`; `lib/lines.test.ts`.
- BDD (`bdd/features/beta5/shopping.feature`):
  - Not needed takes passata off the list without adding Stock
  - Needed after all puts the line back
  - A new list range shows a Not needed line again
  - The list is complete when every other line is ticked
  - A Planned Meal from Tuesday not marked Cooked keeps its Ingredients on the list
  - Not needed does not make a Planned Meal Bought

---

### 2.6 Stock Lots: several purchases of one Ingredient

**Behaviour**

*By Ingredient view.* Each Ingredient row ("Chicken thighs · 1300 g · 2 Lots") expands in place with a disclosure button named "2 Lots" with a caret glyph and `aria-expanded`. Each Lot row: "800 g · Bought today · Good until Fri · Garage Fridge" ("Not sorted" when none; no "Good until" without a go-off date), in Deduction order (the order Cooked takes them). Tapping a Lot opens the Lot sheet. The device remembers which rows are open for the session only.

*Editing a Lot.* The Lot sheet gains **Edit** and **Delete**.

- **Edit** opens fields: Quantity (shared `NumberField`, Base Unit, > 0), Bought on (`DateField`, not after today), Good until (`DateField`, not before Bought on; a `Switch` "No go-off date" when the Ingredient has no Shelf Life). Changing Bought on suggests Good until again from the Shelf Life of the Lot's Storage Place kind, unless Good until was changed in the same edit. **Save** / **Cancel**.
- An edit is a correction: no waste, no Keep. Moving Good until of a Lot that went off to a later day removes that go-off (the streak is recomputed as if the new date had always been there); moving it earlier can make the Lot spoiled now (then Throw out and Keep apply).
- **Delete** confirm: title "Delete this Stock Lot?", body "Use Delete for a mistake, like a double Scan. It does not count as waste. To record waste, Throw out a Lot that has gone off." Actions **Delete** (danger), **Cancel**. The Lot leaves Stock; its go-off record (if it had gone off) goes too, as for the Undo of a Scan; purchases recorded for it (§2.4) go.

*Deduction when Cooked.* The rule stays: soonest to go off first, then oldest bought, then lowest id. The Mark as Cooked sheet (and the Mark all Cooked sheet, per Course) gains a collapsed row **Used from** with the summary "Soonest to go off first". Expanding lists each required Ingredient line ("Chicken thighs · 800 g") with its Lots in Deduction order; the User picks the Lot(s) actually used (toggle rows with our `Checkbox`) and may change each amount (prefilled in pick order up to the need). The summary then reads "Your choice for 1 Ingredient". Confirming takes the picked amounts from those Lots first, then any rest in the default order; picked amounts larger than the need are taken as picked (the cook used more).

**Spec changes**

| § | Change |
|---|---|
| §6 | Pantry By Ingredient expands to Lots; **Editing a Lot** and **Delete** bullets; Deduction "unless the User picks the Lots in **Used from**". |
| §6.1 | Delete removes a go-off like the Undo of a Scan; editing Good until moves the go-off. |
| §8 | Mark as Cooked step 1: "deducts Stock (§6), from the Lots picked in Used from first". |
| §15 | Decision 37. |

**GLOSSARY**

- **Stock Lot** (update): "…with its purchase date and go-off date, both of which a User may correct."
- **Cooked** (update): "…only then is Stock deducted, from the Lots the User picked or else soonest to go off first."
- **Used from** (new): "The Stock Lots a User says a Cooked Planned Meal took an Ingredient from, when not the default order." _Avoid_: Source lots, override.

**ADR**: new **ADR 0011** "Cooked takes from the Lots the User picks, else soonest to go off first" amends ADR 0003 (the order is the default, not the only rule).

**Data model**: no migration. `DELETE` reuses `DeleteLot` plus removal of the `stock_go_offs` row and the `planned_meal_bought` rows of that Lot, in one transaction. Pure `stock.DeductPicked(lots, need, picks)` and `stock.ValidateEdit(lot, edit, today, shelfLife)` in `internal/stock/lot.go`.

**API**

| Route | Body | Answer | Errors |
|---|---|---|---|
| `PATCH /api/stock/lots/{id}` | `{ "quantity"?, "purchased"?, "goesOff"?: date \| null }` | the Lot | `404`; `422 validation_failed` with `field` and `reason`: `quantity_invalid`, `purchased_future`, `goes_off_before_purchase`, `goes_off_required` |
| `DELETE /api/stock/lots/{id}` | | `204` | `404` |
| `GET /api/plan/{date}/{slotId}/{courseId}/cook` | each need gains `"lots": [{ "id", "quantity", "purchased", "goesOff", "storagePlaceName" }]` in Deduction order | | |
| `POST …/{courseId}/cooked` | gains `"usedFrom"?: [{ "ingredientId", "lots": [{ "lotId", "quantity" }] }]` | as today | `422 used_from_invalid` (Lot unknown, another Ingredient, more than the Lot holds, an Ingredient not in the Recipe) |
| `POST …/all/cooked` | each `courses[i]` may carry `usedFrom` | | as above |

Stock writes publish `stock {"changed":"lots"}` (replans as a Stock-take; Bought Planned Meals stay).

**UI**

- `features/stock`: `IngredientLotsRow` (expandable `ListRow`), `LotEditSheet`, Delete via `useConfirm`; pure `lib/pantry.ts` (`lotsByIngredient` in Deduction order), `lib/lotEdit.ts` (validation, Good until suggestion).
- `features/plan`: `UsedFromSection` inside `MarkCookedSheet`; pure `lib/usedFrom.ts` (prefill in pick order, summary copy, payload); hook `useUsedFrom`.
- Shared: an expandable variant of `ListRow` (`ui/ListRow`, prop `expanded` + `onToggle`, disclosure button) added by team D.

**Edge cases**

- Two Courses of one slot use the same Ingredient: picks are per Course; a Lot picked twice beyond its quantity is refused for the second.
- A picked Lot used up meanwhile (another device): `used_from_invalid`; the sheet reloads the Lots.
- Editing a Lot that a pending offline Scan Undo refers to: Undo deletes it as today; nothing else breaks.
- A Lot that spoiled before its go-off date: edit Good until to yesterday; it then shows as spoiled with Throw out.
- Quantity edited to more than was bought: allowed (a correction).

**Tests**

- Unit: `DeductPicked` (picks first, rest default, more than need, invalid picks), `ValidateEdit`; repository: delete removes go-off and purchase records; `lib/pantry` grouping order; `lib/usedFrom` prefill and payload; `lib/lotEdit` suggestion.
- BDD (`bdd/features/beta5/stock-lots.feature`):
  - By Ingredient lists yesterday's and today's chicken thighs as two Lots
  - Editing a Lot's Good until moves its go-off
  - Deleting a double Scan does not count as waste
  - Deleting a Lot that had gone off removes that go-off from the streak
  - Cooked takes from the soonest Lot by default
  - Used from takes the chosen Lot first
  - A Used from Lot that holds too little is refused

---

### 2.7 Recipes: sort by last cooked

**Behaviour**

- The Recipes list gains a **Sort** select (shared `Select`, no native control) beside the search: "Name" (the current order, default), "Last cooked: longest ago first", "Last cooked: most recent first". If beta.4 added other sorts, these join them. The device remembers the choice (`localStorage`, try/catch).
- "Longest ago first" puts Recipes not cooked yet first, then oldest; "Most recent first" puts them last. Ties by name.
- Recipe tiles and rows show the last cooked date in their meta: "Last cooked today", "Last cooked yesterday", "Last cooked Tue" (2 to 6 days ago), "Last cooked 3 Oct" (7 days or more), "Not cooked yet" (decided copy). The Recipe detail shows the same in its facts.
- **Last cooked** = the latest date of a Cooked fresh Planned Meal of that Recipe, in any Course. Leftover-served Planned Meals do not count (nothing was cooked). The Planned Meal's date counts, not the day it was marked.

**Spec changes**: §4 (Recipes list sort and Last cooked), decision 38.

**GLOSSARY**: **Last cooked** (new): "The latest date a Recipe was Cooked fresh (not served from a Leftover)." _Avoid_: Last made, last eaten.

**Data model**: no table; the partial index in 1520.

**API**: Recipe list and detail gain `"lastCookedOn": "YYYY-MM-DD" | null`; `GET /api/recipes?sort=name|last_cooked_asc|last_cooked_desc` (server order; the SPA also sorts client-side with the same pure rule for live updates).

**UI**: `features/recipes`: `RecipeSortSelect` (on shared `Select`), meta line on `RecipeTile` and rows; pure `lib/sort.ts` and `lib/lastCooked.ts` (copy by day distance, household dates); `useRecipes` takes the sort.

**Edge cases**: archived Recipes keep their date (shown when archived ones are listed); a Cooked Planned Meal later marked Not cooked no longer counts (state changes); a Recipe merged or imported has no history.

**Tests**

- Unit: `lastCooked.test.ts` (each copy form), `sort.test.ts` (both orders, not cooked yet placement, ties); repository query (fresh only, any Course, latest date).
- BDD (`bdd/features/beta5/recipes.feature`):
  - Recipes sorted by last cooked, longest ago first, start with Recipes not cooked yet
  - A Leftover served on Wednesday does not change the last cooked date
  - The Recipe tile says when it was last cooked

---

### 2.8 Settings grouped

**Behaviour**

The Settings index has three groups, in this order:

| Group | Rows (title · route) | Who sees the row |
|---|---|---|
| **Catalogue** | Ingredients `/ingredients` · Products `/products` · Shops `/settings/shops` · Tags `/settings/tags` · Courses `/settings/courses` · Storage Places `/settings/storage-places` | every User |
| **Household** | Household `/settings/household` · Members `/settings/members` · Meal Slots `/settings/meal-slots` · Planning rules `/settings/planning` · Sign-in requests `/settings/access-requests` | every User |
| | Allowlist `/settings/allowlist` · Recipe Assistant `/settings/recipe-assistant` | Admins only (the former Admin group) |
| **You** | Your preferences `/settings/preferences` · Notifications `/settings/notifications` | every User |

- Ingredients, Products and Shops leave the avatar menu. The avatar menu keeps **Kitchen board**, **Settings** and **Sign-in requests** (with its count badge).
- Routes do not change (links keep working). The Ingredients and Products pages gain the breadcrumb "Settings › Ingredients" like the other Settings pages.

**Role rules per page (unchanged, now stated in one place)**

| Page | Opens | Changes |
|---|---|---|
| Ingredients | every User | every User (add, edit, merge, picture, Exclusions) |
| Products | every User | every User (add, edit, archive) |
| Shops | every User | every User adds a Shop and saves a Shop Location; the Admin renames, deletes and edits Weight Barcode Rules |
| Tags | every User | every User |
| Courses | every User (read-only) | Admin |
| Storage Places | every User | every User |
| Household | every User (read-only) | Admin (incl. the new Frozen Use-by default) |
| Members | every User (read-only) | Admin |
| Meal Slots | every User (read-only) | Admin (weekly set-up); per-date controls on Plan and Today: every User (§2.1) |
| Planning rules | every User | every User |
| Sign-in requests | every User | every User approves or denies |
| Allowlist, Recipe Assistant | Admin | Admin |
| Your preferences, Notifications | each User | their own |

**Spec changes**: §2 (role table above replaces the scattered statements, by reference), §14 (avatar menu: Kitchen board, Settings, Sign-in requests), §5 ("Adding a Shop … from Settings > Catalogue"), decision 39. ux-brief *Structure* already says Settings and the board sit behind the avatar; no change.

**GLOSSARY**: none ("Catalogue" is a Settings group caption, not a domain term; it does not conflict with ADR 0002's Product catalogue).

**Data model / API**: none.

**UI**: `features/settings/lib/settingsSections.ts` (groups `catalogue`, `household`, `you`; the `admin` group goes; rows for Ingredients, Products, Tags, Courses), its test, `strings.ts` (group and row copy), `app/nav.ts` (`MENU_ICONS` entries go), `features/{ingredients,products,shops}/index.ts` (`navItems` go), breadcrumbs.

**Edge cases**: a non-Admin sees Household without Allowlist and Recipe Assistant; an empty group is dropped (none is today); the page-layout guard lists no new route.

**Tests**

- Unit: `settingsSections.test.ts` (groups, order, Admin rows), `nav` (menu without the Catalogue rows), breadcrumbs.
- BDD (`bdd/features/beta5/settings.feature`, SPA-level steps if the BDD harness drives the SPA; else Vitest screen tests): 
  - Settings lists Ingredients, Products and Shops under Catalogue
  - The avatar menu no longer lists Ingredients, Products or Shops
  - A User who is not an Admin does not see the Allowlist row

---

### 2.9 GLOSSARY changes, all together

| Term | Change |
|---|---|
| **Not served** | new (§2.1) |
| **Guest** | new (§2.2) |
| **Frozen Use-by** | new (§2.3) |
| **Had it / Threw it out / Freeze it** | new (§2.3) |
| **Bought** | new (§2.4) |
| **Not needed** | new (§2.5) |
| **Used from** | new (§2.6) |
| **Last cooked** | new (§2.7) |
| **Attendance** | _Avoid_ loses "Guests" (now a term); _Note_ added |
| **Meal Slot**, **Portion Factor**, **Leftover**, **Use-by**, **Zero-waste streak**, **Storage Place**, **Pinned**, **Stock Lot**, **Cooked**, **Shopping List** | wording updates as listed per feature |

### 2.10 ADRs

| ADR | Status | Amends |
|---|---|---|
| **0011** Cooked takes from the Lots the User picks, else soonest to go off first | new | ADR 0003 |
| **0012** Leftovers stay Leftovers: Storage Places, Frozen Use-by, and asking before waste | new | spec §1 (*a freezer for Leftovers* was out of v1), §6.1, §8 |
| **0013** Bought Planned Meals are held by automatic replans | new | ADR 0009 point 4, decision 22's reservation rule |

No conflict with ADR 0001, 0002, 0004–0008 or 0010. Per-date controls for every User match ADR 0005 (Admin-only powers are the weekly set-up, unchanged) and ADR 0008 point 8 (Attendance stays owned by the slot; Guests add portions on a date, no new list per Course). The numbers are the next free ones on `main`; the doc team (W0) checks beta.4 has not taken them.

---

## 3. Open questions for the user

None remain. The user answered Q1 to Q8 on the recommended defaults; each answer is written into its feature section as decided (§2.2, §2.3, §2.4, §2.7, §1).

### 3.1 Candidates (not decided)

| Candidate | Recommendation |
|---|---|
| Partial Leftover plus a top-up Batch (a Leftover covers 2 of 4 portions, cook one Batch more) | Do next (beta.6): Guests make partial cover common. Planner step 1 gains a "Leftover + Batch" option scored against a fresh pick; Leftover and fresh Batch become two sources of one Planned Meal, so it needs its own ADR. |
| Moving a Planned Meal to another day | Do in beta.6 as **Move to…** in the Planned Meal sheet: pins at the target cell (Course fit and hard rules checked), swaps when occupied, carries Bought records with it. Small and much asked for. |
| An earlier "use soon" warning | Do as a household setting "Use soon: N days ahead" (today 2), used by the Use soon tile, the chip and the push. Small; no planner change. |
| Inferring a Shop-only barcode | Do: preselect "Shop-only" in the unknown-barcode form for in-Shop prefixes (GS1 02, 04, 20–29), still changeable. Tiny, `internal/barcode` plus the form default. |
| Undo after Regenerate | Do later: keep the replaced unpinned Planned Meals for 10 minutes and offer **Undo** in the toast; restore only cells nobody has changed since. Medium; needs a snapshot table. |

---

## 4. Teams and order

### 4.1 Gate

Beta.5 code starts once beta.4 has merged (its team H merged, `v1.0.0-beta.4` tagged): beta.4 owns the spec, GLOSSARY, plan, planner, household, settings and today files until then. The pure Vitest and Go test files of new modules may be authored earlier on their own branches.

Every team follows the CLAUDE.md pipeline: **designer / test author** [Sonnet 5.5] writes the unit tests and the Gherkin first → **developer** [Haiku 5.5] implements until they pass → **reviewer** [Opus 5.5] checks against spec, GLOSSARY, ADRs and conventions; nothing merges without approval. Each worktree writes `<worktree>/build/check.log`. Merge chains are gated with `&&` on `make check`.

### 4.2 Work packages and file ownership

| WP | Scope | Owns | Depends on |
|---|---|---|---|
| **W0 Doc** | Spec edits (§2 tables), GLOSSARY (§2.9), ADRs 0011–0013, decisions 33–39, spec §18 API | `docs/spec/functional-spec.md`, `GLOSSARY.md`, `docs/adr/0011-*`, `0012-*`, `0013-*` | gate |
| **A0 Types** | No behaviour: `plan.Meal.Bought`, `plan.Leftover` new fields, `planner.ExistingMeal.Held`, `planner.Slot.Guests`/`NotServed`, `household.SlotDate` type | `internal/plan/types.go`, `internal/planner/types.go`, `internal/household/meals.go` | gate |
| **A Data** | Migrations 1500–1530 and their tests; `feeder-pre-1500.db` snapshot (generalise `NeedsPre1400Snapshot` to `NeedsPreSnapshot(name)`); repositories: slot dates, Guests, Leftover columns and events, Bought records (+ mover, in-place updates), Not needed (+ mover), Lot edit and delete (go-off and Bought removal), Recipe `frozen_use_by_days`, `lastCookedOn` query, household setting; pure `internal/household/slotdate.go` | `internal/db/**`, `cmd/feeder/main.go` (snapshot call), `internal/household/slotdate.go`, `internal/household/store/**`, `internal/plan/store/**`, `internal/shopping/store/**`, `internal/stock/store/**`, `internal/recipe/{recipe.go,store/**}` | A0 |
| **S Stock and shopping domain** | `stock.DeductPicked`, `stock.ValidateEdit`, stock service (edit, delete, picks in `DeductCookedTx`); `shopping.Attribute`, Not needed and `pastPlannedMeals` in `Derive`; shopping service records purchases (`BoughtRecorder` port), Undo and untick remove them | `internal/stock/{lot.go,lot_test.go}`, `internal/stock/service/**`, `internal/shopping/shopping.go` and tests, `internal/shopping/service/**` | A |
| **B Planner** | Held role, Guests in portions, Not served cells, walk by date time, Batches follow portions, frozen and to-answer Leftovers left out; runner: snapshot (slot dates, Bought, Guests), `invalidOnRead` keeps Bought, Regenerate dry-run list, no auto-waste at 03:00, Leftover hand actions and answers (replans), `usedFrom` passed to Stock; pure `internal/plan/leftover.go`; `ReasonSlotDateChanged` | `internal/planner/**` (after A0), `internal/plan/{plan.go,cook.go,leftover.go}` and tests, `internal/plan/runner/**`, `internal/plan/plantest/**` | A0; merges after A and S |
| **N Notify** | Effective slot time for Start cooking, Advance Step, Confirm Cooked; no reminder for Not served dates | `internal/notify/**` | A |
| **C1 API (household, stock, shopping, recipes)** | Slot dates routes, Date Attendance `guests`, Lot `PATCH`/`DELETE`, Not needed routes, list fields, Recipe `lastCookedOn`/`frozenUseByDays`/`?sort`, household `frozenUseByDays`; BDD steps | `internal/household/httpapi/**`, `internal/stock/httpapi/**`, `internal/shopping/httpapi/**`, `internal/recipe/httpapi/**`; `bdd/features/beta5/{slot-dates,stock-lots,shopping,recipes}.feature`, `bdd/steps_beta5_c1_test.go` | A, S |
| **C2 API (plan, today, cook, board)** | Plan payload (time, notServed, guests, `unserved: not_served`, `bought`, `warning`), Leftover routes, Regenerate `dryRun`, cook preview `lots`, `usedFrom` on cooked routes, Today and board fields, cooking timeline end at the date time; BDD steps | `internal/plan/httpapi/**`, `internal/today/httpapi/**`, `internal/cook/{httpapi,service}/**`; `bdd/features/beta5/{leftovers,plan-stability}.feature`, `bdd/steps_beta5_c2_test.go` | B, N |
| **G Settings and nav** | §2.8; Household page Frozen Use-by field | `web/src/features/settings/lib/settingsSections.ts` (+test), `web/src/features/settings/strings.ts`, `web/src/features/settings/screens/**`, `web/src/app/{nav.ts,breadcrumbs.ts,breadcrumbStrings.ts}` (+tests), `web/src/features/{ingredients,products,shops}/index.ts` (+tests) | gate (the Frozen Use-by field after C1) |
| **D Shared web** | Phosphor glyphs (`shopping-cart`, `snowflake`, `question`, `users-three` for Guests), expandable `ListRow`, Gallery rows | `web/src/ui/icons.ts`, `web/src/ui/ListRow*`, `web/src/ui/Gallery*`, `web/src/ui/galleryData.ts`, `web/src/ui/index.ts` | gate |
| **L Leftovers web** | `lib/leftovers` and `ui/LeftoverActions` (rows, sheet, question, freeze and take-out) | `web/src/lib/leftovers/**` (new), `web/src/ui/LeftoverActions/**` (new); `web/src/ui/index.ts` after D | C2, D |
| **R Recipes web** | §2.7; Frozen Use-by field in the editor | `web/src/features/recipes/**` | C1 (pure libs may start at gate) |
| **SH Shop web** | §2.5 | `web/src/features/shop/**` | C1 |
| **P Pantry web** | §2.6 Pantry side; frozen Leftovers in Pantry groups and the Leftovers filter | `web/src/features/stock/**` | C1, D, L |
| **F1 Plan and Today: slot controls** | §2.1, §2.2 (Guests row in `DateAttendancePanel`), Bought chip and lines, hard-rule warn line, Regenerate confirm list, Swap note, board and cook time captions | `web/src/features/plan/**`, `web/src/features/today/**`, `web/src/features/board/**`, `web/src/features/cook/**`; granted `web/src/features/settings/components/DateAttendancePanel*` and `features/settings/lib/dateAttendance.ts` after G merges | C2, D, G |
| **F2 Plan and Today: Leftovers and Used from** | Leftovers tile with questions (composes L), Planned Meal sheet link to its Leftover, "From the freezer" in Choose a Recipe, `UsedFromSection` in the Cooked sheets | `web/src/features/plan/**`, `web/src/features/today/**` | F1 (same files), L |
| **H Release** | CHANGELOG, upgrade note, deploy guide, last spec and GLOSSARY pass, the word check (§6) | `CHANGELOG.md`, `docs/dev/deploy.md`, `GLOSSARY.md`, `docs/spec/functional-spec.md` | last |

No two packages own the same file at the same time: S and A split `internal/stock` and `internal/shopping` by sub-directory; B owns `internal/planner/types.go` only after A0 merges; F1 is granted the two settings files only after G merges; F2 starts after F1 merges; L adds to `ui/index.ts` only after D merges.

### 4.3 Waves

| Wave | Packages (parallel within a wave) | Exit |
|---|---|---|
| **0** | W0 Doc, A0 Types, G Settings and nav, D Shared web | spec, GLOSSARY and ADRs approved; types on main |
| **1** | A Data; R, SH, P authors write pure-lib tests against the API contract | migrations and repositories merged |
| **2** | S Stock and shopping domain, N Notify | |
| **3** | B Planner, C1 API | planner and C1 merged |
| **4** | C2 API, R Recipes web, SH Shop web | |
| **5** | L Leftovers web, F1 Plan and Today | |
| **6** | P Pantry web, F2 Plan and Today | |
| **7** | H Release, release QA (§5, §6) | `v1.0.0-beta.5` |

Critical path: A0 → A → S → B → C2 → L/F1 → F2 → H.

---

## 5. Risks

| Risk | Where | Mitigation and QA |
|---|---|---|
| **Migrations cannot be undone** | 1500–1530 | Plain `CREATE`/`ALTER`, no rebuild, no foreign-key pragma. Snapshot `feeder-pre-1500.db` before 1500 when `planned_meals` has rows (same helper as 1400). Migration tests per file: fresh and upgraded schemas equal, second migrate is a no-op, `foreign_key_check` empty, defaults as stated. Rehearse on a copy of the user's `/data` before the tag. |
| **Bought records lost by a delete-and-insert** | plan repository | A's test: every write path of a Bought Planned Meal keeps its id and records; a planner Reconcile with new portions keeps them. |
| **Held Planned Meals change planner output** | planner | Bought holds only after purchases from the upgrade on, so an upgraded plan is unchanged until the first Scan. Golden planner tests: every replan reason with a Bought cell; Regenerate replaces it. |
| **Batches follow portions** changes Pinned and unpinned behaviour (decided) | planner, runner | Before/after replay of the user's database copy with the old and new planner: diff placements; expected differences are only cells whose Batches did not cover their portions. CHANGELOG says so. |
| **No auto-waste at 03:00** changes the streak | runner, `cook/zerowaste` | Streak unit tests for every answer; the upgrade note says Leftovers past their Use-by now ask. QA: a Leftover with Use-by yesterday on a test install shows the question the next morning, and the streak holds until answered. |
| **Effective slot time used everywhere** | notify, cook, planner, today, board | One function (`household.EffectiveTime`); a guard test greps for direct reads of `meal_slots.time` outside the household package. QA: change tonight's time and watch Start cooking, the board and Cook Mode. |
| **Attribution maths** | shopping | `Attribute` is pure and derived from the same `derivedLines`; property test: the sum of recorded amounts for a purchase equals the drop in total shortfall. |
| **Offline Scans record against a later list** | shopping | Documented edge (§2.4); BDD for a synced Scan. |
| **beta.4 drift** | all | Gate in §4.1; W0 rebases the spec on beta.4's final text before any team starts. |
| **Copy using avoided words** | all UI | §6 word check before the tag; the decided copy avoids "eaten" and "never". |

---

## 6. Release checklist for beta.5

- [ ] Spec, GLOSSARY and ADRs 0011–0013 match the decisions recorded in §2.
- [ ] Every package merged with an Opus review approval; `make check` green on main.
- [ ] Migrations 1500, 1510, 1520, 1530 rehearsed on a copy of the user's `/data`; `feeder-pre-1500.db` written and not listed in Settings.
- [ ] Planner before/after replay on that copy reviewed (only expected differences).
- [ ] Hands-on QA on phone and desktop, light and dark: slot menu (Not served, Who's eating with Guests, Time today), Leftover actions and the question, Bought chip after a Scan, Not needed, By Ingredient Lots, Lot edit and Delete, Used from, Recipe sort, Settings groups and avatar menu.
- [ ] Reminders at a changed time on a real device (Start cooking, Confirm Cooked).
- [ ] Word check: no GLOSSARY _Avoid_ word in new UI strings (`strings.ts` files) or in the new spec text; `scripts/check-ui.sh` passes (no native controls, Phosphor only).
- [ ] CHANGELOG `[1.0.0-beta.5]`: Added (each feature), Changed (Leftovers past Use-by ask first; Batches follow portions; Settings groups), Upgrading (migrations 1500–1530, the snapshot, going back to the image you ran before, Bought starts with purchases after the upgrade, no new settings for the operator).
- [ ] Deploy guide: `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.5 --namespace feeder --reset-then-reuse-values`.
- [ ] Tag `v1.0.0-beta.5`; image and chart published from the tag; prerelease tags only (no `latest`).
