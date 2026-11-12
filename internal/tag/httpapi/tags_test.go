package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func TestTagRoutesAreForSignedInUsers(t *testing.T) {
	env := testkit.Start(t)
	fish := seedTag(t, env, "fish", "tomato")
	sea := seedTag(t, env, "Seafood", "apricot")
	anon, user := env.Anonymous(), env.LoginUser(t) // a User who is not an Admin
	for _, p := range []string{"/api/tags", path("/api/tags/%d/impact", fish)} {
		if r := anon.Get(p); r.Status != 401 {
			t.Errorf("anonymous GET %s = %d, want 401", p, r.Status)
		}
		if r := user.Get(p); r.Status != 200 {
			t.Errorf("User GET %s = %d, want 200", p, r.Status)
		}
	}
	writes := []struct {
		method, path string
		body         any
	}{
		{"POST", "/api/tags", map[string]any{"name": "Roast"}},
		{"PATCH", path("/api/tags/%d", fish), map[string]any{"colour": "sky"}},
		{"POST", path("/api/tags/%d/merge", fish), map[string]any{"into": sea}},
		{"DELETE", path("/api/tags/%d", sea), nil},
	}
	for _, w := range writes {
		if r := anon.Do(w.method, w.path, w.body); r.Status != 401 {
			t.Errorf("anonymous %s %s = %d, want 401", w.method, w.path, r.Status)
		}
	}
	for _, w := range writes {
		if r := user.Do(w.method, w.path, w.body); r.Status >= 300 {
			t.Errorf("User %s %s = %d %s, want a success", w.method, w.path, r.Status, r.Body)
		}
	}
}

func TestListIsAnArrayByNameWithCountsAndColour(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	if r := c.Get("/api/tags"); r.Status != 200 || strings.TrimSpace(r.String()) != "[]" {
		t.Fatalf("no Tags = %d %q, want 200 and []", r.Status, r.String())
	}
	pasta, fish, apple := seedTag(t, env, "Pasta", "sage"), seedTag(t, env, "fish", "tomato"), seedTag(t, env, "Apple", "plum")
	seedRecipe(t, env, "Carbonara", 0, pasta)
	seedRecipe(t, env, "Old lasagne", 1, pasta) // archived Recipes count
	seedRecipe(t, env, "Salmon", 0, fish, pasta)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	dinner := seedSlot(t, env, 5, "Dinner", "19:00")
	seedSlotRule(t, env, dinner, main, "fish")
	seedSlotRule(t, env, dinner, side, "fish")
	seedVariety(t, env, "fish", 1, 0)

	got := listTags(t, c)
	want := []tagBody{
		{ID: apple, Name: "Apple", Key: "apple", Colour: "plum"},
		{ID: fish, Name: "fish", Key: "fish", Colour: "tomato", Recipes: 1, SlotRules: 2, VarietyRule: true},
		{ID: pasta, Name: "Pasta", Key: "pasta", Colour: "sage", Recipes: 3},
	}
	if len(got) != len(want) {
		t.Fatalf("GET /api/tags = %+v, want %+v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("tag %d = %+v, want %+v", i, got[i], want[i])
		}
	}
	// An older SPA still reads name and recipes.
	var old []struct {
		Name    string `json:"name"`
		Recipes int    `json:"recipes"`
	}
	c.Get("/api/tags").MustJSON(t, &old)
	if len(old) != 3 || old[2].Name != "Pasta" || old[2].Recipes != 3 {
		t.Errorf("old fields = %+v", old)
	}
}

func TestCreateTakesTheNextColourOrTheOneGiven(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	var first tagBody
	r := c.Post("/api/tags", map[string]any{"name": "  Roast   beef "})
	r.MustJSON(t, &first)
	if r.Status != 201 || first.ID == 0 || first.Name != "Roast beef" || first.Key != "roast beef" || first.Colour != "tomato" ||
		first.Recipes != 0 || first.SlotRules != 0 || first.VarietyRule {
		t.Fatalf("first Tag = %d %s", r.Status, r.Body)
	}
	var second tagBody
	c.Post("/api/tags", map[string]any{"name": "Fish"}).MustJSON(t, &second)
	if second.Colour != "apricot" {
		t.Errorf("second colour = %q, want apricot (the colour fewest Tags have)", second.Colour)
	}
	var chosen tagBody
	r = c.Post("/api/tags", map[string]any{"name": "Soup", "colour": "rose"})
	r.MustJSON(t, &chosen)
	if r.Status != 201 || chosen.Colour != "rose" {
		t.Errorf("chosen colour = %d %s", r.Status, r.Body)
	}
	if got := tagNames(listTags(t, c)); !sameStrings(got, []string{"Fish", "Roast beef", "Soup"}) {
		t.Errorf("list = %v, want by name", got)
	}
}

func TestColoursRepeatAfterTen(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	var colours []string
	for i := 0; i < 12; i++ {
		var tg tagBody
		r := c.Post("/api/tags", map[string]any{"name": path("Tag %02d", i)})
		r.MustJSON(t, &tg)
		if r.Status != 201 {
			t.Fatalf("Tag %d = %d %s", i, r.Status, r.Body)
		}
		colours = append(colours, tg.Colour)
	}
	want := []string{"tomato", "apricot", "mustard", "olive", "sage", "teal", "sky", "blue", "plum", "rose", "tomato", "apricot"}
	if !sameStrings(colours, want) {
		t.Errorf("colours = %v, want %v", colours, want)
	}
}

func TestCreateRefusals(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish := seedTag(t, env, "fish", "tomato")
	wantError(t, "empty name", c.Post("/api/tags", map[string]any{"name": "   "}), 422, "validation_failed", "name", "tag_invalid")
	wantError(t, "41 characters", c.Post("/api/tags", map[string]any{"name": strings.Repeat("é", 41)}), 422, "validation_failed", "name", "tag_invalid")
	if r := c.Post("/api/tags", map[string]any{"name": strings.Repeat("é", 40)}); r.Status != 201 {
		t.Errorf("40 characters = %d %s, want 201", r.Status, r.Body)
	}
	wantError(t, "unknown colour", c.Post("/api/tags", map[string]any{"name": "Soup", "colour": "chartreuse"}), 422, "validation_failed", "colour", "colour_unknown")
	e := wantError(t, "taken", c.Post("/api/tags", map[string]any{"name": " FISH "}), 409, "tag_name_taken", "", "")
	if e.Error.Tag == nil || e.Error.Tag.ID != fish || e.Error.Tag.Name != "fish" || e.Error.Tag.Colour != "tomato" {
		t.Errorf("tag_name_taken names %+v, want the other Tag {fish, tomato}", e.Error.Tag)
	}
	if r := c.Post("/api/tags", nil); r.Status != 400 {
		t.Errorf("no body = %d, want 400", r.Status)
	}
	if n := count(t, env, `SELECT count(*) FROM tags`); n != 2 {
		t.Errorf("%d Tags after the refusals, want fish and the 40-character one", n)
	}
}

func TestRenameMovesTheRulesAndKeepsTheColour(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish := seedTag(t, env, "fish", "plum")
	seedRecipe(t, env, "Salmon", 0, fish)
	dinner := seedSlot(t, env, 5, "Dinner", "19:00")
	main := courseID(t, env, "Main")
	seedSlotRule(t, env, dinner, main, "fish")
	seedVariety(t, env, "fish", 1, 0)

	var got tagBody
	r := c.Patch(path("/api/tags/%d", fish), map[string]any{"name": "Seafood"})
	r.MustJSON(t, &got)
	want := tagBody{ID: fish, Name: "Seafood", Key: "seafood", Colour: "plum", Recipes: 1, SlotRules: 1, VarietyRule: true}
	if r.Status != 200 || got != want {
		t.Fatalf("rename = %d %s, want %+v (the counts follow the key)", r.Status, r.Body, want)
	}
	if rules := ruleKeys(t, env); !sameStrings(rules, []string{path("%d/%d=seafood", dinner, main), "variety=seafood"}) {
		t.Errorf("rules after the rename = %v, want them on seafood", rules)
	}
	// The rules answers the SPA reads follow the new key.
	var slotRules []struct {
		Tag string `json:"tag"`
	}
	c.Get("/api/slot-rules").MustJSON(t, &slotRules)
	var variety []struct {
		Tag string `json:"tag"`
	}
	c.Get("/api/variety-rules").MustJSON(t, &variety)
	if len(slotRules) != 1 || slotRules[0].Tag != "seafood" || len(variety) != 1 || variety[0].Tag != "seafood" {
		t.Errorf("GET slot-rules = %+v, variety-rules = %+v, want seafood in both", slotRules, variety)
	}
}

func TestRespellKeepsTheRulesAndRecolourChangesOnlyTheColour(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish := seedTag(t, env, "fish", "tomato")
	seedVariety(t, env, "fish", 2, 1)
	var got tagBody
	r := c.Patch(path("/api/tags/%d", fish), map[string]any{"name": "Fish"})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Name != "Fish" || got.Key != "fish" || got.Colour != "tomato" || !got.VarietyRule {
		t.Errorf("respell = %d %s", r.Status, r.Body)
	}
	if rules := ruleKeys(t, env); !sameStrings(rules, []string{"variety=fish"}) {
		t.Errorf("rules after a respell = %v, want untouched", rules)
	}
	r = c.Patch(path("/api/tags/%d", fish), map[string]any{"colour": "sky"})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Name != "Fish" || got.Colour != "sky" {
		t.Errorf("recolour = %d %s", r.Status, r.Body)
	}
	r = c.Patch(path("/api/tags/%d", fish), map[string]any{"name": "Seafood", "colour": "teal"})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.Name != "Seafood" || got.Colour != "teal" {
		t.Errorf("rename and recolour = %d %s", r.Status, r.Body)
	}
}

func TestUpdateRefusals(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish := seedTag(t, env, "fish", "tomato")
	sea := seedTag(t, env, "Seafood", "apricot")
	seedVariety(t, env, "fish", 1, 0)
	url := path("/api/tags/%d", fish)
	wantError(t, "unknown Tag", c.Patch("/api/tags/9999", map[string]any{"colour": "sky"}), 404, "not_found", "", "")
	wantError(t, "not a number", c.Patch("/api/tags/fish", map[string]any{"colour": "sky"}), 404, "not_found", "", "")
	wantError(t, "nothing to change", c.Patch(url, map[string]any{}), 422, "validation_failed", "name", "nothing_to_change")
	wantError(t, "empty name", c.Patch(url, map[string]any{"name": ""}), 422, "validation_failed", "name", "tag_invalid")
	wantError(t, "unknown colour", c.Patch(url, map[string]any{"colour": "chartreuse"}), 422, "validation_failed", "colour", "colour_unknown")
	e := wantError(t, "onto another Tag", c.Patch(url, map[string]any{"name": "SEAFOOD", "colour": "rose"}), 409, "tag_name_taken", "", "")
	if e.Error.Tag == nil || e.Error.Tag.ID != sea || e.Error.Tag.Name != "Seafood" || e.Error.Tag.Colour != "apricot" {
		t.Errorf("tag_name_taken names %+v, want Seafood", e.Error.Tag)
	}
	// A refused update changes nothing, not even the colour.
	var colour string
	env.DB.QueryRow(`SELECT colour FROM tags WHERE id = ?`, fish).Scan(&colour)
	if colour != "tomato" || !sameStrings(ruleKeys(t, env), []string{"variety=fish"}) {
		t.Errorf("after the refusals colour = %q, rules = %v, want tomato and untouched", colour, ruleKeys(t, env))
	}
}

func TestImpactListsWhatDeleteAndMergeTouch(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish := seedTag(t, env, "fish", "tomato")
	sea := seedTag(t, env, "Seafood", "apricot")
	empty := seedTag(t, env, "Unused", "sage")
	seedRecipe(t, env, "Salmon", 0, fish, sea)
	seedRecipe(t, env, "Cod", 0, fish)
	seedRecipe(t, env, "Old trout", 1, fish, sea) // archived Recipes count
	seedRecipe(t, env, "Prawns", 0, sea)
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	friday, monday := seedSlot(t, env, 5, "Dinner", "19:00"), seedSlot(t, env, 1, "Lunch", "12:00")
	seedSlotRule(t, env, friday, side, "fish")
	seedSlotRule(t, env, friday, main, "fish")
	seedSlotRule(t, env, monday, main, "fish")
	seedVariety(t, env, "fish", 1, 1)

	var im impactBody
	r := c.Get(path("/api/tags/%d/impact", fish))
	r.MustJSON(t, &im)
	if r.Status != 200 || im.Recipes != 3 || im.BothRecipes != nil {
		t.Fatalf("impact = %d %s, want 3 Recipes and no bothRecipes without ?into", r.Status, r.Body)
	}
	wantRules := []impactSlotRule{
		{ID: im.SlotRules[0].ID, MealSlotID: monday, MealSlotName: "Lunch", Weekday: 1, CourseID: main, CourseName: "Main", Tag: "fish"},
		{ID: im.SlotRules[1].ID, MealSlotID: friday, MealSlotName: "Dinner", Weekday: 5, CourseID: main, CourseName: "Main", Tag: "fish"},
		{ID: im.SlotRules[2].ID, MealSlotID: friday, MealSlotName: "Dinner", Weekday: 5, CourseID: side, CourseName: "Side", Tag: "fish"},
	}
	if len(im.SlotRules) != 3 || im.SlotRules[0] != wantRules[0] || im.SlotRules[1] != wantRules[1] || im.SlotRules[2] != wantRules[2] || im.SlotRules[0].ID == 0 {
		t.Errorf("slotRules = %+v, want %+v (by weekday, time, then Course position)", im.SlotRules, wantRules)
	}
	if v := im.VarietyRule; v == nil || v.Tag != "fish" || v.MaxPerWeek != 1 || !v.NotConsecutiveDays {
		t.Errorf("varietyRule = %+v", v)
	}

	// bothRecipes with ?into: the Recipes that already have both Tags.
	var both impactBody
	r = c.Get(path("/api/tags/%d/impact?into=%d", fish, sea))
	r.MustJSON(t, &both)
	if r.Status != 200 || both.BothRecipes == nil || *both.BothRecipes != 2 || both.Recipes != 3 {
		t.Errorf("impact into Seafood = %d %s, want bothRecipes 2", r.Status, r.Body)
	}
	r = c.Get(path("/api/tags/%d/impact?into=%d", fish, empty))
	both = impactBody{}
	r.MustJSON(t, &both)
	if both.BothRecipes == nil || *both.BothRecipes != 0 {
		t.Errorf("impact into a Tag with no Recipe = %s, want bothRecipes 0 (present, not omitted)", r.Body)
	}

	// A Tag nothing uses: zero counts, an empty (not null) list and a null Variety Rule.
	r = c.Get(path("/api/tags/%d/impact", empty))
	if !strings.Contains(r.String(), `"slotRules":[]`) || !strings.Contains(r.String(), `"varietyRule":null`) || !strings.Contains(r.String(), `"recipes":0`) {
		t.Errorf("impact of an unused Tag = %s", r.Body)
	}
}

func TestImpactRefusals(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish := seedTag(t, env, "fish", "tomato")
	wantError(t, "unknown Tag", c.Get("/api/tags/9999/impact"), 404, "not_found", "", "")
	wantError(t, "not a number", c.Get("/api/tags/x/impact"), 404, "not_found", "", "")
	wantError(t, "into itself", c.Get(path("/api/tags/%d/impact?into=%d", fish, fish)), 422, "validation_failed", "into", "")
	wantError(t, "unknown into", c.Get(path("/api/tags/%d/impact?into=9999", fish)), 422, "validation_failed", "into", "")
	wantError(t, "into not a number", c.Get(path("/api/tags/%d/impact?into=sea", fish)), 422, "validation_failed", "into", "")
	wantError(t, "unknown Tag with into", c.Get("/api/tags/9999/impact?into=1"), 404, "not_found", "", "")
}

func TestMergeEveryOutcomeThroughTheAPI(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish := seedTag(t, env, "fish", "tomato")
	sea := seedTag(t, env, "Seafood", "apricot")
	main, side := courseID(t, env, "Main"), courseID(t, env, "Side")
	friday, monday := seedSlot(t, env, 5, "Dinner", "19:00"), seedSlot(t, env, 1, "Lunch", "12:00")
	both := seedRecipe(t, env, "Salmon", 0, fish, sea)
	onlyFish := seedRecipe(t, env, "Cod", 0, fish)
	onlySea := seedRecipe(t, env, "Prawns", 0, sea)
	seedSlotRule(t, env, friday, main, "fish")    // the target has one there: goes
	seedSlotRule(t, env, friday, main, "seafood") // stays
	seedSlotRule(t, env, monday, main, "fish")    // moves
	seedSlotRule(t, env, friday, side, "fish")    // moves
	seedVariety(t, env, "fish", 1, 0)             // the target has its own: goes
	seedVariety(t, env, "seafood", 2, 1)          // wins

	var got tagBody
	r := c.Post(path("/api/tags/%d/merge", fish), map[string]any{"into": sea})
	r.MustJSON(t, &got)
	want := tagBody{ID: sea, Name: "Seafood", Key: "seafood", Colour: "apricot", Recipes: 3, SlotRules: 3, VarietyRule: true}
	if r.Status != 200 || got != want {
		t.Fatalf("merge = %d %s, want the target %+v with its new counts", r.Status, r.Body, want)
	}
	wantRules := []string{path("%d/%d=seafood", monday, main), path("%d/%d=seafood", friday, main), path("%d/%d=seafood", friday, side), "variety=seafood"}
	if rules := ruleKeys(t, env); !sameStrings(sortedCopy(rules), sortedCopy(wantRules)) {
		t.Errorf("rules = %v, want %v", rules, wantRules)
	}
	var max int
	env.DB.QueryRow(`SELECT max_per_week FROM variety_rules WHERE tag = 'seafood'`).Scan(&max)
	if max != 2 {
		t.Errorf("the target's Variety Rule has max %d, want its own 2", max)
	}
	for _, id := range []int64{both, onlyFish, onlySea} {
		if n := count(t, env, `SELECT count(*) FROM recipe_tags WHERE recipe_id = ? AND tag_id = ?`, id, sea); n != 1 {
			t.Errorf("Recipe %d carries Seafood %d times, want once", id, n)
		}
	}
	if n := count(t, env, `SELECT count(*) FROM tags WHERE id = ?`, fish); n != 0 {
		t.Error("the source Tag is still there")
	}
	if got := tagNames(listTags(t, c)); !sameStrings(got, []string{"Seafood"}) {
		t.Errorf("list after the merge = %v", got)
	}
}

func sortedCopy(in []string) []string {
	out := append([]string(nil), in...)
	for i := range out {
		for j := i + 1; j < len(out); j++ {
			if out[j] < out[i] {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

func TestMergeMovesTheVarietyRuleWhenTheTargetHasNone(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish, sea := seedTag(t, env, "fish", "tomato"), seedTag(t, env, "Seafood", "apricot")
	seedVariety(t, env, "fish", 1, 0)
	if r := c.Post(path("/api/tags/%d/merge", fish), map[string]any{"into": sea}); r.Status != 200 {
		t.Fatalf("merge = %d %s", r.Status, r.Body)
	}
	if rules := ruleKeys(t, env); !sameStrings(rules, []string{"variety=seafood"}) {
		t.Errorf("rules = %v, want the Variety Rule moved", rules)
	}
}

func TestMergeRefusals(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish := seedTag(t, env, "fish", "tomato")
	seedVariety(t, env, "fish", 1, 0)
	url := path("/api/tags/%d/merge", fish)
	wantError(t, "unknown Tag", c.Post("/api/tags/9999/merge", map[string]any{"into": fish}), 404, "not_found", "", "")
	wantError(t, "into missing", c.Post(url, map[string]any{}), 422, "validation_failed", "into", "")
	wantError(t, "into zero", c.Post(url, map[string]any{"into": 0}), 422, "validation_failed", "into", "")
	wantError(t, "into itself", c.Post(url, map[string]any{"into": fish}), 422, "validation_failed", "into", "")
	wantError(t, "unknown into", c.Post(url, map[string]any{"into": 9999}), 422, "validation_failed", "into", "")
	if r := c.Post(url, nil); r.Status != 400 {
		t.Errorf("no body = %d, want 400", r.Status)
	}
	if n := count(t, env, `SELECT count(*) FROM tags`); n != 1 || !sameStrings(ruleKeys(t, env), []string{"variety=fish"}) {
		t.Errorf("after the refusals %d Tags, rules %v: nothing may change", n, ruleKeys(t, env))
	}
}

func TestDeleteTakesTheTagOffAndRemovesItsRulesAndIsNeverRefused(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish, pasta := seedTag(t, env, "fish", "tomato"), seedTag(t, env, "Pasta", "apricot")
	salmon := seedRecipe(t, env, "Salmon", 0, fish, pasta)
	seedRecipe(t, env, "Old trout", 1, fish)
	main := courseID(t, env, "Main")
	dinner := seedSlot(t, env, 5, "Dinner", "19:00")
	seedSlotRule(t, env, dinner, main, "fish")
	seedVariety(t, env, "fish", 1, 0)
	seedVariety(t, env, "pasta", 3, 0) // another Tag's rule stays

	r := c.Delete(path("/api/tags/%d", fish))
	if r.Status != 204 {
		t.Fatalf("delete = %d %s, want 204 although rules name the Tag", r.Status, r.Body)
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_tags WHERE tag_id = ?`, fish); n != 0 {
		t.Errorf("%d Recipe links left", n)
	}
	if n := count(t, env, `SELECT count(*) FROM recipe_tags WHERE recipe_id = ? AND tag_id = ?`, salmon, pasta); n != 1 {
		t.Error("the Recipe lost its other Tag")
	}
	if rules := ruleKeys(t, env); !sameStrings(rules, []string{"variety=pasta"}) {
		t.Errorf("rules = %v, want only pasta's Variety Rule", rules)
	}
	if got := tagNames(listTags(t, c)); !sameStrings(got, []string{"Pasta"}) {
		t.Errorf("list = %v", got)
	}
	if n := count(t, env, `SELECT count(*) FROM recipes`); n != 2 {
		t.Errorf("%d Recipes, want both kept", n)
	}
	wantError(t, "second delete", c.Delete(path("/api/tags/%d", fish)), 404, "not_found", "", "")
	wantError(t, "unknown", c.Delete("/api/tags/9999"), 404, "not_found", "", "")
}

func TestATagWithNoRecipeStaysUntilDeleted(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	var created tagBody
	c.Post("/api/tags", map[string]any{"name": "Roast"}).MustJSON(t, &created)
	if got := tagNames(listTags(t, c)); !sameStrings(got, []string{"Roast"}) {
		t.Errorf("list = %v, want the unused Tag", got)
	}
}
