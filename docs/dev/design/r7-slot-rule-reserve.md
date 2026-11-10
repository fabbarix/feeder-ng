# R7: Slot Rule reservation

Spec: §7.2 "Slot Rule reservation", §7.3, §15.21 (2026-11-10). Replaces the "known planner limit" in t11-planning.md and the "never falls back" caveat in t3-planner-core.md.

## Rule
A Slot Rule slot S reserves Recipe R when S is still open (empty, or unpinned Planned in this run; not Pinned, Cooked, skipped, a kept meal or a Swap target) and R is the only Recipe S can take: the union of Recipes matching S's rules (by id, or by Tag), restricted to eligible ones (not archived, Yield > 0, no Exclusion for an attendee of S, including Ingredients), is exactly `{R}`. A Tag carried by several eligible Recipes reserves nothing (the rest can fill S; if Cool-down empties the Tag anyway, S shows its couldn't-plan reason).

While evaluating an earlier slot i (index < S, same day included), R is removed when `|day(S) - day(i)| < cooldownDays(R)`. This is a new filter that runs before the four existing ones and is not counted in `Eliminations` (it is not "every option was excluded or in cool-down" for slot i; `Considered` still counts R? **D**: no, R is skipped like a Slot Rule narrowing, before `Considered++`).

**Void reservation** (nothing held back): the history already holds a fresh cook of R (LastPlanned, Pinned, Cooked or kept, before or after S) with `|day - day(S)| < cooldownDays(R)`, or R is `Cooldown 0` (window empty). Two open reservations of R inside each other's Cool-down: the earlier slot wins; the later is void and its slot ends up `Unfilled{no_candidates, SlotRuleClaimed, CoolDown 1}`.

**Pinned earlier wins** (SetMeal never refuses): S shows its existing couldn't-plan reason.

**Plan validity**: an unpinned Planned fresh meal of R inside the window of a live (non-void) reservation is invalid, so `Plan` replans it (it is not in `Result.Kept`). Because kept meals are classified in `newState` before the history is seeded, compute reservations after classifying (a Planned meal of R must not count as "already blocking" S while deciding the reservation). Order: classify with Planned meals tentatively kept, build history from LastPlanned and Pinned/Cooked only, compute reservations, then drop kept meals that violate one and add the remaining kept meals to history.

**Swap**: the same reservations apply when evaluating the Swap target; the reserved Recipe is not offered where it would block S (decision: no, test `TestSwapRespectsReservations`). Reservation is skipped for S when S is the Swap target (the User overrides the rule there; Swap on S ignores Slot Rules as before). Pinning a Recipe through the API is unchanged: pinned always wins.

## Code
- `internal/planner/reserve.go`: stub `func (st *state) reservedFor(i int, r Recipe) bool`. The developer computes the reservations once per walk (`[]reservation{slot int, recipe RecipeID, cooldown int}`) in `newState` and wires `reservedFor` into `evaluate` (all three of Plan, Regenerate, Swap) and `validPlannedFresh`. Pure planner only; no runner or API change, no type change.
- No UI change: the rule slot's existing "Couldn't plan" text applies when Pinned made it impossible.

## Tests
- `internal/planner/reserve_test.go` (red before the change): pizza/Friday for Plan and Regenerate; window = the Recipe's own Cool-down (3 vs 5 days); same-day lunch before the Friday dinner; Tag rule (one Recipe; archived and excluded Recipes do not count; two eligible reserve nothing; Recipe + Tag rules matching others reserve nothing); Pinned earlier pizza and `LastPlanned` void the reservation without blocking others; unpinned Planned pizza inside the window is replanned; Pinned/Cooked rule slot reserves nothing; no blocking of unrelated Recipes or later slots; two rules for one Recipe (earlier wins); Swap respects reservations. The "Pinned earlier" and "LastPlanned" tests already pass today (regression guards).
- `bdd/features/planning/slot_rule_reserve.feature`, new step `no alternative is the Recipe "..."`: five Recipes in a five-day horizon, so Friday only works if pizza is reserved.

## Workarounds to simplify (developer, optional)
- `internal/plan/runner/actions_test.go`: `TestASlotRuleFixesItsMealSlotAndGetsASlotRuleChip` (pins four days) and `TestPlanAfterARuleChangeReplansUnpinnedMealsThatBreakIt` (confirms Monday and Tuesday) pin days only to keep the rule's Recipe off earlier days; with reservation the pins are not needed. `bdd/features/planning/rules.feature` "A Slot Rule by Tag/Recipe" scenarios pin four days for the same reason.
