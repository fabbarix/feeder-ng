package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// 1572 (beta.9 Stock Undo, B9-05) is additive: waste and Stock-takes recorded before it read back with no lot_json and
// no takes_json, so they cannot be undone, and both columns take values afterwards.
func TestMigration1572KeepsOldWasteAndStockTakesWithoutUndoData(t *testing.T) {
	d := tagsOpenAt(t, "1572_")
	mustExec(t, d, `INSERT INTO stock_waste(id,quantity,wasted_on,reason,lot_id,created_at) VALUES (3,200,'2026-11-09','spoiled',9,?)`, mts)
	mustExec(t, d, `INSERT INTO scan_events(client_uuid,kind,scanned_at,applied_at,seq,quantity,lot_id,result_json)
		VALUES ('u-1','stock_take',?,?,1,500,NULL,'{}')`, mts, mts)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1572: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM stock_waste WHERE id = 3 AND lot_json IS NULL AND quantity = 200`); n != 1 {
		t.Errorf("old waste without lot_json = %d, want 1", n)
	}
	if n := count(t, d, `SELECT count(*) FROM scan_events WHERE client_uuid = 'u-1' AND takes_json IS NULL`); n != 1 {
		t.Errorf("old Stock-takes without takes_json = %d, want 1", n)
	}
	mustExec(t, d, `UPDATE stock_waste SET lot_json = '{"id":9}' WHERE id = 3`)
	mustExec(t, d, `UPDATE scan_events SET takes_json = '[]' WHERE client_uuid = 'u-1'`)
	if n := count(t, d, `SELECT count(*) FROM stock_waste WHERE lot_json = '{"id":9}'`); n != 1 {
		t.Error("lot_json does not keep a value")
	}
}
