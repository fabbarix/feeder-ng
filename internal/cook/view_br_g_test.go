package cook_test

import (
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// BR-G (docs/dev/design/base-recipes.md section 9): the composed Steps carry the Base recipe they come from. The adapter
// (cook/service) fills cook.Step.BaseRecipe and cook.Step.Covered; BuildView copies the label onto the CookStep and the
// AdvanceItem, leaves a covered Step out (its Index is kept, so Number and Of count the Steps shown), lists the Base recipes
// whose Steps it left out in View.Covered, and labels a Base recipe Step's timer with the Base recipe's name.
//
// Pinned API in package cook:
//
//	type BaseRecipe struct { ID int64; Name string; Path []string }   // Name is the innermost, Path the chain from the outermost
//	cook.Step{..., BaseRecipe *BaseRecipe, Covered bool}
//	cook.CookStep{..., BaseRecipe *BaseRecipe}
//	cook.AdvanceItem{..., BaseRecipe *BaseRecipe}
//	cook.View{..., Covered []BaseRecipe}   // never nil from BuildView

var bechamel = &cook.BaseRecipe{ID: 7, Name: "Béchamel", Path: []string{"Béchamel"}}
var roux = &cook.BaseRecipe{ID: 8, Name: "Roux", Path: []string{"Béchamel", "Roux"}}

// lasagne is the composed list of Lasagne: Roux (inside Béchamel), Béchamel, then Lasagne's own Steps.
func lasagne() cook.RecipeSteps {
	return cook.RecipeSteps{RecipeID: 3, Name: "Lasagne", Steps: []cook.Step{
		{Kind: schedule.Advance, Text: "Chill the milk", LeadTimeMinutes: 360, BaseRecipe: bechamel},
		{Kind: schedule.Active, Text: "Cook the roux", DurationMinutes: 3, BaseRecipe: roux, Uses: []schedule.Use{{Ingredient: "flour", Quantity: 50, Unit: "g"}}},
		{Kind: schedule.Passive, Text: "Simmer the sauce", DurationMinutes: 20, After: []int{1}, BaseRecipe: bechamel},
		{Kind: schedule.Active, Text: "Layer the lasagne", DurationMinutes: 10, After: []int{2}},
		{Kind: schedule.Passive, Text: "Bake", DurationMinutes: 30, After: []int{3}},
	}}
}

func TestBuildViewCopiesTheBaseRecipeLabelToStepsAndAdvanceItems(t *testing.T) {
	v, err := cook.BuildView(cook.RecipeScope(3), lasagne(), 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Advance) != 1 || v.Advance[0].BaseRecipe == nil || v.Advance[0].BaseRecipe.Name != "Béchamel" {
		t.Errorf("Advance = %+v, want the Chill the milk item labelled Béchamel", v.Advance)
	}
	var labels []string
	for _, s := range v.Steps {
		if s.BaseRecipe == nil {
			labels = append(labels, "-")
			continue
		}
		labels = append(labels, s.BaseRecipe.Name)
	}
	if want := []string{"Roux", "Béchamel", "-", "-"}; !reflect.DeepEqual(labels, want) {
		t.Errorf("labels = %v, want %v", labels, want)
	}
	if got := v.Steps[0].BaseRecipe; got == nil || got.ID != 8 || !reflect.DeepEqual(got.Path, []string{"Béchamel", "Roux"}) {
		t.Errorf("nested label = %+v, want Roux with the path Béchamel, Roux", got)
	}
	if v.Covered == nil || len(v.Covered) != 0 {
		t.Errorf("Covered = %#v, want an empty list, not nil", v.Covered)
	}
}

func TestBuildViewLabelsABaseRecipePassiveStepsTimerWithItsName(t *testing.T) {
	v, err := cook.BuildView(cook.RecipeScope(3), lasagne(), 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	simmer, bake := v.Steps[1], v.Steps[3]
	if simmer.Timer == nil || simmer.Timer.Label != "Béchamel: Simmer the sauce" || simmer.Timer.DurationSeconds != 1200 {
		t.Errorf("Simmer timer = %+v, want the Base recipe's name, a colon and the Step text", simmer.Timer)
	}
	if bake.Timer == nil || bake.Timer.Label != "Step 4: Bake" {
		t.Errorf("Bake timer = %+v, want the usual label (Step 4 of the composed list)", bake.Timer)
	}
}

func TestBuildViewNamesTheWholeChainOnANestedBaseRecipesTimer(t *testing.T) {
	rs := cook.RecipeSteps{RecipeID: 3, Name: "Lasagne", Steps: []cook.Step{
		{Kind: schedule.Passive, Text: "Whisk until it thickens", DurationMinutes: 4, BaseRecipe: roux},
	}}
	v, err := cook.BuildView(cook.RecipeScope(3), rs, 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := v.Steps[0].Timer.Label; got != "Béchamel · Roux: Whisk until it thickens" {
		t.Errorf("label = %q, want the path joined with \" · \", a colon and the text (cut to 30 runes as usual)", got)
	}
}

func TestBuildViewLeavesCoveredStepsOutAndKeepsTheComposedIndexes(t *testing.T) {
	rs := lasagne()
	for i := 0; i <= 2; i++ { // the Béchamel block (and Roux inside it) is covered by a jar: zero-length Active Steps
		rs.Steps[i].Covered = true
		rs.Steps[i].Kind = schedule.Active
		rs.Steps[i].DurationMinutes = 0
		rs.Steps[i].LeadTimeMinutes = 0
	}
	v, err := cook.BuildView(cook.RecipeScope(3), rs, 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Advance) != 0 {
		t.Errorf("Advance = %+v, want none: a covered Advance Step is not asked", v.Advance)
	}
	if len(v.Steps) != 2 || v.Steps[0].Text != "Layer the lasagne" || v.Steps[1].Text != "Bake" {
		t.Fatalf("Steps = %+v, want Layer and Bake only", v.Steps)
	}
	if a, b := v.Steps[0], v.Steps[1]; a.Index != 3 || b.Index != 4 || a.Number != 1 || b.Number != 2 || a.Of != 2 || b.Of != 2 {
		t.Errorf("Layer = index %d number %d of %d, Bake = index %d number %d of %d; want indexes 3 and 4, numbered 1 and 2 of 2",
			a.Index, a.Number, a.Of, b.Index, b.Number, b.Of)
	}
	// Round 2 (Option A): one entry per covered block, the outermost Base recipe: a jar of Béchamel gives [Béchamel], never Roux
	// inside it. The entry's Path is just that Base recipe's name.
	if len(v.Covered) != 1 || v.Covered[0].Name != "Béchamel" || !reflect.DeepEqual(v.Covered[0].Path, []string{"Béchamel"}) {
		t.Errorf("Covered = %+v, want only the outermost Base recipe of the block: Béchamel with the path [Béchamel]", v.Covered)
	}
	if b := v.Steps[1]; b.Timer == nil || b.Timer.Label != "Step 2: Bake" {
		t.Errorf("Bake timer = %+v, want Step 2 (the number counts the Steps shown)", b.Timer)
	}
}

func TestBuildViewLeavesAPlainRecipesViewAsItWas(t *testing.T) {
	v, err := cook.BuildView(cook.RecipeScope(12), carbonara(), 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, s := range v.Steps {
		if s.BaseRecipe != nil {
			t.Errorf("Step %q has a label: %+v", s.Text, s.BaseRecipe)
		}
	}
	if len(v.Steps) != 3 || v.Covered == nil || len(v.Covered) != 0 {
		t.Errorf("Steps %d Covered %#v", len(v.Steps), v.Covered)
	}
}
