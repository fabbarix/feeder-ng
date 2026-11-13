package baserecipe_test

import (
	"math/rand"
	"testing"

	br "github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
)

var names = map[int64]string{1: "Lasagne", 2: "Béchamel", 3: "Roux", 4: "Pasta frolla", 5: "Stock", 6: "Ragù"}

func TestFindCycleNone(t *testing.T) {
	for name, edges := range map[string]map[int64][]int64{
		"empty graph":   nil,
		"no edges":      {2: nil},
		"a chain":       {1: {2}, 2: {3}, 3: {4}},
		"a diamond":     {1: {2, 3}, 2: {4}, 3: {4}},
		"repeat target": {1: {2, 2}},
	} {
		if got := br.FindCycle(edges, names, 1); got != nil {
			t.Errorf("%s: path = %v, want nil", name, got)
		}
	}
}

func TestFindCycleSelf(t *testing.T) {
	got := br.FindCycle(map[int64][]int64{2: {2}}, names, 2)
	if !eqStrings(got, []string{"Béchamel", "Béchamel"}) {
		t.Errorf("path = %v", got)
	}
}

func TestFindCycleTwoStep(t *testing.T) {
	got := br.FindCycle(map[int64][]int64{2: {3}, 3: {2}}, names, 2)
	if !eqStrings(got, []string{"Béchamel", "Roux", "Béchamel"}) {
		t.Errorf("path = %v", got)
	}
	// Seen from the other end the path starts at the saved Recipe.
	got = br.FindCycle(map[int64][]int64{2: {3}, 3: {2}}, names, 3)
	if !eqStrings(got, []string{"Roux", "Béchamel", "Roux"}) {
		t.Errorf("path = %v", got)
	}
}

func TestFindCycleThreeStepInOrder(t *testing.T) {
	edges := map[int64][]int64{2: {3}, 3: {4}, 4: {2}}
	got := br.FindCycle(edges, names, 2)
	if !eqStrings(got, []string{"Béchamel", "Roux", "Pasta frolla", "Béchamel"}) {
		t.Errorf("path = %v", got)
	}
}

func TestFindCycleSavedRecipeCallsIntoACycleThroughItself(t *testing.T) {
	// Lasagne (saved) -> Béchamel -> Roux -> Lasagne, with a side branch that goes nowhere.
	edges := map[int64][]int64{1: {5, 2}, 2: {3}, 3: {1}, 5: nil}
	got := br.FindCycle(edges, names, 1)
	if !eqStrings(got, []string{"Lasagne", "Béchamel", "Roux", "Lasagne"}) {
		t.Errorf("path = %v", got)
	}
}

func TestFindCycleIgnoresAnUnrelatedCycleElsewhere(t *testing.T) {
	edges := map[int64][]int64{1: {2}, 2: nil, 3: {4}, 4: {3}}
	if got := br.FindCycle(edges, names, 1); got != nil {
		t.Errorf("reported another Recipe's cycle: %v", got)
	}
	// And with the saved Recipe on a cycle of its own, only that one is returned.
	edges = map[int64][]int64{1: {1}, 3: {4}, 4: {3}}
	if got := br.FindCycle(edges, names, 1); !eqStrings(got, []string{"Lasagne", "Lasagne"}) {
		t.Errorf("path = %v", got)
	}
}

func TestFindCycleUsesTheSavedEdgesNotAStaleOnes(t *testing.T) {
	// The caller replaces the saved Recipe's edges first; a graph without the back edge has no cycle.
	if got := br.FindCycle(map[int64][]int64{2: {3}, 3: nil}, names, 2); got != nil {
		t.Errorf("path = %v", got)
	}
}

func TestFindCycleDoesNotModifyTheGraph(t *testing.T) {
	edges := map[int64][]int64{2: {3}, 3: {2}}
	br.FindCycle(edges, names, 2)
	if len(edges) != 2 || len(edges[2]) != 1 || edges[2][0] != 3 {
		t.Errorf("graph changed: %v", edges)
	}
}

func TestPropertyFindCycle(t *testing.T) {
	r := rand.New(rand.NewSource(11))
	nm := map[int64]string{}
	for i := int64(1); i <= 12; i++ {
		nm[i] = string(rune('A' + i))
	}
	for n := 0; n < 300; n++ {
		// A random DAG (edges go from lower to higher id) has no cycle.
		edges := map[int64][]int64{}
		for a := int64(1); a <= 12; a++ {
			for b := a + 1; b <= 12; b++ {
				if r.Intn(4) == 0 {
					edges[a] = append(edges[a], b)
				}
			}
		}
		for s := int64(1); s <= 12; s++ {
			if got := br.FindCycle(edges, nm, s); got != nil {
				t.Fatalf("iter %d: cycle %v in a DAG", n, got)
			}
		}
		// One back edge makes a cycle through its tail when the head reaches it.
		a, b := int64(1+r.Intn(11)), int64(0)
		b = a + 1 + int64(r.Intn(int(12-a)))
		edges[a] = append(edges[a], b) // forward edge guarantees b reachable from a
		edges[b] = append(edges[b], a)
		got := br.FindCycle(edges, nm, a)
		if len(got) < 3 || got[0] != nm[a] || got[len(got)-1] != nm[a] {
			t.Fatalf("iter %d: path %v is not a closed walk from %s", n, got, nm[a])
		}
		// Every step of the path is an edge.
		byName := map[string]int64{}
		for id, name := range nm {
			byName[name] = id
		}
		for i := 0; i+1 < len(got); i++ {
			from, to := byName[got[i]], byName[got[i+1]]
			ok := false
			for _, x := range edges[from] {
				ok = ok || x == to
			}
			if !ok {
				t.Fatalf("iter %d: %s -> %s is not an edge (path %v)", n, got[i], got[i+1], got)
			}
		}
	}
}
