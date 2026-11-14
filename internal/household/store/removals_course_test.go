package store_test

import (
	"testing"

	coursestore "github.com/fabbarix/feeder-ng/internal/course/store"
	"github.com/fabbarix/feeder-ng/internal/household"
)

// B9-04 (developer): archiving the only Course of a removed Meal Slot needs no replacement (the Course impact ignores a
// removed Meal Slot), and putting that Meal Slot back gives it the main Course, so a Meal Slot is never read with none.
func TestARemovedMealSlotLeftWithNoCourseGetsTheMainCourseWhenPutBack(t *testing.T) {
	r := newRfx(t)
	var side int64
	if err := r.d.QueryRow(`SELECT id FROM courses WHERE name_key = 'side'`).Scan(&side); err != nil {
		t.Fatal(err)
	}
	snack, err := r.st.CreateSlot(r.ctx, household.MealSlotInput{Weekday: 1, Name: "Snack", Time: "16:30",
		Attendance: []household.Attendee{}, Courses: []household.SlotCourseInput{{CourseID: side}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := r.st.RemoveSlot(r.ctx, snack.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := coursestore.New(r.d, r.clk).Archive(r.ctx, side, 0); err != nil {
		t.Fatalf("Archive Side with no replacement = %v, want it allowed: only a removed Meal Slot serves it", err)
	}
	back, err := r.st.RestoreSlot(r.ctx, snack.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(back.Courses) != 1 || back.Courses[0].CourseID != r.main {
		t.Errorf("Courses after Put back = %+v, want the main Course", back.Courses)
	}
}
