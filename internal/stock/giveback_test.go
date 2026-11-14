package stock

import (
	"reflect"
	"testing"
)

// B9-05 (SAFE-03, SAFE-09): GiveBack puts back what an action took from Stock.
//
//	type Take struct { Before Lot; Taken float64 }   // Before is the Lot as it was just before the action
//	func GiveBack(lots []Lot, takes []Take) GiveBackResult  // { Lots, Restored []int64, Gone []int64 }
//
// Three cases per take, by what the Lot is now:
//   - it exists: the Taken quantity is added back to its current quantity (it may have changed since);
//   - it is gone and the action emptied it (Taken >= Before.Quantity): it is put back whole, with its id, dates, KeptOn,
//     and quantity Taken;
//   - it is gone and the action left some of it (Taken < Before.Quantity): somebody deleted it since. Its Stock is not
//     invented: the id goes to Gone.
// Takes of the same Lot add up. A take whose Taken is not more than 0 (or NaN) is ignored. The input is not modified.

func TestGiveBackAddsTheQuantityToALotThatStillExists(t *testing.T) {
	before := lot(1, 400, "2026-11-01", "2026-11-05")
	now := lot(1, 150, "2026-11-01", "2026-11-05") // Cooked took 250
	res := GiveBack([]Lot{now}, []Take{{Before: before, Taken: 250}})
	if len(res.Lots) != 1 || res.Lots[0].Quantity != 400 || res.Lots[0].ID != 1 {
		t.Fatalf("Lots = %+v, want Lot 1 back to 400", res.Lots)
	}
	if !reflect.DeepEqual(res.Restored, []int64{1}) || len(res.Gone) != 0 {
		t.Errorf("Restored = %v, Gone = %v", res.Restored, res.Gone)
	}
}

func TestGiveBackAddsToTheQuantityTheLotHasNowNotTheOneItHadBefore(t *testing.T) {
	before := lot(1, 400, "2026-11-01", "2026-11-05")
	now := lot(1, 500, "2026-11-01", "2026-11-05") // used 250, then a correction raised it to 500
	res := GiveBack([]Lot{now}, []Take{{Before: before, Taken: 250}})
	if res.Lots[0].Quantity != 750 {
		t.Errorf("Quantity = %v, want 500 + 250", res.Lots[0].Quantity)
	}
}

func TestGiveBackPutsAnEmptiedLotBackWithItsIdAndDates(t *testing.T) {
	before := Lot{ID: 7, IngredientID: 3, Quantity: 300, Purchased: "2026-11-02", GoesOff: "2026-11-06", KeptOn: "2026-11-07"}
	other := lot(2, 50, "2026-11-08", "2026-11-12")
	res := GiveBack([]Lot{other}, []Take{{Before: before, Taken: 300}})
	if len(res.Lots) != 2 {
		t.Fatalf("Lots = %+v, want the other Lot and the one put back", res.Lots)
	}
	var back Lot
	for _, l := range res.Lots {
		if l.ID == 7 {
			back = l
		}
	}
	if back != before {
		t.Errorf("put back = %+v, want exactly %+v", back, before)
	}
	if !reflect.DeepEqual(res.Restored, []int64{7}) || len(res.Gone) != 0 {
		t.Errorf("Restored = %v, Gone = %v", res.Restored, res.Gone)
	}
}

func TestGiveBackDoesNotInventALotDeletedSince(t *testing.T) {
	before := lot(7, 400, "2026-11-02", "2026-11-06")
	res := GiveBack(nil, []Take{{Before: before, Taken: 250}}) // some was left, then somebody deleted the Lot
	if len(res.Lots) != 0 {
		t.Errorf("Lots = %+v, want none: its Stock is gone", res.Lots)
	}
	if !reflect.DeepEqual(res.Gone, []int64{7}) || len(res.Restored) != 0 {
		t.Errorf("Gone = %v, Restored = %v", res.Gone, res.Restored)
	}
}

func TestGiveBackHandlesSeveralLotsAndReportsEachOutcome(t *testing.T) {
	exists := lot(1, 100, "2026-11-01", "2026-11-05")
	emptied := lot(2, 80, "2026-11-01", "2026-11-05")
	deleted := lot(3, 90, "2026-11-01", "2026-11-05")
	res := GiveBack([]Lot{lot(1, 40, "2026-11-01", "2026-11-05")}, []Take{
		{Before: exists, Taken: 60}, {Before: emptied, Taken: 80}, {Before: deleted, Taken: 30},
	})
	if got := Total(res.Lots); got != 100+80 {
		t.Errorf("Total = %v, want 180 (Lot 1 back to 100, Lot 2 put back, Lot 3 not invented)", got)
	}
	if !reflect.DeepEqual(res.Restored, []int64{1, 2}) || !reflect.DeepEqual(res.Gone, []int64{3}) {
		t.Errorf("Restored = %v, Gone = %v", res.Restored, res.Gone)
	}
}

func TestGiveBackAddsUpTakesOfTheSameLot(t *testing.T) {
	before := lot(1, 400, "2026-11-01", "2026-11-05")
	res := GiveBack([]Lot{lot(1, 100, "2026-11-01", "2026-11-05")}, []Take{{Before: before, Taken: 200}, {Before: before, Taken: 100}})
	if len(res.Lots) != 1 || res.Lots[0].Quantity != 400 {
		t.Errorf("Lots = %+v, want one Lot of 400", res.Lots)
	}
	if !reflect.DeepEqual(res.Restored, []int64{1}) {
		t.Errorf("Restored = %v, want Lot 1 once", res.Restored)
	}
}

func TestGiveBackIgnoresTakesOfNothing(t *testing.T) {
	l := lot(1, 100, "2026-11-01", "2026-11-05")
	for _, taken := range []float64{0, -5} {
		res := GiveBack([]Lot{l}, []Take{{Before: l, Taken: taken}})
		if len(res.Lots) != 1 || res.Lots[0] != l || len(res.Restored) != 0 || len(res.Gone) != 0 {
			t.Errorf("Taken %v: %+v", taken, res)
		}
	}
	if res := GiveBack(nil, nil); len(res.Lots) != 0 {
		t.Errorf("no takes: %+v", res)
	}
}

func TestGiveBackDoesNotModifyItsInput(t *testing.T) {
	lots := []Lot{lot(1, 100, "2026-11-01", "2026-11-05")}
	GiveBack(lots, []Take{{Before: lot(1, 300, "2026-11-01", "2026-11-05"), Taken: 200}})
	if lots[0].Quantity != 100 {
		t.Error("GiveBack modified the Lots it was given")
	}
}

// SSP-17: Keep makes the Lot good until a date, in one tap.
//
//	func KeepUntil(lot Lot, goodUntil, today Date) Lot
//
// GoesOff becomes goodUntil and KeptOn becomes today, so the zero-waste streak forgives the go-offs so far, exactly as
// Keep does. Nothing else changes. A Lot with no go-off date is returned unchanged. The input is not modified.
func TestKeepUntilSetsTheGoOffDateAndRecordsTheKeepDate(t *testing.T) {
	l := lot(1, 100, "2026-11-01", "2026-11-05")
	kept := KeepUntil(l, "2026-11-12", "2026-11-09")
	if kept.GoesOff != "2026-11-12" || kept.KeptOn != "2026-11-09" {
		t.Errorf("kept = %+v, want GoesOff 2026-11-12 and KeptOn 2026-11-09", kept)
	}
	if kept.ID != l.ID || kept.Quantity != l.Quantity || kept.Purchased != l.Purchased || kept.IngredientID != l.IngredientID {
		t.Errorf("KeepUntil changed more than GoesOff and KeptOn: %+v", kept)
	}
	if l.GoesOff != "2026-11-05" || l.KeptOn != None {
		t.Error("KeepUntil modified its argument")
	}
}

func TestKeepUntilTodayMakesTheLotGoodUntilToday(t *testing.T) {
	kept := KeepUntil(lot(1, 100, "2026-10-01", "2026-10-08"), "2026-11-09", "2026-11-09")
	if kept.GoesOff != "2026-11-09" || kept.KeptOn != "2026-11-09" {
		t.Errorf("kept = %+v: a Lot that went off 37 days ago is good until today in one Keep", kept)
	}
	if IsSpoiled(kept, "2026-11-09") {
		t.Error("a Lot good until today is not spoiled today")
	}
	if !IsSpoiled(kept, "2026-11-10") {
		t.Error("it is spoiled again tomorrow")
	}
}

func TestKeepUntilLeavesAnUndatedLotAlone(t *testing.T) {
	l := lot(3, 100, "2026-11-01", None)
	if got := KeepUntil(l, "2026-11-12", "2026-11-09"); got != l {
		t.Errorf("undated lot changed: %+v", got)
	}
}
