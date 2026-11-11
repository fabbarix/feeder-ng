package plan_test

import (
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

func rome(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Rome")
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

func TestTodayIsTheHouseholdDate(t *testing.T) {
	now := time.Date(2026, 11, 9, 23, 30, 0, 0, time.UTC) // 00:30 on the 10th in Rome
	if got := plan.Today(now, rome(t)); got != "2026-11-10" {
		t.Errorf("Today in Rome = %q, want 2026-11-10", got)
	}
	if got := plan.Today(now, time.UTC); got != "2026-11-09" {
		t.Errorf("Today in UTC = %q, want 2026-11-09", got)
	}
}

func TestHorizonDatesStartAtTodayAndCrossMonthsAndLeapDays(t *testing.T) {
	cases := []struct {
		today string
		days  int
		want  []string
	}{
		{"2026-11-27", 5, []string{"2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01"}},
		{"2028-02-28", 3, []string{"2028-02-28", "2028-02-29", "2028-03-01"}},
		{"2026-11-09", 1, []string{"2026-11-09"}},
		{"2026-11-09", 0, nil},
	}
	for _, c := range cases {
		if got := plan.HorizonDates(c.today, c.days); !reflect.DeepEqual(got, c.want) {
			t.Errorf("HorizonDates(%s, %d) = %v, want %v", c.today, c.days, got, c.want)
		}
	}
}

func TestSlotInstantUsesTheHouseholdZone(t *testing.T) {
	got, err := plan.SlotInstant("2026-11-10", "19:30", rome(t))
	if err != nil {
		t.Fatal(err)
	}
	if want := time.Date(2026, 11, 10, 18, 30, 0, 0, time.UTC); !got.Equal(want) {
		t.Errorf("SlotInstant = %v, want %v", got, want)
	}
	// Summer time: UTC+2.
	got, _ = plan.SlotInstant("2026-07-15", "19:30", rome(t))
	if want := time.Date(2026, 7, 15, 17, 30, 0, 0, time.UTC); !got.Equal(want) {
		t.Errorf("SlotInstant in summer = %v, want %v", got, want)
	}
	for _, bad := range []string{"7:30", "24:00", "19:60", "", "19h30"} {
		if _, err := plan.SlotInstant("2026-11-10", bad, time.UTC); err == nil {
			t.Errorf("SlotInstant(%q) must fail with ErrBadTime", bad)
		}
	}
}

func TestSeedForIsStableNonNegativeAndDiffersPerGeneration(t *testing.T) {
	seen := map[int64]int64{}
	for g := int64(1); g <= 50; g++ {
		s := plan.SeedFor(g)
		if s < 0 {
			t.Fatalf("SeedFor(%d) = %d, want >= 0", g, s)
		}
		if s != plan.SeedFor(g) {
			t.Fatalf("SeedFor(%d) is not deterministic", g)
		}
		if other, dup := seen[s]; dup {
			t.Fatalf("generations %d and %d share seed %d", other, g, s)
		}
		seen[s] = g
	}
}

func TestWhyConversionKeepsEveryParameter(t *testing.T) {
	got := plan.WhyFrom(planner.Why{Code: planner.ReasonFavourite, Value: 4, MemberIDs: []planner.MemberID{3, 5},
		IngredientID: 7, RecipeID: 9, Tag: "fish", Date: "2026-11-11"})
	want := plan.Why{Code: "favourite", Value: 4, MemberIDs: []int64{3, 5}, IngredientID: 7, RecipeID: 9, Tag: "fish", Date: "2026-11-11"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("WhyFrom = %+v, want %+v", got, want)
	}
	all := plan.WhyAll([]planner.Why{{Code: planner.ReasonSlotRule, Tag: "fish"}, {Code: planner.ReasonLeftover, RecipeID: 4}})
	if len(all) != 2 || all[0].Code != "slot_rule" || all[1].Code != "leftover" {
		t.Errorf("WhyAll = %+v", all)
	}
}

func TestWhyJSONRoundTrip(t *testing.T) {
	in := []plan.Why{
		{Code: "ingredient_overlap", Value: 1.5, IngredientID: 7, Date: "2026-11-09"},
		{Code: "favourite", Value: 2, MemberIDs: []int64{1}},
	}
	s, err := plan.EncodeWhy(in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := plan.DecodeWhy(s)
	if err != nil || !reflect.DeepEqual(in, out) {
		t.Fatalf("round trip = %+v, %v; want %+v", out, err, in)
	}
	if s, _ := plan.EncodeWhy(nil); s != "[]" {
		t.Errorf("EncodeWhy(nil) = %q, want []", s)
	}
	if out, err := plan.DecodeWhy("[]"); err != nil || len(out) != 0 {
		t.Errorf("DecodeWhy([]) = %v, %v", out, err)
	}
	if _, err := plan.DecodeWhy("{nope"); err == nil {
		t.Error("DecodeWhy must reject malformed JSON")
	}
}

func TestStartByIsTheSlotLessTheCookingTimeInTheHouseholdZone(t *testing.T) {
	slot, err := plan.SlotInstant("2026-11-10", "19:30", rome(t))
	if err != nil {
		t.Fatal(err)
	}
	if got := plan.StartBy(slot, 45); got != "18:45" {
		t.Errorf("StartBy 45 min = %q, want 18:45", got)
	}
	if got := plan.StartBy(slot, 90); got != "18:00" {
		t.Errorf("StartBy 90 min = %q, want 18:00", got)
	}
}

func TestStartByCrossesMidnightAndIsEmptyWhenUnknown(t *testing.T) {
	slot, err := plan.SlotInstant("2026-11-10", "00:20", rome(t))
	if err != nil {
		t.Fatal(err)
	}
	if got := plan.StartBy(slot, 60); got != "23:20" {
		t.Errorf("StartBy across midnight = %q, want 23:20", got)
	}
	if got := plan.StartBy(slot, 0); got != "" {
		t.Errorf("StartBy without a cooking time = %q, want empty", got)
	}
}
