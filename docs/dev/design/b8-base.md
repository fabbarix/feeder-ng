# beta.8, team base: two Base recipe follow-ups

Source: `docs/dev/design/base-recipes.md` (sections 3.2, 9 and 11.3, updated with this note).

## 1. keptLines in the take-over ask

**What.** The take-over ask of Import Review ("An Ingredient named béchamel exists ... Should the new Base recipe Béchamel take it over?", and the Confirm-time dialog "Béchamel (Base recipe) has the name of an Ingredient. Take it over?") says how many other lines of the import stay Ingredient lines, so the User sees what Yes does to them.

**Why.** After a Yes there is no plain Ingredient left, so a file line kept as an Ingredient, or one no tile asks about, lands on the Base recipe too (design 11.3, Commit). The review only said so for the line the User had answered *keep*. The client cannot count lines: name matching lives in the server.

**Server.**
- `recipefile.TakeOverAsk` gains `KeptLines int` (`json:"keptLines"`, always present, 0 when none). Counted in `buildTakeOvers`: lines of kept (not skipped) file Recipes whose `units.NormalizeName(line.Ingredient)` equals the plain Ingredient's key, excluding lines answered with a Base recipe (use, file, create, convert). A *keep* answer counts, and so does a line with no tile. Lines of stored Recipes are not counted (the ask's `recipes` names them).
- `recipe.TakeOverError` gains `KeptLines int`; `httpapi.WriteTakeOver` writes `keptLines` (always). The editor leaves it 0. The import Confirm's 409 (`recipefile/httpapi` `writeApplyError`) should fill it from the plan's count for that ask when the handler has it; otherwise it stays 0 and the dialog shows no note.

**Web.**
- `ImportTakeOverAsk.keptLines: number` (web/src/features/import/types.ts); `TakeOverAsk.keptLines?: number` (web/src/lib/baseRecipes/types.ts, optional: the editor and older answers have none). Both type changes and the fixture default are already in the test commit.
- `keptLinesNote(keptLines: number | undefined, baseName: string): string | null` in `web/src/lib/baseRecipes/takeOver.ts` (pure). `parseTakeOver` carries `keptLines`; `takeOverDialog(...)` gains `note?: string` (undefined when 0 or absent) and `TakeOverDialog` renders it as a paragraph after the body.
- `TakeOverQuestion` renders the note under the question and the answer cards, only when `keptLines > 0`, in the same `base-take-over__text` paragraph style. No logic in the component: it calls `keptLinesNote(ask.keptLines, ask.name)`.

**Copy** (exact):
- 1 line: `1 other line in this import stays an Ingredient. With Yes it uses Béchamel too; with No it keeps the Ingredient.`
- n lines: `3 other lines in this import stay an Ingredient. With Yes they use Béchamel too; with No they keep the Ingredient.`
- The Base recipe's name is `ask.name` (tile) or `baseName` (dialog). Shown whatever the answer, and also when Yes is not offered (not convertible).

## 2. A gone-off jar is not cover

**Decision (main session).** Cook Mode's cover check ignores Stock Lots that have gone off by the meal date, matching the Shopping List (`internal/shopping` `draw`: a Lot is skipped when its go-off date is before the date). A Lot with no go-off date never goes off; one that goes off on the meal date is still usable that day. **Cooked's deductions are unchanged** (the BDD "Cooked uses up a gone-off Lot - streak stays reset" stays as it is).

**Rule, one function.** `stock.UsableOn(lots []Lot, date Date) map[int64]float64` in `internal/stock`: per Ingredient the quantity of Lots with `Quantity > 0` and `GoesOff.IsNone() || GoesOff >= date`. The shopping draw may call it too but need not change.

**Cook Mode** (`internal/cook/service`):
- `MealRecipes.MealSteps(ctx, recipeID, batches, date string)` gets the meal's date; `SlotMeal` gains `Date string`. The service passes the Planned Meal's date everywhere it already passes Batches (CourseView, SlotTimeline, timers and marks on a meal scope, the board's next Advance Step). `Steps` (a Recipe on its own) is unchanged.
- The adapter replaces `stockOnHand` (sum of every Lot) with `stock.UsableOn` over the Lots (read `goes_off` too) at the date `max(meal date, household today)`, the Shopping List's `drawDate` clamp: a past meal is judged by today. `SlotSteps` builds one pool per call as now; all its meals share a slot, hence a date.

**Notification facts** (`internal/notify/facts`): `stockOnHand(lots)` becomes per date: the pool of a slot occurrence (`slotKey{date, slot}`) is cloned from `stock.UsableOn(lots, effective date)` instead of one shared `have`. The facts' `today` is the household's today, so the same `max(date, today)` applies. Result: Start cooking matches the timeline `startAt` in every case.

**Unchanged:** Cooked's deductions (`baserecipe.Resolve` over all Lots), the Shopping List, the streak.

## Tests (red until implemented)

| Area | File | Command |
|---|---|---|
| keptLines, domain | `internal/recipefile/b8_keptlines_test.go` | `go test ./internal/recipefile/` |
| keptLines on the 409 | `internal/recipe/httpapi/b8_takeover_test.go` | `go test ./internal/recipe/httpapi/` |
| UsableOn | `internal/stock/usableon_test.go` | `go test ./internal/stock/` |
| Cook Mode cover | `internal/cook/service/b8_goneoff_test.go` (and the signature updates in `br_g_test.go`, `br_g_round2_test.go`) | `go test ./internal/cook/service/` |
| Facts | `internal/notify/facts/b8_goneoff_test.go` | `go test ./internal/notify/facts/` |
| Web note | `web/src/features/import/components/TakeOverQuestion.test.tsx`, `web/src/lib/baseRecipes/takeOver.test.ts`, `web/src/features/recipes/components/TakeOverDialog.test.tsx` | `cd web && pnpm vitest run src/features/import src/lib/baseRecipes src/features/recipes/components/TakeOverDialog.test.tsx` |
| BDD | `bdd/features/import-export/b8_take_over_kept_lines.feature`, `bdd/features/cook-board/b8_base_cook_gone_off.feature`, `bdd/features/notify-ops/b8_base_reminders_gone_off.feature`, steps in `bdd/steps_beta8_base_test.go` | `GODOG_TAGS=@b8-base go test ./bdd/` |
