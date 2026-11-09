-- T13: Shopping List extras and ticks, and the Scan ledger. Quantities are Base Units; money is integer minor units;
-- dates are household-time YYYY-MM-DD; instants are RFC 3339 UTC.

-- A manual extra: free text ("toilet paper") or an Ingredient with a quantity. Not tied to the plan.
-- It stays until it is ticked (kept for the rest of that household day) or deleted.
CREATE TABLE shopping_extras (
    id            INTEGER PRIMARY KEY,
    text          TEXT,
    ingredient_id INTEGER REFERENCES ingredients(id),
    quantity      REAL CHECK (quantity IS NULL OR quantity > 0),
    got           REAL NOT NULL DEFAULT 0 CHECK (got >= 0),   -- Scanned or ticked so far (Ingredient extras)
    created_at    TEXT NOT NULL,
    ticked_on     TEXT,                                        -- household date it was ticked, NULL = open
    CHECK ((text IS NOT NULL AND ingredient_id IS NULL AND quantity IS NULL)
        OR (text IS NULL AND ingredient_id IS NOT NULL AND quantity IS NOT NULL))
);

-- Ticked state per Ingredient for one list range (identified by the range's last date).
CREATE TABLE shopping_ticks (
    range_to      TEXT    NOT NULL,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    needed        REAL    NOT NULL CHECK (needed >= 0),        -- the line's quantity when it was ticked
    by            TEXT    NOT NULL CHECK (by IN ('scan', 'hand')),
    lot_id        INTEGER,                                     -- Stock Lot a tick by hand added (informational, no FK)
    ticked_at     TEXT    NOT NULL,
    PRIMARY KEY (range_to, ingredient_id)
);

-- Every applied operation from the phone, keyed by the client UUID (idempotency, Undo, summary).
CREATE TABLE scan_events (
    client_uuid     TEXT PRIMARY KEY,
    kind            TEXT NOT NULL CHECK (kind IN ('shop_scan', 'shop_unknown', 'stock_take')),
    scanned_at      TEXT NOT NULL,                             -- the phone's timestamp
    applied_at      TEXT NOT NULL,
    seq             INTEGER NOT NULL,                          -- application order
    shop_id         INTEGER,
    product_id      INTEGER,
    ingredient_id   INTEGER,
    quantity        REAL,
    price_cents     INTEGER,
    range_to        TEXT,
    on_list         INTEGER NOT NULL DEFAULT 0,
    ticked          INTEGER NOT NULL DEFAULT 0,                -- this event ticked the line
    lot_id          INTEGER,
    purchase_id     INTEGER,
    sold_at_added   INTEGER NOT NULL DEFAULT 0,                -- this event made the Product "sold at" the Shop
    price_id        INTEGER,                                   -- the Price this event wrote
    prev_price_json TEXT,                                      -- the Price it replaced on the same day, to restore on Undo
    product_created INTEGER NOT NULL DEFAULT 0,
    merged_into     INTEGER,
    result_json     TEXT NOT NULL,
    undone_at       TEXT
);
CREATE INDEX scan_events_range ON scan_events(range_to);
