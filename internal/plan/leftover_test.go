package plan_test

import (
	"errors"
	"math"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// B5-LO (ADR 0012, docs/dev/design/b5-lo.md): the pure rules of Leftovers by hand. Today in these tests is Monday 2026-11-09.

func ip(v int) *int { return &v }

func fp(v float64) *float64 { return &v }

func TestFreezeUseByIsTodayPlusTheFrozenUseByDays(t *testing.T) {
	cases := []struct {
		name      string
		recipe    *int
		household int
		want      string
	}{
		{"the Household's 90 days", nil, 90, "2027-02-07"},
		{"the Recipe's own days win", ip(30), 90, "2026-12-09"},
		{"a Recipe of 365 days", ip(365), 90, "2027-11-09"},
		{"a Recipe of 1 day", ip(1), 90, "2026-11-10"},
	}
	for _, tc := range cases {
		if got := plan.FreezeUseBy("2026-11-09", tc.recipe, tc.household); got != tc.want {
			t.Errorf("%s: FreezeUseBy = %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestTakeOutUseByIsTodayPlusTheRecipesUseByDays(t *testing.T) {
	cases := []struct {
		name   string
		recipe *int
		deflt  int
		want   string
	}{
		{"the Household default of 3 days", nil, 3, "2026-11-12"},
		{"the Recipe's own days", ip(5), 3, "2026-11-14"},
		{"0 days is the same day", ip(0), 3, "2026-11-09"},
	}
	for _, tc := range cases {
		if got := plan.TakeOutUseBy("2026-11-09", tc.recipe, tc.deflt); got != tc.want {
			t.Errorf("%s: TakeOutUseBy = %q, want %q", tc.name, got, tc.want)
		}
		if got, want := plan.TakeOutUseBy("2026-11-09", tc.recipe, tc.deflt), plan.LeftoverUseBy("2026-11-09", tc.recipe, tc.deflt); got != want {
			t.Errorf("%s: TakeOutUseBy %q differs from LeftoverUseBy %q: a taken-out Leftover is a normal Leftover", tc.name, got, want)
		}
	}
}

func TestIsToAnswer(t *testing.T) {
	avail := plan.Leftover{ID: 1, Portions: 3, UseBy: "2026-11-08", Status: plan.LeftoverAvailable}
	cases := []struct {
		name string
		mod  func(l *plan.Leftover)
		want bool
	}{
		{"past its Use-by with portions left", func(l *plan.Leftover) {}, true},
		{"still good on its Use-by date", func(l *plan.Leftover) { l.UseBy = "2026-11-09" }, false},
		{"Use-by in the future", func(l *plan.Leftover) { l.UseBy = "2026-11-10" }, false},
		{"nothing left", func(l *plan.Leftover) { l.Portions = 0 }, false},
		{"frozen Leftovers ask too", func(l *plan.Leftover) { l.FrozenOn = "2026-08-01"; l.StoragePlaceID = 4 }, true},
		{"a frozen one inside its Frozen Use-by does not", func(l *plan.Leftover) { l.FrozenOn = "2026-11-02"; l.UseBy = "2027-01-31" }, false},
		{"a discarded one (old rows) never asks", func(l *plan.Leftover) { l.Status = plan.LeftoverDiscarded }, false},
	}
	for _, tc := range cases {
		l := avail
		tc.mod(&l)
		if got := plan.IsToAnswer(l, "2026-11-09"); got != tc.want {
			t.Errorf("%s: IsToAnswer = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestFrozenIsTheFrozenDateNotThePlace(t *testing.T) {
	if (plan.Leftover{StoragePlaceID: 3}).Frozen() {
		t.Error("a Leftover in a place but with no frozen date is not frozen")
	}
	if !(plan.Leftover{FrozenOn: "2026-11-01"}).Frozen() {
		t.Error("a Leftover with a frozen date is frozen even when its Freezer was deleted (no place)")
	}
}

func TestPlannableLeftoversAreNeitherFrozenNorToAnswer(t *testing.T) {
	base := plan.Leftover{ID: 1, Portions: 2, UseBy: "2026-11-11", Status: plan.LeftoverAvailable}
	cases := []struct {
		name string
		mod  func(l *plan.Leftover)
		want bool
	}{
		{"an ordinary Leftover", func(l *plan.Leftover) {}, true},
		{"on its Use-by date", func(l *plan.Leftover) { l.UseBy = "2026-11-09" }, true},
		{"frozen", func(l *plan.Leftover) { l.FrozenOn = "2026-11-05"; l.UseBy = "2027-02-03" }, false},
		{"to answer", func(l *plan.Leftover) { l.UseBy = "2026-11-08" }, false},
		{"empty", func(l *plan.Leftover) { l.Portions = 0 }, false},
		{"discarded", func(l *plan.Leftover) { l.Status = plan.LeftoverDiscarded }, false},
	}
	for _, tc := range cases {
		l := base
		tc.mod(&l)
		if got := plan.Plannable(l, "2026-11-09"); got != tc.want {
			t.Errorf("%s: Plannable = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestThrownOutOn(t *testing.T) {
	cases := []struct {
		name      string
		answer    plan.LeftoverAnswer
		useBy     string
		wantOn    string
		wantWaste bool
	}{
		{"Threw it out before the Use-by counts today", plan.AnswerThrewOut, "2026-11-12", "2026-11-09", true},
		{"Threw it out on the Use-by date counts today", plan.AnswerThrewOut, "2026-11-09", "2026-11-09", true},
		{"Threw it out after the Use-by counts the day after the Use-by", plan.AnswerThrewOut, "2026-11-04", "2026-11-05", true},
		{"yesterday's Use-by counts today", plan.AnswerThrewOut, "2026-11-08", "2026-11-09", true},
		{"Had it is not waste", plan.AnswerHadIt, "2026-11-04", "", false},
		{"Wasn't there is not waste", plan.AnswerWasntThere, "2026-11-04", "", false},
		{"an unknown answer is not waste", plan.LeftoverAnswer("binned"), "2026-11-04", "", false},
	}
	for _, tc := range cases {
		on, waste := plan.ThrownOutOn(tc.answer, tc.useBy, "2026-11-09")
		if on != tc.wantOn || waste != tc.wantWaste {
			t.Errorf("%s: ThrownOutOn = %q, %v; want %q, %v", tc.name, on, waste, tc.wantOn, tc.wantWaste)
		}
	}
}

func TestTheThreeAnswersAreValidAndNothingElseIs(t *testing.T) {
	for _, a := range []plan.LeftoverAnswer{plan.AnswerHadIt, plan.AnswerThrewOut, plan.AnswerWasntThere} {
		if !a.Valid() {
			t.Errorf("%q must be a valid answer", a)
		}
	}
	for _, a := range []plan.LeftoverAnswer{"", "binned", "HAD_IT", "had it"} {
		if a.Valid() {
			t.Errorf("%q must not be a valid answer", a)
		}
	}
	if plan.AnswerHadIt != "had_it" || plan.AnswerThrewOut != "threw_out" || plan.AnswerWasntThere != "wasnt_there" {
		t.Error("the answers are the API's words had_it, threw_out and wasnt_there")
	}
}

func TestCheckPortions(t *testing.T) {
	cases := []struct {
		portions, left float64
		ok             bool
	}{
		{1, 3, true}, {0.5, 3, true}, {3, 3, true}, {3.0000000001, 3, true}, // rounding noise is tolerated
		{0, 3, false}, {-1, 3, false}, {3.5, 3, false}, {4, 3, false},
	}
	for _, tc := range cases {
		err := plan.CheckPortions(tc.portions, tc.left)
		if tc.ok && err != nil {
			t.Errorf("CheckPortions(%v, %v) = %v, want nil", tc.portions, tc.left, err)
		}
		if !tc.ok && !errors.Is(err, plan.ErrPortionsInvalid) {
			t.Errorf("CheckPortions(%v, %v) = %v, want ErrPortionsInvalid", tc.portions, tc.left, err)
		}
	}
	if err := plan.CheckPortions(math.NaN(), 3); !errors.Is(err, plan.ErrPortionsInvalid) {
		t.Errorf("NaN portions = %v, want ErrPortionsInvalid", err)
	}
}

func TestSplitForFreeze(t *testing.T) {
	cases := []struct {
		name                 string
		left                 float64
		take                 *float64
		wantFrozen, wantStay float64
		bad                  bool
	}{
		{"nothing said freezes all of it", 4, nil, 4, 0, false},
		{"part of it", 4, fp(2), 2, 2, false},
		{"half a portion", 4, fp(0.5), 0.5, 3.5, false},
		{"all of it, said out loud", 4, fp(4), 4, 0, false},
		{"zero", 4, fp(0), 0, 0, true},
		{"negative", 4, fp(-1), 0, 0, true},
		{"more than is left", 4, fp(4.5), 0, 0, true},
	}
	for _, tc := range cases {
		frozen, stays, err := plan.SplitForFreeze(tc.left, tc.take)
		if tc.bad {
			if !errors.Is(err, plan.ErrPortionsInvalid) {
				t.Errorf("%s: err = %v, want ErrPortionsInvalid", tc.name, err)
			}
			continue
		}
		if err != nil || frozen != tc.wantFrozen || stays != tc.wantStay {
			t.Errorf("%s: SplitForFreeze = %v, %v, %v; want %v, %v", tc.name, frozen, stays, err, tc.wantFrozen, tc.wantStay)
		}
	}
}

func deps() []plan.Dependant {
	at := func(h int) time.Time { return time.Date(2026, 11, 11, h, 0, 0, 0, time.UTC) }
	return []plan.Dependant{
		{Key: k("2026-11-11", 3), At: at(19), Portions: 2, Pinned: true},  // Wed dinner
		{Key: k("2026-11-11", 2), At: at(12), Portions: 2, Pinned: false}, // Wed lunch
		{Key: k("2026-11-12", 2), At: time.Date(2026, 11, 12, 12, 0, 0, 0, time.UTC), Portions: 1, Pinned: false},
	}
}

func TestPlannedClaimsAreTheSumOfTheDependantsPortions(t *testing.T) {
	if got := plan.PlannedClaims(deps()); got != 5 {
		t.Errorf("PlannedClaims = %v, want 5", got)
	}
	if got := plan.PlannedClaims(nil); got != 0 {
		t.Errorf("PlannedClaims(nil) = %v, want 0", got)
	}
}

func TestMisfitDependantsListsPinnedAndUnpinnedOnesThatLoseTheirPortions(t *testing.T) {
	// 3 portions remain: Wed lunch (2) is served first, Wed dinner (2) no longer fits, Thu lunch (1) still does.
	got := plan.MisfitDependants(3, deps())
	if want := []plan.Key{k("2026-11-11", 3)}; !reflect.DeepEqual(got, want) {
		t.Errorf("3 left: misfits = %v, want %v", got, want)
	}
	// 1 portion remains: both Wednesday meals lose out, Thursday lunch takes it.
	got = plan.MisfitDependants(1, deps())
	if want := []plan.Key{k("2026-11-11", 2), k("2026-11-11", 3)}; !reflect.DeepEqual(got, want) {
		t.Errorf("1 left: misfits = %v, want %v (in the order they are served, unpinned ones too)", got, want)
	}
	if got := plan.MisfitDependants(5, deps()); len(got) != 0 {
		t.Errorf("5 left: misfits = %v, want none", got)
	}
	if got := plan.MisfitDependants(0, deps()); len(got) != 3 {
		t.Errorf("none left: misfits = %v, want all three", got)
	}
}

func TestBuildInputLeavesFrozenAndToAnswerLeftoversToTheUser(t *testing.T) {
	s := baseSnapshot() // Monday 2026-11-09 12:00 UTC
	s.Leftovers = []plan.Leftover{
		{ID: 1, RecipeID: 5, From: k("2026-11-08", 1), Portions: 2, CookedOn: "2026-11-08", UseBy: "2026-11-11", Status: plan.LeftoverAvailable},
		{ID: 2, RecipeID: 6, From: k("2026-11-01", 1), Portions: 3, CookedOn: "2026-11-01", UseBy: "2027-01-30", Status: plan.LeftoverAvailable,
			StoragePlaceID: 4, FrozenOn: "2026-11-02"}, // frozen: used only when picked
		{ID: 3, RecipeID: 7, From: k("2026-11-02", 1), Portions: 2, CookedOn: "2026-11-02", UseBy: "2026-11-08", Status: plan.LeftoverAvailable}, // to answer
	}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	want := []planner.Leftover{{ID: 1, FromSlot: pk("2026-11-08", 1), RecipeID: 5, Portions: 2, CookedOn: "2026-11-08", UseBy: "2026-11-11"}}
	if !reflect.DeepEqual(in.Leftovers, want) {
		t.Errorf("planner Leftovers = %+v, want only the ordinary one %+v", in.Leftovers, want)
	}
}

func TestBuildInputDecidesToAnswerOnTheHouseholdDate(t *testing.T) {
	// 2026-11-09 23:30 UTC is already the 10th in Rome: a Leftover to use by the 9th is to answer there.
	rome, err := time.LoadLocation("Europe/Rome")
	if err != nil {
		t.Skip("no tzdata")
	}
	s := baseSnapshot()
	s.Now, s.Zone = time.Date(2026, 11, 9, 23, 30, 0, 0, time.UTC), rome
	s.Leftovers = []plan.Leftover{{ID: 1, RecipeID: 5, From: k("2026-11-05", 1), Portions: 2, CookedOn: "2026-11-05", UseBy: "2026-11-09", Status: plan.LeftoverAvailable}}
	in, err := plan.BuildInput(s)
	if err != nil {
		t.Fatal(err)
	}
	if len(in.Leftovers) != 0 {
		t.Errorf("planner Leftovers = %+v; in Rome it is the 10th, so a Leftover to use by the 9th is to answer", in.Leftovers)
	}
}
