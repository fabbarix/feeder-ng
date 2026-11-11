package cook

import (
	"fmt"
	"math/rand"
	"reflect"
	"sort"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

func act(min int, after ...int) schedule.Step {
	return schedule.Step{Kind: schedule.Active, DurationMinutes: min, After: after}
}
func pas(min int, after ...int) schedule.Step {
	return schedule.Step{Kind: schedule.Passive, DurationMinutes: min, After: after}
}
func adv(lead int) schedule.Step {
	return schedule.Step{Kind: schedule.Advance, LeadTimeMinutes: lead}
}
func fresh(id int64, steps ...schedule.Step) Course { return Course{ID: id, Steps: steps} }
func reheat(id int64, secs int) Course              { return Course{ID: id, Reheat: true, ReheatSeconds: secs} }

func must(t *testing.T, cs []Course) Result {
	t.Helper()
	r, err := Timeline(cs)
	if err != nil {
		t.Fatalf("Timeline: %v", err)
	}
	return r
}

// find returns the item of a course at a Recipe step index (-1 for reheat/serve).
func find(t *testing.T, r Result, course int64, step int) Item {
	t.Helper()
	for _, it := range r.Items {
		if it.CourseID == course && it.StepIndex == step {
			return it
		}
	}
	t.Fatalf("no item for course %d step %d in %+v", course, step, r.Items)
	return Item{}
}

func span(it Item) [2]int { return [2]int{it.StartSeconds, it.EndSeconds} }

// riceExample is the roast-tray example of recipe-file.md: oven 0-2, veg 2-10,
// tray 10-35, rice 10-25, serve 35-40.
var riceExample = []schedule.Step{act(2), act(8), pas(25, 0, 1), pas(15), act(5, 2, 3)}

func TestOneCourseIsExactlyCompute(t *testing.T) {
	examples := map[string][]schedule.Step{
		"rice":     riceExample,
		"serial":   {act(3), act(4), act(5)},
		"passive":  {pas(30), act(2, 0)},
		"advance":  {adv(60), act(10), pas(20)},
		"zero act": {act(0), act(5)},
	}
	for name, steps := range examples {
		t.Run(name, func(t *testing.T) {
			want, err := schedule.Compute(steps)
			if err != nil {
				t.Fatal(err)
			}
			r := must(t, []Course{fresh(7, steps...)})
			if r.TotalSeconds != want.TotalMinutes*60 {
				t.Fatalf("total = %d, want %d", r.TotalSeconds, want.TotalMinutes*60)
			}
			if len(r.Items) != len(want.Steps) {
				t.Fatalf("items = %d, want %d", len(r.Items), len(want.Steps))
			}
			for k, w := range want.Steps {
				it := r.Items[k] // on-screen order is the Recipe order
				if it.StepIndex != w.Index || it.CourseID != 7 || it.Kind != ItemStep {
					t.Fatalf("item %d = %+v, want step %d of course 7", k, it, w.Index)
				}
				if it.StartSeconds != w.Start*60 || it.EndSeconds != w.End*60 {
					t.Fatalf("step %d at %v, want %v", w.Index, span(it), [2]int{w.Start * 60, w.End * 60})
				}
				if it.StepKind != steps[w.Index].Kind {
					t.Fatalf("step %d kind %q", w.Index, it.StepKind)
				}
			}
		})
	}
}

func TestRiceExampleTimes(t *testing.T) {
	r := must(t, []Course{fresh(1, riceExample...)})
	want := map[int][2]int{0: {0, 120}, 1: {120, 600}, 2: {600, 2100}, 3: {600, 1500}, 4: {2100, 2400}}
	for idx, w := range want {
		if got := span(find(t, r, 1, idx)); got != w {
			t.Errorf("step %d = %v, want %v", idx, got, w)
		}
	}
	if r.TotalSeconds != 2400 {
		t.Errorf("total = %d", r.TotalSeconds)
	}
}

func TestAdvanceStepsAreNotItems(t *testing.T) {
	r := must(t, []Course{fresh(1, adv(60), act(10))})
	if len(r.Items) != 1 || r.Items[0].StepIndex != 1 {
		t.Fatalf("items = %+v", r.Items)
	}
}

func TestEmptyInput(t *testing.T) {
	for _, in := range [][]Course{nil, {}} {
		r := must(t, in)
		if r.TotalSeconds != 0 || len(r.Items) != 0 {
			t.Fatalf("got %+v", r)
		}
	}
}

func TestInvalidInputIsAnError(t *testing.T) {
	bad := [][]Course{
		{fresh(1, pas(0))},                   // passive needs a duration
		{reheat(1, 0)},                       // reheat needs a length
		{reheat(1, -30)},                     // negative
		{fresh(1, act(1)), fresh(1, act(1))}, // duplicate course id
	}
	for i, in := range bad {
		if _, err := Timeline(in); err == nil {
			t.Errorf("case %d: want an error", i)
		}
	}
}

func TestTwoPassiveCoursesBothEndAtE(t *testing.T) {
	r := must(t, []Course{fresh(1, pas(20)), fresh(2, pas(10))})
	if r.TotalSeconds != 1200 {
		t.Fatalf("total = %d", r.TotalSeconds)
	}
	if got := span(find(t, r, 1, 0)); got != [2]int{0, 1200} {
		t.Errorf("course 1 = %v", got)
	}
	if got := span(find(t, r, 2, 0)); got != [2]int{600, 1200} {
		t.Errorf("course 2 = %v", got)
	}
}

func TestBothEndOnActiveStep(t *testing.T) {
	// The longer Course (1) is placed first and ends at E; the other ends
	// exactly when course 1's serve Step starts.
	r := must(t, []Course{fresh(2, act(5)), fresh(1, pas(10), act(5, 0))})
	if r.TotalSeconds != 900 {
		t.Fatalf("total = %d", r.TotalSeconds)
	}
	if got := span(find(t, r, 1, 1)); got != [2]int{600, 900} {
		t.Errorf("course 1 serve = %v", got)
	}
	// Course 2 ends as course 1's active Step starts.
	if got := span(find(t, r, 2, 0)); got != [2]int{300, 600} {
		t.Errorf("course 2 = %v", got)
	}
}

func TestEqualLengthSlotOrderDecides(t *testing.T) {
	r := must(t, []Course{fresh(5, act(5)), fresh(3, act(5))})
	if r.TotalSeconds != 600 {
		t.Fatalf("total = %d", r.TotalSeconds)
	}
	if got := span(find(t, r, 5, 0)); got != [2]int{300, 600} {
		t.Errorf("first in slot order = %v, want it to end at E", got)
	}
	if got := span(find(t, r, 3, 0)); got != [2]int{0, 300} {
		t.Errorf("second = %v", got)
	}
}

func TestLongerCourseEndsAtEWhateverSlotOrder(t *testing.T) {
	r := must(t, []Course{fresh(1, act(2)), fresh(2, act(10))})
	if got := span(find(t, r, 2, 0)); got != [2]int{120, 720} {
		t.Errorf("longer = %v", got)
	}
	if got := span(find(t, r, 1, 0)); got != [2]int{0, 120} {
		t.Errorf("shorter = %v", got)
	}
}

func TestClashFarFromEndMovesBlockJustEnough(t *testing.T) {
	// A: passive 30 then an active 5 (length 35). B: passive 20 then active 3
	// (length 23). At E, B's active would be 32-35 and clash with A's 30-35;
	// it must end at 30 instead, so B sits at 7-30.
	r := must(t, []Course{fresh(1, pas(30), act(5, 0)), fresh(2, pas(20), act(3, 0))})
	if r.TotalSeconds != 2100 {
		t.Fatalf("total = %d", r.TotalSeconds)
	}
	if got := span(find(t, r, 1, 1)); got != [2]int{1800, 2100} {
		t.Errorf("A active = %v", got)
	}
	if got := span(find(t, r, 2, 0)); got != [2]int{420, 1620} {
		t.Errorf("B passive = %v", got)
	}
	if got := span(find(t, r, 2, 1)); got != [2]int{1620, 1800} {
		t.Errorf("B active = %v", got)
	}
}

func TestBackToBackActiveIsAllowed(t *testing.T) {
	r := must(t, []Course{fresh(1, act(5)), fresh(2, act(5))})
	a, b := find(t, r, 1, 0), find(t, r, 2, 0)
	if a.StartSeconds != b.EndSeconds && b.StartSeconds != a.EndSeconds {
		t.Fatalf("not back to back: %v %v", span(a), span(b))
	}
}

func TestLongPassiveMayOverlapAnotherCoursesActive(t *testing.T) {
	r := must(t, []Course{fresh(1, pas(60)), fresh(2, act(10))})
	if r.TotalSeconds != 3600 {
		t.Fatalf("total = %d", r.TotalSeconds)
	}
	if got := span(find(t, r, 1, 0)); got != [2]int{0, 3600} {
		t.Errorf("passive = %v", got)
	}
	if got := span(find(t, r, 2, 0)); got != [2]int{3000, 3600} {
		t.Errorf("active = %v, want it to end at E over the passive Step", got)
	}
}

func TestServeItemForCourseWithoutSteps(t *testing.T) {
	for name, c := range map[string]Course{"no steps": fresh(9), "only advance": fresh(9, adv(120))} {
		t.Run(name, func(t *testing.T) {
			r := must(t, []Course{c})
			if r.TotalSeconds != 0 || len(r.Items) != 1 {
				t.Fatalf("got %+v", r)
			}
			it := r.Items[0]
			if it.Kind != ItemServe || it.StepIndex != -1 || it.StepKind != schedule.Active || it.CourseID != 9 || it.StartSeconds != 0 || it.EndSeconds != 0 {
				t.Fatalf("item = %+v", it)
			}
		})
	}
}

func TestServeItemSitsAtEAndNeverClashes(t *testing.T) {
	r := must(t, []Course{fresh(1, act(5)), fresh(2)})
	if r.TotalSeconds != 300 {
		t.Fatalf("total = %d", r.TotalSeconds)
	}
	s := find(t, r, 2, -1)
	if s.StartSeconds != 300 || s.EndSeconds != 300 || s.Kind != ItemServe {
		t.Errorf("serve = %+v", s)
	}
	if got := span(find(t, r, 1, 0)); got != [2]int{0, 300} {
		t.Errorf("course 1 moved by a zero-length item: %v", got)
	}
}

func TestReheatEndsAtEInThirtySecondSteps(t *testing.T) {
	r := must(t, []Course{fresh(1, act(10)), reheat(2, 150)})
	if r.TotalSeconds != 600 {
		t.Fatalf("total = %d", r.TotalSeconds)
	}
	h := find(t, r, 2, -1)
	if h.Kind != ItemReheat || h.StepKind != schedule.Passive || h.StartSeconds != 450 || h.EndSeconds != 600 {
		t.Errorf("reheat = %+v", h)
	}
	if got := span(find(t, r, 1, 0)); got != [2]int{0, 600} {
		t.Errorf("fresh = %v: a Reheat must not push it", got)
	}
}

func TestReheatOnlyAndTwoReheats(t *testing.T) {
	r := must(t, []Course{reheat(1, 60), reheat(2, 90)})
	if r.TotalSeconds != 90 {
		t.Fatalf("total = %d", r.TotalSeconds)
	}
	if got := span(find(t, r, 1, -1)); got != [2]int{30, 90} {
		t.Errorf("reheat 1 = %v", got)
	}
	if got := span(find(t, r, 2, -1)); got != [2]int{0, 90} {
		t.Errorf("reheat 2 = %v", got)
	}
}

func TestItemOrderTiesBySlotOrderThenStep(t *testing.T) {
	r := must(t, []Course{fresh(8, pas(10), pas(10)), fresh(4, pas(10))})
	// All three start at 0 (the first two Steps of course 8 start together).
	var got [][2]int64
	for _, it := range r.Items {
		got = append(got, [2]int64{it.CourseID, int64(it.StepIndex)})
	}
	want := [][2]int64{{8, 0}, {8, 1}, {4, 0}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("order = %v, want %v", got, want)
	}
}

func TestDeterministic(t *testing.T) {
	in := []Course{fresh(1, riceExample...), fresh(2, pas(20), act(3, 0)), reheat(3, 90), fresh(4)}
	first := must(t, in)
	for i := 0; i < 20; i++ {
		if again := must(t, in); !reflect.DeepEqual(first, again) {
			t.Fatalf("run %d differs:\n%+v\n%+v", i, first, again)
		}
	}
}

func TestDoesNotModifyInput(t *testing.T) {
	steps := []schedule.Step{act(2), pas(10, 0)}
	in := []Course{fresh(1, steps...)}
	before := []schedule.Step{act(2), pas(10, 0)}
	must(t, in)
	if !reflect.DeepEqual(steps, before) {
		t.Fatal("input steps modified")
	}
}

// randomCourses builds a deterministic pseudo-random slot.
func randomCourses(rng *rand.Rand) []Course {
	var cs []Course
	for id := int64(1); id <= int64(1+rng.Intn(4)); id++ {
		switch rng.Intn(6) {
		case 0:
			cs = append(cs, reheat(id, 30*(1+rng.Intn(8))))
		case 1:
			cs = append(cs, fresh(id))
		default:
			var steps []schedule.Step
			for i, n := 0, 1+rng.Intn(5); i < n; i++ {
				var after []int
				if i > 0 && rng.Intn(2) == 0 {
					after = []int{rng.Intn(i)}
				}
				if rng.Intn(2) == 0 {
					steps = append(steps, act(rng.Intn(8), after...))
				} else {
					steps = append(steps, pas(1+rng.Intn(30), after...))
				}
			}
			cs = append(cs, fresh(id, steps...))
		}
	}
	return cs
}

func clash(a, b Item) bool {
	if a.StepKind != schedule.Active || b.StepKind != schedule.Active {
		return false
	}
	if a.EndSeconds == a.StartSeconds || b.EndSeconds == b.StartSeconds {
		return false
	}
	return a.StartSeconds < b.EndSeconds && b.StartSeconds < a.EndSeconds
}

// placementOrder rebuilds the order Timeline places Courses in: Reheat first,
// then longer length, then slot order.
func placementOrder(cs []Course) []Course {
	length := func(c Course) int {
		if c.Reheat {
			return c.ReheatSeconds
		}
		s, _ := schedule.Compute(c.Steps)
		return s.TotalMinutes * 60
	}
	out := append([]Course(nil), cs...)
	pos := map[int64]int{}
	for i, c := range cs {
		pos[c.ID] = i
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if a.Reheat != b.Reheat {
			return a.Reheat
		}
		if la, lb := length(a), length(b); la != lb {
			return la > lb
		}
		return pos[a.ID] < pos[b.ID]
	})
	return out
}

// assertLatest fails when a Course could end later (a whole-second shift,
// ending at or before E) without clashing with the Courses placed before it.
func assertLatest(t *testing.T, label string, cs []Course, r Result) {
	t.Helper()
	var before []Item
	for _, c := range placementOrder(cs) {
		var mine []Item
		end := 0
		for _, it := range r.Items {
			if it.CourseID == c.ID {
				mine = append(mine, it)
				if it.EndSeconds > end {
					end = it.EndSeconds
				}
			}
		}
		for s := r.TotalSeconds - end; s >= 1; s-- {
			free := true
			for _, it := range mine {
				m := it
				m.StartSeconds += s
				m.EndSeconds += s
				for _, p := range before {
					if clash(m, p) {
						free = false
					}
				}
			}
			if free {
				t.Fatalf("%s: course %d could end %ds later without a clash", label, c.ID, s)
			}
		}
		before = append(before, mine...)
	}
}

func TestLatestPositionOnRandomSlots(t *testing.T) {
	rng := rand.New(rand.NewSource(2))
	for n := 0; n < 300; n++ {
		cs := randomCourses(rng)
		assertLatest(t, fmt.Sprintf("case %d", n), cs, must(t, cs))
	}
}

func TestZeroShiftWinsOverPassiveStep(t *testing.T) {
	// Candidates exist (Course 1's Active Step), yet the answer is d = 0:
	// Course 2 ends at E, over Course 1's passive Step.
	cs := []Course{fresh(1, act(5), pas(30)), fresh(2, act(3))}
	r := must(t, cs)
	if got := find(t, r, 2, 0).EndSeconds; got != r.TotalSeconds {
		t.Fatalf("course 2 ends at %d, want E = %d", got, r.TotalSeconds)
	}
	assertLatest(t, "fixed", cs, r)
}

func TestGuaranteesOnRandomSlots(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	for n := 0; n < 300; n++ {
		cs := randomCourses(rng)
		r := must(t, cs)

		byCourse := map[int64][]Item{}
		maxEnd := 0
		for k, it := range r.Items {
			byCourse[it.CourseID] = append(byCourse[it.CourseID], it)
			if it.StartSeconds < 0 || it.EndSeconds > r.TotalSeconds || it.EndSeconds < it.StartSeconds {
				t.Fatalf("case %d: bad item %+v (total %d)", n, it, r.TotalSeconds)
			}
			if it.EndSeconds > maxEnd {
				maxEnd = it.EndSeconds
			}
			if k > 0 && r.Items[k-1].StartSeconds > it.StartSeconds {
				t.Fatalf("case %d: items not ordered by start", n)
			}
		}
		if len(r.Items) > 0 && maxEnd != r.TotalSeconds {
			t.Fatalf("case %d: latest end %d != total %d", n, maxEnd, r.TotalSeconds)
		}

		// Every Course is placed: (a) each fresh Course keeps Compute's
		// offsets and each non-Advance Step appears exactly once; Reheat and
		// Serve items sit where the spec puts them; (b) one cook, below.
		for _, c := range cs {
			items := byCourse[c.ID]
			switch {
			case c.Reheat:
				if len(items) != 1 {
					t.Fatalf("case %d: reheat course %d has %d items", n, c.ID, len(items))
				}
				it := items[0]
				if it.Kind != ItemReheat || it.StepKind != schedule.Passive ||
					it.EndSeconds-it.StartSeconds != c.ReheatSeconds || it.EndSeconds != r.TotalSeconds {
					t.Fatalf("case %d: reheat course %d = %+v (total %d)", n, c.ID, it, r.TotalSeconds)
				}
				continue
			}
			want, _ := schedule.Compute(c.Steps)
			if len(want.Steps) == 0 {
				if len(items) != 1 {
					t.Fatalf("case %d: serve course %d has %d items", n, c.ID, len(items))
				}
				it := items[0]
				if it.Kind != ItemServe || it.StepKind != schedule.Active ||
					it.StartSeconds != r.TotalSeconds || it.EndSeconds != r.TotalSeconds {
					t.Fatalf("case %d: serve course %d = %+v (total %d)", n, c.ID, it, r.TotalSeconds)
				}
				continue
			}
			if len(items) != len(want.Steps) {
				t.Fatalf("case %d: course %d has %d items, want %d", n, c.ID, len(items), len(want.Steps))
			}
			seenIdx := map[int]bool{}
			for _, it := range items {
				if it.Kind != ItemStep || seenIdx[it.StepIndex] {
					t.Fatalf("case %d: course %d duplicate or odd item %+v", n, c.ID, it)
				}
				seenIdx[it.StepIndex] = true
			}
			shift := find(t, r, c.ID, want.Steps[0].Index).StartSeconds - want.Steps[0].Start*60
			for _, w := range want.Steps {
				it := find(t, r, c.ID, w.Index)
				if it.StartSeconds-shift != w.Start*60 || it.EndSeconds-shift != w.End*60 {
					t.Fatalf("case %d course %d: block split at step %d", n, c.ID, w.Index)
				}
			}
		}
		// The first fresh Course in placement order ends at E.
		for _, c := range placementOrder(cs) {
			if c.Reheat {
				continue
			}
			end := 0
			for _, it := range byCourse[c.ID] {
				if it.EndSeconds > end {
					end = it.EndSeconds
				}
			}
			if end != r.TotalSeconds {
				t.Fatalf("case %d: first fresh course %d ends at %d, want %d", n, c.ID, end, r.TotalSeconds)
			}
			break
		}
		for i := range r.Items {
			for j := i + 1; j < len(r.Items); j++ {
				if r.Items[i].CourseID != r.Items[j].CourseID && clash(r.Items[i], r.Items[j]) {
					t.Fatalf("case %d: active clash %+v %+v", n, r.Items[i], r.Items[j])
				}
			}
		}

	}
}

// TestNoCourseCanMoveLater checks guarantee (c) against the blocks placed
// before each Course (placement order: Reheat, longer fresh, slot order).
func TestNoCourseCanMoveLater(t *testing.T) {
	cases := [][]Course{
		{fresh(1, pas(30), act(5, 0)), fresh(2, pas(20), act(3, 0))},
		{fresh(1, act(5)), fresh(2, act(5)), fresh(3, act(5))},
		{fresh(1, riceExample...), fresh(2, act(10)), fresh(3, pas(5), act(2, 0))},
	}
	for ci, cs := range cases {
		r := must(t, cs)
		placedBefore := func(c Course) []Course { // longer first, then slot order
			var out []Course
			lenOf := func(x Course) int {
				s, _ := schedule.Compute(x.Steps)
				return s.TotalMinutes
			}
			for _, o := range cs {
				if o.ID == c.ID {
					continue
				}
				if lenOf(o) > lenOf(c) {
					out = append(out, o)
				}
			}
			for _, o := range cs {
				if o.ID == c.ID {
					break
				}
				if lenOf(o) == lenOf(c) {
					out = append(out, o)
				}
			}
			return out
		}
		for _, c := range cs {
			end := 0
			for _, it := range r.Items {
				if it.CourseID == c.ID && it.EndSeconds > end {
					end = it.EndSeconds
				}
			}
			if end+1 > r.TotalSeconds {
				continue
			}
			clashed := false
			for _, it := range r.Items {
				if it.CourseID != c.ID {
					continue
				}
				m := it
				m.StartSeconds++
				m.EndSeconds++
				for _, p := range placedBefore(c) {
					for _, o := range r.Items {
						if o.CourseID == p.ID && clash(m, o) {
							clashed = true
						}
					}
				}
			}
			if !clashed {
				t.Errorf("case %d: course %d could move one second later", ci, c.ID)
			}
		}
	}
}
