package recipeassistant_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// HF-schema (1.0.0-beta.6.1): since beta.6 every Recipe Assistant call failed with "The compiled grammar is too large".
// Structured outputs compile unions at exponential cost, and nested objects compound it, so the output schema goes
// back to the five unions of beta.5.1 and the Base recipe fields write an explicit "none" instead.

// isUnion is a schema with an anyOf or a type array.
func isUnion(s map[string]any) bool {
	if _, ok := s["anyOf"]; ok {
		return true
	}
	_, ok := s["type"].([]any)
	return ok
}

func TestOutputSchemaHasAtMostFiveUnionTypedProperties(t *testing.T) {
	root := decode(t, projected(t))
	var unions []string
	walkSchemas("$", root, func(path string, s map[string]any) {
		if isUnion(s) {
			unions = append(unions, path)
		}
	})
	if len(unions) > 5 {
		t.Errorf("%d union-typed properties, the grammar compiler accepts 5 (beta.5.1): %v", len(unions), unions)
	}
}

// followRefs walks the schema the way the grammar compiler expands it: a $ref is inlined at every use, so a union in
// a $def reached through two arrays is multiplied. depth is the number of array items entered so far.
func followRefs(t *testing.T, path string, s map[string]any, defs map[string]any, depth int, f func(path string, s map[string]any, depth int)) {
	t.Helper()
	if depth > 6 {
		t.Fatalf("%s: schema recurses", path)
	}
	if ref, ok := s["$ref"].(string); ok {
		name := strings.TrimPrefix(ref, "#/$defs/")
		if d, ok := defs[name].(map[string]any); ok {
			followRefs(t, path+"{"+name+"}", d, defs, depth, f)
		}
	}
	f(path, s, depth)
	if props, ok := s["properties"].(map[string]any); ok {
		for name, c := range props {
			if cm, ok := c.(map[string]any); ok {
				followRefs(t, path+"."+name, cm, defs, depth, f)
			}
		}
	}
	if items, ok := s["items"].(map[string]any); ok {
		followRefs(t, path+"[]", items, defs, depth+1, f)
	}
	if list, ok := s["anyOf"].([]any); ok {
		for _, b := range list {
			if bm, ok := b.(map[string]any); ok {
				followRefs(t, path+"|", bm, defs, depth, f)
			}
		}
	}
}

func TestOutputSchemaHasNoUnionInsideNestedArrays(t *testing.T) {
	root := decode(t, projected(t))
	defs, _ := root["$defs"].(map[string]any)
	// recipes[] and ingredients[] are arrays of objects at depth 1 (they hold the five beta.5.1 unions). The lines,
	// uses, steps and conversions are arrays inside those (depth 2): no union may sit there.
	followRefs(t, "$", root, defs, 0, func(path string, s map[string]any, depth int) {
		if depth >= 2 && isUnion(s) {
			t.Errorf("%s: a union inside nested array items (depth %d) multiplies the grammar", path, depth)
		}
	})
	// The same by name, so a moved array cannot hide a union.
	for _, def := range []string{"quantity", "step", "recipeRef"} {
		d, _ := defs[def].(map[string]any)
		walkSchemas("$defs."+def, d, func(path string, s map[string]any) {
			if isUnion(s) {
				t.Errorf("%s is a union: $defs.%s sits inside array items", path, def)
			}
		})
	}
}

func TestOutputSchemaKeepsEveryFieldRequiredAndKeepsTheFiveBeta51Unions(t *testing.T) {
	defs := decode(t, projected(t))["$defs"].(map[string]any)
	want := map[string][]string{
		"ingredient": {"shelfLifeDays"},
		"recipe":     {"cooldownDays", "leftoverUseByDays", "reheatMinutes", "wholeMeal"},
	}
	for def, names := range want {
		props := defs[def].(map[string]any)["properties"].(map[string]any)
		for _, n := range names {
			p, _ := props[n].(map[string]any)
			if p == nil || !isUnion(p) {
				t.Errorf("%s.%s must stay a union (beta.5.1): %v", def, n, p)
			}
		}
	}
	for def, v := range defs {
		m := v.(map[string]any)
		props, ok := m["properties"].(map[string]any)
		if !ok {
			continue
		}
		if len(toStrings(m["required"])) != len(props) {
			t.Errorf("$defs.%s: every property must be required: %v of %d", def, m["required"], len(props))
		}
	}
}

// ---- the sentinels, through pruneNone and Finish -------------------------------------------------------------

func TestFinishReadsNeededAtStepMinusOneAsAbsentAndKeepsZero(t *testing.T) {
	r := finishBase(t, `"recipe":{"name":"Béchamel","cue":""},"neededAtStep":-1`)
	if l := r.Ingredients[1]; l.NeededAtStep != nil {
		t.Errorf("-1 is none, got %d", *l.NeededAtStep)
	}
	r = finishBase(t, `"recipe":{"name":"Béchamel","cue":""},"neededAtStep":1`)
	if l := r.Ingredients[1]; l.NeededAtStep == nil || *l.NeededAtStep != 1 {
		t.Errorf("1 stays: %+v", l.NeededAtStep)
	}
}

func TestFinishReadsAnEmptyRecipeNameAsNoRecipe(t *testing.T) {
	r := finishBase(t, `"recipe":{"name":"","cue":""},"neededAtStep":-1`)
	if l := r.Ingredients[1]; l.Recipe != nil {
		t.Errorf("name \"\" is none: %+v", l.Recipe)
	}
}

func TestFinishReadsBaseRecipeFalseAsAbsentAndKeepsTrueWithItsUnit(t *testing.T) {
	r := finishBase(t, `"recipe":{"name":"","cue":""},"neededAtStep":-1`)
	if r.BaseRecipe != nil || r.YieldUnit != "" {
		t.Errorf("baseRecipe false and yieldUnit \"\" are absent: %v %q", r.BaseRecipe, r.YieldUnit)
	}
	raw := `{"format":"feeder-recipe-file","version":1,"noRecipe":false,
	 "ingredients":[{"name":"milk","baseUnit":"ml","conversions":[],"image":"","shelfLifeDays":null}],
	 "recipes":[{"name":"Béchamel","description":"","yield":1,"readyMeal":false,"courses":[],"wholeMeal":null,"tags":[],
	  "image":"","cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	  "baseRecipe":true,"yieldUnit":"l",
	  "ingredients":[{"ingredient":"milk","quantity":1000,"unit":"ml","note":"","optional":false,"recipe":{"name":"","cue":""},"neededAtStep":-1}],
	  "steps":[]}]}`
	fin, err := ra.Finish([]byte(raw), ra.FinishInput{Kind: ra.KindText})
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}
	if b := fin.File.Recipes[0]; b.BaseRecipe == nil || !*b.BaseRecipe || b.YieldUnit != "l" {
		t.Errorf("a Base recipe keeps its fields: %+v", b)
	}
}

// spellOut writes a Recipe File the way the model must under the hotfix schema: every field present, every none spelled out.
func spellOut(t *testing.T, file string) []byte {
	t.Helper()
	m := decode(t, []byte(file))
	m["noRecipe"] = false
	for _, ing := range m["ingredients"].([]any) {
		im := ing.(map[string]any)
		fill(im, map[string]any{"conversions": []any{}, "image": "", "shelfLifeDays": nil})
	}
	for _, r := range m["recipes"].([]any) {
		rm := r.(map[string]any)
		fill(rm, map[string]any{"description": "", "readyMeal": false, "courses": []any{}, "wholeMeal": nil, "tags": []any{},
			"image": "", "cooldownDays": nil, "leftoverUseByDays": nil, "reheatMinutes": nil,
			"source": map[string]any{"url": "", "attribution": ""}, "baseRecipe": false, "yieldUnit": "", "steps": []any{}})
		for _, l := range rm["ingredients"].([]any) {
			fill(l.(map[string]any), map[string]any{"note": "", "optional": false,
				"recipe": map[string]any{"name": "", "cue": ""}, "neededAtStep": float64(-1)})
		}
		for _, st := range rm["steps"].([]any) {
			fill(st.(map[string]any), map[string]any{"image": "", "after": []any{}, "uses": []any{}, "leadTimeMinutes": float64(0), "durationMinutes": float64(5)})
		}
	}
	out, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func fill(m, defaults map[string]any) {
	for k, v := range defaults {
		if _, has := m[k]; !has {
			m[k] = v
		}
	}
}

func TestFinishOnTheBaseRecipesFixtureSpelledOutWithSentinelsEqualsTheFixture(t *testing.T) {
	for name, fixture := range map[string]string{
		"base-recipes":   fakeanthropic.BaseRecipesFile(),
		"base-reference": fakeanthropic.BaseReferenceFile(),
	} {
		want, err := recipefile.Parse([]byte(fixture))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		fin, err := ra.Finish(spellOut(t, fixture), ra.FinishInput{Kind: ra.KindText})
		if err != nil {
			t.Fatalf("%s: Finish: %v (%+v)", name, err, err)
		}
		if !reflect.DeepEqual(fin.File.Recipes[0].Ingredients, want.Recipes[0].Ingredients) {
			t.Errorf("%s: lines differ:\n got %+v\nwant %+v", name, fin.File.Recipes[0].Ingredients, want.Recipes[0].Ingredients)
		}
		for i := range want.Recipes {
			g, w := fin.File.Recipes[i], want.Recipes[i]
			if !reflect.DeepEqual(g.BaseRecipe, w.BaseRecipe) || g.YieldUnit != w.YieldUnit || g.Yield != w.Yield {
				t.Errorf("%s: recipe %d = base %v %q yield %v, want base %v %q yield %v", name, i, g.BaseRecipe, g.YieldUnit, g.Yield, w.BaseRecipe, w.YieldUnit, w.Yield)
			}
		}
	}
}

// A Base recipe whose own line calls for another Base recipe (Lasagne > Béchamel > Roux), end to end with sentinels.
func TestFinishNestedBaseRecipeLineEndToEnd(t *testing.T) {
	raw := []byte(`{"format":"feeder-recipe-file","version":1,"noRecipe":false,
	 "ingredients":[
	  {"name":"lasagne sheets","baseUnit":"g","conversions":[],"image":"","shelfLifeDays":null},
	  {"name":"béchamel","baseUnit":"ml","conversions":[],"image":"","shelfLifeDays":null},
	  {"name":"milk","baseUnit":"ml","conversions":[],"image":"","shelfLifeDays":null},
	  {"name":"roux","baseUnit":"g","conversions":[],"image":"","shelfLifeDays":null},
	  {"name":"butter","baseUnit":"g","conversions":[],"image":"","shelfLifeDays":null}],
	 "recipes":[
	  {"name":"Lasagne","description":"","yield":4,"readyMeal":false,"courses":["Main"],"wholeMeal":null,"tags":[],"image":"",
	   "cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	   "baseRecipe":false,"yieldUnit":"",
	   "ingredients":[
	    {"ingredient":"lasagne sheets","quantity":250,"unit":"g","note":"","optional":false,"recipe":{"name":"","cue":""},"neededAtStep":-1},
	    {"ingredient":"béchamel","quantity":500,"unit":"ml","note":"","optional":false,"recipe":{"name":"Béchamel","cue":"see page 42"},"neededAtStep":1}],
	   "steps":[{"text":"Cook.","kind":"active","durationMinutes":5,"leadTimeMinutes":0,"after":[],"uses":[],"image":""},
	            {"text":"Layer.","kind":"active","durationMinutes":5,"leadTimeMinutes":0,"after":[0],"uses":[],"image":""}]},
	  {"name":"Béchamel","description":"","yield":1,"readyMeal":false,"courses":[],"wholeMeal":null,"tags":[],"image":"",
	   "cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	   "baseRecipe":true,"yieldUnit":"l",
	   "ingredients":[
	    {"ingredient":"milk","quantity":1000,"unit":"ml","note":"","optional":false,"recipe":{"name":"","cue":""},"neededAtStep":-1},
	    {"ingredient":"roux","quantity":80,"unit":"g","note":"","optional":false,"recipe":{"name":"Roux","cue":""},"neededAtStep":0}],
	   "steps":[{"text":"Add the roux.","kind":"active","durationMinutes":5,"leadTimeMinutes":0,"after":[],"uses":[],"image":""}]},
	  {"name":"Roux","description":"","yield":200,"readyMeal":false,"courses":[],"wholeMeal":null,"tags":[],"image":"",
	   "cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	   "baseRecipe":true,"yieldUnit":"g",
	   "ingredients":[
	    {"ingredient":"butter","quantity":100,"unit":"g","note":"","optional":false,"recipe":{"name":"","cue":""},"neededAtStep":-1}],
	   "steps":[]}]}`)
	fin, err := ra.Finish(raw, ra.FinishInput{Kind: ra.KindText})
	if err != nil {
		t.Fatalf("Finish: %v (%+v)", err, err)
	}
	lasagne, bech, roux := fin.File.Recipes[0], fin.File.Recipes[1], fin.File.Recipes[2]
	if lasagne.BaseRecipe != nil || lasagne.YieldUnit != "" {
		t.Errorf("Lasagne is a plain Recipe: %v %q", lasagne.BaseRecipe, lasagne.YieldUnit)
	}
	if l := lasagne.Ingredients[0]; l.Recipe != nil || l.NeededAtStep != nil {
		t.Errorf("a plain line has neither: %+v", l)
	}
	if l := lasagne.Ingredients[1]; l.Recipe == nil || l.Recipe.Name != "Béchamel" || l.Recipe.Cue != "see page 42" || l.NeededAtStep == nil || *l.NeededAtStep != 1 {
		t.Errorf("the Béchamel line = %+v", l)
	}
	if bech.BaseRecipe == nil || !*bech.BaseRecipe || bech.YieldUnit != "l" {
		t.Errorf("Béchamel = %v %q", bech.BaseRecipe, bech.YieldUnit)
	}
	if l := bech.Ingredients[0]; l.Recipe != nil || l.NeededAtStep != nil {
		t.Errorf("milk is a plain line: %+v", l)
	}
	if l := bech.Ingredients[1]; l.Recipe == nil || l.Recipe.Name != "Roux" || l.Recipe.Cue != "" || l.NeededAtStep == nil || *l.NeededAtStep != 0 {
		t.Errorf("the Roux line inside a Base recipe = %+v", l)
	}
	if roux.BaseRecipe == nil || !*roux.BaseRecipe || roux.YieldUnit != "g" || roux.Ingredients[0].Recipe != nil || roux.Ingredients[0].NeededAtStep != nil {
		t.Errorf("Roux = %+v", roux)
	}
}

// ---- round 2: the duplicate `use` def pushed the grammar over the limit (bisected against the real API) -------------

func TestOutputSchemaDefsAreExactlyTheExpectedSet(t *testing.T) {
	defs := decode(t, projected(t))["$defs"].(map[string]any)
	var got []string
	for name := range defs {
		got = append(got, name)
	}
	want := []string{"image", "ingredient", "name", "quantity", "recipe", "recipeRef", "step", "unit"}
	if len(got) != len(want) {
		t.Errorf("$defs = %v, want exactly %v (a second line-shaped def doubles the grammar)", got, want)
	}
	for _, w := range want {
		if !contains(got, w) {
			t.Errorf("$defs lacks %q", w)
		}
	}
	if _, has := defs["use"]; has {
		t.Error("the `use` def must be gone: a Step's uses reuse quantity")
	}
}

func TestStepUsesAndRecipeLinesShareTheQuantityDef(t *testing.T) {
	defs := decode(t, projected(t))["$defs"].(map[string]any)
	lines := defs["recipe"].(map[string]any)["properties"].(map[string]any)["ingredients"].(map[string]any)["items"].(map[string]any)
	uses := defs["step"].(map[string]any)["properties"].(map[string]any)["uses"].(map[string]any)["items"].(map[string]any)
	if lines["$ref"] != "#/$defs/quantity" || uses["$ref"] != "#/$defs/quantity" {
		t.Errorf("lines items = %v, uses items = %v: both must be {$ref: #/$defs/quantity}", lines, uses)
	}
}

func TestOutputSchemaQuantityDescriptionsSayAlwaysNoneInAStepsUses(t *testing.T) {
	props := decode(t, projected(t))["$defs"].(map[string]any)["quantity"].(map[string]any)["properties"].(map[string]any)
	for name, want := range map[string]string{
		"neededAtStep": "Write -1 when the line calls for no other recipe, and always in a Step's uses.",
		"recipe":       `Write name "" and cue "" when the line calls for no other recipe, and always in a Step's uses.`,
	} {
		d, _ := props[name].(map[string]any)["description"].(string)
		if !strings.HasSuffix(d, want) {
			t.Errorf("%s description = %q, want it to end with %q", name, d, want)
		}
	}
}

// useAnswer is a model answer whose one Step use carries the given recipe and neededAtStep.
func useAnswer(useExtra string) []byte {
	return []byte(`{"format":"feeder-recipe-file","version":1,"noRecipe":false,
	 "ingredients":[{"name":"rice","baseUnit":"g","conversions":[],"image":"","shelfLifeDays":null}],
	 "recipes":[{"name":"Rice","description":"","yield":2,"readyMeal":false,"courses":[],"wholeMeal":null,"tags":[],
	  "image":"","cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	  "baseRecipe":false,"yieldUnit":"",
	  "ingredients":[{"ingredient":"rice","quantity":200,"unit":"g","note":"","optional":false,"recipe":{"name":"","cue":""},"neededAtStep":-1}],
	  "steps":[{"text":"Boil.","kind":"active","durationMinutes":5,"leadTimeMinutes":0,"after":[],"image":"",
	   "uses":[{"ingredient":"rice","quantity":200,"unit":"g","note":"","optional":false,` + useExtra + `}]},
	   {"text":"Serve.","kind":"active","durationMinutes":1,"leadTimeMinutes":0,"after":[0],"image":"","uses":[]},
	   {"text":"Eat.","kind":"active","durationMinutes":1,"leadTimeMinutes":0,"after":[1],"image":"","uses":[]}]}]}`)
}

func TestFinishDropsTheSentinelsOfAStepsUses(t *testing.T) {
	fin, err := ra.Finish(useAnswer(`"recipe":{"name":"","cue":""},"neededAtStep":-1`), ra.FinishInput{Kind: ra.KindText})
	if err != nil {
		t.Fatalf("Finish: %v (%+v)", err, err)
	}
	if u := fin.File.Recipes[0].Steps[0].Uses[0]; u.Ingredient != "rice" || u.Quantity != 200 {
		t.Errorf("use = %+v", u)
	}
}

// The Recipe File forbids recipe and neededAtStep on a Step's uses, so a wrong model answer must not fail validation.
func TestFinishDropsARealRecipeAndNeededAtStepFromAStepsUse(t *testing.T) {
	fin, err := ra.Finish(useAnswer(`"recipe":{"name":"Béchamel","cue":""},"neededAtStep":2`), ra.FinishInput{Kind: ra.KindText})
	if err != nil {
		t.Fatalf("Finish: %v (%+v)", err, err)
	}
	// Neither field survives on the use: marshal the File and look at the Step's uses.
	out, err := json.Marshal(fin.File.Recipes[0].Steps[0].Uses)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), "recipe") || strings.Contains(string(out), "neededAtStep") || strings.Contains(string(out), "Béchamel") {
		t.Errorf("the use kept a field the Recipe File forbids: %s", out)
	}
	// ...and the line-level mark on the Recipe's own lines is untouched by that rule.
	if l := fin.File.Recipes[0].Ingredients[0]; l.Recipe != nil || l.NeededAtStep != nil {
		t.Errorf("line = %+v", l)
	}
	// The Finished file passes the canonical schema.
	raw, err := json.Marshal(fin.File)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := recipefile.Parse(raw); err != nil {
		t.Errorf("the finished file fails the canonical schema: %v", err)
	}
}

func TestFinishKeepsALinesRecipeWhileDroppingItFromTheStepsUses(t *testing.T) {
	raw := strings.Replace(string(useAnswer(`"recipe":{"name":"Béchamel","cue":""},"neededAtStep":2`)),
		`"recipe":{"name":"","cue":""},"neededAtStep":-1}],`, `"recipe":{"name":"Béchamel","cue":"see page 4"},"neededAtStep":1}],`, 1)
	raw = strings.Replace(raw, `"ingredients":[{"name":"rice"`, `"ingredients":[{"name":"rice"`, 1)
	// Béchamel must exist in the file for CheckFile: add it as a Base recipe.
	raw = strings.Replace(raw, `{"text":"Eat.","kind":"active","durationMinutes":1,"leadTimeMinutes":0,"after":[1],"image":"","uses":[]}]}]}`,
		`{"text":"Eat.","kind":"active","durationMinutes":1,"leadTimeMinutes":0,"after":[1],"image":"","uses":[]}]},
	 {"name":"Béchamel","description":"","yield":1,"readyMeal":false,"courses":[],"wholeMeal":null,"tags":[],"image":"",
	  "cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	  "baseRecipe":true,"yieldUnit":"l",
	  "ingredients":[{"ingredient":"rice","quantity":1,"unit":"g","note":"","optional":false,"recipe":{"name":"","cue":""},"neededAtStep":-1}],
	  "steps":[]}]}`, 1)
	fin, err := ra.Finish([]byte(raw), ra.FinishInput{Kind: ra.KindText})
	if err != nil {
		t.Fatalf("Finish: %v (%+v)", err, err)
	}
	r := fin.File.Recipes[0]
	if l := r.Ingredients[0]; l.Recipe == nil || l.Recipe.Name != "Béchamel" || l.NeededAtStep == nil || *l.NeededAtStep != 1 {
		t.Errorf("the line keeps its mark: %+v", l)
	}
	out, _ := json.Marshal(r.Steps[0].Uses)
	if strings.Contains(string(out), "recipe") || strings.Contains(string(out), "neededAtStep") {
		t.Errorf("the use kept a field the Recipe File forbids: %s", out)
	}
}
