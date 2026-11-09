package plan_test

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

var monday = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC) // a Monday

func k(date string, slot int64) plan.Key { return plan.Key{Date: date, MealSlotID: slot} }

func pk(date string, slot int64) planner.SlotKey {
	return planner.SlotKey{Date: planner.Date(date), MealSlotID: slot}
}

func slotInfo(date string, slot int64, hhmm string, members ...int64) plan.SlotInfo {
	s := plan.SlotInfo{Key: k(date, slot), Name: "Dinner", Time: hhmm}
	for _, m := range members {
		s.Attendance = append(s.Attendance, plan.Attendee{MemberID: m, Factor: 1})
	}
	return s
}

func baseSnapshot() plan.Snapshot {
	return plan.Snapshot{
		Now: monday, Zone: time.UTC, Seed: 42,
		Settings: plan.Settings{HorizonDays: 7, DefaultCooldownDays: 5, DefaultUseByDays: 2, Style: 0.25},
	}
}

func slotByKey(t *testing.T, in planner.Input, key planner.SlotKey) planner.Slot {
	t.Helper()
	for _, s := range in.Slots {
		if s.Key == key {
			return s
		}
	}
	t.Fatalf("planner input has no slot %v; slots: %v", key, in.Slots)
	return planner.Slot{}
}

func TestBuildInputNeedsAZoneAndWellFormedTimes(t *testing.T) {
	s := baseSnapshot()
	s.Zone = nil
	if _, err := plan.BuildInput(s); !errors.Is(err, plan.ErrNoZone) {
		t.Errorf("nil zone: err = %v, want ErrNoZone", err)
	}
	s = baseSnapshot()
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-10", 1, "7pm", 1)}
	if _, err := plan.BuildInput(s); !errors.Is(err, plan.ErrBadTime) {
		t.Errorf("bad time: err = %v, want ErrBadTime", err)
	}
}

func TestBuildInputPassesTheSettingsAndTheClockThrough(t *testing.T) {
	in, err := plan.BuildInput(baseSnapshot())
	if err != nil {
		t.Fatal(err)
	}
	if !in.Now.Equal(monday) || in.Seed != 42 || in.Style != 0.25 {
		t.Errorf("Now/Seed/Style = %v/%d/%v", in.Now, in.Seed, in.Style)
	}
	want := planner.DefaultConfig()
	want.DefaultCooldownDays, want.DefaultUseByDays = 5, 2
	if in.Config != want {
		t.Errorf("Config = %+v, want %+v (Household Cool-down 5 and Use-by 2, planner constants kept)", in.Config, want)
	}
}

func TestBuildInputDropsEmptySlotsInThePastButKeepsMealsAndLaterSlots(t *testing.T) {
	s := baseSnapshot()
	s.Now = time.Date(2026, 11, 9, 20, 0, 0, 0, time.UTC)
	s.Slots = []plan.SlotInfo{
		slotInfo("2026-11-09", 1, "12:00", 1), // empty and past: dropped
		slotInfo("2026-11-09", 2, "19:00", 1), // past but has a Cooked meal: kept
		slotInfo("2026-11-09", 3, "21:00", 1), // later today: kept
		slotInfo("2026-11-10", 1, "12:00", 1), // tomorrow: kept
		slotInfo("2026-11-09", 4, "20:00", 1), // exactly now: kept (not before Now)
	}
	s.Meals = []plan.Meal{{Key: k("2026-11-09", 2), RecipeID: 5, Batches: 1, State: plan.StateCooked}}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	var got []planner.SlotKey
	for _, sl := range in.Slots {
		got = append(got, sl.Key)
	}
	want := []planner.SlotKey{pk("2026-11-09", 2), pk("2026-11-09", 3), pk("2026-11-10", 1), pk("2026-11-09", 4)}
	if !sameKeys(got, want) {
		t.Errorf("slots = %v, want %v (any order)", got, want)
	}
}

func sameKeys(a, b []planner.SlotKey) bool {
	if len(a) != len(b) {
		return false
	}
	seen := map[planner.SlotKey]int{}
	for _, x := range a {
		seen[x]++
	}
	for _, x := range b {
		seen[x]--
	}
	for _, n := range seen {
		if n != 0 {
			return false
		}
	}
	return true
}

func TestBuildInputSlotInstantsFollowTheHouseholdZone(t *testing.T) {
	s := baseSnapshot()
	s.Zone = rome(t)
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-10", 1, "19:30", 1)}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := slotByKey(t, in, pk("2026-11-10", 1)).At, time.Date(2026, 11, 10, 18, 30, 0, 0, time.UTC); !got.Equal(want) {
		t.Errorf("At = %v, want %v", got, want)
	}
}

func TestBuildInputMapsEveryMealStateAndTheLeftoverSource(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{
		slotInfo("2026-11-10", 1, "19:00", 1), slotInfo("2026-11-11", 1, "19:00", 1),
		slotInfo("2026-11-12", 1, "19:00", 1), slotInfo("2026-11-13", 1, "19:00", 1),
		slotInfo("2026-11-14", 1, "19:00", 1),
	}
	s.Meals = []plan.Meal{
		{Key: k("2026-11-10", 1), RecipeID: 1, Batches: 2, State: plan.StatePlanned},
		{Key: k("2026-11-11", 1), RecipeID: 2, Batches: 1.5, State: plan.StatePlanned, Pinned: true},
		{Key: k("2026-11-12", 1), RecipeID: 3, Batches: 1, State: plan.StateCooked, Pinned: true},
		{Key: k("2026-11-13", 1), RecipeID: 4, State: plan.StateSkipped},
		{Key: k("2026-11-14", 1), RecipeID: 1, State: plan.StatePlanned, From: &plan.Source{LeftoverID: 8, From: k("2026-11-10", 1)}},
	}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		key  planner.SlotKey
		want planner.ExistingMeal
	}{
		{pk("2026-11-10", 1), planner.ExistingMeal{State: planner.MealPlanned, RecipeID: 1, Batches: 2}},
		{pk("2026-11-11", 1), planner.ExistingMeal{State: planner.MealPinned, RecipeID: 2, Batches: 1.5}},
		{pk("2026-11-12", 1), planner.ExistingMeal{State: planner.MealCooked, RecipeID: 3, Batches: 1}},
		{pk("2026-11-13", 1), planner.ExistingMeal{State: planner.MealSkipped, RecipeID: 4}},
		{pk("2026-11-14", 1), planner.ExistingMeal{State: planner.MealPlanned, RecipeID: 1,
			From: &planner.LeftoverSource{LeftoverID: 8, FromSlot: pk("2026-11-10", 1)}}},
	}
	for _, c := range cases {
		got := slotByKey(t, in, c.key).Existing
		if got == nil || !reflect.DeepEqual(*got, c.want) {
			t.Errorf("Existing at %v = %+v, want %+v", c.key, got, c.want)
		}
	}
}

func TestBuildInputClearEmptiesOnlyUnpinnedPlannedMeals(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-10", 1, "19:00", 1), slotInfo("2026-11-11", 1, "19:00", 1), slotInfo("2026-11-12", 1, "19:00", 1)}
	s.Meals = []plan.Meal{
		{Key: k("2026-11-10", 1), RecipeID: 1, Batches: 1, State: plan.StatePlanned},
		{Key: k("2026-11-11", 1), RecipeID: 2, Batches: 1, State: plan.StatePlanned, Pinned: true},
		{Key: k("2026-11-12", 1), RecipeID: 3, Batches: 1, State: plan.StateCooked},
	}
	s.Clear = []plan.Key{k("2026-11-10", 1), k("2026-11-11", 1), k("2026-11-12", 1)}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if slotByKey(t, in, pk("2026-11-10", 1)).Existing != nil {
		t.Error("an unpinned Planned Meal in Clear must be treated as empty")
	}
	if slotByKey(t, in, pk("2026-11-11", 1)).Existing == nil || slotByKey(t, in, pk("2026-11-12", 1)).Existing == nil {
		t.Error("Pinned and Cooked meals must survive Clear")
	}
}

func TestBuildInputAttendanceDropsZeroFactorsAndKeepsSlotRulesPerMealSlot(t *testing.T) {
	s := baseSnapshot()
	s.Slots = []plan.SlotInfo{
		{Key: k("2026-11-13", 7), Name: "Dinner", Time: "19:00",
			Attendance: []plan.Attendee{{MemberID: 1, Factor: 1}, {MemberID: 2, Factor: 0.5}, {MemberID: 3, Factor: 0}}},
		slotInfo("2026-11-13", 8, "12:00", 1),
	}
	s.SlotRules = []plan.SlotRule{{ID: 1, MealSlotID: 7, Tag: "Pizza"}, {ID: 2, MealSlotID: 7, RecipeID: 40}, {ID: 3, MealSlotID: 99, Tag: "x"}}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	dinner := slotByKey(t, in, pk("2026-11-13", 7))
	if want := []planner.Attendee{{MemberID: 1, PortionFactor: 1}, {MemberID: 2, PortionFactor: 0.5}}; !reflect.DeepEqual(dinner.Attendance, want) {
		t.Errorf("Attendance = %+v, want %+v", dinner.Attendance, want)
	}
	if want := []planner.SlotRule{{Tag: "pizza"}, {RecipeID: 40}}; !reflect.DeepEqual(dinner.Rules, want) {
		t.Errorf("Rules = %+v, want %+v (tags normalised, other slots' rules left out)", dinner.Rules, want)
	}
	if lunch := slotByKey(t, in, pk("2026-11-13", 8)); len(lunch.Rules) != 0 {
		t.Errorf("lunch Rules = %+v, want none", lunch.Rules)
	}
}

func TestBuildInputNormalisesTagsOfRecipesAndVarietyRules(t *testing.T) {
	s := baseSnapshot()
	s.Recipes = []planner.Recipe{{ID: 1, Yield: 4, Tags: []planner.Tag{"Fish", "  Quick  Meals "}}}
	s.VarietyRules = []plan.VarietyRule{{Tag: "FISH", MaxPerWeek: 2, NotConsecutiveDays: true}}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if want := []planner.Tag{"fish", "quick meals"}; !reflect.DeepEqual(in.Recipes[0].Tags, want) {
		t.Errorf("Recipe Tags = %v, want %v (recipe.TagKey)", in.Recipes[0].Tags, want)
	}
	if want := []planner.VarietyRule{{Tag: "fish", MaxPerWeek: 2, NotConsecutiveDays: true}}; !reflect.DeepEqual(in.VarietyRules, want) {
		t.Errorf("VarietyRules = %+v, want %+v", in.VarietyRules, want)
	}
}

func TestBuildInputLeftoversExcludeDiscardedAndEmptyOnes(t *testing.T) {
	s := baseSnapshot()
	s.Leftovers = []plan.Leftover{
		{ID: 1, RecipeID: 5, From: k("2026-11-08", 1), Portions: 2, CookedOn: "2026-11-08", UseBy: "2026-11-11", Status: plan.LeftoverAvailable},
		{ID: 2, RecipeID: 5, Portions: 3, UseBy: "2026-11-12", Status: plan.LeftoverDiscarded},
		{ID: 3, RecipeID: 6, Portions: 0, UseBy: "2026-11-12", Status: plan.LeftoverAvailable},
	}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	want := []planner.Leftover{{ID: 1, FromSlot: pk("2026-11-08", 1), RecipeID: 5, Portions: 2, CookedOn: "2026-11-08", UseBy: "2026-11-11"}}
	if !reflect.DeepEqual(in.Leftovers, want) {
		t.Errorf("Leftovers = %+v, want %+v", in.Leftovers, want)
	}
}

func TestBuildInputLastPlannedIsTheLatestHistoryDatePerRecipe(t *testing.T) {
	s := baseSnapshot()
	s.History = []plan.HistoryEntry{{RecipeID: 1, Date: "2026-11-02"}, {RecipeID: 1, Date: "2026-11-06"}, {RecipeID: 2, Date: "2026-10-30"}}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if want := map[planner.RecipeID]planner.Date{1: "2026-11-06", 2: "2026-10-30"}; !reflect.DeepEqual(in.LastPlanned, want) {
		t.Errorf("LastPlanned = %v, want %v", in.LastPlanned, want)
	}
}

func TestBuildInputCarriesStockPacksAndPreferencesUnchanged(t *testing.T) {
	s := baseSnapshot()
	s.Lots = []planner.StockLot{{ID: 1, IngredientID: 7, Quantity: 500, Purchased: "2026-11-08", GoesOff: "2026-11-12"}}
	s.ShelfLife = map[planner.IngredientID]int{7: 5}
	s.Packs = map[planner.IngredientID]planner.Pack{7: {ProductID: 3, Size: 1000}}
	s.Preferences = map[int64]planner.Preferences{4: {Favourites: []planner.RecipeID{1}}}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(in.Lots, s.Lots) || !reflect.DeepEqual(in.ShelfLifeDays, s.ShelfLife) || !reflect.DeepEqual(in.Packs, s.Packs) {
		t.Errorf("Lots/ShelfLifeDays/Packs were altered: %+v %+v %+v", in.Lots, in.ShelfLifeDays, in.Packs)
	}
	if got := in.Members[planner.MemberID(4)]; !reflect.DeepEqual(got, s.Preferences[4]) {
		t.Errorf("Members[4] = %+v", got)
	}
}

func TestBuildInputPassesAnUnconfirmedMealWhoseSlotIsOverAsPinned(t *testing.T) {
	s := baseSnapshot()
	s.Now = time.Date(2026, 11, 10, 8, 0, 0, 0, time.UTC)
	s.Slots = []plan.SlotInfo{slotInfo("2026-11-09", 1, "19:00", 1), slotInfo("2026-11-10", 1, "19:00", 1)}
	s.Meals = []plan.Meal{
		{Key: k("2026-11-09", 1), RecipeID: 1, Batches: 1, State: plan.StatePlanned}, // last night's dinner, never confirmed
		{Key: k("2026-11-10", 1), RecipeID: 2, Batches: 1, State: plan.StatePlanned}, // tonight's
	}
	s.Clear = []plan.Key{k("2026-11-09", 1), k("2026-11-10", 1)}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if got := slotByKey(t, in, pk("2026-11-09", 1)).Existing; got == nil || got.State != planner.MealPinned || got.RecipeID != 1 {
		t.Errorf("last night's unconfirmed meal = %+v, want MealPinned (not replanned, not cleared)", got)
	}
	if slotByKey(t, in, pk("2026-11-10", 1)).Existing != nil {
		t.Error("tonight's unpinned meal in Clear must still be treated as empty")
	}
}
