package household_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/household"
)

func TestNewSlotsExpandOnePerWeekdayInOrder(t *testing.T) {
	in := household.NewSlotsInput{Entries: []household.NewSlotsEntry{
		{Name: " Lunch ", Time: "13:00", Weekdays: []int{3, 1, 3}},
		{Name: "Dinner", Time: "19:30", Weekdays: []int{2}},
	}}.Normalized()
	if err := in.Validate(); err != nil {
		t.Fatal(err)
	}
	got := in.Slots()
	if len(got) != 3 || got[0].Name != "Lunch" || got[0].Weekday != 1 || got[1].Weekday != 3 || got[2].Name != "Dinner" {
		t.Fatalf("Slots = %+v", got)
	}
	if got[0].Attendance != nil || got[0].Courses != nil {
		t.Errorf("Attendance and Courses are left to the store's defaults: %+v", got[0])
	}
}

func TestNewSlotsRefuseWhatASingleMealSlotRefuses(t *testing.T) {
	for field, e := range map[string]household.NewSlotsEntry{
		"name":     {Name: " ", Time: "13:00", Weekdays: []int{1}},
		"time":     {Name: "Lunch", Time: "1pm", Weekdays: []int{1}},
		"weekdays": {Name: "Lunch", Time: "13:00", Weekdays: []int{0}},
	} {
		err := household.NewSlotsInput{Entries: []household.NewSlotsEntry{e}}.Normalized().Validate()
		var ve *household.ValidationError
		if !errors.As(err, &ve) || ve.Field != field {
			t.Errorf("%s: err = %v", field, err)
		}
	}
	var ve *household.ValidationError
	if err := (household.NewSlotsInput{}).Validate(); !errors.As(err, &ve) || ve.Field != "slots" {
		t.Errorf("empty: err = %v", err)
	}
}
