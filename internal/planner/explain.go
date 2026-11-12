package planner

import "sort"

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
