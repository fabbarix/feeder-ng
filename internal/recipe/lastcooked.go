package recipe

import "sort"

// Last cooked order of the Recipe list (beta.5 F7, plan 2.7). The list arrives ordered by name (case-insensitive,
// then id); the sort is stable, so ties keep the name order.

// SortLastCookedAsc puts the Recipes never cooked first, then the oldest last cooked date first.
// SortLastCookedDesc puts the most recent first and the Recipes never cooked last.
// lastCooked maps a Recipe id to its YYYY-MM-DD date; an id it does not hold was never cooked.
func SortLastCookedAsc(list []Summary, lastCooked map[int64]string) {
	sort.SliceStable(list, func(i, j int) bool {
		di, oi := lastCooked[list[i].ID]
		dj, oj := lastCooked[list[j].ID]
		if oi != oj {
			return !oi
		}
		return oi && di < dj
	})
}

// SortLastCookedDesc is the reverse order of last cooked, with the Recipes never cooked last.
func SortLastCookedDesc(list []Summary, lastCooked map[int64]string) {
	sort.SliceStable(list, func(i, j int) bool {
		di, oi := lastCooked[list[i].ID]
		dj, oj := lastCooked[list[j].ID]
		if oi != oj {
			return oi
		}
		return oi && di > dj
	})
}
