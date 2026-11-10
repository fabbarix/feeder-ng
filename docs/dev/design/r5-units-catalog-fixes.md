# R5 units-catalog-fixes (round 2: B9, B11)

## B9 Imperial display

Storage and API stay metric (functional-spec section 14: imperial is display only).

Rule, in `web/src/lib/units.ts` (pure):

| Case | Function | Result |
|---|---|---|
| Quantity (Base Units): stock, shopping, scan | `formatQuantity` | unchanged |
| Quantity as written (recipe line, Step use) | new `formatLineQuantity(quantity, unit, system)` | only metric mass/volume units (g, kg, ml, l, dl, cl) convert to imperial through `formatQuantity`; every other unit (tsp, tbsp, cup, piece, an Ingredient's own conversion unit) is shown as written, in both systems. "2 tbsp" stays "2 tbsp". Numbers: max 2 decimals. Metric: g/ml through `formatQuantity`, others as written. |
| Unit Conversion label | `formatConversion` | imperial base side is always oz (g) or fl oz (ml), 1 decimal (2 decimals when 1 would show 0), never tsp/tbsp/cup and never lb: "1 cup = 8.1 fl oz", "1 clove = 0.2 oz". Piece unchanged. Storage and the amount input stay metric. |
| Product pack size | `formatPackSize(size, base, system = 'metric')` (products/lib/names.ts) | metric as before (2 decimals); imperial delegates to `formatQuantity` ("700 g" -> "1 lb 9 oz"). `defaultProductName` stays metric always (it is stored text). |

Display sites:
- ingredients: `ConversionEditor` (via `formatConversion`, fixed in the lib), `MergeConflictList` (already `formatQuantity`).
- products: `ProductList` gets a `system` prop (callers: `ProductsScreen`, `IngredientProducts` pass `useDisplayUnitSystem()`); `ProductScreen` pack-size header uses `formatPackSize(..., system)`. The pack-size input label stays the metric Base Unit.
- recipes (not owned by R5, one small shared edit): `recipes/lib/lineUnits.ts quantityText` is the path that produced "0.4 oz" (it converted every unit to its Base Unit). It must delegate to `formatLineQuantity`; it is also used by `cook/hooks/useFormatUse.ts` (no change needed there). Red test added in `lineUnits.test.ts`.
- other users of `formatQuantity` (shop, stock, scan, import) show Base Unit quantities and are correct.

## B11 Merge navigation and ids

Frontend (round 3, realistic case): removing the source queries and then `await`ing the `['ingredients']` refetch is not enough. The refetched list no longer contains the source, so the still-mounted source screen re-renders while `useIngredient(source)` and the merge-preview query are mounted; they rebuild the removed queries and fetch them (404s) before navigation. Fix: `merge(onMerged?: (survivor: Ingredient) => void)` calls `onMerged(survivor)` immediately after the POST succeeds (the caller navigates to the survivor, which unmounts the source screen), THEN `removeQueries({ queryKey: ['ingredients', sourceId] })`, THEN `void client.invalidateQueries({ queryKey: ['ingredients'] })` (not awaited, so nothing waits on a refetch with the source screen mounted). `MergeSheet` passes its navigate to the survivor as `onMerged` instead of navigating after `merge()` resolves. Red test: the "merge from a mounted source screen" case in `useMergeFlow.test.tsx` (list without the source after the merge, `useIngredient(4)` + `useMergeFlow(4)` mounted, navigation unmounts them; asserts `api.get(4)` and `mergePreview` are never called, and navigation to 9 happens).

Frontend (earlier rule, kept): `useMergeFlow.merge()` must `removeQueries({ queryKey: ['ingredients', sourceId] })` (covers the detail, merge-preview, any sub-keys) BEFORE invalidating `['ingredients']`, so the deleted source is never refetched (no 404 polling); the target and list are refreshed. `MergeSheet`/`IngredientScreen` already navigate to the survivor; with the source gone from the cache the stale page can no longer flash.

Ids: SQLite reuses the largest rowid + 1 for plain `INTEGER PRIMARY KEY`. Migration `internal/db/migrations/1100_autoincrement.sql` rebuilds, with `INTEGER PRIMARY KEY AUTOINCREMENT`: ingredients, recipes, products, shops, members, meal_slots, planned_meals, stock_lots (the ids that URLs, caches, SSE payloads and shopping/scan state point at). Not rebuilt: join/child tables (composite keys), leftovers, stock_waste, scan_events, prices, purchases, tags, cook_timers (their ids are not linked from clients across deletes; the rebuild risk is not worth it). Justification: 8 tables, all with simple DDL and no triggers/views of their own; the one trigger lives on `users` (untouched).

Runner change (`internal/db/db.go`): `PRAGMA foreign_keys` is a no-op inside a transaction, and `DROP TABLE` with foreign_keys=ON deletes/cascades child rows, so the rebuild needs foreign_keys OFF. A migration whose first line is `-- feeder:foreign-keys=off` runs on one dedicated `*sql.Conn`: `PRAGMA foreign_keys=OFF`, `BEGIN`, body, `INSERT schema_migrations`, `PRAGMA foreign_key_check` (any row -> rollback and fail naming the file), `COMMIT`, then `PRAGMA foreign_keys=ON` again in a `defer` (also on failure, before the conn returns to the pool). Other files keep the current path.

Rebuild procedure per table (documented SQLite 12-step): `CREATE TABLE x_new (... AUTOINCREMENT ...)` with the exact current DDL (take it from `sqlite_master`, since constraints, CHECKs, UNIQUEs and COLLATEs must match), `INSERT INTO x_new SELECT <explicit columns> FROM x`, `DROP TABLE x`, `ALTER TABLE x_new RENAME TO x`, recreate the table's indexes. Order does not matter with foreign keys off; children keep referring to "x" by name. `sqlite_sequence` is seeded by the copy (max(id)), so new ids continue above the highest surviving id. Ids that were already freed before the migration cannot be recovered; the guarantee starts at the migration.

## Tests (red)
- `web/src/lib/units.test.ts`: `formatLineQuantity`, new imperial `formatConversion` labels.
- `web/src/features/products/lib/names.test.ts`, `components/ProductList.test.tsx`: imperial pack sizes.
- `web/src/features/recipes/lib/lineUnits.test.ts`: `quantityText`.
- `web/src/features/ingredients/hooks/useMergeFlow.test.tsx`: source queries dropped, never refetched.
- `internal/db/autoincrement_test.go`: runner directive (children survive, FK check rolls back, foreign_keys back ON), rebuild keeps data/ids/FKs/indexes/cascades, ids not reused after delete.
