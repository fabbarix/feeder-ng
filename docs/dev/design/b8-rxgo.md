# b8-rxgo: no orphan Ingredient after a failed receipt apply; one live-key rule

## 1. The orphan Ingredient

What the apply creates (`scan/service/receiptplan.go`, `createProduct`): for an accepted Add, `Ingredients.Ensure` finds
the Ingredient by name or creates it (food or Supply), then `Catalogue.CreateProduct` makes the Product. The step's
inverse is `delete_product`, which removes the Product only. The put-back (`putBack`, reverse order of the steps that did
something) therefore left a *new* Ingredient (or Supply) behind: the real-app test
`TestAFailedApplyLeavesNoNewIngredientInTheList` shows it. Two more leaks: `CreateProduct` failing right after `Ensure`
created the Ingredient (the step has no compensation, so nothing ran), and a pre-existing Ingredient found by name must
never be removed.

Decision: the put-back removes what this run created, rather than one transaction. The apply is a sequence of ports over
several stores with a ledger and a Shopping List publishing in between; a single SQL transaction would cut across all of
them. The domain stays free of SQL.

Port change (`scan/service.Ingredients`, adapter `ingredientsPort` in `scan/httpapi/wiring.go`; `Ensure` stays for the
unknown-barcode path):

- `EnsureNew(ctx, name, baseUnit, kind) (id int64, created bool, err error)`: Ensure that says whether it created the row.
- `DeleteUnused(ctx, id) (deleted bool, err error)`: removes the Ingredient only when nothing references it. The adapter
  calls `ingredientstore.Store.Delete` and maps `ErrInUse` (and `ErrNotFound`) to `false, nil`.

Service change (`createProduct` and the step compensation): `createProduct` also returns `createdIngredient` (id, 0 for
none). The step's compensation is `delete_product` and, only when the Ingredient was created in this run, then
`DeleteUnused(ingredientID)`, after the Product, so the Product no longer references it. If `CreateProduct` fails after
`EnsureNew` created the Ingredient, the step calls `DeleteUnused` itself before returning the error (its error, if any,
is joined into the step's error). An Ingredient chosen by id, found by name, or referenced by something else by then
(`false, nil`) is never removed and is not an error. A `DeleteUnused` error is a put-back error (`Compensation`), like
any other inverse. If `delete_product` fails, the Ingredient is still referenced and stays: reported as before.

The scan ledger and the put-back (review). The run's new scans are put back by Undo, which marks them undone but keeps
their rows (their uuids stay taken, so a retry writes under `#n`, receipt-reading §7.2), and the scan ledger's reference
mover (`scan/store.Mover.Count`) counts every row, undone ones included. So the undone scans kept the new Ingredient "in
use". Options weighed: (a) count only live scans: rejected, it would change the delete and Merge protection for every
Ingredient, letting a user delete one that undone history rows still point at; (b) delete the run's undone rows: rejected,
it frees their uuids and breaks the `#n` retry rule; (c) chosen: keep `Count` protective and let the put-back release only
its own rows. `scan/store.Store.ReleaseIngredient(uuids, ingredientID)` sets `ingredient_id = NULL` on the rows among
`uuids` that reference that Ingredient **and are undone**; `undoProduct` calls it with the uuids of the new scans this run
applied (`planRun.written`), just before `DeleteUnused`. A scan whose Undo failed is not undone, keeps the reference (its
retried Undo needs it) and so keeps the Ingredient. Safe for the readers of undone rows: `scan_events.ingredient_id` has no
foreign key; Undo returns "already undone" before it reads the Ingredient; Merge's `Move` re-points by id, and a NULL is
never moved; the receipt `undone` answer, the session loader and Totals skip undone rows or read only the uuid.
The service fakes now count the scan ledger as a reference (`store.Mover.Count` on the fake env's database), as the real
store does, so the fake tests catch the leak too; `scan/store` has a unit test for the release.

No SQL schema, API or UI change; the 500 `receipt_apply_failed` answer is unchanged. No BDD scenario: the effect is
invisible unless a step fails, and a failure cannot be injected through the UI. The Go tests cover it twice, on fakes
(`internal/scan/service/receiptplan_orphan_test.go`) and on the real app and SQLite (`internal/scan/httpapi/receipt_test.go`).

Existing test changed: `TestAFailureWhilePuttingBackStillRunsTheOtherInverses` expects, when `DeleteProduct` fails, that
the Product and the Ingredient it references both stay (two leftovers, was one). The fake snapshot now lists Ingredients,
which is how `TestAFailureAtEachStepKindPutsBackEverythingAlreadyDone` catches the leak.

## 2. The API key variable names

Read today: `FEEDER_ANTHROPIC_KEY` (four live tests), `FEEDER_LIVE_ANTHROPIC_KEY` (the Recipe Assistant smoke test and
`docs/dev/design/ai-recipe-import.md`), and `ANTHROPIC_KEY` only in the repo's `.env.local` (so the receipt live test
skipped). Nothing in `cmd/`, `scripts/` or the app reads them; the app keeps its key sealed in the store.

Rule: new package `internal/testkit/anthropickey` with `Lookup() (key, source string)` and `SkipReason() string`. The key
is the first non-empty, trimmed value of `FEEDER_ANTHROPIC_KEY`, `FEEDER_LIVE_ANTHROPIC_KEY` (alias), `ANTHROPIC_KEY`
(the `.env.local` name). `source` and the skip reason carry names, never values. The five live tests call `Lookup()` and
`t.Skip(anthropickey.SkipReason())`. Documented in `docs/dev/live-tests.md` (new). `scripts/test/live-key-env_test.sh`
guards the rule: no other file reads the names, the live tests use the package, the docs name every variable, and no
live test formats `key` into output.

`docs/design/receipt-reading.md` lines 252-253 name `FEEDER_ANTHROPIC_KEY` and `FEEDER_LIVE_ANTHROPIC_KEY` (still valid
as aliases); that file is rxweb's, so a pointer to `docs/dev/live-tests.md` there is for the main session.

## Files and tests

Developer may touch: `internal/scan/service/service.go` (port), `internal/scan/service/receiptplan.go`,
`internal/scan/httpapi/wiring.go`, `internal/testkit/anthropickey/anthropickey.go` (new), the five live tests
(`internal/receipt/service/live_read_test.go`, `internal/recipeassistant/service/live_read_test.go`,
`internal/recipeassistant/claude/{live_test,live_schema_test,live_receipt_schema_test}.go`: replace the env read only),
and update the comment in `receiptplan_test.go` header if wanted.

Tests (failing now): `internal/scan/service/receiptplan_orphan_test.go`, the existing failure tests in
`receiptplan_test.go` (snapshot now includes Ingredients), `TestAFailedApplyLeavesNoNewIngredientInTheList` in
`internal/scan/httpapi/receipt_test.go`, `internal/testkit/anthropickey/anthropickey_test.go`,
`scripts/test/live-key-env_test.sh`.
