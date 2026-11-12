# A Meal Slot on one date: Not served, an emptied date, Guests and Batches following portions

Status: **Accepted** (2026-11-12; the user's decisions U1 to U7, [beta5-reconcile.md](../dev/design/beta5-reconcile.md) §13). Amends [ADR 0008](0008-courses.md) point 8 (Course Attendance: a Course nobody eats is left empty).

ADR 0008 keeps Attendance on the Meal Slot (usual, and per date) and Course Attendance as opt-outs on top of it. A date can change who is eating, but not whether the slot is served, when, or how many non-Members eat. The Household wants all three for one date, for any User.

## Decision

1. **Per-date facts live in `meal_slot_dates`** (slot, date): `not_served`, `time` (null = usual), `guests`. A row back to all defaults is deleted. This is separate from the Attendance override on purpose: an override owns an attendee list and is removed by Reset to usual Attendance.
2. **Not served.** A User may mark a slot on a date (today on) **Not served**: every Course is left empty with `unserved: "not_served"`, no Couldn't plan reason, and unresolved Planned Meals are removed after a confirm that names them (Pinned and Bought ones included, with what was bought). Offered only while no Course of the slot is Cooked or Not cooked (decided, U2 = A). Any User, not only the Admin: the weekly set-up stays Admin's ([ADR 0005](0005-sign-in-needs-approval.md) is unaffected).
3. **An emptied date.** Decided (U1 = A): saving Who's eating with no Member and no Guest means Not served. Either way a slot whose **usual** Attendance is empty stays Couldn't plan (Nobody attends): that is set-up, not a date choice.
4. **Guests.** A date may carry 0 to 20 **Guests**, each one standard portion of every Course the slot serves. They add portions, Batches, Leftover maths and so Shopping List needs, never preferences or Exclusions. Course Attendance (Members) is unchanged; **point 8 of ADR 0008 changes** so that a Course every Member opts out of is served when the date has Guests (decided, U3 = A), and a slot with Guests and no Member is served. "Nobody attends" and "nobody eats the Course" then mean no Member **and** no Guest.
5. **Time today.** A date may carry its own time for the slot. The **effective time** is read through `household.EffectiveTime` by the planner walk and Advance Step lead-time check, Start cooking, Confirm Cooked, To confirm, the cooking timeline, the board and Today. Reminder keys already end in the due instant, so a changed time gives a new key.
6. **Batches follow portions.** An unresolved fresh Planned Meal (unpinned, Pinned or Bought) whose Batches no longer cover its Course's portions keeps its Recipe and gets Batches = ceil(portions / Yield). Fewer portions never lower Batches. This is the plan's decision for every portion change, not only Guests; the CHANGELOG says so.

## Considered options

- *A per-Course Not served flag and per-Course Guests*: more storage and UI for something opt-outs and one number of Guests already cover. Rejected (decided).
- *Store Guests, time and Not served on the Attendance override*: the override is deleted by Reset and owns an attendee list; the three would be lost or half-reset. Rejected.
- *Replan (drop and re-place) unpinned Planned Meals whose Batches fall short*: simpler for unpinned ones, but leaves Pinned ones under-cooking. Rejected for raising Batches.

## Consequences

- Migration 1500 (`meal_slot_dates`); `internal/household/slotdate.go` (`EffectiveTime`, `IsNotServed`, `PortionsNeeded`); `SlotInfo.Guests` / `NotServed` and an effective `Time` in the planner input; a new replan reason; the API and `unserved` enum gain `not_served`.
- Spec §3, §3.1, §7.1, §7.2 (steps 0b and 4), §7.4, §7.5, §11, §12 and numbered decisions; GLOSSARY **Not served**, **Guest**, **Attendance**, **Portion Factor**, **Meal Slot**.
