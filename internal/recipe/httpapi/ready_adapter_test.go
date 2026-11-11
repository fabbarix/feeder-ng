package httpapi

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// R14b: the adapter reports a lost name race as store.ErrReadyMealNameTaken (mapped to 409 by writeErr).
func TestCreatePieceTxNameTaken(t *testing.T) {
	ctx := context.Background()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	ings := ingstore.New(d, clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)))
	if _, err := ings.Create(ctx, ingredient.Input{Name: "Paella", Base: units.Piece}); err != nil {
		t.Fatal(err)
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	_, err = readyMealIngredients{ings}.CreatePieceTx(ctx, tx, "paella")
	if !errors.Is(err, store.ErrReadyMealNameTaken) {
		t.Fatalf("CreatePieceTx = %v, want ErrReadyMealNameTaken", err)
	}
}
