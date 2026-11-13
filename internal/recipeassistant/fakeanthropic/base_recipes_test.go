package fakeanthropic_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C: the fake's Base recipe answers (docs/dev/design/base-recipes.md §11.2, last bullet).

func answerText(t *testing.T, m map[string]any) string {
	t.Helper()
	content, _ := m["content"].([]any)
	if len(content) == 0 {
		t.Fatalf("no content: %v", m)
	}
	return content[0].(map[string]any)["text"].(string)
}

func TestTheBaseRecipesAnswerIsAValidFileWithALasagneAndABechamelBaseRecipe(t *testing.T) {
	f, err := recipefile.Parse([]byte(fakeanthropic.BaseRecipesFile()))
	if err != nil {
		t.Fatalf("must parse: %v", err)
	}
	if errs := recipefile.CheckFile(f); len(errs) != 0 {
		t.Fatalf("must pass CheckFile: %+v", errs)
	}
	if len(f.Recipes) != 2 || f.Recipes[0].Name != "Lasagne" || f.Recipes[1].Name != "Béchamel" {
		t.Fatalf("recipes = %+v", f.Recipes)
	}
	if b := f.Recipes[1]; b.BaseRecipe == nil || !*b.BaseRecipe || b.Yield != 1 || b.YieldUnit != "l" {
		t.Errorf("Béchamel = %+v", b)
	}
	var found bool
	for _, l := range f.Recipes[0].Ingredients {
		if l.Recipe != nil && l.Recipe.Name == "Béchamel" && l.Quantity == 500 && l.Unit == "ml" {
			found = true
		}
	}
	if !found {
		t.Errorf("Lasagne needs the line 500 ml béchamel marked as Béchamel: %+v", f.Recipes[0].Ingredients)
	}
}

func TestTheBaseReferenceAnswerCarriesTheCueAndNoRecipeToMatchIt(t *testing.T) {
	f, err := recipefile.Parse([]byte(fakeanthropic.BaseReferenceFile()))
	if err != nil {
		t.Fatalf("must parse: %v", err)
	}
	if errs := recipefile.CheckFile(f); len(errs) != 0 {
		t.Fatalf("must pass CheckFile: %+v", errs)
	}
	if len(f.Recipes) != 1 {
		t.Fatalf("recipes = %+v", f.Recipes)
	}
	var cue string
	for _, l := range f.Recipes[0].Ingredients {
		if l.Recipe != nil {
			cue = l.Recipe.Cue
		}
	}
	if cue != "see page 42" {
		t.Errorf("cue = %q", cue)
	}
}

func TestTheMarkersAnswerWithTheBaseRecipeFiles(t *testing.T) {
	s := fakeanthropic.New()
	defer s.Close()
	for marker, want := range map[string]string{
		"base-recipes":   fakeanthropic.BaseRecipesFile(),
		"base-reference": fakeanthropic.BaseReferenceFile(),
	} {
		status, m, _ := post(t, s.URL, "sk-1", "<source>500 ml béchamel #fake:"+marker+"</source>")
		if status != 200 || want == "" || answerText(t, m) != want {
			t.Errorf("#fake:%s: status %d, answer %.60q, want %.60q", marker, status, answerText(t, m), want)
		}
	}
}

func TestAReadOfTheReferenceAnswerEndsInReviewWithATileWaitingForAnAnswer(t *testing.T) {
	f, err := recipefile.Parse([]byte(fakeanthropic.BaseReferenceFile()))
	if err != nil {
		t.Fatal(err)
	}
	p := recipefile.BuildPlan(f, recipefile.Existing{}, recipefile.Decisions{}, recipefile.ImageSet{})
	if len(p.BaseRecipeLines) != 1 {
		t.Fatalf("tiles = %+v", p.BaseRecipeLines)
	}
	row := p.BaseRecipeLines[0]
	if row.Cue != "see page 42" || row.Reference != "Béchamel" || row.Resolved || p.Ready || !strings.HasPrefix(row.Path, "$.recipes[0].ingredients[") {
		t.Errorf("row = %+v ready=%v", row, p.Ready)
	}
}
