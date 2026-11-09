# T3 planner-core: design

Scope: the PURE package `internal/planner` (stdlib only, no SQL, no HTTP, no `time.Now`), implementing functional-spec §3 (Planner Style), §7 (planner) and the planning side of §8 (actual Leftovers). Persistence, HTTP, events and the nightly trigger belong to the planning team, which maps database rows to `planner.Input` and `planner.Result` back to rows. Tests are table-driven in `internal/planner/*_test.go`; `types.go` and `planner.go` are the API stub (bodies `panic("TODO")`).

## Public API

```go
func Plan(in Input) (Result, error)               // fill empty slots; keep valid unpinned Planned meals
func Regenerate(in Input) (Result, error)         // also redo every unpinned, uncooked Planned meal
func Swap(in Input, key SlotKey) ([]Placement, error) // top 3 alternatives for one slot
func WeightsFor(style float64) Weights            // Planner Style -> weights
func JitterFor(seed int64, key SlotKey, recipe RecipeID, amplitude float64) float64
func PortionsNeeded(att []Attendee) float64
func BatchesFor(portions, yield float64) int
func DefaultConfig() Config
```

Types are in `types.go` (documented there). Highlights:
- **Dates** are `type Date string` (`YYYY-MM-DD`, household zone), matching the architecture contract; **instants** (`Now`, `Slot.At`) are `time.Time`. `Date("")` means "none".
- `Slot` = `Key{Date, MealSlotID}` + `At` + `Attendance []Attendee{MemberID, PortionFactor}` + `Rules []SlotRule{RecipeID | Tag}` + optional `Existing *ExistingMeal{State, RecipeID, Batches, From *LeftoverSource}`. `State` is `MealPlanned` (unpinned, uncooked), `MealPinned`, `MealCooked`, `MealSkipped`. All slots of the horizon (empty or not) are passed in one list; the planner orders them by `(At, MealSlotID)`.
- `Recipe` = Yield, Tags, Archived, `CooldownDays`/`UseByDays` overrides (`*int`), `Needs []Need{IngredientID, Quantity per Batch in Base Units, Optional}`, `AdvanceSteps []AdvanceStep{Lead}`.
- `Input` also carries: `Members map[MemberID]Preferences` (Favourites, Dislikes, ExcludedRecipes, ExcludedIngredients), `Lots []StockLot` (with `GoesOff`), `ShelfLifeDays`, `Packs map[IngredientID]Pack{ProductID, Size}` (last-bought Product), `Leftovers []Leftover` (actual, with remaining portions and Use-by), `LastPlanned map[RecipeID]Date`, `VarietyRules`, `Config`, `Seed`, `Style`, `Now`, and an optional `Weights` override (tests/diagnostics; when nil, `WeightsFor(Style)`).
- `Result` = `Placements` (Recipe or Leftover source, Batches, `NewLeftover{Portions, UseBy}`, per-placement `Purchases`, `Score`, `Terms`, `Why`), `Unfilled` (reason + elimination counts), `Kept` (unpinned Planned meals Plan left alone) and `Purchases` (aggregate per Ingredient for the whole walk, pack-rounded).
- **Why chips are structured**: `Why{Code ReasonCode, Value, MemberIDs, IngredientID, RecipeID, Tag, Date}`. Codes: `slot_rule`, `leftover`, `favourite`, `perishable_use`, `ingredient_overlap`, `stock_coverage`, `leftover_fits`, `best_available`. The frontend phrases them ("uses Monday's chicken" = `ingredient_overlap{chicken, Date=Mon}`, "spinach goes off Thu" = `perishable_use{spinach, Date=Thu}`, "Slot Rule: Friday" = `slot_rule{Tag}` plus the slot's weekday, "leftover from Tue" = `leftover{Date=Tue}`).
- **Unfilled** slots carry `Reason` (`no_attendance`, `no_candidates`) and `Eliminations{Considered, Exclusion, CoolDown, VarietyRule, AdvanceStep}`, so Today can say "every option was excluded or in cool-down".

## Algorithm (decisions marked **D**)

The walk is one chronological pass over all slots. State: projected Stock lots per Ingredient, pending Leftovers, and the history of fresh cooks (date per Recipe) used for cool-down, recency and Variety Rules.

**Pre-seed**: history starts from `LastPlanned` and from every fixed or kept fresh meal in the horizon, even those later than the slot being planned, so a Pinned Friday meal blocks the same Recipe on Wednesday. Skipped meals count for nothing; Leftover-served meals never restart cool-down (**D**).

**Existing meals as the walk reaches them**
- *Pinned* (always) and *Planned* (in `Plan`, if valid): consume projected Stock (shortfalls become planned purchases, and so feed Ingredient Overlap), and a fresh one adds a pending Leftover of `Batches x Yield - portions` with Use-by = date + UseByDays. A Leftover-served meal consumes portions from its source.
- *Cooked*: nothing is consumed (ADR 0003: Stock was already deducted) and no Leftover is invented: the actual Leftover is in `Input.Leftovers` (§8.2). *Skipped*: nothing at all, so Leftover meals that depended on it lose their source.
- **D** A *Planned* meal is **invalid** and replanned (by `Plan`) if its Recipe is unknown/archived, an attending Member now has an Exclusion on it, `Batches x Yield` no longer covers the attendance, or its Leftover source no longer exists or no longer holds enough portions (actual Leftover smaller than planned, source skipped; §8.3). If the actual Leftover is larger, the extra is simply pending and later empty slots use it. Pinned meals are never dropped, even if their source vanished (a missing source is clamped to 0).

**Empty slot** (no `Existing`, or Planned in `Regenerate`/dropped):
0. `portions = sum(PortionFactor)`; `<= 0` gives `Unfilled{no_attendance}`.
1. *Leftover first* unless the slot has any Slot Rule (**D**: any rule claims the slot, even if the Leftover's Recipe matches it). A pending Leftover is eligible if its Recipe is known, remaining portions `>= portions`, `slot date <= UseBy`, it was produced by an earlier slot (`source.At < slot.At`; actual Leftovers are always available), and no attendee has an Exclusion on the Recipe or any of its Ingredients (optional lines included). Dislikes, cool-down and Variety Rules do not apply. Place the soonest Use-by (ties: actual before planned, then lowest id / earliest source). The remainder `(remaining - portions)` stays pending with the same Use-by (**D**). Chip: `leftover`.
2. *Candidates*: non-archived Recipes with `Yield > 0`; if the slot has Slot Rules, only Recipes matching ANY rule (by id or Tag). Then filters, each candidate counted once in `Eliminations` by the first that removes it:
   1. *Exclusion*: any attendee (factor > 0) excludes the Recipe or any of its Ingredients (optional lines included, because of allergies).
   2. *Cool-down*: `|slotDate - d| < cooldown` for any fresh-cook date `d` of the Recipe (history, fixed meals, earlier placements, past or future). `cooldown` = Recipe override else `Config.DefaultCooldownDays`. Exactly `cooldown` days apart is allowed.
   3. *Variety Rule*: for each rule on one of the Recipe's Tags: `MaxPerWeek` counts fresh meals with that Tag in the same ISO week (Mon-Sun) (**D**), `NotConsecutiveDays` forbids a fresh meal with the Tag on the day before or after. Same-day meals only count towards the weekly cap. Served-from-Leftover meals do not count (**D**).
   4. *Advance Step*: `slot.At - lead < Now` for any Advance Step (equality is allowed).
   A Slot Rule never falls back: if its candidates are all filtered out, the slot is `Unfilled{no_candidates, SlotRuleClaimed: true}`.
3. *Score* = sum of terms (zero terms are omitted from `Placement.Terms`). Per candidate, `batches = BatchesFor(portions, yield)`, needs are non-optional lines `x batches`, and "available" means projected lots with `GoesOff == "" || GoesOff >= slotDate`:
   - `Favourite x count(attendees who favourite it)`; `Dislike x count(attendees who dislike it)` (the weight is negative).
   - `PerishableUse x share`, `StockCoverage x share`, `IngredientOverlap x share`. **D** `share` = mean over the non-optional lines of `min(1, covered / need)` (unit-free, so grams and pieces do not mix); no non-optional lines gives 0. `covered` is: for perishable use, the sum of **at-risk** available lots, where at-risk means `GoesOff != ""` and `GoesOff <= slotDate + PerishWindowDays` (**D**: the spec's "before the next time those lots could be used" needs look-ahead; it is approximated by a 2-day window, tunable in `Config`); for stock coverage, all available lots (planned-purchase remainders included); for overlap, only available lots that are **pack remainders of planned purchases** (a lot created by this run's rounding-up; plain Stock is not overlap, so overlap is a subset of coverage). Planned-purchase lots are bought on the date of the meal that triggered them (**D**) and go off `ShelfLifeDays` later if known.
   - Extra portions: `s = batches x yield - portions`. `s == 0` contributes 0. Else `LeftoverFits` if some **later** slot (by `At`) is still to be filled (empty in this run; not Pinned/Cooked/Skipped/kept, not claimed by a Slot Rule), has `slotDate <= UseBy`, needs `<= s` portions and none of its attendees has an Exclusion on the Recipe; otherwise `LeftoverWasted`. Use-by = slot date + (Recipe `UseByDays` else `Config.DefaultUseByDays`).
   - `Recency x recentness`: `recentness = 1 - min(days, RecencyDays) / RecencyDays` where `days` is the gap to the most recent fresh-cook date **before** the slot (0 if never; `RecencyDays` = 28). The weight is negative, so recent Recipes lose and the term is never positive.
   - `Jitter`: `JitterFor(seed, slotKey, recipeID, weights.Jitter)`, uniform in `[-J, +J]`, from a hash of the arguments (no `math/rand`, stable across Go versions and independent of candidate order). Different seeds change the plan; the same seed never does.
4. *Pick* the highest total; ties go to the lowest Recipe id (so with all weights zero the lowest id wins, which tests rely on). Then: `Batches = BatchesFor(...)`; `NewLeftover` if `> 0` (cooked date + Use-by days); consume projected Stock soonest-go-off first, then oldest purchase, then lot id; for each Ingredient short by `x`: with a `Pack` for it, buy `ceil(x / size)` packs (a planned lot of the full bought amount is added, then consumed, leaving the remainder), without one buy exactly `x` and leave no remainder. Record `Purchase{Shortfall, Packs, PackSize, Quantity}` on the placement and merge into `Result.Purchases` (ordered by IngredientID).
5. *Why chips*: chip candidates are the positive terms among Favourite, PerishableUse, IngredientOverlap, StockCoverage, LeftoverFits (Dislike, LeftoverWasted, Recency and Jitter are never chips). Sort by value desc (ties: that order), take 3. A Slot Rule placement puts `slot_rule` first and takes at most 2 more. If nothing remains, the single chip is `best_available`. Parameters: favourite lists the attending Members who favourite it (sorted); perishable use names the Ingredient with the largest at-risk covered fraction and its earliest at-risk go-off date; overlap names the Ingredient with the largest remainder-covered fraction and the date of the slot whose purchase left the pack; leftover-fits has the date of the first later slot that fits.

**Swap**: runs the same walk on the given `Input` as the current plan state: the target slot's `Existing` is treated as empty, every other existing meal stays as is. It evaluates the target's candidates exactly as step 2 and 3 (so context such as an earlier Pinned meal's Stock use, cool-down and later fitting slots is honoured), minus the current Recipe, and returns the top 3 by score (ties: lowest id) as `Placement`s with Batches, NewLeftover, Purchases and Why. **D** Slot Rules are ignored (the User is overriding them), Leftovers are not offered. Errors: `ErrUnknownSlot`, `ErrSlotNotSwappable` (Cooked or skipped). The caller pins the choice and calls `Plan`/`Regenerate`-style replanning of downstream slots (§7.3): it sets the downstream unpinned slots' `Existing` to nil (or uses `Regenerate`).

## Planner Style presets (**D**)

`Style` in [0,1]; clamped; NaN means 0.5. Piecewise linear between three anchors:

| Weight | 0 Use what we have | 0.5 Variety (spec) | 1 Favourites |
|---|---|---|---|
| Favourite (per Member) | 2 | **3** | 5 |
| Dislike (per Member) | -2 | **-2** | -2 |
| PerishableUse | 6 | **4** | 2 |
| IngredientOverlap | 3 | **2** | 1 |
| StockCoverage | 2 | **1** | 0.5 |
| LeftoverFits | 1 | **1** | 1 |
| LeftoverWasted | -1 | **-1** | -1 |
| Recency | -0.25 | **-0.5** | -0.25 |
| Jitter amplitude | 0.5 | **0.5** | 0.5 |

The middle anchor reproduces the spec's weights exactly. "Use what we have" boosts perishable use, overlap and coverage; "Favourites" boosts the Favourite weight; recency is strongest in the middle ("Variety"), which is how the spec's "Variety boosts recency" is realised with the middle preset fixed to the spec numbers.

## Package layout

```
internal/planner/types.go       all exported types and constants (stub, done)
internal/planner/planner.go     Plan, Regenerate, Swap, WeightsFor, JitterFor, PortionsNeeded, BatchesFor (stubs)
internal/planner/*_test.go      weights, leftover, candidates, score, batches (purchases, projected Stock), why, unfilled, swap, plan (existing meals, section 8, determinism)
```
The developer may add unexported files (`state.go`, `candidates.go`, `score.go`, `stock.go`, `why.go`) but must not change exported signatures without telling the designer. The package is covered by unit tests only; the planning team adds the HTTP layer and BDD later.

## Conventions
- Tests isolate one score term by passing `Input.Weights` with only that weight set; with all-zero weights the lowest Recipe id wins ties.
- Epsilon `1e-9` on portion and quantity comparisons (`BatchesFor(0.9, 0.3) == 3`).
- No goroutines, no global state, no input mutation; output order is fully determined.

Naming note: the spec says 'surplus' but GLOSSARY lists Surplus under _Avoid_ for Leftover, so the Go names are `NewLeftover`, `LeftoverFits`, `LeftoverWasted`.
