-- Supplies (ADR 0017, docs/dev/design/household-items.md §5.1): a Supply is an Ingredient of kind 'supply'.
-- Additive only: no table rebuild, no foreign-key pragma. Every existing Ingredient becomes food with no Restock level.
-- The rules that span columns (a Supply has no Shelf Life; only a Supply has a Restock level) are checked in Go,
-- because ADD COLUMN cannot add a table constraint.
ALTER TABLE ingredients ADD COLUMN kind TEXT NOT NULL DEFAULT 'food' CHECK (kind IN ('food', 'supply'));
-- Base Units, Supply only: the Stock below which the Shopping List asks for it; NULL = no Restock level.
ALTER TABLE ingredients ADD COLUMN restock_level REAL CHECK (restock_level IS NULL OR restock_level > 0);
