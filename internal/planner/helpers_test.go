package planner

import (
	"math"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

const (
	anna MemberID = 1
	ben  MemberID = 2
	carl MemberID = 3
)

const (
	chicken IngredientID = 10 + iota
	spinach
	rice
	pasta
	garlic
)

const (
	lunchSlot  int64 = 1
	dinnerSlot int64 = 2
)

// baseDay is a Monday (ISO week 46 of 2026).
var baseDay = time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)

func day(n int) Date { return Date(baseDay.AddDate(0, 0, n).Format("2006-01-02")) }

// now is Monday 08:00.
func now() time.Time { return baseDay.Add(8 * time.Hour) }

func both() []Attendee { return []Attendee{{anna, 1}, {ben, 1}} }

func slotAt(n int, id int64, hour, min int, att []Attendee) Slot {
	if att == nil {
		att = both()
	}
	return Slot{
		Key:        SlotKey{day(n), id},
		At:         baseDay.AddDate(0, 0, n).Add(time.Duration(hour)*time.Hour + time.Duration(min)*time.Minute),
		Attendance: att,
	}
}

// dinner is the 19:30 slot on day n, attended by anna and ben (2 portions) unless att is given.
func dinner(n int, att ...Attendee) Slot { return slotAt(n, dinnerSlot, 19, 30, att) }

func lunch(n int) Slot { return slotAt(n, lunchSlot, 12, 0, nil) }

func key(n int) SlotKey { return SlotKey{day(n), dinnerSlot} }

func withRules(s Slot, r ...SlotRule) Slot { s.Rules = r; return s }

func withExisting(s Slot, m ExistingMeal) Slot { s.Existing = &m; return s }

func intp(i int) *int { return &i }

type recipeOpt func(*Recipe)

func rcp(id RecipeID, yield float64, opts ...recipeOpt) Recipe {
	r := Recipe{ID: id, Yield: yield}
	for _, o := range opts {
		o(&r)
	}
	return r
}

func tags(t ...Tag) recipeOpt      { return func(r *Recipe) { r.Tags = t } }
func needs(n ...Need) recipeOpt    { return func(r *Recipe) { r.Needs = n } }
func archived() recipeOpt          { return func(r *Recipe) { r.Archived = true } }
func cooldown(days int) recipeOpt  { return func(r *Recipe) { r.CooldownDays = intp(days) } }
func useByDays(days int) recipeOpt { return func(r *Recipe) { r.UseByDays = intp(days) } }
func lead(d time.Duration) recipeOpt {
	return func(r *Recipe) { r.AdvanceSteps = append(r.AdvanceSteps, AdvanceStep{Lead: d}) }
}

func need(ing IngredientID, q float64) Need { return Need{IngredientID: ing, Quantity: q} }
func optional(ing IngredientID, q float64) Need {
	return Need{IngredientID: ing, Quantity: q, Optional: true}
}

func lot(id int64, ing IngredientID, qty float64, goesOff Date) StockLot {
	return StockLot{ID: id, IngredientID: ing, Quantity: qty, Purchased: day(-3), GoesOff: goesOff}
}

func leftoverOf(id int64, r RecipeID, portions float64, useBy Date) Leftover {
	return Leftover{ID: id, RecipeID: r, Portions: portions, CookedOn: day(-1), UseBy: useBy}
}

// baseInput has all score weights at zero (so ties go to the lowest Recipe id),
// the default Config, and no preferences.
func baseInput(slots []Slot, recipes ...Recipe) Input {
	return Input{
		Now:     now(),
		Seed:    1,
		Style:   0.5,
		Weights: &Weights{},
		Config:  DefaultConfig(),
		Slots:   slots,
		Recipes: recipes,
	}
}

func weighted(in Input, w Weights) Input { in.Weights = &w; return in }

func noCooldown(in Input) Input { in.Config.DefaultCooldownDays = 0; return in }

func prefs(in Input, m MemberID, p Preferences) Input {
	if in.Members == nil {
		in.Members = map[MemberID]Preferences{}
	}
	in.Members[m] = p
	return in
}

func mustPlan(t *testing.T, in Input) Result {
	t.Helper()
	r, err := Plan(in)
	if err != nil {
		t.Fatalf("Plan: %v", err)
	}
	return r
}

func placementAt(t *testing.T, r Result, k SlotKey) Placement {
	t.Helper()
	for _, p := range r.Placements {
		if p.Key == k {
			return p
		}
	}
	t.Fatalf("no placement for %+v in %+v (unfilled %+v)", k, r.Placements, r.Unfilled)
	return Placement{}
}

func unfilledAt(t *testing.T, r Result, k SlotKey) Unfilled {
	t.Helper()
	for _, u := range r.Unfilled {
		if u.Key == k {
			return u
		}
	}
	t.Fatalf("slot %+v is not unfilled; placements %+v", k, r.Placements)
	return Unfilled{}
}

func approx(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func wantScore(t *testing.T, p Placement, want float64) {
	t.Helper()
	if !approx(p.Score, want) {
		t.Errorf("score = %v, want %v (terms %+v)", p.Score, want, p.Terms)
	}
}

func termValue(p Placement, c TermCode) float64 {
	for _, tm := range p.Terms {
		if tm.Term == c {
			return tm.Value
		}
	}
	return 0
}

func equalResults(a, b Result) bool { return reflect.DeepEqual(a, b) }

// planSignature is the sequence of chosen Recipes, e.g. "1,4,7".
func planSignature(r Result) string {
	var s []string
	for _, p := range r.Placements {
		s = append(s, strconv.Itoa(int(p.RecipeID)))
	}
	return strings.Join(s, ",")
}
