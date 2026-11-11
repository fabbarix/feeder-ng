package notify_test

import (
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/notify"
)

func zone(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Fatalf("zone %s: %v", name, err)
	}
	return loc
}

// 2026-11-09 is a Monday; Rome is UTC+1 then, so 19:30 Rome = 18:30Z.
func slot1930(loc *time.Location) time.Time { return time.Date(2026, 11, 9, 19, 30, 0, 0, loc) }

func curry(loc *time.Location) notify.MealFact {
	return notify.MealFact{
		Date: "2026-11-09", MealSlotID: 3, RecipeName: "Chicken curry",
		SlotAt: slot1930(loc), State: notify.MealPlanned, TotalTime: 45 * time.Minute,
		AdvanceSteps: []notify.AdvanceStepFact{{ID: 11, Description: "Marinate the chicken", Lead: 4 * time.Hour}},
	}
}

func byType(cs []notify.Candidate, t notify.Type) []notify.Candidate {
	var out []notify.Candidate
	for _, c := range cs {
		if c.Type == t {
			out = append(out, c)
		}
	}
	return out
}

func only(t *testing.T, cs []notify.Candidate, typ notify.Type) notify.Candidate {
	t.Helper()
	got := byType(cs, typ)
	if len(got) != 1 {
		t.Fatalf("want exactly one %s candidate, got %d in %+v", typ, len(got), cs)
	}
	return got[0]
}

func TestAdvanceStepIsDueSlotTimeMinusLeadTime(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	cs := notify.Compute(notify.Facts{Meals: []notify.MealFact{curry(rome)}}, rome)
	c := only(t, cs, notify.AdvanceStep)
	if want := time.Date(2026, 11, 9, 15, 30, 0, 0, rome); !c.At.Equal(want) {
		t.Errorf("At = %s, want %s", c.At, want)
	}
	if c.Body != "Marinate the chicken now for 19:30" {
		t.Errorf("Body = %q", c.Body)
	}
	if c.Title != "Advance Step" {
		t.Errorf("Title = %q", c.Title)
	}
}

func TestStartCookingIsDueSlotTimeMinusTotalTime(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	cs := notify.Compute(notify.Facts{Meals: []notify.MealFact{curry(rome)}}, rome)
	c := only(t, cs, notify.StartCooking)
	if want := time.Date(2026, 11, 9, 18, 45, 0, 0, rome); !c.At.Equal(want) {
		t.Errorf("At = %s, want %s", c.At, want)
	}
	if c.Body != "Start cooking Chicken curry now to eat at 19:30" {
		t.Errorf("Body = %q", c.Body)
	}
}

func TestStartCookingIsSkippedWhenTotalTimeUnknown(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	m := curry(rome)
	m.TotalTime = 0
	cs := notify.Compute(notify.Facts{Meals: []notify.MealFact{m}}, rome)
	if got := byType(cs, notify.StartCooking); len(got) != 0 {
		t.Errorf("want no Start cooking, got %+v", got)
	}
}

func TestConfirmCookedIsTwoHoursAfterSlotTimeWhileUnconfirmed(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	cs := notify.Compute(notify.Facts{Meals: []notify.MealFact{curry(rome)}}, rome)
	c := only(t, cs, notify.ConfirmCooked)
	if want := time.Date(2026, 11, 9, 21, 30, 0, 0, rome); !c.At.Equal(want) {
		t.Errorf("At = %s, want %s", c.At, want)
	}
	if c.Body != "Did you cook Chicken curry?" {
		t.Errorf("Body = %q", c.Body)
	}
}

func TestResolvedMealsGetNoReminders(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	for _, state := range []string{"cooked", "skipped"} {
		m := curry(rome)
		m.State = state
		if cs := notify.Compute(notify.Facts{Meals: []notify.MealFact{m}}, rome); len(cs) != 0 {
			t.Errorf("state %s: want none, got %+v", state, cs)
		}
	}
}

func TestAMealServedFromALeftoverHasNothingToPrepareButStillNeedsConfirming(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	m := curry(rome)
	m.FromLeftover = true
	cs := notify.Compute(notify.Facts{Meals: []notify.MealFact{m}}, rome)
	if len(cs) != 1 || cs[0].Type != notify.ConfirmCooked {
		t.Fatalf("want only Confirm Cooked, got %+v", cs)
	}
}

func TestLeftoverUseByIsTenInTheMorningOnTheUseByDate(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	f := notify.Facts{Leftovers: []notify.LeftoverFact{{ID: 5, RecipeName: "Chicken curry", Portions: 2, UseBy: "2026-11-10"}}}
	c := only(t, notify.Compute(f, rome), notify.LeftoverUseBy)
	if want := time.Date(2026, 11, 10, 10, 0, 0, 0, rome); !c.At.Equal(want) {
		t.Errorf("At = %s, want %s", c.At, want)
	}
	if c.Body != "Use up the Chicken curry (2 portions) today" {
		t.Errorf("Body = %q", c.Body)
	}
	f.Leftovers[0].Portions = 1
	if got := only(t, notify.Compute(f, rome), notify.LeftoverUseBy).Body; got != "Use up the Chicken curry (1 portion) today" {
		t.Errorf("Body = %q", got)
	}
}

// A Lot is fine on its go-off date and goes off on go-off date + 1 (functional-spec 6.1),
// so the day before it goes off is the go-off date itself.
func TestStockSpoilIsTenInTheMorningOnTheGoOffDateUnlessAPlanUsesIt(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	f := notify.Facts{Lots: []notify.LotFact{
		{ID: 1, IngredientName: "Spinach", GoesOff: "2026-11-12"},
		{ID: 2, IngredientName: "Milk", GoesOff: "2026-11-12", UsedByPlan: true},
		{ID: 3, IngredientName: "Rice"}, // never goes off
	}}
	cs := byType(notify.Compute(f, rome), notify.StockSpoil)
	if len(cs) != 1 {
		t.Fatalf("want 1 Stock about to spoil, got %+v", cs)
	}
	if want := time.Date(2026, 11, 12, 10, 0, 0, 0, rome); !cs[0].At.Equal(want) {
		t.Errorf("At = %s, want %s", cs[0].At, want)
	}
	if cs[0].Body != "Spinach goes off tomorrow and no Planned Meal uses it" {
		t.Errorf("Body = %q", cs[0].Body)
	}
}

func TestDatesAreReadInTheHouseholdTimeZone(t *testing.T) {
	f := notify.Facts{Leftovers: []notify.LeftoverFact{{ID: 5, RecipeName: "Soup", Portions: 2, UseBy: "2026-11-10"}}}
	utc := only(t, notify.Compute(f, time.UTC), notify.LeftoverUseBy).At
	rome := only(t, notify.Compute(f, zone(t, "Europe/Rome")), notify.LeftoverUseBy).At
	if want := time.Date(2026, 11, 10, 10, 0, 0, 0, time.UTC); !utc.Equal(want) {
		t.Errorf("UTC household: %s, want %s", utc, want)
	}
	if want := time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC); !rome.Equal(want) {
		t.Errorf("Rome household: %s, want %s", rome, want)
	}
}

func TestTenOClockIsExactAcrossADaylightSavingChange(t *testing.T) {
	rome := zone(t, "Europe/Rome") // DST ends 2026-10-25 03:00
	f := notify.Facts{Leftovers: []notify.LeftoverFact{{ID: 5, RecipeName: "Soup", Portions: 2, UseBy: "2026-10-25"}}}
	at := only(t, notify.Compute(f, rome), notify.LeftoverUseBy).At
	if want := time.Date(2026, 10, 25, 9, 0, 0, 0, time.UTC); !at.Equal(want) { // 10:00 CET
		t.Errorf("At = %s, want %s", at.UTC(), want)
	}
}

func TestKeysAreStableAndChangeWhenTheDueTimeMoves(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	facts := notify.Facts{Meals: []notify.MealFact{curry(rome)}}
	a := notify.Compute(facts, rome)
	b := notify.Compute(facts, rome)
	if len(a) != len(b) {
		t.Fatal("not deterministic")
	}
	seen := map[string]bool{}
	for i := range a {
		if a[i].Key != b[i].Key || a[i].Key == "" {
			t.Errorf("key %q vs %q", a[i].Key, b[i].Key)
		}
		if seen[a[i].Key] {
			t.Errorf("duplicate key %q", a[i].Key)
		}
		seen[a[i].Key] = true
		if !strings.HasPrefix(a[i].Key, string(a[i].Type)+":") {
			t.Errorf("key %q should start with the type", a[i].Key)
		}
	}
	moved := curry(rome)
	moved.SlotAt = moved.SlotAt.Add(time.Hour)
	c := notify.Compute(notify.Facts{Meals: []notify.MealFact{moved}}, rome)
	for _, x := range c {
		if seen[x.Key] {
			t.Errorf("moving the slot should give a new key, %q repeated", x.Key)
		}
	}
}

func TestCandidatesAreOrderedByDueTime(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	cs := notify.Compute(notify.Facts{Meals: []notify.MealFact{curry(rome)}}, rome)
	for i := 1; i < len(cs); i++ {
		if cs[i].At.Before(cs[i-1].At) {
			t.Fatalf("not sorted: %v before %v", cs[i].At, cs[i-1].At)
		}
	}
	if len(cs) != 3 {
		t.Errorf("want advance step, start cooking, confirm; got %d", len(cs))
	}
}

func TestCandidatesDeepLinkToTheScreenThatActsOnThem(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	f := notify.Facts{
		Meals:     []notify.MealFact{curry(rome)},
		Leftovers: []notify.LeftoverFact{{ID: 5, RecipeName: "Chicken curry", Portions: 2, UseBy: "2026-11-09"}},
		Lots:      []notify.LotFact{{ID: 9, IngredientName: "Spinach", GoesOff: "2026-11-10"}},
	}
	cs := notify.Compute(f, rome)
	want := map[notify.Type]string{
		notify.AdvanceStep: "/plan", notify.StartCooking: "/plan", notify.ConfirmCooked: "/plan",
		notify.LeftoverUseBy: "/plan", notify.StockSpoil: "/stock",
	}
	for typ, url := range want {
		if got := only(t, cs, typ).URL; got != url {
			t.Errorf("%s URL = %q, want %q", typ, got, url)
		}
	}
}

func TestNotificationTextUsesGlossaryTerms(t *testing.T) {
	rome := zone(t, "Europe/Rome")
	f := notify.Facts{
		Meals:     []notify.MealFact{curry(rome)},
		Leftovers: []notify.LeftoverFact{{ID: 5, RecipeName: "Chicken curry", Portions: 2, UseBy: "2026-11-09"}},
		Lots:      []notify.LotFact{{ID: 9, IngredientName: "Spinach", GoesOff: "2026-11-10"}},
	}
	for _, c := range notify.Compute(f, rome) {
		for _, bad := range []string{"prep-ahead", "prep ahead", " dish", "meal plan"} {
			if strings.Contains(strings.ToLower(c.Title+" "+c.Body), bad) {
				t.Errorf("%s text %q %q contains %q", c.Type, c.Title, c.Body, bad)
			}
		}
	}
}
