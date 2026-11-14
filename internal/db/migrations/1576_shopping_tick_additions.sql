-- Ticks by addition (beta.9, B9-23; SSP-01, SSP-02, RES-03, ADR 0023 and 0024). Additive plus a data move.
-- A Line (or an Ingredient extra) can be ticked more than once: each tick is an addition with its own Stock Lot, the
-- quantity it put into Stock, the Line quantity it covered (Q0), who made it and the client UUID that makes a retried or
-- queued tick idempotent. shopping_ticks stays the Line's ticked state: `needed` is the largest `covers` of its
-- additions and `by` is the first addition's.
--   range_to + ingredient_id: an addition to an Ingredient Line of that range; extra_id (range_to NULL): to an extra.
--   lot_id NULL: the addition put no Stock Lot into Stock (Tick without adding, or taken back). No FK: the Lot may be gone.
--   quantity NULL: a tick from before migration 1560; Take back then takes what is left of the Lot.
--   used: with no Stock Lot (lot_id NULL), how much of what the addition put into Stock was used (by a Cooked Planned
--     Meal) before its Lot went: a Change or the Undo of a Take back puts back only the rest, so Stock is never doubled.
--   by: 'hand', or 'scan' for the addition a Scan made when its Stock Lot ticked the Line.
--   ticked_at: when the User ticked (the phone's time for a queued tick); synced_at: when a queued tick synced, else NULL.
CREATE TABLE shopping_tick_additions (
    id            INTEGER PRIMARY KEY,
    range_to      TEXT,
    ingredient_id INTEGER REFERENCES ingredients(id),
    extra_id      INTEGER REFERENCES shopping_extras(id) ON DELETE CASCADE,
    by            TEXT    NOT NULL DEFAULT 'hand' CHECK (by IN ('hand', 'scan')),
    lot_id        INTEGER,
    quantity      REAL    CHECK (quantity IS NULL OR quantity >= 0),
    covers        REAL    NOT NULL DEFAULT 0 CHECK (covers >= 0),
    used          REAL    NOT NULL DEFAULT 0 CHECK (used >= 0),
    user_id       INTEGER,
    client_uuid   TEXT    UNIQUE,
    ticked_at     TEXT    NOT NULL,
    synced_at     TEXT,
    CHECK ((ingredient_id IS NOT NULL AND range_to IS NOT NULL AND extra_id IS NULL)
        OR (extra_id IS NOT NULL AND ingredient_id IS NULL))
);
CREATE INDEX shopping_tick_additions_line ON shopping_tick_additions (range_to, ingredient_id);
CREATE INDEX shopping_tick_additions_extra ON shopping_tick_additions (extra_id);

-- Every tick by hand of a Line becomes its first addition, with the Stock Lot and quantity it recorded (a tick of 0 has
-- none). A Scan's tick from before this migration does not know its Stock Lot: it keeps no addition.
INSERT INTO shopping_tick_additions (range_to, ingredient_id, by, lot_id, quantity, covers, ticked_at)
SELECT range_to, ingredient_id, 'hand', lot_id, CASE WHEN lot_id IS NULL THEN 0 ELSE lot_quantity END, needed, ticked_at
FROM shopping_ticks WHERE by = 'hand';

-- Every ticked Ingredient extra likewise. An extra records only the day it was ticked: its addition is set at midnight UTC.
INSERT INTO shopping_tick_additions (extra_id, by, lot_id, quantity, covers, ticked_at)
SELECT id, 'hand', tick_lot_id, CASE WHEN tick_lot_id IS NULL THEN 0 ELSE tick_lot_quantity END, quantity,
       ticked_on || 'T00:00:00Z'
FROM shopping_extras WHERE ticked_on IS NOT NULL AND ingredient_id IS NOT NULL;
