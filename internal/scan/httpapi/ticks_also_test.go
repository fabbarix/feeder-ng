package httpapi_test

import "testing"

// B9-54 (RES 2): the answer to a queued tick names the additions made before it, the same User's own from another phone included
// (mine: true), each with the time it was ticked, so the phone whose tick synced late can say "Carrot was ticked twice".

func TestAQueuedTickAfterTheSameUsersTickOnAnotherPhoneSaysSoAndMarksItMine(t *testing.T) {
	f := newFixture(t)
	f.plan(t, 300)
	if r := f.user.Post("/api/shopping/ticks", map[string]any{"ingredientId": f.ingr, "to": "2026-11-15", "quantity": 300, "clientUuid": "other-phone"}); r.Status != 200 {
		t.Fatalf("tick = %d %s", r.Status, r.Body)
	}
	res := syncOps(t, f.user, f.tickOp("tick-1", 300, 300))[0]
	if res.Status != "applied" || res.Tick == nil || len(res.Tick.AlsoTickedBy) != 1 {
		t.Fatalf("sync = %+v; want applied with the User's own earlier tick named (never silently omitted)", res)
	}
	a := res.Tick.AlsoTickedBy[0]
	if a.Name != "User" || a.Quantity != 300 || a.By != "hand" || !a.Mine || a.TickedAt == "" {
		t.Errorf("alsoTickedBy[0] = %+v, want the User's 300 by hand, mine, with its time", a)
	}
	if n, total := lotCount(t, f); n != 2 || total != 600 {
		t.Errorf("Stock Lots = %d total %v; want both Stock Lots (both were bought)", n, total)
	}
}

func TestAnotherUsersAdditionInTheAnswerIsNotMine(t *testing.T) {
	f := newFixture(t)
	f.plan(t, 300)
	f.env.AddUser(t, "sam@example.test", "Sam", false)
	sam := f.env.LoginAs(t, "sam@example.test")
	if r := f.user.Post("/api/shopping/ticks", map[string]any{"ingredientId": f.ingr, "to": "2026-11-15", "quantity": 300, "clientUuid": "online"}); r.Status != 200 {
		t.Fatalf("tick = %d %s", r.Status, r.Body)
	}
	res := syncOps(t, sam, f.tickOp("tick-sam", 300, 300))[0]
	if res.Tick == nil || len(res.Tick.AlsoTickedBy) != 1 || res.Tick.AlsoTickedBy[0].Mine || res.Tick.AlsoTickedBy[0].TickedAt == "" {
		t.Errorf("alsoTickedBy = %+v, want the User's addition, not mine, with its time", res.Tick)
	}
}

func TestARetriedQueuedTickAnswersWithTheSameAlsoTickedBy(t *testing.T) {
	f := newFixture(t)
	f.plan(t, 300)
	if r := f.user.Post("/api/shopping/ticks", map[string]any{"ingredientId": f.ingr, "to": "2026-11-15", "quantity": 300, "clientUuid": "other-phone"}); r.Status != 200 {
		t.Fatalf("tick = %d %s", r.Status, r.Body)
	}
	for i, want := range []string{"applied", "duplicate", "duplicate"} {
		res := syncOps(t, f.user, f.tickOp("tick-1", 300, 300))[0]
		if res.Status != want || res.Tick == nil || len(res.Tick.AlsoTickedBy) != 1 || !res.Tick.AlsoTickedBy[0].Mine {
			t.Fatalf("sync %d = %+v, want %s answering the same alsoTickedBy (the other phone's tick) every time", i, res, want)
		}
	}
	if n, _ := lotCount(t, f); n != 2 {
		t.Errorf("Stock Lots = %d, want 2: a retry never adds a third", n)
	}
}
