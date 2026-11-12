package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// A Meal Slot on one date: the repository (ADR 0014, migration 1500). Team B5-SD, test-first.

const sdDate = "2026-11-12" // a Thursday

func (f *fx) thursday(t *testing.T) (household.MealSlot, household.Member, household.Member) {
	t.Helper()
	anna, sam := f.member(t, "Anna", 1), f.member(t, "Sam", 0.5)
	slot, err := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 4, Name: "Dinner", Time: "19:00",
		Attendance: []household.Attendee{{MemberID: anna.ID}, {MemberID: sam.ID}}})
	if err != nil {
		t.Fatal(err)
	}
	return slot, anna, sam
}

func TestSlotDateIsTheDefaultRowWhenNothingIsStored(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	got, err := f.st.SlotDate(f.ctx, slot.ID, sdDate)
	if err != nil || got != (household.SlotDate{SlotID: slot.ID, Date: sdDate}) {
		t.Fatalf("SlotDate = %+v, %v; want the default row for the slot and date", got, err)
	}
	if _, err := f.st.SlotDate(f.ctx, 999, sdDate); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("unknown Meal Slot = %v, want ErrNotFound", err)
	}
}

func TestSaveSlotDateRoundTripsAndDeletesTheDefaultRow(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	row := household.SlotDate{SlotID: slot.ID, Date: sdDate, NotServed: true, Time: "20:15", Guests: 2}
	if err := f.st.SaveSlotDate(f.ctx, row); err != nil {
		t.Fatal(err)
	}
	if got, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); got != row {
		t.Fatalf("SlotDate = %+v, want %+v", got, row)
	}
	// Dates are independent.
	if other, _ := f.st.SlotDate(f.ctx, slot.ID, "2026-11-19"); other.NotServed || other.Time != "" || other.Guests != 0 {
		t.Errorf("next Thursday = %+v, want untouched", other)
	}
	// Back to all defaults: the row is deleted.
	if err := f.st.SaveSlotDate(f.ctx, household.SlotDate{SlotID: slot.ID, Date: sdDate}); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM meal_slot_dates`).Scan(&n); err != nil || n != 0 {
		t.Errorf("%d rows stored after saving the default row (%v), want none", n, err)
	}
	if err := f.st.SaveSlotDate(f.ctx, household.SlotDate{SlotID: 999, Date: sdDate, Guests: 1}); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("unknown Meal Slot = %v, want ErrNotFound", err)
	}
}

func TestDeletingAMealSlotDeletesItsDateRows(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	if err := f.st.SaveSlotDate(f.ctx, household.SlotDate{SlotID: slot.ID, Date: sdDate, Guests: 1}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.DeleteSlot(f.ctx, slot.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM meal_slot_dates`).Scan(&n); err != nil || n != 0 {
		t.Errorf("%d date rows survive the Meal Slot (%v)", n, err)
	}
}

func TestSaveWhoIsEatingStoresMembersAndGuestsTogether(t *testing.T) {
	f := newFx(t)
	slot, anna, _ := f.thursday(t)
	two := 2
	att := []household.Attendee{{MemberID: anna.ID}}
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &att, Guests: &two}); err != nil {
		t.Fatal(err)
	}
	got, isOverride, _ := f.st.DateAttendance(f.ctx, slot.ID, sdDate)
	if !isOverride || len(got) != 1 || got[0].MemberID != anna.ID {
		t.Errorf("Members = %+v %v, want Anna only as an override", got, isOverride)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); row.Guests != 2 || row.NotServed {
		t.Errorf("row = %+v, want 2 Guests and served", row)
	}
	// Guests alone leave the Members as they are.
	five := 5
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Guests: &five}); err != nil {
		t.Fatal(err)
	}
	if got, _, _ := f.st.DateAttendance(f.ctx, slot.ID, sdDate); len(got) != 1 {
		t.Errorf("Members = %+v after a Guests-only save, want Anna still", got)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); row.Guests != 5 {
		t.Errorf("Guests = %d, want 5", row.Guests)
	}
}

func TestSaveWhoIsEatingRefusesTooManyGuestsAndWritesNothing(t *testing.T) {
	f := newFx(t)
	slot, anna, _ := f.thursday(t)
	many := 21
	att := []household.Attendee{{MemberID: anna.ID}}
	err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &att, Guests: &many})
	var ve *household.ValidationError
	if !errors.As(err, &ve) || ve.Reason != "guests_invalid" {
		t.Fatalf("21 Guests = %v, want guests_invalid", err)
	}
	if _, isOverride, _ := f.st.DateAttendance(f.ctx, slot.ID, sdDate); isOverride {
		t.Error("the Members were written although the Guests were refused")
	}
}

func TestAnEmptiedDateIsSavedNotServed(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	none, zero := []household.Attendee{}, 0
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &zero}); err != nil {
		t.Fatal(err)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); !row.NotServed {
		t.Errorf("row = %+v, want Not served (U1: no Member and no Guest)", row)
	}
	if att, isOverride, _ := f.st.DateAttendance(f.ctx, slot.ID, sdDate); !isOverride || len(att) != 0 {
		t.Errorf("Attendance = %+v %v, want the empty override kept", att, isOverride)
	}
}

func TestNoMemberButGuestsIsServed(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	none, three := []household.Attendee{}, 3
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &three}); err != nil {
		t.Fatal(err)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); row.NotServed || row.Guests != 3 {
		t.Errorf("row = %+v, want served with 3 Guests (U3)", row)
	}
}

func TestEmptyingMembersWhileGuestsAreAlreadySetIsServed(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	two := 2
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Guests: &two}); err != nil {
		t.Fatal(err)
	}
	none := []household.Attendee{}
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none}); err != nil {
		t.Fatal(err)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); row.NotServed {
		t.Error("the stored 2 Guests count: nobody but Guests is served")
	}
}

func TestServeAgainBringsAnEmptiedDateBackToTheUsualAttendance(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	none, zero := []household.Attendee{}, 0
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &zero}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.ServeAgain(f.ctx, slot.ID, sdDate); err != nil {
		t.Fatal(err)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); row.NotServed {
		t.Error("still Not served after Plan Dinner again")
	}
	att, isOverride, _ := f.st.DateAttendance(f.ctx, slot.ID, sdDate)
	if isOverride || len(att) != 2 {
		t.Errorf("Attendance = %+v %v, want the usual two Members back", att, isOverride)
	}
}

func TestServeAgainKeepsTheMembersAndGuestsOfAHandMarkedDate(t *testing.T) {
	f := newFx(t)
	slot, anna, _ := f.thursday(t)
	att, two := []household.Attendee{{MemberID: anna.ID}}, 2
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &att, Guests: &two}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.SaveSlotDate(f.ctx, household.SlotDate{SlotID: slot.ID, Date: sdDate, NotServed: true, Time: "20:00", Guests: 2}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.ServeAgain(f.ctx, slot.ID, sdDate); err != nil {
		t.Fatal(err)
	}
	row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate)
	if row.NotServed || row.Guests != 2 || row.Time != "20:00" {
		t.Errorf("row = %+v, want served, 2 Guests and the 20:00 kept", row)
	}
	if got, isOverride, _ := f.st.DateAttendance(f.ctx, slot.ID, sdDate); !isOverride || len(got) != 1 {
		t.Errorf("Members = %+v %v, want Anna's override kept", got, isOverride)
	}
}

func TestResetToUsualAttendanceClearsGuestsButNotNotServedNorTheTime(t *testing.T) {
	f := newFx(t)
	slot, anna, _ := f.thursday(t)
	att, four := []household.Attendee{{MemberID: anna.ID}}, 4
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &att, Guests: &four}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.SaveSlotDate(f.ctx, household.SlotDate{SlotID: slot.ID, Date: sdDate, NotServed: true, Time: "20:00", Guests: 4}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.ClearDateAttendance(f.ctx, slot.ID, sdDate); err != nil {
		t.Fatal(err)
	}
	row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate)
	if row.Guests != 0 || !row.NotServed || row.Time != "20:00" {
		t.Errorf("row = %+v, want Guests 0 and Not served and the time kept (decision Q5)", row)
	}
	if _, isOverride, _ := f.st.DateAttendance(f.ctx, slot.ID, sdDate); isOverride {
		t.Error("the date's Members were not reset")
	}
}

func TestResetOfAGuestsOnlyDateDeletesTheRow(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	two := 2
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Guests: &two}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.ClearDateAttendance(f.ctx, slot.ID, sdDate); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM meal_slot_dates`).Scan(&n); err != nil || n != 0 {
		t.Errorf("%d rows left, want the all-default row deleted (%v)", n, err)
	}
}

func TestSavingANonEmptyWhoIsEatingServesANotServedDateAgain(t *testing.T) {
	f := newFx(t)
	slot, anna, _ := f.thursday(t)
	// An emptied date is Not served; saving Anna brings it back.
	none, zero := []household.Attendee{}, 0
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &zero}); err != nil {
		t.Fatal(err)
	}
	att := []household.Attendee{{MemberID: anna.ID}}
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &att}); err != nil {
		t.Fatal(err)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); row.NotServed {
		t.Errorf("row = %+v, want served: a non-empty Who's eating serves the date again", row)
	}
	// So does a hand-marked Not served date, and its own time is kept.
	if err := f.st.SaveSlotDate(f.ctx, household.SlotDate{SlotID: slot.ID, Date: sdDate, NotServed: true, Time: "20:00"}); err != nil {
		t.Fatal(err)
	}
	two := 2
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &att, Guests: &two}); err != nil {
		t.Fatal(err)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); row.NotServed || row.Time != "20:00" || row.Guests != 2 {
		t.Errorf("row = %+v, want served, 20:00 kept, 2 Guests", row)
	}
}

func TestResetStillLeavesNotServedAlone(t *testing.T) {
	f := newFx(t)
	slot, anna, _ := f.thursday(t)
	att, one := []household.Attendee{{MemberID: anna.ID}}, 1
	f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &att, Guests: &one})
	f.st.SaveSlotDate(f.ctx, household.SlotDate{SlotID: slot.ID, Date: sdDate, NotServed: true, Guests: 1})
	if err := f.st.ClearDateAttendance(f.ctx, slot.ID, sdDate); err != nil {
		t.Fatal(err)
	}
	if row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate); !row.NotServed {
		t.Errorf("row = %+v, want Not served kept (Q5)", row)
	}
}
