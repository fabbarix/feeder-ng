-- T10: Stock Lots and waste records. Quantities are Base Units; dates are household-time YYYY-MM-DD.
CREATE TABLE stock_lots (
    id            INTEGER PRIMARY KEY,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    quantity      REAL    NOT NULL CHECK (quantity > 0),
    purchased     TEXT    NOT NULL,
    goes_off      TEXT,
    source        TEXT    NOT NULL CHECK (source IN ('scan', 'stock_take', 'manual')),
    product_id    INTEGER,
    shop_id       INTEGER,
    client_uuid   TEXT UNIQUE,
    created_at    TEXT    NOT NULL
);
CREATE INDEX stock_lots_ingredient ON stock_lots (ingredient_id);

CREATE TABLE stock_waste (
    id            INTEGER PRIMARY KEY,
    ingredient_id INTEGER REFERENCES ingredients(id),
    quantity      REAL    NOT NULL CHECK (quantity >= 0),
    wasted_on     TEXT    NOT NULL,
    reason        TEXT    NOT NULL CHECK (reason IN ('spoiled', 'leftover_expired')),
    lot_id        INTEGER,
    created_at    TEXT    NOT NULL
);
CREATE INDEX stock_waste_ingredient ON stock_waste (ingredient_id);
