-- Stock Undo (beta.9, B9-05; SAFE-09). Additive only.
-- stock_waste.lot_json: the thrown-out Stock Lot as it was (id, dates, Kept on, Storage Place, Product, Shop), written by
-- Throw out so a same-day Undo puts it back with the same id. NULL for a discarded Leftover and for waste recorded
-- before this migration: that waste cannot be undone.
ALTER TABLE stock_waste ADD COLUMN lot_json TEXT;
-- scan_events.takes_json: what a Stock-take (-1 pack, Set total) took from each Stock Lot, as a JSON array of
-- {lotId, lot, taken}, so its Undo gives exactly that back. '[]' when it took nothing. A Set total that added Stock
-- records its new Lot in lot_id, as +1 pack does. NULL on a Stock-take from before this migration: a -1 pack or Set
-- total recorded then cannot be undone (a +1 pack can: its lot_id is there).
ALTER TABLE scan_events ADD COLUMN takes_json TEXT;
