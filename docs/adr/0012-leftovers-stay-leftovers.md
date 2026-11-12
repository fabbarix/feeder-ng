# Leftovers stay Leftovers: freezing, hand actions and asking before waste

Status: **Proposed** (2026-11-12). Amends spec §1 ("a freezer for Leftovers" was out of v1), §6.1 (waste event 3) and §8 (Leftovers past their Use-by are discarded automatically). Waits on open questions Q10 to Q15 in [beta5-reconcile.md](../dev/design/beta5-reconcile.md).

A Leftover is a row in `leftovers` (Recipe, remaining portions, Use-by, status, and the Course it was cooked in, [ADR 0008](0008-courses.md)). It is not Stock: the glossary defines Stock as quantities of Ingredients, and the planner plans Leftovers (Leftover first, Course fit, one Recipe per slot, Reheat). The Household now wants to record what it did with one by hand, to freeze one, and not to have Feeder decide at 03:00 that it was wasted.

## Decision

1. **A Leftover stays a Leftover.** It is not turned into a Stock Lot. Freezing adds `frozen_on` to the row (and a Storage Place only if the Pantry lists frozen Leftovers, Q10); "frozen" is that column, not the place's kind, so deleting or re-kinding a Storage Place changes no Leftover.
2. **Hand actions.** Had it (portions had outside the plan, not waste), Threw it out (waste dated the day of the action), Freeze it (move to a Freezer; Use-by = today + Frozen Use-by), Take out (not frozen; Use-by = today + the Recipe's Use-by days), each recorded in `leftover_events`. Fewer portions than the Planned Meals served from it need unpin and replan those Planned Meals, as for a smaller Cooked Leftover (spec §8 rule 3).
3. **Frozen Use-by.** Per Recipe (optional, 1 to 365 days) or the Household default (90). It is a Leftover's counterpart to the Ingredient's Frozen Shelf Life, and not the same number.
4. **Frozen Leftovers are not planned automatically.** They are used only when a User picks one for a Planned Meal (Q12 decides when it leaves the Freezer).
5. **Ask before waste.** The 03:00 job stops discarding. A Leftover past its Use-by with portions left is **to answer**: the planner ignores it, Today's Leftovers tile asks "Had it, threw it out, or wasn't there?", and it keeps asking until answered. Had it and Wasn't there are not waste; Threw it out is waste dated the day after the Use-by (like a Lot's go-off, §6.1 event 1). An unanswered Leftover counts nothing, so the **Zero-waste streak** holds until it is answered.

## Considered options

- *Leftover becomes a Stock Lot when frozen*: needs a Recipe-to-Ingredient link, portions as a Base Unit, and a second path into the plan. Rejected.
- *Keep automatic waste, add an undo*: the Household's complaint is the wrong waste record, and an undo after the streak reset is too late. Rejected.
- *Push a notification for each unanswered Leftover*: every notification type needs a Settings > Notifications toggle; Today already asks. Not now (Q15).

## Consequences

- Migration 1510 (`ALTER` only); `plan.IsToAnswer`, `FreezeUseBy`, `TakeOutUseBy`; `runner.DiscardExpired` is replaced by answer actions; `cook/zerowaste` reads answered waste by date.
- Spec §1, §3 (Frozen Use-by default), §4 (Recipe field), §6, §6.1, §8 and a numbered decision; GLOSSARY **Frozen Use-by**, **Had it / Threw it out / Freeze it**, **Leftover**, **Use-by**, **Zero-waste streak**.
- Upgrade: Leftovers that went past their Use-by since the last 03:00 job are to answer, not waste.
