package planner

import (
	"sort"
	"time"
)

// explainExclusions says which Exclusions removed which of the cell's Recipes (docs/dev/design/crs-brx.md).
// removed holds the ids evaluate's Exclusion count counted at cell i. It returns the records (at most
// MaxExclusionRecords, in the documented order) and how many were left out.
//
// Every attendee with a Portion Factor above eps is checked against every removed Recipe, without stopping at
// the first hit: a Member's direct Exclusion of the Recipe goes to the Member's IngredientID 0 record, and each
// Ingredient line the Member excludes goes to a (Member, Ingredient) record. A Recipe is listed once per record.
func (st *state) explainExclusions(i int, removed []RecipeID) ([]ExclusionRecord, int) {
	type key struct {
		member MemberID
		ing    IngredientID
	}
	byKey := map[key]map[RecipeID]bool{}
	add := func(k key, id RecipeID) {
		if byKey[k] == nil {
			byKey[k] = map[RecipeID]bool{}
		}
		byKey[k][id] = true
	}
	att := st.slots[i].Attendance
	for _, id := range removed {
		r := st.recipes[id]
		for _, a := range att {
			if a.PortionFactor <= eps {
				continue
			}
			p := st.in.Members[a.MemberID]
			if containsRecipe(p.ExcludedRecipes, r.ID) {
				add(key{a.MemberID, 0}, r.ID)
			}
			for _, n := range r.Needs {
				if containsIngredient(p.ExcludedIngredients, n.IngredientID) {
					add(key{a.MemberID, n.IngredientID}, r.ID)
				}
			}
		}
	}
	if len(byKey) == 0 {
		return nil, 0
	}

	out := make([]ExclusionRecord, 0, len(byKey))
	for k, set := range byKey {
		ids := make([]RecipeID, 0, len(set))
		for id := range set {
			ids = append(ids, id)
		}
		sort.Slice(ids, func(a, b int) bool { return ids[a] < ids[b] })
		count := len(ids)
		if len(ids) > MaxExclusionRecipes {
			ids = ids[:MaxExclusionRecipes]
		}
		out = append(out, ExclusionRecord{MemberID: k.member, IngredientID: k.ing, RecipeIDs: ids, RecipeCount: count})
	}
	sort.Slice(out, func(a, b int) bool {
		x, y := out[a], out[b]
		if x.RecipeCount != y.RecipeCount {
			return x.RecipeCount > y.RecipeCount
		}
		if x.MemberID != y.MemberID {
			return x.MemberID < y.MemberID
		}
		return x.IngredientID < y.IngredientID
	})
	more := 0
	if len(out) > MaxExclusionRecords {
		more = len(out) - MaxExclusionRecords
		out = out[:MaxExclusionRecords]
	}
	return out, more
}

// EarlyStart is a Pinned or Bought Planned Meal whose cooking would have to start outside the Household's start
// window: before the Earliest start, or after the Latest start (PC-14, A2). Both are held where they are: the Plan never refuses or moves them, it only flags them.
type EarlyStart struct {
	Key     SlotKey
	StartAt time.Time // slot time minus the Recipe's TotalMinutes
}

// EarlyStarts lists the Pinned and Bought (Held) fresh meals of in.Slots that start outside the start window, in slot
// order. Unpinned Planned meals are refiltered by the planner instead, and Cooked or Not cooked meals are past.
func EarlyStarts(in Input) []EarlyStart {
	if in.EarliestStart == "" {
		return nil
	}
	recipes := make(map[RecipeID]Recipe, len(in.Recipes))
	for _, r := range in.Recipes {
		recipes[r.ID] = r
	}
	slots := append([]Slot(nil), in.Slots...)
	sort.SliceStable(slots, func(a, b int) bool { return slots[a].At.Before(slots[b].At) })
	var out []EarlyStart
	for _, s := range slots {
		m := s.Existing
		if m == nil || m.From != nil {
			continue
		}
		if m.State != MealPinned && !(m.State == MealPlanned && m.Held) {
			continue
		}
		r, ok := recipes[m.RecipeID]
		if !ok {
			continue
		}
		if start, outside := outsideStartWindow(s.At, r.TotalMinutes, in.EarliestStart, in.LatestStart); outside {
			out = append(out, EarlyStart{Key: s.Key, StartAt: start})
		}
	}
	return out
}
