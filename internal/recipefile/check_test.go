package recipefile_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

func ptr[T any](v T) *T { return &v }

// miniRecipe is a valid one-line, no-Step Recipe.
func miniRecipe(name string) recipefile.Recipe {
	return recipefile.Recipe{
		Name: name, Yield: 2,
		Ingredients: []recipefile.Line{{Ingredient: "Rice", Quantity: 200, Unit: "g"}},
	}
}

func fileOf(rs ...recipefile.Recipe) recipefile.File {
	return recipefile.File{Format: recipefile.Format, Version: recipefile.Version, Recipes: rs}
}

func withSteps(steps ...recipefile.Step) recipefile.File {
	r := miniRecipe("Rice")
	r.Steps = steps
	return fileOf(r)
}

func paths(errs []recipefile.PathError) []string {
	out := make([]string, len(errs))
	for i, e := range errs {
		out[i] = e.Path
	}
	return out
}

func TestCheckFileAcceptsThePublishedExample(t *testing.T) {
	if errs := recipefile.CheckFile(exampleFile(t)); len(errs) != 0 {
		t.Fatalf("the spec example must pass: %v", errs)
	}
	if errs := recipefile.CheckFile(fileOf(miniRecipe("A"))); errs != nil {
		t.Fatalf("a plain Recipe: %v", errs)
	}
}

func TestCheckFileReportsStepTimingRules(t *testing.T) {
	active := recipefile.Step{Text: "Chop", Kind: "active"}
	tests := []struct {
		name  string
		steps []recipefile.Step
		want  string
	}{
		{"passive without a duration", []recipefile.Step{{Text: "Rest", Kind: "passive"}}, "$.recipes[0].steps[0].durationMinutes"},
		{"advance without a lead time", []recipefile.Step{{Text: "Soak", Kind: "advance"}}, "$.recipes[0].steps[0].leadTimeMinutes"},
		{"after points forward", []recipefile.Step{{Text: "A", Kind: "active", After: []int{1}}, active}, "$.recipes[0].steps[0].after[0]"},
		{"after points at itself", []recipefile.Step{active, {Text: "B", Kind: "active", After: []int{1}}}, "$.recipes[0].steps[1].after[0]"},
		{"after is negative", []recipefile.Step{active, {Text: "B", Kind: "active", After: []int{0, -1}}}, "$.recipes[0].steps[1].after[1]"},
		{"after names an advance step", []recipefile.Step{{Text: "Soak", Kind: "advance", LeadTimeMinutes: ptr(60.0)}, {Text: "B", Kind: "active", After: []int{0}}}, "$.recipes[0].steps[1].after[0]"},
		{"advance step with after", []recipefile.Step{active, {Text: "Soak", Kind: "advance", LeadTimeMinutes: ptr(60.0), After: []int{0}}}, "$.recipes[0].steps[1].after"},
		{"unknown kind", []recipefile.Step{{Text: "X", Kind: "sideways"}}, "$.recipes[0].steps[0].kind"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			errs := recipefile.CheckFile(withSteps(tc.steps...))
			found := false
			for _, e := range errs {
				if e.Path == tc.want {
					found = true
					if strings.TrimSpace(e.Message) == "" {
						t.Error("empty message")
					}
				}
			}
			if !found {
				t.Fatalf("want an error at %s, got %v", tc.want, errs)
			}
		})
	}
}

func TestCheckFileAcceptsValidTiming(t *testing.T) {
	f := withSteps(
		recipefile.Step{Text: "Soak", Kind: "advance", LeadTimeMinutes: ptr(480.0)},
		recipefile.Step{Text: "Chop", Kind: "active", DurationMinutes: ptr(10.0)},
		recipefile.Step{Text: "Simmer", Kind: "passive", DurationMinutes: ptr(30.0), After: []int{1}},
		recipefile.Step{Text: "Serve", Kind: "active", After: []int{1, 2}},
	)
	if errs := recipefile.CheckFile(f); errs != nil {
		t.Fatalf("got %v", errs)
	}
}

func TestCheckFileRejectsFractionalMinutes(t *testing.T) {
	f := withSteps(
		recipefile.Step{Text: "Soak", Kind: "advance", LeadTimeMinutes: ptr(90.5)},
		recipefile.Step{Text: "Chop", Kind: "active", DurationMinutes: ptr(2.5)},
		recipefile.Step{Text: "Boil", Kind: "passive", DurationMinutes: ptr(10.0)}, // whole: fine
	)
	got := paths(recipefile.CheckFile(f))
	want := []string{"$.recipes[0].steps[0].leadTimeMinutes", "$.recipes[0].steps[1].durationMinutes"}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("paths = %v, want %v", got, want)
	}
}

func TestCheckFileReadyMealNeedsExactlyOneLine(t *testing.T) {
	two := miniRecipe("Lasagne")
	two.ReadyMeal = true
	two.Ingredients = append(two.Ingredients, recipefile.Line{Ingredient: "Cheese", Quantity: 1, Unit: "piece"})
	if got := paths(recipefile.CheckFile(fileOf(two))); fmt.Sprint(got) != "[$.recipes[0].ingredients]" {
		t.Fatalf("two lines: %v", got)
	}
	none := two
	none.Ingredients = nil
	if got := paths(recipefile.CheckFile(fileOf(none))); fmt.Sprint(got) != "[$.recipes[0].ingredients]" {
		t.Fatalf("no lines: %v", got)
	}
	one := miniRecipe("Lasagne")
	one.ReadyMeal = true
	if errs := recipefile.CheckFile(fileOf(one)); errs != nil {
		t.Fatalf("one line: %v", errs)
	}
	notReady := two
	notReady.ReadyMeal = false
	if errs := recipefile.CheckFile(fileOf(notReady)); errs != nil {
		t.Fatalf("a normal Recipe may have many lines: %v", errs)
	}
}

func TestCheckFileReportsDuplicateRecipeNames(t *testing.T) {
	f := fileOf(miniRecipe("Pasta  Bake"), miniRecipe("Soup"), miniRecipe(" pasta bake "))
	errs := recipefile.CheckFile(f)
	if got := paths(errs); fmt.Sprint(got) != "[$.recipes[2].name]" {
		t.Fatalf("paths = %v (the second spelling is the error, normalised comparison)", got)
	}
}

func TestCheckFileReportsEverythingInDocumentOrder(t *testing.T) {
	bad := miniRecipe("A")
	bad.Steps = []recipefile.Step{{Text: "x", Kind: "active", DurationMinutes: ptr(1.5)}, {Text: "y", Kind: "passive"}}
	bad2 := miniRecipe("B")
	bad2.ReadyMeal = true
	bad2.Ingredients = append(bad2.Ingredients, recipefile.Line{Ingredient: "Salt", Quantity: 1, Unit: "g"})
	got := paths(recipefile.CheckFile(fileOf(bad, bad2)))
	want := []string{"$.recipes[0].steps[0].durationMinutes", "$.recipes[0].steps[1].durationMinutes", "$.recipes[1].ingredients"}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("paths = %v, want %v", got, want)
	}
}

// CheckFile and BuildPlan agree on the rules they share: a file CheckFile
// accepts has no schedule Problems in the plan, and one it rejects for
// ordering has one.
func TestCheckFileAgreesWithBuildPlanOnSharedRules(t *testing.T) {
	good := exampleFile(t)
	if errs := recipefile.CheckFile(good); errs != nil {
		t.Fatal(errs)
	}
	if p := recipefile.BuildPlan(good, recipefile.Existing{}, recipefile.Decisions{}, recipefile.ImageSet{}); len(p.Problems) != 0 {
		t.Fatalf("BuildPlan problems on a CheckFile-clean example: %v", p.Problems)
	}
	broken := exampleFile(t)
	broken.Recipes[0].Steps[1].After = []int{4} // forward reference
	if errs := recipefile.CheckFile(broken); len(errs) == 0 {
		t.Fatal("CheckFile must reject a forward 'after'")
	}
	if p := recipefile.BuildPlan(broken, recipefile.Existing{}, recipefile.Decisions{}, recipefile.ImageSet{}); len(p.Problems) == 0 {
		t.Fatal("BuildPlan reports the same file as a Problem")
	}
}
