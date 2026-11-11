package httpapi_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func start(t *testing.T) (*testkit.Env, *testkit.Client) {
	t.Helper()
	env := testkit.Start(t)
	return env, env.LoginUser(t)
}

func pngDataURL(t *testing.T, w, h int) string {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, w, h))); err != nil {
		t.Fatal(err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())
}

type obj = map[string]any

func mustStatus(t *testing.T, r *testkit.Response, want int) *testkit.Response {
	t.Helper()
	if r.Status != want {
		t.Fatalf("status = %d, want %d; body: %s", r.Status, want, r.Body)
	}
	return r
}

func idOf(t *testing.T, r *testkit.Response) int64 {
	t.Helper()
	var v struct {
		ID int64 `json:"id"`
	}
	r.MustJSON(t, &v)
	return v.ID
}

// seed creates the Ingredients "flour" (g, cup = 120, shelf life 365) and "milk" (ml),
// an uploaded photo, and two Recipes: "Pancakes" (with the photo, a Step image) and "Milk".
func seed(t *testing.T, c *testkit.Client) (pancakes, milk int64) {
	t.Helper()
	flour := idOf(t, mustStatus(t, c.Post("/api/ingredients", obj{"name": "Flour", "baseUnit": "g", "shelfLifeDays": 365, "conversions": []obj{{"unit": "cup", "toBase": 120}}}), 201))
	milkID := idOf(t, mustStatus(t, c.Post("/api/ingredients", obj{"name": "milk", "baseUnit": "ml"}), 201))
	img := idOf2(t, mustStatus(t, c.Post("/api/images", obj{"dataUrl": pngDataURL(t, 40, 30)}), 201))
	pancakes = idOf(t, mustStatus(t, c.Post("/api/recipes", obj{
		"name": "Pancakes", "yield": 4, "tags": []string{"breakfast"}, "image": img, "cooldownDays": 0,
		"source": obj{"attribution": "Nonna"},
		"lines": []obj{
			{"ingredientId": flour, "quantity": 2, "unit": "cup", "note": "sifted"},
			{"ingredientId": milkID, "quantity": 300, "unit": "ml", "optional": true},
		},
		"steps": []obj{
			{"text": "Rest the batter", "kind": "advance", "leadTimeMinutes": 30},
			{"text": "Fry", "kind": "active", "durationMinutes": 10, "image": img, "uses": []obj{{"ingredientId": flour, "quantity": 1, "unit": "cup"}}},
		},
	}), 201))
	milk = idOf(t, mustStatus(t, c.Post("/api/recipes", obj{
		"name": "Milk", "yield": 1, "lines": []obj{{"ingredientId": milkID, "quantity": 200, "unit": "ml"}},
	}), 201))
	return pancakes, milk
}

func idOf2(t *testing.T, r *testkit.Response) string {
	t.Helper()
	var v struct {
		ID string `json:"id"`
	}
	r.MustJSON(t, &v)
	return v.ID
}

func TestSchemaIsServedPublicallyFromTheEmbeddedSpecFile(t *testing.T) {
	env := testkit.Start(t)
	r := mustStatus(t, env.Anonymous().Get("/schema/recipe-file-v1.json"), 200)
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		t.Fatalf("Content-Type = %q", r.Header.Get("Content-Type"))
	}
	if !bytes.Equal(r.Body, spec.Schema) {
		t.Fatal("the served schema must be docs/spec/recipe-file-v1.schema.json byte for byte")
	}
}

func TestEveryOtherRouteNeedsASignedInUser(t *testing.T) {
	env := testkit.Start(t)
	anon := env.Anonymous()
	for _, tc := range []struct{ method, path string }{
		{"GET", "/api/recipe-file/agent-prompt"}, {"GET", "/api/recipe-file/export?all=1"},
		{"POST", "/api/imports"}, {"POST", "/api/imports/abc/plan"}, {"POST", "/api/imports/abc/confirm"}, {"DELETE", "/api/imports/abc"},
	} {
		if r := anon.Do(tc.method, tc.path, obj{}); r.Status != 401 {
			t.Errorf("%s %s = %d, want 401", tc.method, tc.path, r.Status)
		}
	}
}

func TestAgentPromptInlinesTheSchemaAndTheExample(t *testing.T) {
	_, c := start(t)
	var v struct {
		Prompt string `json:"prompt"`
	}
	mustStatus(t, c.Get("/api/recipe-file/agent-prompt"), 200).MustJSON(t, &v)
	tpl, _ := recipefile.ExtractTemplate(spec.RecipeFileMD)
	seeded := []recipefile.PromptCourse{{Name: "Main", Main: true}, {Name: "Side"}, {Name: "Starter"}, {Name: "Dessert"}}
	if v.Prompt != recipefile.AgentPrompt(tpl, string(spec.Schema), string(spec.Example), seeded) {
		t.Fatal("the endpoint returns exactly recipefile.AgentPrompt of the embedded files and the seeded Courses")
	}
	if !strings.Contains(v.Prompt, "- Main (default)\n- Side\n- Starter\n- Dessert\n") {
		t.Fatal("the prompt lists the seeded Courses")
	}
	if !strings.Contains(v.Prompt, `"feeder-recipe-file"`) || strings.Contains(v.Prompt, "{{") {
		t.Fatal("prompt looks wrong")
	}
}

func TestExportDownloadsAValidFileWithImagesAndIngredientDefinitions(t *testing.T) {
	_, c := start(t)
	pancakes, _ := seed(t, c)
	r := mustStatus(t, c.Get("/api/recipe-file/export?ids="+fmt.Sprint(pancakes)), 200)
	if cd := r.Header.Get("Content-Disposition"); cd != `attachment; filename="feeder-recipes-2026-11-09.feeder.json"` {
		t.Fatalf("Content-Disposition = %q", cd)
	}
	if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q", ct)
	}
	f, err := recipefile.Parse(r.Body)
	if err != nil {
		t.Fatalf("the export must validate against the schema: %v", err)
	}
	if len(f.Recipes) != 1 || f.Recipes[0].Name != "Pancakes" {
		t.Fatalf("recipes = %+v", f.Recipes)
	}
	if !strings.HasPrefix(f.Recipes[0].Image, "data:image/webp;base64,") || !strings.HasPrefix(f.Recipes[0].Steps[1].Image, "data:image/webp;base64,") {
		t.Fatal("images must be embedded as data URLs")
	}
	var names []string
	for _, i := range f.Ingredients {
		names = append(names, i.Name)
	}
	if strings.Join(names, ",") != "Flour,milk" {
		t.Fatalf("definitions = %v", names)
	}
	if f.Ingredients[0].BaseUnit != "g" || *f.Ingredients[0].ShelfLifeDays != 365 || f.Ingredients[0].Conversions[0].ToBase != 120 {
		t.Fatalf("flour = %+v", f.Ingredients[0])
	}
	if f.ExportedAt != "2026-11-09T12:00:00Z" {
		t.Fatalf("exportedAt = %q (the injected clock)", f.ExportedAt)
	}
}

func TestExportAllAndItsErrors(t *testing.T) {
	_, c := start(t)
	mustStatus(t, c.Get("/api/recipe-file/export?all=1"), 422)
	if code := c.Get("/api/recipe-file/export?all=1").ErrorCode(); code != "nothing_to_export" {
		t.Fatalf("code = %q", code)
	}
	seed(t, c)
	var f recipefile.File
	mustStatus(t, c.Get("/api/recipe-file/export?all=1"), 200).MustJSON(t, &f)
	if len(f.Recipes) != 2 {
		t.Fatalf("%d recipes, want 2", len(f.Recipes))
	}
	for _, q := range []string{"", "?ids=", "?ids=abc", "?ids=1,,2", "?ids=-1"} {
		if r := c.Get("/api/recipe-file/export" + q); r.Status != 400 || r.ErrorCode() != "bad_request" {
			t.Errorf("export%s = %d %s", q, r.Status, r.ErrorCode())
		}
	}
	if r := c.Get("/api/recipe-file/export?ids=999"); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown id = %d %s", r.Status, r.ErrorCode())
	}
}

type reviewResp struct {
	ID   string          `json:"id"`
	Plan recipefile.Plan `json:"plan"`
}

func openReview(t *testing.T, c *testkit.Client, text string) reviewResp {
	t.Helper()
	var v reviewResp
	mustStatus(t, c.Post("/api/imports", obj{"text": text}), 201).MustJSON(t, &v)
	if v.ID == "" {
		t.Fatal("no review id")
	}
	return v
}

func TestRoundTripExportThenImportIntoAnotherFeeder(t *testing.T) {
	_, a := start(t)
	pancakes, _ := seed(t, a)
	exported := mustStatus(t, a.Get("/api/recipe-file/export?all=1"), 200).Body

	_, b := start(t)
	rev := openReview(t, b, string(exported))
	if !rev.Plan.Ready || len(rev.Plan.Ingredients) != 2 || len(rev.Plan.Warnings) != 0 || len(rev.Plan.Problems) != 0 {
		t.Fatalf("plan = %+v", rev.Plan)
	}
	var done struct {
		Recipes []struct {
			Index        int
			ID           int64
			Name, Action string
		}
		IngredientsCreated int
		ConversionsAdded   int
	}
	mustStatus(t, b.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}), 200).MustJSON(t, &done)
	if len(done.Recipes) != 2 || done.IngredientsCreated != 2 {
		t.Fatalf("done = %+v", done)
	}

	// The imported Recipe equals the original, apart from ids and the re-encoded image.
	var orig, got map[string]any
	mustStatus(t, a.Get(fmt.Sprintf("/api/recipes/%d", pancakes)), 200).MustJSON(t, &orig)
	var importedID int64
	for _, r := range done.Recipes {
		if r.Name == "Pancakes" {
			importedID = r.ID
		}
	}
	mustStatus(t, b.Get(fmt.Sprintf("/api/recipes/%d", importedID)), 200).MustJSON(t, &got)
	for _, k := range []string{"name", "yield", "tags", "cooldownDays", "leftoverUseByDays", "source", "totalMinutes", "advanceMinutes", "readyMeal"} {
		if fmt.Sprint(orig[k]) != fmt.Sprint(got[k]) {
			t.Errorf("%s: %v became %v", k, orig[k], got[k])
		}
	}
	oLines, gLines := orig["lines"].([]any), got["lines"].([]any)
	for i := range oLines {
		o, g := oLines[i].(map[string]any), gLines[i].(map[string]any)
		for _, k := range []string{"ingredient", "quantity", "unit", "optional", "note"} {
			if fmt.Sprint(o[k]) != fmt.Sprint(g[k]) {
				t.Errorf("line %d %s: %v became %v", i, k, o[k], g[k])
			}
		}
	}
	if got["imageUrl"] == "" || got["imageUrl"] == nil {
		t.Fatal("the photo must arrive")
	}
	mustStatus(t, b.Get(got["imageUrl"].(string)), 200)
	if steps := got["steps"].([]any); steps[1].(map[string]any)["imageUrl"] == "" {
		t.Fatal("the Step photo must arrive")
	}
	// The Ingredient definitions arrived too (Unit Conversion included).
	var ings []struct {
		Name          string
		ShelfLifeDays *int
		Conversions   []struct {
			Unit   string
			ToBase float64
		}
	}
	mustStatus(t, b.Get("/api/ingredients"), 200).MustJSON(t, &ings)
	if len(ings) != 2 || ings[0].Name != "Flour" || *ings[0].ShelfLifeDays != 365 || ings[0].Conversions[0].Unit != "cup" {
		t.Fatalf("ingredients = %+v", ings)
	}
	// Exporting again gives the same recipes and definitions (images are re-encoded losslessly but compare by presence).
	var again recipefile.File
	mustStatus(t, b.Get("/api/recipe-file/export?all=1"), 200).MustJSON(t, &again)
	var first recipefile.File
	json.Unmarshal(exported, &first)
	if len(again.Recipes) != len(first.Recipes) || len(again.Ingredients) != len(first.Ingredients) {
		t.Fatal("second export differs in size")
	}
	// The Review is gone after Confirm.
	mustStatus(t, b.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}), 404)
}

func TestInvalidFilesAreRejectedWithJSONPaths(t *testing.T) {
	_, c := start(t)
	bad := `{"format":"feeder-recipe-file","version":1,"recipes":[{"name":"X","yield":0,"ingredients":[{"ingredient":"a","quantity":-1,"unit":"g"}]}]}`
	r := mustStatus(t, c.Post("/api/imports", obj{"text": bad}), 422)
	var v struct {
		Error struct {
			Code   string
			Errors []recipefile.PathError
		}
	}
	r.MustJSON(t, &v)
	if v.Error.Code != "invalid_recipe_file" || len(v.Error.Errors) < 2 {
		t.Fatalf("body: %s", r.Body)
	}
	have := map[string]bool{}
	for _, e := range v.Error.Errors {
		have[e.Path] = true
	}
	if !have["$.recipes[0].yield"] || !have["$.recipes[0].ingredients[0].quantity"] {
		t.Fatalf("errors = %+v", v.Error.Errors)
	}
}

func TestUnknownVersionsAndBrokenJSONAreRejected(t *testing.T) {
	_, c := start(t)
	r := c.Post("/api/imports", obj{"text": `{"format":"feeder-recipe-file","version":2,"recipes":[]}`})
	if r.Status != 422 || r.ErrorCode() != "unsupported_version" {
		t.Fatalf("version 2: %d %s", r.Status, r.Body)
	}
	if r := c.Post("/api/imports", obj{"text": "this is not json"}); r.Status != 422 || r.ErrorCode() != "invalid_json" {
		t.Fatalf("syntax: %d %s", r.Status, r.Body)
	}
	if r := c.Post("/api/imports", obj{}); r.Status != 400 || r.ErrorCode() != "bad_request" {
		t.Fatalf("missing text: %d %s", r.Status, r.Body)
	}
}

func TestReviewMustBeFinishedBeforeConfirm(t *testing.T) {
	_, c := start(t)
	seed(t, c) // "Pancakes" and "Milk" exist
	exported := mustStatus(t, c.Get("/api/recipe-file/export?all=1"), 200).Body
	rev := openReview(t, c, string(exported))
	if rev.Plan.Ready || rev.Plan.Recipes[0].Status != recipefile.RecipeConflict || rev.Plan.Recipes[1].Status != recipefile.RecipeConflict {
		t.Fatalf("plan = %+v", rev.Plan)
	}
	r := c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}})
	if r.Status != 422 || r.ErrorCode() != "import_not_ready" {
		t.Fatalf("confirm = %d %s", r.Status, r.Body)
	}
	if n := countRecipes(t, c); n != 2 {
		t.Fatalf("%d recipes after a refused confirm", n)
	}
	// Answer through /plan, then confirm: replace one, keep both of the other.
	d := obj{"recipes": []obj{{"index": 0, "action": "replace"}, {"index": 1, "action": "keep_both"}}}
	var p reviewResp
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/plan", obj{"decisions": d}), 200).MustJSON(t, &p)
	if !p.Plan.Ready || p.Plan.Recipes[1].ImportedAs != "Milk (2)" {
		t.Fatalf("plan = %+v", p.Plan)
	}
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d}), 200)
	if n := countRecipes(t, c); n != 3 {
		t.Fatalf("%d recipes, want 3 (one replaced, one kept twice)", n)
	}
}

func countRecipes(t *testing.T, c *testkit.Client) int {
	t.Helper()
	var list []any
	mustStatus(t, c.Get("/api/recipes?archived=all"), 200).MustJSON(t, &list)
	return len(list)
}

func TestConfirmIsAtomicWhenTheDataChangedAfterTheReview(t *testing.T) {
	_, c := start(t)
	pancakes, _ := seed(t, c)
	exported := mustStatus(t, c.Get("/api/recipe-file/export?ids="+fmt.Sprint(pancakes)), 200).Body
	// A second Feeder-like file: same Recipe plus a brand new Ingredient and Recipe.
	var f map[string]any
	json.Unmarshal(exported, &f)
	f["ingredients"] = append(f["ingredients"].([]any), obj{"name": "saffron", "baseUnit": "g"})
	f["recipes"] = append(f["recipes"].([]any), obj{"name": "Golden rice", "yield": 2, "ingredients": []obj{{"ingredient": "saffron", "quantity": 1, "unit": "g"}}})
	text, _ := json.Marshal(f)
	rev := openReview(t, c, string(text))
	d := obj{"recipes": []obj{{"index": 0, "action": "replace"}}}
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/plan", obj{"decisions": d}), 200)

	mustStatus(t, c.Delete(fmt.Sprintf("/api/recipes/%d", pancakes)), 204) // the Recipe to replace disappears
	r := c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d})
	if r.Status != 409 || r.ErrorCode() != "import_stale" {
		t.Fatalf("confirm = %d %s", r.Status, r.Body)
	}
	var ings []obj
	mustStatus(t, c.Get("/api/ingredients"), 200).MustJSON(t, &ings)
	if len(ings) != 2 {
		t.Fatalf("%d Ingredients: 'saffron' must not exist after a failed Confirm", len(ings))
	}
	if n := countRecipes(t, c); n != 1 { // only "Milk"
		t.Fatalf("%d recipes", n)
	}
}

func TestReviewsBelongToTheirUser(t *testing.T) {
	env, user := start(t)
	admin := env.LoginAdmin(t)
	rev := openReview(t, user, string(spec.Example))
	for _, r := range []*testkit.Response{
		admin.Post("/api/imports/"+rev.ID+"/plan", obj{"decisions": obj{}}),
		admin.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}),
		admin.Delete("/api/imports/" + rev.ID),
	} {
		if r.Status != 404 {
			t.Fatalf("another User got %d %s", r.Status, r.Body)
		}
	}
	mustStatus(t, user.Delete("/api/imports/"+rev.ID), 204)
	mustStatus(t, user.Post("/api/imports/"+rev.ID+"/plan", obj{"decisions": obj{}}), 404)
}

func TestImportedDataURLImagesAreStoredAsWebPAndBadOnesAreWarnings(t *testing.T) {
	_, c := start(t)
	f := obj{
		"format": "feeder-recipe-file", "version": 1,
		"recipes": []obj{{
			"name": "Photo", "yield": 1, "image": pngDataURL(t, 3200, 1600),
			"ingredients": []obj{{"ingredient": "water", "quantity": 100, "unit": "ml"}},
			"steps":       []obj{{"text": "Pour", "kind": "active", "image": "data:image/png;base64,AAAA"}},
		}},
		"ingredients": []obj{{"name": "water", "baseUnit": "ml"}},
	}
	text, _ := json.Marshal(f)
	rev := openReview(t, c, string(text))
	if !rev.Plan.Ready || len(rev.Plan.Warnings) != 1 || rev.Plan.Warnings[0].Path != "$.recipes[0].steps[0].image" || rev.Plan.Warnings[0].Code != "image_failed" {
		t.Fatalf("plan = %+v", rev.Plan)
	}
	var done struct{ Recipes []struct{ ID int64 } }
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}), 200).MustJSON(t, &done)
	var rec struct {
		ImageURL string
		Steps    []struct{ ImageURL string }
	}
	mustStatus(t, c.Get(fmt.Sprintf("/api/recipes/%d", done.Recipes[0].ID)), 200).MustJSON(t, &rec)
	if rec.ImageURL == "" || rec.Steps[0].ImageURL != "" {
		t.Fatalf("recipe = %+v", rec)
	}
	img := mustStatus(t, c.Get(rec.ImageURL), 200)
	if img.Header.Get("Content-Type") != "image/webp" {
		t.Fatalf("Content-Type = %q", img.Header.Get("Content-Type"))
	}
}

func TestImageURLsOnPrivateAddressesAreNeverContacted(t *testing.T) {
	var hits atomic.Int64
	internal := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "image/png")
	}))
	defer internal.Close()
	_, c := start(t)
	urls := []string{internal.URL + "/secret.png", "https://169.254.169.254/latest/meta-data/", "https://[::1]:1/x.png", "https://localhost:1/x.png", "https://10.1.2.3/x.png"}
	var steps []obj
	for _, u := range urls {
		steps = append(steps, obj{"text": "s", "kind": "active", "image": u})
	}
	f := obj{
		"format": "feeder-recipe-file", "version": 1,
		"ingredients": []obj{{"name": "water", "baseUnit": "ml"}},
		"recipes": []obj{{
			"name": "SSRF", "yield": 1, "image": internal.URL + "/cover.png",
			"ingredients": []obj{{"ingredient": "water", "quantity": 1, "unit": "ml"}}, "steps": steps,
		}},
	}
	text, _ := json.Marshal(f)
	rev := openReview(t, c, string(text))
	if len(rev.Plan.Warnings) != len(urls)+1 || !rev.Plan.Ready {
		t.Fatalf("every refused image is a warning and the import can go on: %+v", rev.Plan)
	}
	for _, w := range rev.Plan.Warnings {
		for _, leak := range []string{"169.254", "10.1.2.3", "127.0.0.1", "::1", "dial tcp"} {
			if strings.Contains(w.Message, leak) {
				t.Errorf("warning %q at %s reveals %q", w.Message, w.Path, leak)
			}
		}
	}
	if hits.Load() != 0 {
		t.Fatalf("the server on a loopback address received %d requests", hits.Load())
	}
}

func TestOversizedUploadsAreRefused(t *testing.T) {
	_, c := start(t)
	huge := strings.Repeat(" ", recipefile.MaxFileBytes+(1<<20))
	r := c.Do("POST", "/api/imports", []byte(`{"text":"`+huge+`"}`))
	if r.Status != 413 || r.ErrorCode() != "file_too_large" {
		t.Fatalf("got %d %s", r.Status, r.ErrorCode())
	}
}

// A Review closes when its Confirm succeeds: a second Confirm (a double click,
// a retry after a lost response) must not import everything again. Recipe
// names have no UNIQUE constraint, so only the single-use Review prevents it.
func TestConfirmingTwiceImportsOnce(t *testing.T) {
	_, c := start(t)
	rev := openReview(t, c, string(spec.Example))
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}), 200)
	r := c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}})
	if r.Status != 404 && r.Status != 409 {
		t.Fatalf("second confirm = %d %s, want 404 or 409", r.Status, r.Body)
	}
	if n := countRecipes(t, c); n != 2 {
		t.Fatalf("%d recipes, want 2", n)
	}
}

func TestParallelConfirmsOfOneReviewImportEachRecipeOnce(t *testing.T) {
	_, c := start(t)
	rev := openReview(t, c, string(spec.Example))
	const n = 12
	statuses := make([]int, n)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			statuses[i] = c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}).Status
		}(i)
	}
	close(start)
	wg.Wait()
	ok := 0
	for _, st := range statuses {
		switch st {
		case 200:
			ok++
		case 404, 409:
		default:
			t.Errorf("a losing confirm must answer 404 or 409, got %d (all: %v)", st, statuses)
		}
	}
	if ok != 1 {
		t.Fatalf("%d confirms succeeded, want exactly 1 (all: %v)", ok, statuses)
	}
	if got := countRecipes(t, c); got != 2 {
		t.Fatalf("%d recipes, want 2: each Recipe is imported once", got)
	}
	var ings []obj
	mustStatus(t, c.Get("/api/ingredients"), 200).MustJSON(t, &ings)
	if len(ings) != 9 {
		t.Fatalf("%d Ingredients, want 9", len(ings))
	}
}

// A confirm that fails puts the Review back: the User fixes the cause and
// confirms again without uploading the file once more.
func TestAFailedConfirmLeavesTheReviewOpenForARetry(t *testing.T) {
	_, c := start(t)
	pancakes, _ := seed(t, c)
	exported := mustStatus(t, c.Get("/api/recipe-file/export?ids="+fmt.Sprint(pancakes)), 200).Body
	var f map[string]any
	json.Unmarshal(exported, &f)
	f["ingredients"] = append(f["ingredients"].([]any), obj{"name": "saffron", "baseUnit": "g"})
	f["recipes"] = append(f["recipes"].([]any), obj{"name": "Golden rice", "yield": 2, "ingredients": []obj{{"ingredient": "saffron", "quantity": 1, "unit": "g"}}})
	text, _ := json.Marshal(f)
	rev := openReview(t, c, string(text))
	d := obj{"recipes": []obj{{"index": 0, "action": "replace"}}}

	// Not ready (no answer for the conflict) is refused and keeps the Review.
	if r := c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}); r.Status != 422 {
		t.Fatalf("confirm = %d %s", r.Status, r.Body)
	}
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/plan", obj{"decisions": d}), 200)

	// Stale (the Recipe to replace disappeared) is refused and keeps the Review.
	mustStatus(t, c.Delete(fmt.Sprintf("/api/recipes/%d", pancakes)), 204)
	r := c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d})
	if r.Status != 409 || r.ErrorCode() != "import_stale" {
		t.Fatalf("confirm = %d %s", r.Status, r.Body)
	}
	var p reviewResp
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/plan", obj{"decisions": d}), 200).MustJSON(t, &p)
	if !p.Plan.Ready {
		t.Fatalf("the Review is recomputed from the current data and is ready again: %+v", p.Plan)
	}
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}), 200)
	if n := countRecipes(t, c); n != 3 { // Milk, Pancakes (created again), Golden rice
		t.Fatalf("%d recipes, want 3", n)
	}
	// And now it is closed for good.
	if r := c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": obj{}}); r.Status != 404 && r.Status != 409 {
		t.Fatalf("confirm after success = %d", r.Status)
	}
}
