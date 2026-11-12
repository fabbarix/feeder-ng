package httpapi

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

// Team C-RX: names resolved at read time (docs/dev/design/crs-crx.md §3).

func crxTable() table {
	return table{
		members:      map[int64]string{1: "Anna", 2: "Sam", 3: "Alex"},
		memberColour: map[int64]string{1: "#3366cc", 2: "#81b29a", 3: "#e07a5f"},
		memberPhoto:  map[int64]string{2: "/api/images/sam.jpg"},
		memberAvatar: map[int64]string{2: "🦊"},
		ingredients:  map[int64]string{12: "garlic", 13: "onion"},
		recipes:      map[int64]string{4: "Bolognese", 5: "garlic bread", 6: "Pesto pasta", 7: "Aubergine bake"},
	}
}

func unfilledWith(records []plan.ExclusionRecord, more int) plan.Unfilled {
	return plan.Unfilled{Reason: "no_candidates", Eliminated: plan.Eliminations{Considered: 4, Exclusion: 4},
		Exclusions: records, MoreExclusions: more}
}

func recipeNames(rs []recipeRefOut) []string {
	out := []string{}
	for _, r := range rs {
		out = append(out, r.Name)
	}
	return out
}

func TestExclusionsForResolvesMemberIngredientAndRecipes(t *testing.T) {
	got := exclusionsFor(unfilledWith([]plan.ExclusionRecord{
		{MemberID: 2, IngredientID: 12, RecipeIDs: []int64{4, 5}, RecipeCount: 4},
	}, 0), crxTable())
	if len(got) != 1 {
		t.Fatalf("records = %+v, want 1", got)
	}
	r := got[0]
	wantMember := memberRefOut{ID: 2, Name: "Sam", Colour: "#81b29a", PhotoURL: "/api/images/sam.jpg", Avatar: "🦊"}
	if r.Member != wantMember {
		t.Errorf("member = %+v, want %+v", r.Member, wantMember)
	}
	if r.Ingredient == nil || r.Ingredient.ID != 12 || r.Ingredient.Name != "garlic" {
		t.Errorf("ingredient = %+v, want garlic (12)", r.Ingredient)
	}
	if r.RecipeCount != 4 {
		t.Errorf("recipeCount = %d, want the stored 4 (only 2 ids are kept)", r.RecipeCount)
	}
	if want := []string{"Bolognese", "garlic bread"}; !reflect.DeepEqual(recipeNames(r.Recipes), want) {
		t.Errorf("recipes = %v, want %v", recipeNames(r.Recipes), want)
	}
}

func TestExclusionsForADirectRecordHasANullIngredient(t *testing.T) {
	got := exclusionsFor(unfilledWith([]plan.ExclusionRecord{
		{MemberID: 3, IngredientID: 0, RecipeIDs: []int64{4}, RecipeCount: 1},
	}, 0), crxTable())
	if len(got) != 1 || got[0].Ingredient != nil {
		t.Fatalf("records = %+v, want one direct record with a nil Ingredient", got)
	}
	b, _ := json.Marshal(got[0])
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	if v, ok := m["ingredient"]; !ok || v != nil {
		t.Errorf("ingredient in JSON = %v (present %v), want null: %s", v, ok, b)
	}
}

func TestExclusionsForSortsRecipesByNameIgnoringCase(t *testing.T) {
	got := exclusionsFor(unfilledWith([]plan.ExclusionRecord{
		{MemberID: 2, IngredientID: 12, RecipeIDs: []int64{4, 5, 6, 7}, RecipeCount: 4},
	}, 0), crxTable())
	want := []string{"Aubergine bake", "Bolognese", "garlic bread", "Pesto pasta"}
	if len(got) != 1 || !reflect.DeepEqual(recipeNames(got[0].Recipes), want) {
		t.Errorf("recipes = %+v, want the name order %v", got, want)
	}
}

func TestExclusionsForKeepsTheStoredOrderOfRecords(t *testing.T) {
	got := exclusionsFor(unfilledWith([]plan.ExclusionRecord{
		{MemberID: 3, IngredientID: 0, RecipeIDs: []int64{4}, RecipeCount: 1},
		{MemberID: 2, IngredientID: 13, RecipeIDs: []int64{5}, RecipeCount: 1},
		{MemberID: 1, IngredientID: 12, RecipeIDs: []int64{6}, RecipeCount: 1},
	}, 0), crxTable())
	var ids []int64
	for _, r := range got {
		ids = append(ids, r.Member.ID)
	}
	if want := []int64{3, 2, 1}; !reflect.DeepEqual(ids, want) {
		t.Errorf("Members = %v, want the planner's order %v", ids, want)
	}
}

func TestExclusionsForDropsARecordWhoseMemberIsGone(t *testing.T) {
	got := exclusionsFor(unfilledWith([]plan.ExclusionRecord{
		{MemberID: 99, IngredientID: 12, RecipeIDs: []int64{4}, RecipeCount: 1},
		{MemberID: 2, IngredientID: 12, RecipeIDs: []int64{5}, RecipeCount: 1},
	}, 0), crxTable())
	if len(got) != 1 || got[0].Member.ID != 2 {
		t.Errorf("records = %+v, want only Sam's", got)
	}
}

func TestExclusionsForDropsAnIngredientRecordWhoseIngredientIsGone(t *testing.T) {
	got := exclusionsFor(unfilledWith([]plan.ExclusionRecord{
		{MemberID: 2, IngredientID: 99, RecipeIDs: []int64{4}, RecipeCount: 1},
		{MemberID: 3, IngredientID: 0, RecipeIDs: []int64{5}, RecipeCount: 1},
	}, 0), crxTable())
	if len(got) != 1 || got[0].Member.ID != 3 || got[0].Ingredient != nil {
		t.Errorf("records = %+v, want only Alex's direct record (a gone Ingredient is not a direct record)", got)
	}
}

func TestExclusionsForDropsAGoneRecipeAndCountsItOut(t *testing.T) {
	got := exclusionsFor(unfilledWith([]plan.ExclusionRecord{
		{MemberID: 2, IngredientID: 12, RecipeIDs: []int64{4, 98, 99}, RecipeCount: 7},
	}, 0), crxTable())
	if len(got) != 1 {
		t.Fatalf("records = %+v, want 1", got)
	}
	if want := []string{"Bolognese"}; !reflect.DeepEqual(recipeNames(got[0].Recipes), want) {
		t.Errorf("recipes = %v, want %v", recipeNames(got[0].Recipes), want)
	}
	if got[0].RecipeCount != 5 {
		t.Errorf("recipeCount = %d, want 5 (the stored 7 less the 2 Recipes that are gone)", got[0].RecipeCount)
	}
}

func TestExclusionsForDropsARecordWithNoRecipeLeft(t *testing.T) {
	got := exclusionsFor(unfilledWith([]plan.ExclusionRecord{
		{MemberID: 2, IngredientID: 12, RecipeIDs: []int64{98, 99}, RecipeCount: 2},
		{MemberID: 3, IngredientID: 0, RecipeIDs: []int64{4}, RecipeCount: 1},
	}, 0), crxTable())
	if len(got) != 1 || got[0].Member.ID != 3 {
		t.Errorf("records = %+v, want only Alex's: a record that rules out nothing we can name says nothing", got)
	}
}

func TestExclusionsForIsNullOnlyWhenNothingIsStored(t *testing.T) {
	if got := exclusionsFor(unfilledWith(nil, 0), crxTable()); got != nil {
		t.Errorf("no detail stored: %+v, want nil (JSON null)", got)
	}
	if got := exclusionsFor(unfilledWith([]plan.ExclusionRecord{}, 0), crxTable()); got == nil || len(got) != 0 {
		t.Errorf("empty stored records: %#v, want an empty non-nil list", got)
	}
	if got := exclusionsFor(unfilledWith(nil, 3), crxTable()); got == nil || len(got) != 0 {
		t.Errorf("only a 'more' count stored: %#v, want an empty non-nil list", got)
	}
	// every record dropped: the detail existed, so it is [], not null
	got := exclusionsFor(unfilledWith([]plan.ExclusionRecord{{MemberID: 99, RecipeIDs: []int64{4}, RecipeCount: 1}}, 0), crxTable())
	if got == nil || len(got) != 0 {
		t.Errorf("all records dropped: %#v, want an empty non-nil list", got)
	}
	b, _ := json.Marshal(struct {
		E []exclusionOut `json:"exclusions"`
	}{got})
	if string(b) != `{"exclusions":[]}` {
		t.Errorf("JSON = %s, want []", b)
	}
}

func TestAttendanceForListsMembersWithAPortionFactorAboveZero(t *testing.T) {
	got := attendanceFor([]plan.Attendee{{MemberID: 2, Factor: 1}, {MemberID: 1, Factor: 0}, {MemberID: 3, Factor: 0.5}, {MemberID: 99, Factor: 1}}, crxTable())
	var ids []int64
	for _, m := range got {
		ids = append(ids, m.ID)
	}
	if want := []int64{2, 3}; !reflect.DeepEqual(ids, want) {
		t.Errorf("attendance = %v, want %v (Portion Factor 0 and gone Members left out, order kept)", ids, want)
	}
	if len(got) > 0 && (got[0].Name != "Sam" || got[0].Colour != "#81b29a" || got[0].Avatar != "🦊") {
		t.Errorf("first reference = %+v, want Sam with colour and Avatar", got[0])
	}
}

func TestOptOutsForIsNeverNilAndInIDOrder(t *testing.T) {
	got := optOutsFor(nil, crxTable())
	if got == nil || len(got) != 0 {
		t.Errorf("no opt-outs: %#v, want an empty non-nil list", got)
	}
	got = optOutsFor([]int64{3, 1}, crxTable())
	var ids []int64
	for _, m := range got {
		ids = append(ids, m.ID)
	}
	if want := []int64{1, 3}; !reflect.DeepEqual(ids, want) {
		t.Errorf("opt-outs = %v, want %v", ids, want)
	}
}

func TestMemberRefForReportsAGoneMember(t *testing.T) {
	if ref, ok := memberRefFor(2, crxTable()); !ok || ref.Name != "Sam" {
		t.Errorf("Sam = %+v, %v", ref, ok)
	}
	if _, ok := memberRefFor(99, crxTable()); ok {
		t.Error("a gone Member resolved")
	}
}
