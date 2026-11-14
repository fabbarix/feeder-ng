package db_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// 1576 (beta.9 ticks by addition, B9-23, ADR 0024) adds shopping_tick_additions(range_to, ingredient_id | extra_id,
// lot_id, quantity, covers, user_id, client_uuid UNIQUE, ticked_at, synced_at) and moves the Stock Lot a tick recorded
// (shopping_ticks.lot_id and lot_quantity, shopping_extras.tick_lot_id and tick_lot_quantity) into the first addition.
// What the test pins, with ticks of both kinds (a Line and an extra) and of every shape the earlier betas wrote:
//   - a tick that added a Lot gets exactly one addition with that Lot, its quantity, covers = the tick's needed and the
//     tick's time; a tick from before 1560 keeps a NULL quantity (Take back then takes what is left of the Lot);
//   - a tick that added no Lot (a Scan's, or a tick of 0) gets no addition with a Lot;
//   - the tick rows themselves stay (needed, by, ticked_on); Stock is untouched; the moved columns' values stay readable
//     through the additions;
//   - client_uuid is NULL on the moved rows (any number of them) and unique when set;
//   - the table also has `by` (NOT NULL, 'hand' or 'scan', DEFAULT 'hand'): the plan's column list leaves it out, and a
//     Scan's addition needs it; the default lets the inserts below name the plan's columns only.

func TestMigration1576MovesTheTickLotsIntoAdditionsForLinesAndExtras(t *testing.T) {
	d := tagsOpenAt(t, "1576_")
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES
		(5,'passata','passata','g',?,?),(6,'milk','milk','ml',?,?),(7,'rice','rice','g',?,?),(8,'salt','salt','g',?,?)`,
		mts, mts, mts, mts, mts, mts, mts, mts)
	mustExec(t, d, `INSERT INTO stock_lots(id,ingredient_id,quantity,purchased,source,created_at) VALUES
		(9,5,700,'2026-11-09','manual',?),(10,6,1000,'2026-11-09','manual',?),(11,7,500,'2026-11-09','manual',?)`, mts, mts, mts)
	// Lines: A added 700 g (a beta.8 tick, with lot_quantity); B is from before 1560 (a Lot, no quantity); C is a tick of 0;
	// D is a Scan's.
	mustExec(t, d, `INSERT INTO shopping_ticks(range_to,ingredient_id,needed,by,lot_id,lot_quantity,ticked_at) VALUES
		('2026-11-15',5,700,'hand',9,700,'2026-11-09T10:12:00Z'),
		('2026-11-15',6,1000,'hand',10,NULL,'2026-11-09T10:13:00Z'),
		('2026-11-15',7,300,'hand',NULL,NULL,'2026-11-09T10:14:00Z'),
		('2026-11-15',8,50,'scan',NULL,NULL,'2026-11-09T10:15:00Z')`)
	// Extras: E (an Ingredient extra that added 500 g), F (a text extra, ticked), G (open).
	mustExec(t, d, `INSERT INTO shopping_extras(id,ingredient_id,quantity,got,ticked_on,tick_lot_id,tick_lot_quantity,created_at)
		VALUES (21,7,500,500,'2026-11-09',11,500,?)`, mts)
	mustExec(t, d, `INSERT INTO shopping_extras(id,text,ticked_on,created_at) VALUES (22,'Napkins','2026-11-09',?)`, mts)
	mustExec(t, d, `INSERT INTO shopping_extras(id,ingredient_id,quantity,got,created_at) VALUES (23,8,100,0,?)`, mts)

	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1576: %v", err)
	}

	if n := count(t, d, `SELECT count(*) FROM shopping_tick_additions WHERE range_to = '2026-11-15' AND ingredient_id = 5 AND extra_id IS NULL
		AND lot_id = 9 AND quantity = 700 AND covers = 700 AND ticked_at = '2026-11-09T10:12:00Z' AND client_uuid IS NULL AND user_id IS NULL AND synced_at IS NULL`); n != 1 {
		t.Errorf("Line A's addition = %d rows, want 1 with Lot 9, 700 g, covers 700 and its own time", n)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_tick_additions WHERE ingredient_id = 6 AND lot_id = 10 AND quantity IS NULL AND covers = 1000`); n != 1 {
		t.Errorf("Line B's addition = %d rows, want 1 with Lot 10, a NULL quantity (before 1560) and covers 1000", n)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_tick_additions WHERE extra_id = 21 AND ingredient_id IS NULL
		AND lot_id = 11 AND quantity = 500`); n != 1 {
		t.Errorf("extra E's addition = %d rows, want 1 for the extra with Lot 11 and 500 g (no Ingredient)", n)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_tick_additions WHERE lot_id IS NOT NULL`); n != 3 {
		t.Errorf("additions with a Lot = %d, want 3: a tick that added no Lot has none", n)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_tick_additions WHERE ingredient_id IN (7, 8) AND lot_id IS NOT NULL`); n != 0 {
		t.Errorf("the tick of 0 and the Scan's tick got a Lot")
	}

	// Nothing else moved.
	if n := count(t, d, `SELECT count(*) FROM shopping_ticks`); n != 4 {
		t.Errorf("shopping_ticks = %d rows, want the 4 ticks kept", n)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_ticks WHERE ingredient_id = 5 AND needed = 700 AND by = 'hand' AND ticked_at = '2026-11-09T10:12:00Z'`); n != 1 {
		t.Error("Line A's tick changed")
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_ticks WHERE ingredient_id = 8 AND by = 'scan' AND needed = 50`); n != 1 {
		t.Error("the Scan's tick changed")
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_extras WHERE ticked_on = '2026-11-09'`); n != 2 {
		t.Errorf("ticked extras = %d, want 2 kept (the Ingredient extra and the text extra)", n)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_extras WHERE id = 23 AND ticked_on IS NULL`); n != 1 {
		t.Error("the open extra changed")
	}
	if n := count(t, d, `SELECT count(*) FROM stock_lots WHERE (id = 9 AND quantity = 700) OR (id = 10 AND quantity = 1000) OR (id = 11 AND quantity = 500)`); n != 3 {
		t.Error("a Stock Lot changed")
	}
}

func TestMigration1576AllowsAnyNumberOfAdditionsAndKeepsClientUUIDsUnique(t *testing.T) {
	d := tagsOpenAt(t, "1576_")
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES (5,'passata','passata','g',?,?)`, mts, mts)
	mustExec(t, d, `INSERT INTO shopping_ticks(range_to,ingredient_id,needed,by,lot_id,lot_quantity,ticked_at) VALUES ('2026-11-15',5,700,'hand',9,700,?)`, mts)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1576: %v", err)
	}
	// A Line ticked twice has two additions; the moved one has no client UUID, so several may.
	for i, uuid := range []string{"a", "b"} {
		mustExec(t, d, `INSERT INTO shopping_tick_additions(range_to,ingredient_id,lot_id,quantity,covers,user_id,client_uuid,ticked_at,synced_at)
			VALUES ('2026-11-15',5,?,50,700,NULL,?,?,?)`, 20+i, uuid, mts, mts)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_tick_additions WHERE ingredient_id = 5`); n != 3 {
		t.Errorf("additions = %d, want 3", n)
	}
	if _, err := d.Exec(`INSERT INTO shopping_tick_additions(range_to,ingredient_id,lot_id,quantity,covers,client_uuid,ticked_at)
		VALUES ('2026-11-15',5,30,50,700,'a',?)`, mts); err == nil {
		t.Error("a second addition with the client UUID \"a\" was accepted: client_uuid must be UNIQUE")
	}
}

func TestMigration1576OnAnEmptyDatabaseCreatesTheTable(t *testing.T) {
	d := tagsOpenAt(t, "1576_")
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1576: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_tick_additions`); n != 0 {
		t.Errorf("additions = %d, want none", n)
	}
}

func TestMigration1576MovesATickWhoseLotIsGoneAndAnExtraTickedBefore1560(t *testing.T) {
	d := tagsOpenAt(t, "1576_")
	mustExec(t, d, `INSERT INTO ingredients(id,name,name_key,base_unit,created_at,updated_at) VALUES
		(5,'passata','passata','g',?,?),(6,'milk','milk','ml',?,?)`, mts, mts, mts, mts)
	// Line: its Lot 99 was deleted (used up) since the tick. Extra: ticked before 1560, so no Lot recorded.
	mustExec(t, d, `INSERT INTO shopping_ticks(range_to,ingredient_id,needed,by,lot_id,lot_quantity,ticked_at) VALUES
		('2026-11-15',5,700,'hand',99,700,'2026-11-09T10:12:00Z')`)
	mustExec(t, d, `INSERT INTO shopping_extras(id,ingredient_id,quantity,got,ticked_on,created_at) VALUES (21,6,500,500,'2026-11-09',?)`, mts)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("1576: %v", err)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_tick_additions WHERE ingredient_id = 5 AND lot_id = 99 AND quantity = 700 AND used = 0`); n != 1 {
		t.Errorf("the Line's addition = %d rows, want 1 keeping the gone Lot 99 and its 700 (no FK) with used 0", n)
	}
	if n := count(t, d, `SELECT count(*) FROM shopping_tick_additions WHERE extra_id = 21 AND lot_id IS NULL AND quantity = 0 AND covers = 500`); n != 1 {
		t.Errorf("the extra's addition = %d rows, want 1 with no Lot and nothing added", n)
	}
	if _, err := d.Exec(`INSERT INTO shopping_tick_additions(range_to,ingredient_id,quantity,covers,used,ticked_at) VALUES ('2026-11-15',6,0,0,-1,?)`, mts); err == nil {
		t.Error("a negative used was accepted")
	}
}
