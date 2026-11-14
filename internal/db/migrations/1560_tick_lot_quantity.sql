-- Undo of a tick takes back the Stock it added (beta.8, undo; ADR 0019, docs/dev/design/b8-undo.md). Additive only.
-- lot_quantity is the quantity the tick added to its Lot. NULL on a tick from before this migration: Undo then takes
-- back the Lot's whole current quantity. An Ingredient extra's tick records its Lot and quantity the same way; an extra
-- ticked before this migration has no Lot, so Undo takes nothing.
ALTER TABLE shopping_ticks ADD COLUMN lot_quantity REAL;
ALTER TABLE shopping_extras ADD COLUMN tick_lot_id INTEGER;
ALTER TABLE shopping_extras ADD COLUMN tick_lot_quantity REAL;
