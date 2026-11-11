package household_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

func sp(s string) *string { return &s }

func TestMatchSlotsMatchesTheSameNameOnEachChosenWeekday(t *testing.T) {
	slots := []household.MealSlot{
		{ID: 1, Weekday: 1, Name: "Dinner"}, {ID: 2, Weekday: 1, Name: "Lunch"},
		{ID: 3, Weekday: 2, Name: "dinner "}, {ID: 4, Weekday: 3, Name: "Lunch"},
		{ID: 5, Weekday: 4, Name: "Dinner"},
	}
	matched, skipped := household.MatchSlots(slots, " Dinner", []int{3, 1, 2, 3})
	ids := []int64{}
	for _, m := range matched {
		ids = append(ids, m.ID)
	}
	if !reflect.DeepEqual(ids, []int64{1, 3}) || !reflect.DeepEqual(skipped, []int{3}) {
		t.Fatalf("matched %v skipped %v; want [1 3] and [3]", ids, skipped)
	}
}

func TestBatchInputValidation(t *testing.T) {
	ok := household.BatchInput{Match: "Dinner", Weekdays: []int{1, 2}, Change: household.SlotChange{Time: sp("19:30")}}
	if err := ok.Normalized().Validate(); err != nil {
		t.Fatalf("valid input: %v", err)
	}
	bad := map[string]household.BatchInput{
		"no match":       {Weekdays: []int{1}, Change: ok.Change},
		"no weekdays":    {Match: "Dinner", Change: ok.Change},
		"weekday 8":      {Match: "Dinner", Weekdays: []int{8}, Change: ok.Change},
		"no change":      {Match: "Dinner", Weekdays: []int{1}},
		"bad time":       {Match: "Dinner", Weekdays: []int{1}, Change: household.SlotChange{Time: sp("7pm")}},
		"empty new name": {Match: "Dinner", Weekdays: []int{1}, Change: household.SlotChange{Name: sp("  ")}},
	}
	for name, in := range bad {
		var ve *household.ValidationError
		if err := in.Normalized().Validate(); !errors.As(err, &ve) {
			t.Errorf("%s: err = %v, want a ValidationError", name, err)
		}
	}
}
