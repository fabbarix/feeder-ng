package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-23 (RES-03): shop_tick and shop_untick over POST /api/scan/sync, against the real Shopping List and Stock. The test
// household date is Monday 2026-11-09 12:00 UTC; the phone ticked at 10:20, offline.

type syncTick struct {
	ClientUUID string `json:"clientUuid"`
	Status     string `json:"status"`
	Error      *struct {
		Code string `json:"code"`
	} `json:"error"`
	Tick *struct {
		LotID        *int64  `json:"lotId"`
		Added        float64 `json:"added"`
		AlsoTickedBy []struct {
			Name     string  `json:"name"`
			Quantity float64 `json:"quantity"`
			By       string  `json:"by"`
			Mine     bool    `json:"mine"`
			TickedAt string  `json:"tickedAt"`
		} `json:"alsoTickedBy"`
	} `json:"tick"`
}

func syncOps(t *testing.T, c *testkit.Client, ops ...map[string]any) []syncTick {
	t.Helper()
	var out struct {
		Results []syncTick `json:"results"`
	}
	r := c.Post("/api/scan/sync", map[string]any{"ops": ops})
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Results) != len(ops) {
		t.Fatalf("sync = %d %s; want 200 with %d results", r.Status, r.Body, len(ops))
	}
	return out.Results
}

func (f fixture) tickOp(uuid string, qty, covers float64) map[string]any {
	return map[string]any{"clientUuid": uuid, "scannedAt": "2026-11-09T10:20:00Z", "kind": "shop_tick", "shopId": f.shop, "ingredientId": f.ingr,
		"quantity": qty, "covers": covers, "rangeTo": "2026-11-15"}
}

// plan puts a Dinner on Tuesday 2026-11-10 that needs grams of passata: the Line.
func (f fixture) plan(t *testing.T, grams float64) {
	t.Helper()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO meal_slots(id,weekday,name,time) VALUES (90,2,'Dinner','19:00')`, nil},
		{`INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (100,'Pasta',4,'2026-11-09T12:00:00Z','2026-11-09T12:00:00Z')`, nil},
		{`INSERT INTO recipe_lines(recipe_id,position,ingredient_id,quantity,unit) VALUES (100,0,?,?,'g')`, []any{f.ingr, grams}},
		{`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,created_at,updated_at)
			VALUES ('2026-11-10',90,(SELECT id FROM courses WHERE name='Main'),100,1,4,'2026-11-09T12:00:00Z','2026-11-09T12:00:00Z')`, nil},
	} {
		if _, err := f.env.DB.Exec(q.sql, q.args...); err != nil {
			t.Fatalf("%s: %v", q.sql, err)
		}
	}
}

type tickedLine struct {
	Ticked bool `json:"ticked"`
	Tick   *struct {
		Added     *float64 `json:"added"`
		Additions []struct {
			Who        string  `json:"who"`
			Quantity   float64 `json:"quantity"`
			ClientUUID string  `json:"clientUuid"`
			TickedAt   string  `json:"tickedAt"`
			SyncedAt   *string `json:"syncedAt"`
		} `json:"additions"`
	} `json:"tick"`
}

func (f fixture) line(t *testing.T) tickedLine {
	t.Helper()
	var v struct {
		Lines []tickedLine `json:"lines"`
	}
	f.user.Get("/api/shopping/list").MustJSON(t, &v)
	if len(v.Lines) != 1 {
		t.Fatalf("lines = %+v, want the one Line", v.Lines)
	}
	return v.Lines[0]
}

func lotCount(t *testing.T, f fixture) (n int, total float64) {
	t.Helper()
	var lots struct {
		Lots []struct {
			Quantity float64 `json:"quantity"`
		} `json:"lots"`
	}
	f.user.Get("/api/stock/lots").MustJSON(t, &lots)
	for _, l := range lots.Lots {
		total += l.Quantity
	}
	return len(lots.Lots), total
}

func TestAShopTickSyncsOnceHoweverOftenItIsSent(t *testing.T) {
	f := newFixture(t)
	f.plan(t, 300)
	var first int64
	for i, want := range []string{"applied", "duplicate", "duplicate"} {
		res := syncOps(t, f.user, f.tickOp("tick-1", 700, 300))[0]
		if res.Status != want || res.Tick == nil || res.Tick.LotID == nil || res.Tick.Added != 700 || res.Tick.AlsoTickedBy == nil {
			t.Fatalf("sync %d = %+v, want %s with a Lot, 700 added and an alsoTickedBy array", i, res, want)
		}
		if i == 0 {
			first = *res.Tick.LotID
		} else if *res.Tick.LotID != first {
			t.Fatalf("sync %d Lot %d, want the first %d", i, *res.Tick.LotID, first)
		}
	}
	if n, total := lotCount(t, f); n != 1 || total != 700 {
		t.Fatalf("Stock Lots = %d, total %v; want one of 700 and never a third", n, total)
	}
	l := f.line(t)
	if !l.Ticked || l.Tick == nil || len(l.Tick.Additions) != 1 {
		t.Fatalf("Line = %+v, want ticked once", l)
	}
	if a := l.Tick.Additions[0]; a.ClientUUID != "tick-1" || a.TickedAt != "2026-11-09T10:20:00Z" || a.SyncedAt == nil || a.Who != "User" {
		t.Errorf("addition = %+v, want the phone's time 10:20, a sync time and the User", a)
	}
}

func TestAQueuedTickThatSyncsAfterAnotherUsersTickAddsItsLotAndSaysSo(t *testing.T) {
	f := newFixture(t)
	f.plan(t, 300)
	f.env.AddUser(t, "sam@example.test", "Sam", false)
	sam := f.env.LoginAs(t, "sam@example.test")
	if r := f.user.Post("/api/shopping/ticks", map[string]any{"ingredientId": f.ingr, "to": "2026-11-15", "quantity": 300, "clientUuid": "online"}); r.Status != 200 {
		t.Fatalf("tick = %d %s", r.Status, r.Body)
	}
	res := syncOps(t, sam, f.tickOp("tick-sam", 300, 300))[0]
	if res.Status != "applied" || res.Tick == nil || res.Tick.LotID == nil || len(res.Tick.AlsoTickedBy) != 1 || res.Tick.AlsoTickedBy[0].Name != "User" ||
		res.Tick.AlsoTickedBy[0].Quantity != 300 || res.Tick.AlsoTickedBy[0].By != "hand" {
		t.Fatalf("sync = %+v; want applied, alsoTickedBy the User's 300 by hand (no 'already ticked' refusal)", res)
	}
	if n, total := lotCount(t, f); n != 2 || total != 600 {
		t.Errorf("Stock Lots = %d total %v; want both Stock Lots", n, total)
	}
	if l := f.line(t); l.Tick == nil || len(l.Tick.Additions) != 2 || l.Tick.Additions[1].Who != "Sam" {
		t.Errorf("Line %+v, want two additions, Sam's last", l)
	}
}

func TestAShopTickOfALineThatIsNotOnTheListIsRejected(t *testing.T) {
	f := newFixture(t) // no plan: passata is on no list
	res := syncOps(t, f.user, f.tickOp("tick-1", 700, 300))[0]
	if res.Status != "rejected" || res.Error == nil || res.Error.Code != "not_on_list" || res.Tick != nil {
		t.Fatalf("sync = %+v, want rejected not_on_list", res)
	}
	if n, _ := lotCount(t, f); n != 0 {
		t.Errorf("a refused tick added %d Lots", n)
	}
}

func TestAShopTickOfALineMarkedNotNeededIsRejected(t *testing.T) {
	f := newFixture(t)
	f.plan(t, 300)
	if r := f.user.Post("/api/shopping/not-needed", map[string]any{"ingredientId": f.ingr, "to": "2026-11-15"}); r.Status != 200 {
		t.Fatalf("not needed = %d %s", r.Status, r.Body)
	}
	if res := syncOps(t, f.user, f.tickOp("tick-1", 700, 300))[0]; res.Status != "rejected" || res.Error == nil || res.Error.Code != "not_on_list" {
		t.Errorf("sync = %+v, want rejected not_on_list", res)
	}
}

func TestAnUntickAfterATickInOneBatchLeavesNoStockLot(t *testing.T) {
	f := newFixture(t)
	f.plan(t, 300)
	res := syncOps(t, f.user,
		f.tickOp("tick-1", 700, 300),
		map[string]any{"clientUuid": "untick-1", "scannedAt": "2026-11-09T10:21:00Z", "kind": "shop_untick", "tickClientUuid": "tick-1"},
	)
	if res[0].Status != "applied" || res[1].Status != "applied" {
		t.Fatalf("results = %+v", res)
	}
	if n, _ := lotCount(t, f); n != 0 {
		t.Errorf("Stock Lots = %d, want none", n)
	}
	if l := f.line(t); l.Ticked {
		t.Errorf("Line still ticked: %+v", l)
	}
}

func TestTicksSyncInOrder(t *testing.T) {
	f := newFixture(t)
	f.plan(t, 300)
	res := syncOps(t, f.user,
		f.tickOp("tick-1", 700, 300),
		map[string]any{"clientUuid": "untick-1", "scannedAt": "2026-11-09T10:21:00Z", "kind": "shop_untick", "ingredientId": f.ingr, "rangeTo": "2026-11-15"},
		f.tickOp("tick-2", 200, 300),
	)
	for i, r := range res {
		if r.Status != "applied" {
			t.Fatalf("result %d = %+v", i, r)
		}
	}
	if n, total := lotCount(t, f); n != 1 || total != 200 {
		t.Errorf("Stock Lots = %d total %v; want only the second Tick's 200", n, total)
	}
}

func TestAShopTickOfAnExtraAddsItsLot(t *testing.T) {
	f := newFixture(t)
	var x struct {
		ID int64 `json:"id"`
	}
	f.user.Post("/api/shopping/extras", map[string]any{"ingredientId": f.ingr, "quantity": 700}).MustJSON(t, &x)
	res := syncOps(t, f.user, map[string]any{"clientUuid": "tick-x", "scannedAt": "2026-11-09T10:20:00Z", "kind": "shop_tick", "extraId": x.ID, "quantity": 700})[0]
	if res.Status != "applied" || res.Tick == nil || res.Tick.Added != 700 || res.Tick.LotID == nil {
		t.Fatalf("sync = %+v", res)
	}
	var extras struct {
		Extras []struct {
			Ticked bool `json:"ticked"`
		} `json:"extras"`
	}
	f.user.Get("/api/shopping/list").MustJSON(t, &extras)
	if len(extras.Extras) != 1 || !extras.Extras[0].Ticked {
		t.Errorf("extras = %+v, want ticked", extras.Extras)
	}
	if res := syncOps(t, f.user, map[string]any{"clientUuid": "tick-x2", "scannedAt": "2026-11-09T10:20:00Z", "kind": "shop_tick", "extraId": 99999, "quantity": 1})[0]; res.Status != "rejected" || res.Error == nil || res.Error.Code != "not_on_list" {
		t.Errorf("an extra that is gone = %+v, want rejected not_on_list", res)
	}
}

// Reviewer: a Scan and a Tick of the same Line in one batch, in both orders. Each keeps its own Stock Lot (RES 2); the
// Line is ticked once; a Scan that ticked it is an addition by scan, and its Undo leaves the Tick by hand and its Lot.
func TestAScanAndATickOfTheSameLineInOneBatchKeepBothLotsInEitherOrder(t *testing.T) {
	for _, scanFirst := range []bool{true, false} {
		f := newFixture(t)
		f.plan(t, 300)
		ops := []map[string]any{f.op("scan-1"), f.tickOp("tick-1", 300, 300)}
		if !scanFirst {
			ops[0], ops[1] = ops[1], ops[0]
		}
		for i, r := range syncOps(t, f.user, ops...) {
			if r.Status != "applied" {
				t.Fatalf("scanFirst %v: result %d = %+v", scanFirst, i, r)
			}
		}
		if n, total := lotCount(t, f); n != 2 || total != 1000 {
			t.Errorf("scanFirst %v: Stock Lots = %d total %v; want the Scan's 700 and the Tick's 300", scanFirst, n, total)
		}
		l := f.line(t)
		want := 1 // the Scan ticks the Line only when it was still open
		if scanFirst {
			want = 2
		}
		if !l.Ticked || l.Tick == nil || len(l.Tick.Additions) != want {
			t.Fatalf("scanFirst %v: Line = %+v; want ticked with %d additions", scanFirst, l, want)
		}
		// Undo of the Scan from the Scanned list: the Tick by hand and its Lot stay.
		if r := f.user.Post("/api/scan/scan-1/undo", map[string]any{}); r.Status != 200 && r.Status != 204 {
			t.Fatalf("scanFirst %v: undo = %d %s", scanFirst, r.Status, r.Body)
		}
		if n, total := lotCount(t, f); n != 1 || total != 300 {
			t.Errorf("scanFirst %v: after the Scan's Undo Stock Lots = %d total %v; want the Tick's 300", scanFirst, n, total)
		}
		if l := f.line(t); !l.Ticked || l.Tick == nil || len(l.Tick.Additions) != 1 || l.Tick.Additions[0].ClientUUID != "tick-1" {
			t.Errorf("scanFirst %v: after the Scan's Undo Line = %+v; want ticked by the Tick alone", scanFirst, l)
		}
	}
}
