package store_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
)

// B5-SH: shopping_not_needed (migration 1530), kept per range and Ingredient like ticks.

func setupDB(t *testing.T) (*store.Store, *sql.DB, int64, int64) {
	t.Helper()
	db := stocktest.NewDB(t)
	milk := stocktest.SeedIngredient(t, db, "milk", "ml", nil)
	rice := stocktest.SeedIngredient(t, db, "rice", "g", nil)
	return store.New(db, clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))), db, milk, rice
}

func TestNotNeededIsKeptPerRangeAndIngredient(t *testing.T) {
	st, _, milk, rice := setupDB(t)
	ctx := context.Background()
	for _, c := range []struct {
		to     string
		ing    int64
		needed float64
	}{{"2026-11-15", milk, 1000}, {"2026-11-15", rice, 300}, {"2026-11-12", milk, 400}} {
		if err := st.SetNotNeeded(ctx, stock.Date(c.to), shopping.NotNeeded{IngredientID: c.ing, Needed: c.needed}, 0); err != nil {
			t.Fatal(err)
		}
	}
	got, err := st.NotNeeded(ctx, "2026-11-15")
	if err != nil || len(got) != 2 || got[milk].Needed != 1000 || got[milk].IngredientID != milk || got[rice].Needed != 300 {
		t.Fatalf("NotNeeded(11-15) = %+v, %v", got, err)
	}
	if other, _ := st.NotNeeded(ctx, "2026-11-12"); len(other) != 1 || other[milk].Needed != 400 {
		t.Fatalf("a range of its own: %+v", other)
	}
	if none, err := st.NotNeeded(ctx, "2026-11-30"); err != nil || len(none) != 0 {
		t.Fatalf("an unmarked range = %+v, %v; want empty", none, err)
	}
}

func TestSettingNotNeededAgainReplacesItAndRecordsTheUserAndTime(t *testing.T) {
	st, db, milk, _ := setupDB(t)
	ctx := context.Background()
	_ = st.SetNotNeeded(ctx, "2026-11-15", shopping.NotNeeded{IngredientID: milk, Needed: 1000}, 0)
	if err := st.SetNotNeeded(ctx, "2026-11-15", shopping.NotNeeded{IngredientID: milk, Needed: 800}, 0); err != nil {
		t.Fatalf("marking twice must be harmless: %v", err)
	}
	if got, _ := st.NotNeeded(ctx, "2026-11-15"); len(got) != 1 || got[milk].Needed != 800 {
		t.Fatalf("upsert: %+v", got)
	}
	var created string
	var user sql.NullInt64
	if err := db.QueryRow(`SELECT created_at, user_id FROM shopping_not_needed WHERE ingredient_id = ?`, milk).Scan(&created, &user); err != nil {
		t.Fatal(err)
	}
	if created != "2026-11-09T12:00:00Z" || user.Valid {
		t.Fatalf("created_at %q user_id %v; want the clock's time and NULL for user 0", created, user)
	}
}

func TestDeleteNotNeededClearsOneMarkAndReportsAMissingOne(t *testing.T) {
	st, _, milk, rice := setupDB(t)
	ctx := context.Background()
	_ = st.SetNotNeeded(ctx, "2026-11-15", shopping.NotNeeded{IngredientID: milk, Needed: 1}, 0)
	_ = st.SetNotNeeded(ctx, "2026-11-15", shopping.NotNeeded{IngredientID: rice, Needed: 1}, 0)
	if err := st.DeleteNotNeeded(ctx, "2026-11-15", rice); err != nil {
		t.Fatal(err)
	}
	if err := st.DeleteNotNeeded(ctx, "2026-11-15", rice); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("clearing twice: err = %v, want ErrNotFound", err)
	}
	if err := st.DeleteNotNeeded(ctx, "2026-11-12", milk); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("another range: err = %v, want ErrNotFound", err)
	}
	if got, _ := st.NotNeeded(ctx, "2026-11-15"); len(got) != 1 || got[milk].Needed != 1 {
		t.Fatalf("after DeleteNotNeeded: %+v", got)
	}
}

func TestPurgeBeforeDropsNotNeededOfEndedRangesLikeTicks(t *testing.T) {
	st, _, milk, _ := setupDB(t)
	ctx := context.Background()
	_ = st.SetNotNeeded(ctx, "2026-11-08", shopping.NotNeeded{IngredientID: milk, Needed: 1}, 0)
	_ = st.SetNotNeeded(ctx, "2026-11-09", shopping.NotNeeded{IngredientID: milk, Needed: 2}, 0)
	if err := st.PurgeBefore(ctx, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	if old, _ := st.NotNeeded(ctx, "2026-11-08"); len(old) != 0 {
		t.Fatalf("a range that ended yesterday must go: %+v", old)
	}
	if kept, _ := st.NotNeeded(ctx, "2026-11-09"); len(kept) != 1 {
		t.Fatalf("a range ending today stays: %+v", kept)
	}
}

func TestTheIngredientMoverCountsAndMovesNotNeededMarks(t *testing.T) {
	st, db, milk, rice := setupDB(t)
	ctx := context.Background()
	_ = st.SetNotNeeded(ctx, "2026-11-15", shopping.NotNeeded{IngredientID: milk, Needed: 100}, 0)
	_ = st.SetNotNeeded(ctx, "2026-11-12", shopping.NotNeeded{IngredientID: milk, Needed: 50}, 0)
	_ = st.SetNotNeeded(ctx, "2026-11-15", shopping.NotNeeded{IngredientID: rice, Needed: 300}, 0) // the merge target already has this range
	m := store.Mover{}
	if n, err := m.Count(ctx, db, milk); err != nil || n != 2 {
		t.Fatalf("Count = %d, %v; want the 2 Not needed marks", n, err)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := m.Move(ctx, tx, milk, rice); err != nil {
		t.Fatalf("Move: %v", err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.NotNeeded(ctx, "2026-11-15"); len(got) != 1 || got[rice].Needed != 300 {
		t.Fatalf("11-15 after the merge = %+v, want the target's own mark kept", got)
	}
	if got, _ := st.NotNeeded(ctx, "2026-11-12"); len(got) != 1 || got[rice].Needed != 50 {
		t.Fatalf("11-12 after the merge = %+v, want the mark moved to rice", got)
	}
	if n, _ := m.Count(ctx, db, milk); n != 0 {
		t.Fatalf("Count of the old Ingredient = %d, want 0", n)
	}
}
