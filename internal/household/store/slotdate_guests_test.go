package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// B5-SD round 2 (PM decision): a Guests-only save counts as non-empty, because Guests eat (U3). It serves a Not served
// date again.

func TestSavingGuestsOnlyServesANotServedDateAgain(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	none, zero := []household.Attendee{}, 0
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &zero}); err != nil {
		t.Fatal(err)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); !row.NotServed {
		t.Fatalf("setup: row = %+v, want Not served (emptied)", row)
	}
	three := 3
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Guests: &three}); err != nil {
		t.Fatal(err)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); row.NotServed || row.Guests != 3 {
		t.Errorf("row = %+v, want served with 3 Guests: a Guests-only save serves the date again", row)
	}
}
