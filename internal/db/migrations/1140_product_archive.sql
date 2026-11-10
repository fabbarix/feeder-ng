-- R8: a bought Product cannot be deleted, but it can be archived (and restored).
-- NULL = active; otherwise the RFC 3339 time it was archived. Barcodes, Shop
-- Barcodes, purchases and Prices stay in place; the queries filter on this column.
ALTER TABLE products ADD COLUMN archived_at TEXT;
CREATE INDEX products_active ON products(archived_at);
