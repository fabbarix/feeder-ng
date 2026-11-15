package household_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// B9-42 (SAFE-02, user ruling): Remove and Undo of a Meal Slot on several weekdays are one call each, all or nothing.
// The batch's ids are checked before the store opens its transaction, and its refusals name the slot or the days.

func TestValidateSlotIDsWantsAtLeastOneDistinctPositiveID(t *testing.T) {
	for _, c := range []struct {
		ids  []int64
		ok   bool
		what string
	}{
		{[]int64{4}, true, "one id"},
		{[]int64{4, 5, 6}, true, "several"},
		{nil, false, "none"},
		{[]int64{}, false, "empty"},
		{[]int64{4, 4}, false, "a repeated id"},
		{[]int64{0}, false, "zero"},
		{[]int64{-3}, false, "negative"},
	} {
		err := household.ValidateSlotIDs(c.ids)
		var ve *household.ValidationError
		if c.ok && err != nil {
			t.Errorf("%s: %v, want nil", c.what, err)
		}
		if !c.ok && (!errors.As(err, &ve) || ve.Field != "ids") {
			t.Errorf("%s: %v, want a ValidationError on ids", c.what, err)
		}
	}
}

func TestSlotIDErrorNamesTheSlotAndKeepsItsCause(t *testing.T) {
	err := error(&household.SlotIDError{ID: 12, Err: household.ErrSlotRemoved})
	if !errors.Is(err, household.ErrSlotRemoved) {
		t.Errorf("errors.Is(%v, ErrSlotRemoved) = false", err)
	}
	var se *household.SlotIDError
	if !errors.As(err, &se) || se.ID != 12 {
		t.Errorf("errors.As = %+v", se)
	}
	if !errors.Is(&household.SlotIDError{ID: 3, Err: household.ErrNotFound}, household.ErrNotFound) {
		t.Error("a missing slot keeps ErrNotFound")
	}
}

func TestSlotNameTakenErrorNamesEveryDayItCannotPutBack(t *testing.T) {
	one := &household.SlotNameTakenError{Name: "Dinner", Weekdays: []int{1}, IDs: []int64{7}}
	if !errors.Is(one, household.ErrSlotNameTaken) {
		t.Error("errors.Is(..., ErrSlotNameTaken) = false")
	}
	if got := one.Message(); got != "There is already a Dinner on Monday." {
		t.Errorf("one day: %q", got)
	}
	two := &household.SlotNameTakenError{Name: "Dinner", Weekdays: []int{3, 1}}
	if got := two.Message(); got != "There is already a Dinner on Monday and Wednesday." {
		t.Errorf("two days: %q", got)
	}
	three := &household.SlotNameTakenError{Name: "Snack", Weekdays: []int{5, 1, 3}}
	if got := three.Message(); got != "There is already a Snack on Monday, Wednesday and Friday." {
		t.Errorf("three days: %q", got)
	}
	if household.SlotNameTakenMessage("Dinner", 1) != one.Message() {
		t.Error("the single route's sentence and the batch's one-day sentence differ")
	}
}
