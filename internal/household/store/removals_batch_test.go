package store_test

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// B9-42 (SAFE-02, user ruling): RemoveSlots and RestoreSlots act on several Meal Slots in one transaction, all or
// nothing, through the same per-slot steps as RemoveSlot and RestoreSlot.

func TestRemoveSlotsRemovesEveryDayAtOnceAndKeepsEachHistory(t *testing.T) {
	r := newRfx(t)
	mon := r.slot(1, "Dinner", "19:00")
	tue := r.slot(2, "Dinner", "19:00")
	lunch := r.slot(1, "Lunch", "12:30")
	r.meal(mon.ID, "2026-11-02", "cooked", false)
	r.meal(tue.ID, "2026-11-03", "skipped", false)
	r.meal(mon.ID, "2026-11-16", "planned", false)
	r.meal(tue.ID, "2026-11-07", "planned", false) // To confirm, kept for Undo

	if err := r.st.RemoveSlots(r.ctx, []int64{mon.ID, tue.ID}); err != nil {
		t.Fatalf("RemoveSlots: %v", err)
	}
	if active, _ := r.st.Slots(r.ctx); !reflect.DeepEqual(slotIDs(active), []int64{lunch.ID}) {
		t.Errorf("Slots = %v, want only Lunch", slotIDs(active))
	}
	if n := r.count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id IN (?, ?) AND state IN ('cooked','skipped')`, mon.ID, tue.ID); n != 2 {
		t.Errorf("%d resolved meals kept, want 2", n)
	}
	if n := r.count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id IN (?, ?) AND state = 'planned'`, mon.ID, tue.ID); n != 0 {
		t.Errorf("%d unresolved meals remain, want none", n)
	}
	if n := r.count(`SELECT count(DISTINCT removed_at) FROM meal_slots WHERE id IN (?, ?)`, mon.ID, tue.ID); n != 1 {
		t.Errorf("%d removal times, want one for the whole call", n)
	}
	removed, err := r.st.RemovedSlots(r.ctx)
	if err != nil || len(removed) != 1 || !reflect.DeepEqual(removed[0].IDs, []int64{mon.ID, tue.ID}) {
		t.Errorf("RemovedSlots = %+v, %v; want one row with both days", removed, err)
	}
}

func TestRemoveSlotsRefusesTheWholeCallForAnUnknownOrRemovedSlot(t *testing.T) {
	r := newRfx(t)
	mon := r.slot(1, "Dinner", "19:00")
	tue := r.slot(2, "Dinner", "19:00")
	r.meal(mon.ID, "2026-11-16", "planned", false)

	err := r.st.RemoveSlots(r.ctx, []int64{mon.ID, 9999})
	var se *household.SlotIDError
	if !errors.As(err, &se) || se.ID != 9999 || !errors.Is(err, household.ErrNotFound) {
		t.Fatalf("unknown id: %v, want SlotIDError{9999, ErrNotFound}", err)
	}
	if got, _ := r.st.Slot(r.ctx, mon.ID); got.Removed || r.mealsOf(mon.ID) != 1 {
		t.Error("a refused call removed Monday or its meals (all or nothing)")
	}

	if err := r.st.RemoveSlot(r.ctx, tue.ID); err != nil {
		t.Fatal(err)
	}
	err = r.st.RemoveSlots(r.ctx, []int64{mon.ID, tue.ID})
	if !errors.As(err, &se) || se.ID != tue.ID || !errors.Is(err, household.ErrSlotRemoved) {
		t.Fatalf("already removed: %v, want SlotIDError{tue, ErrSlotRemoved}", err)
	}
	if got, _ := r.st.Slot(r.ctx, mon.ID); got.Removed {
		t.Error("a refused call removed Monday")
	}

	var ve *household.ValidationError
	if err := r.st.RemoveSlots(r.ctx, nil); !errors.As(err, &ve) {
		t.Errorf("no ids: %v, want a ValidationError", err)
	}
}

func TestRestoreSlotsPutsEveryDayBackWithItsToConfirmRows(t *testing.T) {
	r := newRfx(t)
	mon := r.slot(1, "Dinner", "19:00")
	tue := r.slot(2, "Dinner", "19:00")
	r.meal(mon.ID, "2026-11-02", "planned", true) // To confirm
	r.meal(tue.ID, "2026-11-03", "cooked", false)
	if err := r.st.RemoveSlots(r.ctx, []int64{mon.ID, tue.ID}); err != nil {
		t.Fatal(err)
	}
	r.clk.Advance(5 * time.Minute)
	got, err := r.st.RestoreSlots(r.ctx, []int64{tue.ID, mon.ID})
	if err != nil {
		t.Fatalf("RestoreSlots: %v", err)
	}
	if !reflect.DeepEqual(slotIDs(got), []int64{tue.ID, mon.ID}) || got[0].Removed || got[1].Removed {
		t.Errorf("RestoreSlots = %+v, want both active, in the order asked", got)
	}
	if n := r.count(`SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND state = 'planned'`, mon.ID); n != 1 {
		t.Errorf("Monday's To confirm row came back %d times, want once", n)
	}
	if n := r.count(`SELECT count(*) FROM meal_slot_removals WHERE meal_slot_id IN (?, ?)`, mon.ID, tue.ID); n != 0 {
		t.Errorf("%d removal snapshots left, want none", n)
	}
}

func TestRestoreSlotsRefusesTheWholeCallWhenANameIsTakenAndNamesTheDays(t *testing.T) {
	r := newRfx(t)
	mon := r.slot(1, "Dinner", "19:00")
	tue := r.slot(2, "Dinner", "19:00")
	wed := r.slot(3, "Dinner", "19:00")
	if err := r.st.RemoveSlots(r.ctx, []int64{mon.ID, tue.ID, wed.ID}); err != nil {
		t.Fatal(err)
	}
	r.slot(1, "Dinner", "20:00")
	r.slot(3, "Dinner", "20:00")

	_, err := r.st.RestoreSlots(r.ctx, []int64{mon.ID, tue.ID, wed.ID})
	var nt *household.SlotNameTakenError
	if !errors.As(err, &nt) || !errors.Is(err, household.ErrSlotNameTaken) {
		t.Fatalf("RestoreSlots = %v, want a SlotNameTakenError", err)
	}
	if nt.Name != "Dinner" || !reflect.DeepEqual(nt.Weekdays, []int{1, 3}) || !reflect.DeepEqual(nt.IDs, []int64{mon.ID, wed.ID}) {
		t.Errorf("SlotNameTakenError = %+v, want Dinner on Monday and Wednesday", nt)
	}
	if got, _ := r.st.Slot(r.ctx, tue.ID); !got.Removed {
		t.Error("Tuesday came back although the call was refused (all or nothing)")
	}
}

func TestRestoreSlotsRefusesTheWholeCallForAnUnknownOrActiveSlot(t *testing.T) {
	r := newRfx(t)
	mon := r.slot(1, "Dinner", "19:00")
	tue := r.slot(2, "Dinner", "19:00")
	if err := r.st.RemoveSlot(r.ctx, mon.ID); err != nil {
		t.Fatal(err)
	}
	for _, ids := range [][]int64{{mon.ID, tue.ID}, {mon.ID, 9999}} {
		_, err := r.st.RestoreSlots(r.ctx, ids)
		var se *household.SlotIDError
		if !errors.As(err, &se) || se.ID != ids[1] || !errors.Is(err, household.ErrNotFound) {
			t.Errorf("RestoreSlots(%v) = %v, want SlotIDError{%d, ErrNotFound}", ids, err, ids[1])
		}
		if got, _ := r.st.Slot(r.ctx, mon.ID); !got.Removed {
			t.Errorf("RestoreSlots(%v) put Monday back although it was refused", ids)
		}
	}
}
