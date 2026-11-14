package facts_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

// beta.8, base team (docs/dev/design/b8-base.md section 2): the facts count Stock like Cook Mode, and Cook Mode now ignores a
// Lot that has gone off by the meal's date (the Shopping List's rule). A gone-off jar of the Base recipe does not cover
// it, so Start cooking leaves early enough for Béchamel's Steps (65 minutes, not 40).

func TestFactsDoNotCountAJarThatHasGoneOffByTheMealDate(t *testing.T) {
	w := newBechamelWorld(t, standardBechamel())
	w.lot(t, w.bechamelIng, "2026-11-08") // gone off the day before the meal
	w.meal(t, "2026-11-09", w.dinner, w.lasagne, plan.StatePlanned, nil)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, _ := find(f, "2026-11-09", w.dinner)
	if got := leadMinutes(t, m); got != 65 {
		t.Errorf("the timeline takes %d minutes, want 65: a gone-off jar covers nothing", got)
	}
	for i, st := range m.Steps[:2] {
		if st.DurationMinutes == 0 {
			t.Errorf("Béchamel Step %d is zero-length: the gone-off jar must not cover it", i)
		}
	}
}

func TestFactsStillCountAJarThatGoesOffOnTheMealDate(t *testing.T) {
	w := newBechamelWorld(t, standardBechamel())
	w.lot(t, w.bechamelIng, "2026-11-09") // usable on its go-off date
	w.meal(t, "2026-11-09", w.dinner, w.lasagne, plan.StatePlanned, nil)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, _ := find(f, "2026-11-09", w.dinner)
	if got := leadMinutes(t, m); got != 40 {
		t.Errorf("the timeline takes %d minutes, want 40: the jar is usable on the 9th", got)
	}
}

func TestFactsJudgeAJarByEachMealsOwnDate(t *testing.T) {
	w := newBechamelWorld(t, standardBechamel())
	w.lot(t, w.bechamelIng, "2026-11-10") // covers the 9th and the 10th, not the 12th
	w.meal(t, "2026-11-09", w.dinner, w.lasagne, plan.StatePlanned, nil)
	w.meal(t, "2026-11-12", w.dinner, w.lasagne, plan.StatePlanned, nil)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	early, _ := find(f, "2026-11-09", w.dinner)
	late, _ := find(f, "2026-11-12", w.dinner)
	if got := leadMinutes(t, early); got != 40 {
		t.Errorf("meal on the 9th takes %d minutes, want 40 (covered)", got)
	}
	if got := leadMinutes(t, late); got != 65 {
		t.Errorf("meal on the 12th takes %d minutes, want 65: the jar has gone off by then", got)
	}
}
