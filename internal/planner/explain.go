package planner

// explainExclusions says which Exclusions removed which of the cell's Recipes (docs/dev/design/crs-brx.md).
// removed holds the ids evaluate's Exclusion count counted at cell i. It returns the records (at most
// MaxExclusionRecords, in the documented order) and how many were left out.
//
// STUB (test author): the developer implements it and wires it into evaluate and fill.
func (st *state) explainExclusions(i int, removed []RecipeID) ([]ExclusionRecord, int) {
	return nil, 0
}
