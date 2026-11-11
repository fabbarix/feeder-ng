package store_test

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/notify/store"
)

var now = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

type fixture struct {
	st        *store.Store
	clk       *clock.Fake
	anna, ben int64
	ctx       context.Context
	rawQuery  func(q string, args ...any) int
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	ctx := context.Background()
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(now)
	svc := auth.NewService(d, clk, false)
	anna, err := svc.AddUser(ctx, "anna@example.test", "Anna", true)
	if err != nil {
		t.Fatal(err)
	}
	ben, err := svc.AddUser(ctx, "ben@example.test", "Ben", false)
	if err != nil {
		t.Fatal(err)
	}
	return &fixture{
		st: store.New(d, clk), clk: clk, anna: anna.ID, ben: ben.ID, ctx: ctx,
		rawQuery: func(q string, args ...any) int {
			var n int
			if err := d.QueryRow(q, args...).Scan(&n); err != nil {
				t.Fatal(err)
			}
			return n
		},
	}
}

func input(endpoint string, on ...notify.Type) notify.SubscriptionInput {
	types := map[notify.Type]bool{}
	for _, t := range on {
		types[t] = true
	}
	return notify.SubscriptionInput{Endpoint: endpoint, P256dh: "p", Auth: "a", Label: "Pixel", Types: types}
}

func TestANewDeviceStartsWithEverythingOffUnlessAsked(t *testing.T) {
	f := newFixture(t)
	d, created, err := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a"))
	if err != nil || !created {
		t.Fatalf("Upsert = %+v, %v, %v", d, created, err)
	}
	if len(d.Types) != 7 {
		t.Fatalf("want all seven types present, got %v", d.Types)
	}
	for ty, on := range d.Types {
		if on {
			t.Errorf("%s is on for a new device", ty)
		}
	}
	if d.Label != "Pixel" || d.EndpointHash == "" || d.UserID != f.anna || d.ID == 0 {
		t.Errorf("device %+v", d)
	}
}

func TestRegisteringWithTypesTurnsThemOn(t *testing.T) {
	f := newFixture(t)
	d, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a", notify.AdvanceStep, notify.TimerFinished))
	if !d.Types[notify.AdvanceStep] || !d.Types[notify.TimerFinished] || d.Types[notify.StockSpoil] {
		t.Errorf("types %v", d.Types)
	}
}

func TestReRegisteringAnEndpointUpdatesTheSameDevice(t *testing.T) {
	f := newFixture(t)
	first, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a", notify.AdvanceStep))
	second, created, err := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a", notify.StockSpoil))
	if err != nil || created {
		t.Fatalf("Upsert = %v, created %v", err, created)
	}
	if second.ID != first.ID || second.Types[notify.AdvanceStep] || !second.Types[notify.StockSpoil] {
		t.Errorf("second %+v", second)
	}
	if n := f.rawQuery(`SELECT COUNT(*) FROM push_subscriptions`); n != 1 {
		t.Errorf("%d rows, want 1", n)
	}
}

func TestAnEndpointMovesToTheUserWhoSignsInOnThatBrowser(t *testing.T) {
	f := newFixture(t)
	f.st.Upsert(f.ctx, f.anna, input("https://push.example/shared", notify.AdvanceStep))
	d, _, err := f.st.Upsert(f.ctx, f.ben, input("https://push.example/shared"))
	if err != nil || d.UserID != f.ben {
		t.Fatalf("Upsert = %+v, %v", d, err)
	}
	if got, _ := f.st.Devices(f.ctx, f.anna); len(got) != 0 {
		t.Errorf("Anna still has %d devices", len(got))
	}
	if got, _ := f.st.Devices(f.ctx, f.ben); len(got) != 1 || got[0].Types[notify.AdvanceStep] {
		t.Errorf("Ben's devices %+v (Anna's choices must not carry over)", got)
	}
}

func TestDevicesAreListedPerUserOldestFirst(t *testing.T) {
	f := newFixture(t)
	f.st.Upsert(f.ctx, f.anna, input("https://push.example/1"))
	f.clk.Advance(time.Hour)
	f.st.Upsert(f.ctx, f.anna, input("https://push.example/2"))
	f.st.Upsert(f.ctx, f.ben, input("https://push.example/3"))
	got, err := f.st.Devices(f.ctx, f.anna)
	if err != nil || len(got) != 2 || !got[0].CreatedAt.Before(got[1].CreatedAt) {
		t.Fatalf("Devices = %+v, %v", got, err)
	}
}

func TestUpdateSetsOnlyTheGivenTypesAndTheLabel(t *testing.T) {
	f := newFixture(t)
	d, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a", notify.AdvanceStep, notify.StockSpoil))
	label := "Kitchen tablet"
	got, err := f.st.Update(f.ctx, f.anna, d.ID, &label, map[notify.Type]bool{notify.StockSpoil: false, notify.ConfirmCooked: true})
	if err != nil {
		t.Fatal(err)
	}
	if !got.Types[notify.AdvanceStep] || got.Types[notify.StockSpoil] || !got.Types[notify.ConfirmCooked] || got.Label != label {
		t.Errorf("got %+v", got)
	}
}

func TestAUserCannotTouchSomeoneElsesDevice(t *testing.T) {
	f := newFixture(t)
	d, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a"))
	if _, err := f.st.Update(f.ctx, f.ben, d.ID, nil, map[notify.Type]bool{notify.AdvanceStep: true}); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Update err = %v", err)
	}
	if err := f.st.Delete(f.ctx, f.ben, d.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Delete err = %v", err)
	}
	if got, _ := f.st.Devices(f.ctx, f.anna); len(got) != 1 {
		t.Errorf("Anna's device vanished")
	}
}

func TestDeleteRemovesTheDeviceItsTypesAndItsSentLog(t *testing.T) {
	f := newFixture(t)
	d, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a", notify.AdvanceStep))
	f.st.Claim(f.ctx, d.ID, "k")
	if err := f.st.Delete(f.ctx, f.anna, d.ID); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"push_subscriptions", "push_subscription_types", "push_sent"} {
		if n := f.rawQuery(`SELECT COUNT(*) FROM ` + table); n != 0 {
			t.Errorf("%s has %d rows left", table, n)
		}
	}
}

func TestTargetsListsOnlyDevicesOptedInToTheType(t *testing.T) {
	f := newFixture(t)
	a, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a", notify.AdvanceStep))
	f.st.Upsert(f.ctx, f.ben, input("https://push.example/b", notify.StockSpoil))
	got, err := f.st.Targets(f.ctx, notify.AdvanceStep)
	if err != nil || len(got) != 1 || got[0].ID != a.ID || got[0].Endpoint != "https://push.example/a" || got[0].P256dh != "p" || got[0].Auth != "a" || got[0].UserID != f.anna {
		t.Fatalf("Targets = %+v, %v", got, err)
	}
	if got, _ := f.st.Targets(f.ctx, notify.TimerFinished); len(got) != 0 {
		t.Errorf("got %+v", got)
	}
}

func TestRemoveDeletesAGoneDevice(t *testing.T) {
	f := newFixture(t)
	d, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a"))
	if err := f.st.Remove(f.ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := f.st.Devices(f.ctx, f.anna); len(got) != 0 {
		t.Errorf("got %+v", got)
	}
}

func TestClaimIsTrueOnlyTheFirstTimePerDeviceAndKey(t *testing.T) {
	f := newFixture(t)
	a, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a"))
	b, _, _ := f.st.Upsert(f.ctx, f.ben, input("https://push.example/b"))
	if ok, err := f.st.Claim(f.ctx, a.ID, "k1"); err != nil || !ok {
		t.Fatalf("first claim = %v, %v", ok, err)
	}
	if ok, _ := f.st.Claim(f.ctx, a.ID, "k1"); ok {
		t.Error("second claim for the same device and key succeeded")
	}
	if ok, _ := f.st.Claim(f.ctx, b.ID, "k1"); !ok {
		t.Error("another device must be able to claim the same key")
	}
	if ok, _ := f.st.Claim(f.ctx, a.ID, "k2"); !ok {
		t.Error("another key must be claimable")
	}
}

func TestClaimIsAtomicUnderConcurrency(t *testing.T) {
	f := newFixture(t)
	a, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a"))
	var wg sync.WaitGroup
	var mu sync.Mutex
	wins := 0
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if ok, _ := f.st.Claim(f.ctx, a.ID, "same"); ok {
				mu.Lock()
				wins++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if wins != 1 {
		t.Errorf("%d claims won, want exactly 1", wins)
	}
}

func TestReleaseLetsTheKeyBeClaimedAgain(t *testing.T) {
	f := newFixture(t)
	a, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a"))
	f.st.Claim(f.ctx, a.ID, "k")
	if err := f.st.Release(f.ctx, a.ID, "k"); err != nil {
		t.Fatal(err)
	}
	if ok, _ := f.st.Claim(f.ctx, a.ID, "k"); !ok {
		t.Error("claim after release failed")
	}
}

func TestPruneSentDropsOnlyOldRows(t *testing.T) {
	f := newFixture(t)
	a, _, _ := f.st.Upsert(f.ctx, f.anna, input("https://push.example/a"))
	f.st.Claim(f.ctx, a.ID, "old")
	f.clk.Advance(20 * 24 * time.Hour)
	f.st.Claim(f.ctx, a.ID, "new")
	n, err := f.st.PruneSent(f.ctx, f.clk.Now().Add(-14*24*time.Hour))
	if err != nil || n != 1 {
		t.Fatalf("PruneSent = %d, %v", n, err)
	}
	if ok, _ := f.st.Claim(f.ctx, a.ID, "new"); ok {
		t.Error("recent row was pruned")
	}
	if ok, _ := f.st.Claim(f.ctx, a.ID, "old"); !ok {
		t.Error("old row was kept")
	}
}
