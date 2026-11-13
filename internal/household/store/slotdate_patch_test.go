package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// B5-SD review round 3 (PM decisions 3a, 3b, 3f, 3g). PATCH of a Meal Slot on one date runs in ONE store transaction:
//
//	Store.PatchSlotDate(ctx, slotID, date, household.SlotDatePatch{NotServed *bool, Time *string, Today string})
//	  (household.SlotDate, error)
//
// reads the row, serves the date again when NotServed is false, applies only the fields sent (Time "" = the usual
// time), checks date_past / slot_started / time_invalid, saves, and returns the saved row. A refused patch writes
// nothing. Today is the household's date. Errors are *household.ValidationError (Field, Reason) as the handler wrote
// them; household.ErrNotFound for an unknown Meal Slot.

const sdToday2 = "2026-11-09" // the day before the Thursday sdDate, a Monday: "today" of these tests

func bp(b bool) *bool     { return &b }
func sp(s string) *string { return &s }

func wantInvalid(t *testing.T, what string, err error, field, reason string) {
	t.Helper()
	var ve *household.ValidationError
	if !errors.As(err, &ve) || ve.Field != field || ve.Reason != reason {
		t.Errorf("%s = %v, want a ValidationError on %s with reason %s", what, err, field, reason)
	}
}

func TestPatchSlotDateAppliesOnlyTheFieldsSent(t *testing.T) {
	c := newCfx(t)
	slot, _, _ := c.thursday(t)
	if err := c.st.SaveSlotDate(c.ctx, household.SlotDate{SlotID: slot.ID, Date: sdDate, Time: "20:00", Guests: 2}); err != nil {
		t.Fatal(err)
	}
	got, err := c.st.PatchSlotDate(c.ctx, slot.ID, sdDate, household.SlotDatePatch{NotServed: bp(true), Today: sdToday2})
	if err != nil {
		t.Fatal(err)
	}
	if want := (household.SlotDate{SlotID: slot.ID, Date: sdDate, NotServed: true, Time: "20:00", Guests: 2}); got != want {
		t.Errorf("returned = %+v, want %+v (time and Guests untouched)", got, want)
	}
	got, err = c.st.PatchSlotDate(c.ctx, slot.ID, sdDate, household.SlotDatePatch{Time: sp("21:15"), Today: sdToday2})
	if err != nil {
		t.Fatal(err)
	}
	if want := (household.SlotDate{SlotID: slot.ID, Date: sdDate, NotServed: true, Time: "21:15", Guests: 2}); got != want {
		t.Errorf("returned = %+v, want %+v (Not served untouched)", got, want)
	}
	if stored, _ := c.st.SlotDate(c.ctx, slot.ID, sdDate); stored != got {
		t.Errorf("stored = %+v, want what was returned %+v", stored, got)
	}
	got, err = c.st.PatchSlotDate(c.ctx, slot.ID, sdDate, household.SlotDatePatch{Time: sp(""), Today: sdToday2})
	if err != nil || got.Time != "" || !got.NotServed || got.Guests != 2 {
		t.Errorf("back to the usual time = %+v, %v; want Time empty, Not served and 2 Guests kept", got, err)
	}
}

func TestPatchSlotDateServesAnEmptiedDateAgainAndAppliesTheTimeInTheSameTransaction(t *testing.T) {
	c := newCfx(t)
	slot, _, _ := c.thursday(t)
	none, zero := []household.Attendee{}, 0
	if err := c.st.SaveWhoIsEating(c.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &zero}); err != nil {
		t.Fatal(err)
	}
	got, err := c.st.PatchSlotDate(c.ctx, slot.ID, sdDate, household.SlotDatePatch{NotServed: bp(false), Time: sp("20:30"), Today: sdToday2})
	if err != nil {
		t.Fatal(err)
	}
	if want := (household.SlotDate{SlotID: slot.ID, Date: sdDate, Time: "20:30"}); got != want {
		t.Errorf("returned = %+v, want served at 20:30", got)
	}
	if att, isOverride, _ := c.st.DateAttendance(c.ctx, slot.ID, sdDate); isOverride || len(att) != 2 {
		t.Errorf("Attendance = %+v %v, want the usual two Members back (the emptied override removed)", att, isOverride)
	}
}

func TestPatchSlotDateRefusedWritesNothingAtAll(t *testing.T) {
	c := newCfx(t)
	slot, _, _ := c.thursday(t)
	none, zero := []household.Attendee{}, 0
	if err := c.st.SaveWhoIsEating(c.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &zero}); err != nil {
		t.Fatal(err)
	}
	before, _ := c.st.SlotDate(c.ctx, slot.ID, sdDate)
	// Serving again is valid but the time is not: the whole patch is refused and the date stays emptied.
	_, err := c.st.PatchSlotDate(c.ctx, slot.ID, sdDate, household.SlotDatePatch{NotServed: bp(false), Time: sp("25:00"), Today: sdToday2})
	wantInvalid(t, "an invalid time", err, "time", "time_invalid")
	if after, _ := c.st.SlotDate(c.ctx, slot.ID, sdDate); after != before {
		t.Errorf("row = %+v after a refused patch, want %+v", after, before)
	}
	if _, isOverride, _ := c.st.DateAttendance(c.ctx, slot.ID, sdDate); !isOverride {
		t.Error("a refused patch removed the emptied override")
	}
}

func TestPatchSlotDateRefusesAPastDateAndAStartedSlot(t *testing.T) {
	c := newCfx(t)
	slot, _, _ := c.thursday(t)
	_, err := c.st.PatchSlotDate(c.ctx, slot.ID, sdDate, household.SlotDatePatch{NotServed: bp(true), Today: "2026-11-13"})
	wantInvalid(t, "Not served on a past date", err, "notServed", "date_past")
	// PM decision 3g: a time change on a past date is refused too (a time that does not change is not a change).
	_, err = c.st.PatchSlotDate(c.ctx, slot.ID, sdDate, household.SlotDatePatch{Time: sp("20:00"), Today: "2026-11-13"})
	wantInvalid(t, "a time on a past date", err, "time", "date_past")

	c.plannedMeal(t, sdDate, slot.ID, c.main, 1, "cooked", 0)
	_, err = c.st.PatchSlotDate(c.ctx, slot.ID, sdDate, household.SlotDatePatch{NotServed: bp(true), Today: sdToday2})
	wantInvalid(t, "Not served on a started slot", err, "notServed", "slot_started")
	// The time of a started slot can still move, and serving again is never checked.
	if got, err := c.st.PatchSlotDate(c.ctx, slot.ID, sdDate, household.SlotDatePatch{Time: sp("21:00"), Today: sdToday2}); err != nil || got.Time != "21:00" {
		t.Errorf("time of a started slot = %+v, %v; want 21:00", got, err)
	}
	if n := c.count(t, `SELECT count(*) FROM meal_slot_dates WHERE not_served = 1`); n != 0 {
		t.Errorf("%d Not served rows after the refusals, want none", n)
	}
	if _, err := c.st.PatchSlotDate(c.ctx, 999, sdDate, household.SlotDatePatch{NotServed: bp(true), Today: sdToday2}); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("unknown Meal Slot = %v, want ErrNotFound", err)
	}
}

// ---- PM decision 3a: the "emptied while started" check is part of SaveWhoIsEating's transaction ----

func TestSaveWhoIsEatingRefusesEmptyingAStartedSlotAndWritesNothing(t *testing.T) {
	for _, state := range []string{"cooked", "skipped"} {
		c := newCfx(t)
		slot, _, _ := c.thursday(t)
		c.plannedMeal(t, sdDate, slot.ID, c.main, 1, state, 0)
		none, zero := []household.Attendee{}, 0
		err := c.st.SaveWhoIsEating(c.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &zero})
		if !errors.Is(err, household.ErrSlotStarted) {
			t.Errorf("%s: emptying = %v, want ErrSlotStarted", state, err)
		}
		if _, isOverride, _ := c.st.DateAttendance(c.ctx, slot.ID, sdDate); isOverride {
			t.Errorf("%s: the refused save wrote the override", state)
		}
		if row, _ := c.st.SlotDate(c.ctx, slot.ID, sdDate); row.NotServed {
			t.Errorf("%s: row = %+v, want it untouched", state, row)
		}
	}
}

// PM decision 3b: a Guests-only save of 0 that leaves a started slot with no Member and no Guest is refused as well.
func TestSaveWhoIsEatingRefusesTakingTheLastGuestAwayFromAStartedSlotWithNoMember(t *testing.T) {
	c := newCfx(t)
	slot, _, _ := c.thursday(t)
	none, two, zero := []household.Attendee{}, 2, 0
	if err := c.st.SaveWhoIsEating(c.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &two}); err != nil {
		t.Fatal(err)
	}
	c.plannedMeal(t, sdDate, slot.ID, c.main, 1, "skipped", 0)
	err := c.st.SaveWhoIsEating(c.ctx, slot.ID, sdDate, household.WhoIsEating{Guests: &zero})
	if !errors.Is(err, household.ErrSlotStarted) {
		t.Errorf("Guests 0 = %v, want ErrSlotStarted (no Member and no Guest left on a started slot)", err)
	}
	if row, _ := c.st.SlotDate(c.ctx, slot.ID, sdDate); row.Guests != 2 || row.NotServed {
		t.Errorf("row = %+v, want the 2 Guests kept and served", row)
	}
	// Guests 1 still leaves someone eating; Members present make Guests 0 harmless.
	one := 1
	if err := c.st.SaveWhoIsEating(c.ctx, slot.ID, sdDate, household.WhoIsEating{Guests: &one}); err != nil {
		t.Errorf("Guests 1 on a started slot = %v, want it saved", err)
	}
}

func TestSaveWhoIsEatingOnAStartedSlotIsNotRefusedWhenSomeoneStillEatsOrNothingChanges(t *testing.T) {
	c := newCfx(t)
	slot, anna, _ := c.thursday(t)
	c.plannedMeal(t, sdDate, slot.ID, c.main, 1, "cooked", 0)
	zero := 0
	if err := c.st.SaveWhoIsEating(c.ctx, slot.ID, sdDate, household.WhoIsEating{Guests: &zero}); err != nil {
		t.Errorf("Guests 0 with the usual two Members = %v, want it saved", err)
	}
	one := []household.Attendee{{MemberID: anna.ID}}
	if err := c.st.SaveWhoIsEating(c.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &one}); err != nil {
		t.Errorf("Anna alone on a started slot = %v, want it saved", err)
	}
}

// ---- PM decision 3f: Reset to usual Attendance on an emptied date serves it again ----

func TestResetOfAnEmptiedDateServesItAgainWithNoGuestsAndKeepsTheTime(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	none, zero := []household.Attendee{}, 0
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &zero}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.SaveSlotDate(f.ctx, household.SlotDate{SlotID: slot.ID, Date: sdDate, NotServed: true, Time: "20:00"}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.ClearDateAttendance(f.ctx, slot.ID, sdDate); err != nil {
		t.Fatal(err)
	}
	row, _ := f.st.SlotDate(f.ctx, slot.ID, sdDate)
	if row.NotServed || row.Guests != 0 || row.Time != "20:00" {
		t.Errorf("row = %+v, want served again, 0 Guests, the 20:00 kept (an emptied date is not a hand-marked one)", row)
	}
	if att, isOverride, _ := f.st.DateAttendance(f.ctx, slot.ID, sdDate); isOverride || len(att) != 2 {
		t.Errorf("Attendance = %+v %v, want the usual two Members", att, isOverride)
	}
}

func TestResetOfAnEmptiedDateWithNoOtherFactDeletesTheRow(t *testing.T) {
	f := newFx(t)
	slot, _, _ := f.thursday(t)
	none, zero := []household.Attendee{}, 0
	if err := f.st.SaveWhoIsEating(f.ctx, slot.ID, sdDate, household.WhoIsEating{Members: &none, Guests: &zero}); err != nil {
		t.Fatal(err)
	}
	if err := f.st.ClearDateAttendance(f.ctx, slot.ID, sdDate); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM meal_slot_dates`).Scan(&n); err != nil || n != 0 {
		t.Errorf("%d rows left (%v), want the all-default row deleted", n, err)
	}
}
