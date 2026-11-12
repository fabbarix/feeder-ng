package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/service"
)

// B5-SH: Not needed per range (Q20 A), the way ticks are. Monday 2026-11-09, horizon 7, default range ends 2026-11-15.

func notNeededEnv(t *testing.T) (*env, int64) {
	t.Helper()
	e := newEnv(t)
	pass := e.ids[passata]
	e.plan.meals = []shopping.Meal{dinner("2026-11-10", 2, shopping.Need{IngredientID: pass, Quantity: 700})}
	return e, pass
}

func TestNotNeededTakesALineOffTheListWithoutAddingStock(t *testing.T) {
	e, pass := notNeededEnv(t)
	ctx := context.Background()
	before := e.bus.count(service.Topic)
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: pass, To: "2026-11-15"}); err != nil {
		t.Fatal(err)
	}
	v, err := e.svc.List(ctx, service.Query{})
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Lines) != 0 || len(v.NotNeeded) != 1 || v.NotNeeded[0].IngredientID != pass || v.NotNeeded[0].Quantity != 1400 {
		t.Fatalf("Lines %+v, NotNeeded %+v; want passata 1400 g under Not needed only", v.Lines, v.NotNeeded)
	}
	if len(e.stock.adds) != 0 {
		t.Fatalf("Stock adds = %+v; Not needed is not a purchase and adds no Lot", e.stock.adds)
	}
	if v.Progress.Total != 0 || v.Summary.Lines != 0 || v.Summary.LotsAdded != 0 {
		t.Fatalf("progress %+v summary %+v; Not needed lines count nowhere", v.Progress, v.Summary)
	}
	if e.bus.count(service.Topic) != before+1 {
		t.Fatalf("shopping events = %d, want one more than %d", e.bus.count(service.Topic), before)
	}
	last := e.bus.events[len(e.bus.events)-1]
	if m, _ := last.Data.(map[string]string); m["changed"] != "list" {
		t.Fatalf("event data = %+v, want {changed: list}", last.Data)
	}
}

func TestNotNeededRecordsTheLineQuantityItWasSetAt(t *testing.T) {
	e, pass := notNeededEnv(t)
	ctx := context.Background()
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: pass, To: "2026-11-15", UserID: 0}); err != nil {
		t.Fatal(err)
	}
	got, err := e.st.NotNeeded(ctx, "2026-11-15")
	if err != nil || got[pass].Needed != 1400 {
		t.Fatalf("stored = %+v, %v; want Needed 1400 (the line when it was set)", got, err)
	}
}

func TestMarkingNotNeededTwiceIsHarmless(t *testing.T) {
	e, pass := notNeededEnv(t)
	ctx := context.Background()
	for i := 0; i < 2; i++ {
		if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: pass, To: "2026-11-15"}); err != nil {
			t.Fatalf("call %d: %v", i+1, err)
		}
	}
	if v, _ := e.svc.List(ctx, service.Query{}); len(v.NotNeeded) != 1 {
		t.Fatalf("NotNeeded = %+v", v.NotNeeded)
	}
}

func TestNeededAfterAllPutsTheLineBack(t *testing.T) {
	e, pass := notNeededEnv(t)
	ctx := context.Background()
	_ = e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: pass, To: "2026-11-15"})
	if err := e.svc.ClearNotNeeded(ctx, pass, "2026-11-15"); err != nil {
		t.Fatal(err)
	}
	v, _ := e.svc.List(ctx, service.Query{})
	if len(v.Lines) != 1 || len(v.NotNeeded) != 0 || v.Lines[0].Quantity != 1400 {
		t.Fatalf("Lines %+v NotNeeded %+v; want passata back on the list", v.Lines, v.NotNeeded)
	}
	if err := e.svc.ClearNotNeeded(ctx, pass, "2026-11-15"); !errors.Is(err, service.ErrNotFound) {
		t.Fatalf("clearing again: err = %v, want ErrNotFound", err)
	}
}

func TestNeededAfterAllPublishesAListEvent(t *testing.T) {
	e, pass := notNeededEnv(t)
	ctx := context.Background()
	_ = e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: pass, To: "2026-11-15"})
	before := e.bus.count(service.Topic)
	_ = e.svc.ClearNotNeeded(ctx, pass, "2026-11-15")
	if e.bus.count(service.Topic) != before+1 {
		t.Fatalf("shopping events = %d, want %d", e.bus.count(service.Topic), before+1)
	}
}

func TestANewRangeShowsANotNeededLineAgain(t *testing.T) {
	e, pass := notNeededEnv(t)
	ctx := context.Background()
	_ = e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: pass, To: "2026-11-11"})
	other, _ := e.svc.List(ctx, service.Query{To: "2026-11-12"})
	if len(other.Lines) != 1 || len(other.NotNeeded) != 0 {
		t.Fatalf("range to 11-12: Lines %+v NotNeeded %+v; the mark belongs to the range ending 11-11", other.Lines, other.NotNeeded)
	}
	same, _ := e.svc.List(ctx, service.Query{To: "2026-11-11"})
	if len(same.Lines) != 0 || len(same.NotNeeded) != 1 {
		t.Fatalf("range to 11-11: Lines %+v NotNeeded %+v", same.Lines, same.NotNeeded)
	}
}

func TestTheRangeEndIsClampedLikeATicksDoes(t *testing.T) {
	e, pass := notNeededEnv(t)
	ctx := context.Background()
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: pass, To: "2027-01-01"}); err != nil {
		t.Fatal(err)
	}
	if got, _ := e.st.NotNeeded(ctx, "2026-11-15"); len(got) != 1 {
		t.Fatalf("stored under the clamped range 2026-11-15: %+v", got)
	}
}

func TestNotNeededRejectsAnUnknownIngredientAndAnIngredientNotOnTheList(t *testing.T) {
	e, pass := notNeededEnv(t)
	ctx := context.Background()
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: 9999, To: "2026-11-15"}); !errors.Is(err, service.ErrUnknownIngredient) {
		t.Fatalf("unknown Ingredient: err = %v", err)
	}
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: e.ids[milk], To: "2026-11-15"}); !errors.Is(err, service.ErrNotOnList) {
		t.Fatalf("milk has no Line: err = %v, want ErrNotOnList", err)
	}
	// A range that ends before the meal: passata is not on that list.
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: pass, To: "2026-11-09"}); !errors.Is(err, service.ErrNotOnList) {
		t.Fatalf("passata is not needed until 11-10: err = %v, want ErrNotOnList", err)
	}
}

func TestATickedLineCannotBeMarkedNotNeeded(t *testing.T) {
	e, pass := notNeededEnv(t)
	ctx := context.Background()
	if _, err := e.svc.Tick(ctx, service.TickInput{IngredientID: pass, To: "2026-11-15", Quantity: 0}); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: pass, To: "2026-11-15"}); !errors.Is(err, service.ErrNotOnList) {
		t.Fatalf("Not needed is offered on open lines only: err = %v, want ErrNotOnList", err)
	}
}

func TestANotNeededLineIsNotAPurchaseAndLeavesStockAndTheLedgerAlone(t *testing.T) {
	e, pass := notNeededEnv(t)
	ctx := context.Background()
	e.ledger.spent, e.ledger.lots = 0, 0
	_ = e.svc.SetNotNeeded(ctx, service.NotNeededInput{IngredientID: pass, To: "2026-11-15"})
	v, _ := e.svc.List(ctx, service.Query{})
	if v.Summary.SpentCents != 0 || v.Summary.LotsAdded != 0 || len(e.stock.lots) != 0 {
		t.Fatalf("summary %+v, Stock Lots %+v; Not needed buys nothing", v.Summary, e.stock.lots)
	}
}

func TestAPastUnconfirmedMealIsNamedOnItsLineThroughTheService(t *testing.T) {
	e := newEnv(t)
	pass := e.ids[passata]
	past := dinner("2026-11-03", 1, shopping.Need{IngredientID: pass, Quantity: 700})
	past.SlotID, past.SlotName, past.CourseName = 3, "Dinner", "Main"
	e.plan.meals = []shopping.Meal{past}
	v, err := e.svc.List(context.Background(), service.Query{})
	if err != nil || len(v.Lines) != 1 {
		t.Fatalf("List = %+v, %v", v.Lines, err)
	}
	if got := v.Lines[0].PastPlannedMeals; len(got) != 1 || got[0].Date != "2026-11-03" || got[0].MealSlotName != "Dinner" || got[0].CourseName != "Main" {
		t.Fatalf("PastPlannedMeals = %+v", got)
	}
}
