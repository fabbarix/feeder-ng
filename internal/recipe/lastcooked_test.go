package recipe

import (
	"reflect"
	"testing"
)

// Beta.5 F7: the last cooked order, directly. The input arrives in name order and the sort is stable.

func lcList() []Summary {
	return []Summary{
		{ID: 1, Name: "Apple pie"}, {ID: 2, Name: "Borscht"}, {ID: 3, Name: "Chilli"},
		{ID: 4, Name: "Dal"}, {ID: 5, Name: "Eggs"}, {ID: 6, Name: "Fajitas"},
	}
}

// Chilli 11-08; Apple pie and Dal tie on 10-01; Borscht, Eggs and Fajitas never cooked.
var lcDates = map[int64]string{3: "2026-11-08", 1: "2026-10-01", 4: "2026-10-01"}

func lcIDs(l []Summary) []int64 {
	out := make([]int64, len(l))
	for i, s := range l {
		out[i] = s.ID
	}
	return out
}

func TestSortLastCookedAscPutsNeverCookedFirstThenOldest(t *testing.T) {
	l := lcList()
	SortLastCookedAsc(l, lcDates)
	if got, want := lcIDs(l), []int64{2, 5, 6, 1, 4, 3}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = %v, want %v", got, want)
	}
}

func TestSortLastCookedDescPutsNeverCookedLastAfterTheMostRecent(t *testing.T) {
	l := lcList()
	SortLastCookedDesc(l, lcDates)
	if got, want := lcIDs(l), []int64{3, 1, 4, 2, 5, 6}; !reflect.DeepEqual(got, want) {
		t.Errorf("order = %v, want %v", got, want)
	}
}

func TestSortLastCookedKeepsTheInputOrderOnSameDateTies(t *testing.T) {
	// Input deliberately not in name order: ties must keep it, not re-sort.
	for name, sortFn := range map[string]func([]Summary, map[int64]string){"asc": SortLastCookedAsc, "desc": SortLastCookedDesc} {
		l := []Summary{{ID: 9, Name: "Zeta"}, {ID: 4, Name: "Dal"}, {ID: 1, Name: "Apple pie"}}
		sortFn(l, map[int64]string{9: "2026-10-01", 4: "2026-10-01", 1: "2026-10-01"})
		if got, want := lcIDs(l), []int64{9, 4, 1}; !reflect.DeepEqual(got, want) {
			t.Errorf("%s: order = %v, want the input order %v", name, got, want)
		}
	}
}

func TestSortLastCookedWithAnEmptyMapLeavesTheOrderUnchanged(t *testing.T) {
	for name, sortFn := range map[string]func([]Summary, map[int64]string){"asc": SortLastCookedAsc, "desc": SortLastCookedDesc} {
		for label, m := range map[string]map[int64]string{"empty": {}, "nil": nil} {
			l := lcList()
			sortFn(l, m)
			if got, want := lcIDs(l), []int64{1, 2, 3, 4, 5, 6}; !reflect.DeepEqual(got, want) {
				t.Errorf("%s with a %s map: order = %v, want %v", name, label, got, want)
			}
		}
	}
}

func TestSortLastCookedHandlesAnEmptyList(t *testing.T) {
	SortLastCookedAsc(nil, lcDates)
	SortLastCookedDesc([]Summary{}, lcDates)
}
