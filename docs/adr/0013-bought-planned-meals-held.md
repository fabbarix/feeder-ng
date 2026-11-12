# Bought Planned Meals are held by automatic replans

Status: **Accepted** (2026-11-12; the user's decisions U1 to U7, [beta5-reconcile.md](../dev/design/beta5-reconcile.md) §13). Amends [ADR 0008](0008-courses.md) points 2 and 8, [ADR 0009](0009-soft-cool-down-and-variety.md) points 4 and 6, spec decision 22 and spec §7.2 steps 0 and 0b.

Once the Household has bought the Ingredients for a Planned Meal, an automatic replan that swaps its Recipe leaves them with a pack of chicken and no dinner for it. Pinning is the User's way to say so, but nobody pins every meal before shopping.

## Decision

1. **Bought.** A fresh, unresolved Planned Meal (one Course of one slot on one date) is **Bought** once a purchase from the Shopping List (a Scan in Shop mode that matched a list line, or a Tick by hand) covered part of one of its required Ingredient lines. The amount is attributed by deriving the list twice (without and with the new Lot) and giving the drop in shortfall to Planned Meals in the list range in date order, **today onward** (decided, Q18: past unconfirmed Planned Meals still count on the list but get no share; `plans.Meals` ignores From, so `shopping.Attribute` must exclude them). Records are per Planned Meal, Ingredient and Lot (`planned_meal_bought`), removed by Undo of the Scan, unticking, Lot Delete, resolving the Planned Meal, removing it, or changing its Recipe.
2. **Held, not Pinned.** Automatic replans (any reason: Recipe edits, preferences, Tag changes, rule changes, Stock-take, new Recipes, Attendance, the nightly and startup replans) leave a Bought Planned Meal in place, whatever its Recipe, as they do a Pinned one. It consumes projected Stock and yields its Leftover like a Pinned one. Only **Regenerate**, **Swap**, choosing a Recipe by hand, or an explicit structural edit that already names Pinned Planned Meals (taking a Course off a Meal Slot, archiving a Course, Not served, deleting a Meal Slot) changes it; those dialogs also list what was bought.
3. **ADR 0009 point 4 (keep check).** The keep check passes over a Bought Planned Meal (it is not dropped for a strict candidate). Its relaxed flag and why chip are still **recomputed** on each replan, so the chip stays true; it is never replaced.
4. **ADR 0009 point 6 and decision 22 (reservation).** A Bought Planned Meal of R inside a Slot Rule cell's Cool-down is treated like a Pinned one: the rule cell is filled by a relaxed pick, and nothing else is held back.
5. **ADR 0008 point 2 (Whole meal).** A Bought Planned Meal in a Course other than the main Course is kept like a Pinned one: a Whole meal is not picked for the main Course beside it, and a Whole meal set by hand leaves it as a Course that is not covered (decided, U6 = A).
6. **ADR 0008 point 8 and step 0b (nobody eats the Course).** A Bought Planned Meal in a Course that becomes one nobody eats on that date is kept and shown, like a Pinned one (step 0b), not removed. An explicit Not served of the whole slot still removes it after the dialog names what was bought (see ADR 0014; Not served is offered only while no Course is Cooked or Not cooked, U2).
7. **Hard rules still apply.** If a Bought Planned Meal now breaks one (a new Exclusion, an archived Recipe, the Recipe lost that Course), it stays and its sheet says so with the Swap action; the same line is shown for Pinned ones.
8. **Purchases from before the upgrade** have no per-Planned-Meal record, so nothing is Bought until the first purchase after it.

## Considered options

- *Pin on purchase*: Regenerate would then keep it, and the User cannot tell their choice from a side effect. Rejected: Bought is replaced by Regenerate, Pinned is not.
- *Hold only Ingredients with a Shelf Life*: arbitrary; a bought tin is as much of a commitment. Rejected (the plan decided any required line).
- *A "keep them" option on Regenerate*: more choice than the User asked for; Regenerate names what it replaces. Rejected.

## Consequences

- Planner role `roleHeld` (behaves as `rolePinned` except under Regenerate); `ExistingMeal.Held`; plan store updates `planned_meals` in place so records survive; migration 1520; `shopping.Attribute` (pure) and a `BoughtRecorder` port.
- Spec §7.1, §7.2, §7.3, §7.5, §9 and a numbered decision; GLOSSARY **Bought**, **Pinned** note.
