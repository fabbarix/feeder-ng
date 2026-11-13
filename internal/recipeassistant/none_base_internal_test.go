package recipeassistant

import "testing"

// BR-C: pruneNone on the Base recipe fields (docs/dev/design/base-recipes.md §11.2). It already treats null and blank
// text as none; what is new is that `recipe` is an anyOf of the reference and null, so the walk has to look inside anyOf.

func TestPruneNoneOnTheBaseRecipeFields(t *testing.T) {
	answer := map[string]any{
		"format": "feeder-recipe-file", "version": float64(1),
		"recipes": []any{
			map[string]any{
				"name": "Lasagne", "yield": float64(4), "ingredients": []any{},
				"baseRecipe": false, "yieldUnit": "",
			},
			map[string]any{
				"name": "Béchamel", "yield": float64(1), "baseRecipe": true, "yieldUnit": "l",
				"ingredients": []any{
					map[string]any{"ingredient": "milk", "quantity": float64(1000), "unit": "ml", "recipe": map[string]any{"name": "", "cue": ""}, "neededAtStep": float64(-1)},
					map[string]any{"ingredient": "roux", "quantity": float64(160), "unit": "g",
						"recipe": map[string]any{"name": "Roux", "cue": ""}, "neededAtStep": float64(0)},
					map[string]any{"ingredient": "pasta", "quantity": float64(1), "unit": "g",
						"recipe": map[string]any{"name": "Pasta frolla", "cue": "see page 42"}, "neededAtStep": float64(2)},
				},
			},
		},
	}
	got := pruneNone(answer)
	recipes := got["recipes"].([]any)
	lasagne := recipes[0].(map[string]any)
	if _, has := lasagne["yieldUnit"]; has {
		t.Error(`yieldUnit: "" must be dropped`)
	}
	if _, has := lasagne["baseRecipe"]; has {
		t.Error("baseRecipe: false must be dropped (HF-schema: false is the plain Recipe, the Recipe File leaves it out)")
	}
	bech := recipes[1].(map[string]any)
	if bech["baseRecipe"] != true || bech["yieldUnit"] != "l" {
		t.Errorf("a Base recipe keeps its fields: %v", bech)
	}
	lines := bech["ingredients"].([]any)
	l0 := lines[0].(map[string]any)
	if _, has := l0["recipe"]; has {
		t.Error(`recipe: {name: "", cue: ""} must be dropped`)
	}
	if _, has := l0["neededAtStep"]; has {
		t.Error("neededAtStep: -1 must be dropped")
	}
	l1 := lines[1].(map[string]any)
	ref := l1["recipe"].(map[string]any)
	if ref["name"] != "Roux" {
		t.Errorf("recipe = %v", ref)
	}
	if _, has := ref["cue"]; has {
		t.Error(`cue: "" inside the mark must be dropped, also through the anyOf`)
	}
	if v, has := l1["neededAtStep"]; !has || v != float64(0) {
		t.Errorf("neededAtStep 0 is Step 0, not none: %v %v", v, has)
	}
	l2 := lines[2].(map[string]any)
	if l2["recipe"].(map[string]any)["cue"] != "see page 42" || l2["neededAtStep"] != float64(2) {
		t.Errorf("a real cue and step stay: %v", l2)
	}
}
