package recipeassistant_test

import (
	"testing"

	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// The output schema makes every field required, so the model spells "none" out; Finish removes those values from
// the optional fields and the Recipe File parses as if they had been left out.
func TestFinishDropsTheExplicitNoneOfOptionalFields(t *testing.T) {
	raw := `{"format":"feeder-recipe-file","version":1,"noRecipe":false,
	 "ingredients":[{"name":"butter","baseUnit":"g","conversions":[],"image":"","shelfLifeDays":null}],
	 "recipes":[{"name":"Buttered toast","description":"  ","yield":1,"readyMeal":false,"tags":[],"image":"",
	  "cooldownDays":null,"leftoverUseByDays":0,"reheatMinutes":null,"source":{"url":"","attribution":""},
	  "ingredients":[{"ingredient":"butter","quantity":10,"unit":"g","note":"","optional":false}],
	  "steps":[{"text":"Toast the bread.","kind":"active","durationMinutes":3,"leadTimeMinutes":0,"after":[],"uses":[],"image":""}]}]}`
	fin, err := ra.Finish([]byte(raw), ra.FinishInput{Kind: ra.KindText})
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}
	r := fin.File.Recipes[0]
	if r.Name != "Buttered toast" || r.Description != "" || r.Source != nil || len(r.Tags) != 0 || r.Image != "" {
		t.Errorf("recipe = %+v", r)
	}
	if r.CooldownDays != nil || r.ReheatMinutes != nil {
		t.Errorf("null numbers must be absent: cooldown %v reheat %v", r.CooldownDays, r.ReheatMinutes)
	}
	if r.LeftoverUseByDays == nil || *r.LeftoverUseByDays != 0 {
		t.Errorf("a nullable number keeps 0 (same-day Use-by), got %v", r.LeftoverUseByDays)
	}
	s := r.Steps[0]
	if s.DurationMinutes == nil || *s.DurationMinutes != 3 || s.LeadTimeMinutes != nil || len(s.After) != 0 || len(s.Uses) != 0 {
		t.Errorf("step = %+v", s)
	}
}

func TestFinishKeepsARequiredFieldEvenWhenBlank(t *testing.T) {
	raw := `{"format":"feeder-recipe-file","version":1,"noRecipe":false,"ingredients":[],
	 "recipes":[{"name":"","description":"","yield":1,"readyMeal":false,"tags":[],"image":"","cooldownDays":null,
	  "leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	  "ingredients":[{"ingredient":"bread","quantity":2,"unit":"piece","note":"","optional":false}],"steps":[]}]}`
	if _, err := ra.Finish([]byte(raw), ra.FinishInput{Kind: ra.KindText}); ra.CodeOf(err) != ra.CodeInvalidOutput {
		t.Fatalf("a blank required name must still fail validation, got %v", err)
	}
}
