package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// 1560 (beta.8 undo, ADR 0019) is additive: a tick from before it keeps its Lot and has no lot_quantity (its Undo takes
// the Lot's whole current quantity), an extra ticked before it has no Lot, and the take-back record table starts empty.
func TestMigration1560KeepsOldTicksWithoutAQuantity(t *testing.T) {
	d := tagsOpenAt(t, "1560_")
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES (5,'passata','passata','g',?,?)`, mts, mts)
	mustExec(t, d, `INSERT INTO stock_lots(id,ingredient_id,quantity,purchased,source,created_at) VALUES (9,5,700,'2026-11-09','manual',?)`, mts)
	mustExec(t, d, `INSERT INTO shopping_ticks(range_to,ingredient_id,needed,by,lot_id,ticked_at) VALUES ('2026-11-15',5,700,'hand',9,?)`, mts)
	mustExec(t, d, `INSERT INTO shopping_extras(ingredient_id,quantity,got,ticked_on,created_at) VALUES (5,500,500,'2026-11-09',?)`, mts)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1560: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_ticks WHERE lot_id = 9 AND lot_quantity IS NULL`); n != 1 {
		t.Errorf("old ticks with their Lot and no quantity = %d, want 1", n)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_extras WHERE ticked_on IS NOT NULL AND tick_lot_id IS NULL AND tick_lot_quantity IS NULL`); n != 1 {
		t.Errorf("old ticked extras without a Lot = %d, want 1", n)
	}
	if n := count(t, d, `SELECT count(*) FROM stock_lot_take_backs`); n != 0 {
		t.Errorf("stock_lot_take_backs starts with %d rows, want none", n)
	}
	if n := count(t, d, `SELECT count(*) FROM stock_lots WHERE id = 9 AND quantity = 700`); n != 1 {
		t.Error("the Stock Lot changed")
	}
}
