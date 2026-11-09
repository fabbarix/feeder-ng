-- T9: Shops, Products, barcodes, Weight Barcode Rules, Prices, purchases.
-- Needs 0200 (ingredients). Money is integer minor currency units.
CREATE TABLE shops (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    name_key   TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE products (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    pack_size     REAL NOT NULL CHECK (pack_size > 0),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX products_ingredient ON products(ingredient_id);

CREATE TABLE product_barcodes (
    code       TEXT PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX product_barcodes_product ON product_barcodes(product_id);

CREATE TABLE product_shops (
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    shop_id    INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, shop_id)
);

CREATE TABLE weight_barcode_rules (
    id             INTEGER PRIMARY KEY,
    shop_id        INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    prefix         TEXT NOT NULL,
    item_start     INTEGER NOT NULL,
    item_length    INTEGER NOT NULL,
    value_start    INTEGER NOT NULL,
    value_length   INTEGER NOT NULL,
    value_kind     TEXT NOT NULL CHECK (value_kind IN ('weight', 'price')),
    value_unit     TEXT NOT NULL DEFAULT '',
    decimal_places INTEGER NOT NULL,
    UNIQUE (shop_id, prefix)
);

CREATE TABLE shop_barcodes (
    id         INTEGER PRIMARY KEY,
    shop_id    INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    code       TEXT,
    rule_id    INTEGER REFERENCES weight_barcode_rules(id) ON DELETE CASCADE,
    item_code  TEXT,
    CHECK ((code IS NOT NULL AND rule_id IS NULL AND item_code IS NULL)
        OR (code IS NULL AND rule_id IS NOT NULL AND item_code IS NOT NULL)),
    UNIQUE (shop_id, code),
    UNIQUE (rule_id, item_code)
);
CREATE INDEX shop_barcodes_product ON shop_barcodes(product_id);

CREATE TABLE prices (
    id                 INTEGER PRIMARY KEY,
    product_id         INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    shop_id            INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    date               TEXT NOT NULL,
    price_cents        INTEGER CHECK (price_cents > 0),
    price_per_kg_cents INTEGER CHECK (price_per_kg_cents > 0),
    CHECK (price_cents IS NOT NULL OR price_per_kg_cents IS NOT NULL),
    UNIQUE (product_id, shop_id, date)
);
CREATE INDEX prices_shop_product_date ON prices(shop_id, product_id, date);

CREATE TABLE purchases (
    id         INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    shop_id    INTEGER REFERENCES shops(id) ON DELETE SET NULL,
    bought_on  TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX purchases_product_date ON purchases(product_id, bought_on);
