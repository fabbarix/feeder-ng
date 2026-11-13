package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// BR-G (docs/dev/design/base-recipes.md sections 4.4 and 9): Cook Mode walks the composed Steps of a Recipe that calls for a
// Base recipe. Béchamel (Yield 1000 g: 800 g milk, 100 g butter, 100 g flour) has two Steps, "Melt the butter" (5 min Active)
// and "Simmer the sauce" (20 min Passive, after the first). Lasagne (Yield 4: 200 g pasta, 500 g Béchamel) has "Layer the
// lasagne" (10 min Active) and "Bake" (30 min Passive, after the first). Its Needed at Step is the first Step, so Béchamel's
// block goes before "Layer the lasagne" and the composed list is
//
//	0 Melt the butter (Béchamel) · 1 Simmer the sauce (Béchamel, after 0) · 2 Layer the lasagne (after 1) · 3 Bake (after 2)
//
// 65 minutes in all. Indexes are the composed ones, and Stock never moves them. One Batch calls for 500 g of Béchamel.
//
// The wire shape pinned here: every timeline item, every view Step and every Advance item carries `baseRecipe`, null for
// the Recipe's own Steps and {id, name, path} for a Base recipe's (name is the innermost Base recipe, path the names from the
// outermost: ["Béchamel"], or ["Béchamel", "Roux"] when nested); the timeline and the view carry `covered`, the Base recipes
// whose whole block Stock covers (their Steps are left out), and it is [] rather than null.

type baseLabel struct {
	ID   int64    `json:"id"`
	Name string   `json:"name"`
	Path []string `json:"path"`
}

type brgItem struct {
	CourseID     int64      `json:"courseId"`
	Kind         string     `json:"kind"`
	Step         *int       `json:"step"`
	Number       int        `json:"number"`
	Text         string     `json:"text"`
	StartSeconds int        `json:"startSeconds"`
	EndSeconds   int        `json:"endSeconds"`
	Timer        *timerBody `json:"timer"`
	BaseRecipe   *baseLabel `json:"baseRecipe"`
}

type brgTimeline struct {
	TotalMinutes int         `json:"totalMinutes"`
	StartAt      string      `json:"startAt"`
	Items        []brgItem   `json:"items"`
	Covered      []baseLabel `json:"covered"`
	Advance      []struct {
		Step       int        `json:"step"`
		Text       string     `json:"text"`
		BaseRecipe *baseLabel `json:"baseRecipe"`
	} `json:"advance"`
}

type brgView struct {
	Steps []struct {
		Index      int        `json:"index"`
		Number     int        `json:"number"`
		Of         int        `json:"of"`
		Kind       string     `json:"kind"`
		Text       string     `json:"text"`
		Timer      *timerBody `json:"timer"`
		BaseRecipe *baseLabel `json:"baseRecipe"`
	} `json:"steps"`
	Advance []struct {
		Step       int        `json:"step"`
		Text       string     `json:"text"`
		BaseRecipe *baseLabel `json:"baseRecipe"`
	} `json:"advance"`
	Covered []baseLabel `json:"covered"`
}

type brgWorld struct {
	*crsc2.World
	béchamel, béchamelIng, lasagne int64 // béchamelIng is the Base recipe's Ingredient
	pasta, milk                    int64
}

func step(text, kind string, minutes int, after ...int) map[string]any {
	if after == nil {
		after = []int{}
	}
	return map[string]any{"text": text, "kind": kind, "durationMinutes": minutes, "leadTimeMinutes": 0, "after": after, "uses": []any{}}
}

func (b *brgWorld) create(body map[string]any) (id, baseIng int64) {
	b.T.Helper()
	body["tags"] = []string{}
	r := b.Admin.Post("/api/recipes", body)
	var out struct {
		ID               int64 `json:"id"`
		BaseIngredientID int64 `json:"baseIngredientId"`
	}
	if r.Status != 201 || r.JSON(&out) != nil {
		b.T.Fatalf("create %v = %d %s", body["name"], r.Status, r.Body)
	}
	return out.ID, out.BaseIngredientID
}

func line(ing int64, grams float64) map[string]any {
	return map[string]any{"ingredientId": ing, "quantity": grams, "unit": "g"}
}

// newBrg is the C2 household with Béchamel and Lasagne (Main) made, and Lasagne planned on Monday's Main Course for
// batches Batches. Side is left empty so the slot is a single Course.
func newBrg(t *testing.T, batches float64) *brgWorld {
	t.Helper()
	b := &brgWorld{World: crsc2.New(t)}
	b.pasta, b.milk = b.Ingredient("pasta"), b.Ingredient("milk")
	butter, flour := b.Ingredient("butter"), b.Ingredient("flour")
	b.béchamel, b.béchamelIng = b.create(map[string]any{"name": "Béchamel", "yield": 1000, "yieldUnit": "g", "baseRecipe": true,
		"lines": []map[string]any{line(b.milk, 800), line(butter, 100), line(flour, 100)},
		"steps": []map[string]any{step("Melt the butter", "active", 5), step("Simmer the sauce", "passive", 20, 0)}})
	b.lasagne, _ = b.create(map[string]any{"name": "Lasagne", "yield": 4, "courseIds": []int64{b.Main},
		"lines": []map[string]any{line(b.pasta, 200), {"baseRecipeId": b.béchamel, "quantity": 500, "unit": "g"}},
		"steps": []map[string]any{step("Layer the lasagne", "active", 10), step("Bake", "passive", 30, 0)}})
	b.Settle()
	b.Meal(crsc2.Today, b.Slot, b.Main, b.lasagne, "planned", false)
	if batches != 1 {
		b.Exec(`UPDATE planned_meals SET batches = ? WHERE course_id = ?`, batches, b.Main)
	}
	return b
}

func (b *brgWorld) timeline() brgTimeline {
	b.T.Helper()
	r := b.User.Get(slotPath(b.World, "/all"))
	if r.Status != 200 {
		b.T.Fatalf("GET timeline = %d %s", r.Status, r.Body)
	}
	for _, key := range []string{`"covered":null`, `"items":null`, `"advance":null`} {
		if contains(string(r.Body), key) {
			b.T.Errorf("%s in the timeline; want []", key)
		}
	}
	var tl brgTimeline
	r.MustJSON(b.T, &tl)
	return tl
}

func contains(s, sub string) bool { return len(sub) > 0 && len(s) >= len(sub) && indexOf(s, sub) >= 0 }

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func (b *brgWorld) view() brgView {
	b.T.Helper()
	r := b.User.Get(slotPath(b.World, "/"+id(b.Main)))
	if r.Status != 200 {
		b.T.Fatalf("GET Cook view = %d %s", r.Status, r.Body)
	}
	var v brgView
	r.MustJSON(b.T, &v)
	return v
}

func wantLabel(t *testing.T, what string, got *baseLabel, id int64, path ...string) {
	t.Helper()
	if got == nil {
		t.Errorf("%s: baseRecipe is null, want %v", what, path)
		return
	}
	if got.ID != id || got.Name != path[len(path)-1] || fmt.Sprint(got.Path) != fmt.Sprint(path) {
		t.Errorf("%s: baseRecipe = %+v, want id %d, name %q, path %v", what, *got, id, path[len(path)-1], path)
	}
}

func TestTimelineLabelsEachStepOfABaseRecipeAndEndsThemBeforeTheStepThatUsesThem(t *testing.T) {
	b := newBrg(t, 1)
	tl := b.timeline()
	if len(tl.Items) != 4 || tl.TotalMinutes != 65 || tl.StartAt != "2026-11-09T17:55:00Z" {
		t.Fatalf("totalMinutes %d startAt %q, %d items %+v; want 65 minutes from 17:55Z and 4 items", tl.TotalMinutes, tl.StartAt, len(tl.Items), tl.Items)
	}
	melt, simmer, layer, bake := tl.Items[0], tl.Items[1], tl.Items[2], tl.Items[3]
	if melt.Text != "Melt the butter" || simmer.Text != "Simmer the sauce" || layer.Text != "Layer the lasagne" || bake.Text != "Bake" {
		t.Fatalf("items in order = %q, %q, %q, %q; want Béchamel's Steps, then Lasagne's", melt.Text, simmer.Text, layer.Text, bake.Text)
	}
	for i, it := range tl.Items {
		if it.Step == nil || *it.Step != i || it.Number != i+1 {
			t.Errorf("item %d = step %v number %d; want the composed index %d", i, it.Step, it.Number, i)
		}
	}
	wantLabel(t, "Melt the butter", melt.BaseRecipe, b.béchamel, "Béchamel")
	wantLabel(t, "Simmer the sauce", simmer.BaseRecipe, b.béchamel, "Béchamel")
	if layer.BaseRecipe != nil || bake.BaseRecipe != nil {
		t.Errorf("Lasagne's own Steps are labelled: %+v %+v", layer.BaseRecipe, bake.BaseRecipe)
	}
	if simmer.EndSeconds > layer.StartSeconds {
		t.Errorf("Béchamel ends at %d s, after Layer the lasagne starts at %d s", simmer.EndSeconds, layer.StartSeconds)
	}
	if len(tl.Covered) != 0 {
		t.Errorf("covered = %+v, want [] with nothing in Stock", tl.Covered)
	}
}

func TestTimerOnABaseRecipesPassiveStepIsLabelledWithItsName(t *testing.T) {
	b := newBrg(t, 1)
	tl := b.timeline()
	if len(tl.Items) != 4 {
		t.Fatalf("%d items, want the composed four: %+v", len(tl.Items), tl.Items)
	}
	simmer := tl.Items[1]
	if simmer.Timer == nil || simmer.Timer.DurationSeconds != 1200 || simmer.Timer.Label != "Béchamel: Simmer the sauce" {
		t.Errorf("timeline timer = %+v, want Béchamel's 20 minutes labelled with its name", simmer.Timer)
	}
	if bake := tl.Items[3]; bake.Timer == nil || bake.Timer.Label != "Step 4: Bake" {
		t.Errorf("Lasagne's own timer = %+v, want the usual label with the composed number", bake.Timer)
	}
	r := b.User.Post("/api/cook/timers", map[string]any{"scope": mainScope(b.World), "step": 1})
	if r.Status != 201 {
		t.Fatalf("start the timer of Béchamel's Simmer = %d %s", r.Status, r.Body)
	}
	var tm timerBody
	r.MustJSON(t, &tm)
	if tm.DurationSeconds != 1200 || tm.Label != "Béchamel: Simmer the sauce" {
		t.Errorf("timer = %+v, want 1200 s labelled Béchamel: Simmer the sauce", tm)
	}
	wantErr(t, "an Active Step of Béchamel", b.User.Post("/api/cook/timers", map[string]any{"scope": mainScope(b.World), "step": 0}), 422, "not_passive_step")
}

func TestCourseViewLabelsBaseRecipeStepsAndKeepsTheComposedNumbering(t *testing.T) {
	b := newBrg(t, 1)
	v := b.view()
	if len(v.Steps) != 4 {
		t.Fatalf("steps = %+v, want Béchamel's two and Lasagne's two", v.Steps)
	}
	for i, s := range v.Steps {
		if s.Index != i || s.Number != i+1 || s.Of != 4 {
			t.Errorf("step %d = index %d number %d of %d", i, s.Index, s.Number, s.Of)
		}
	}
	wantLabel(t, "view Melt the butter", v.Steps[0].BaseRecipe, b.béchamel, "Béchamel")
	wantLabel(t, "view Simmer the sauce", v.Steps[1].BaseRecipe, b.béchamel, "Béchamel")
	if v.Steps[2].BaseRecipe != nil || v.Steps[3].BaseRecipe != nil {
		t.Errorf("Lasagne's own Steps are labelled: %+v", v.Steps)
	}
	if tm := v.Steps[1].Timer; tm == nil || tm.Label != "Béchamel: Simmer the sauce" {
		t.Errorf("Simmer timer = %+v", tm)
	}
	if v.Covered == nil || len(v.Covered) != 0 {
		t.Errorf("covered = %+v, want []", v.Covered)
	}
}

func TestAJarThatCoversTheBaseRecipeHidesItsStepsAndShortensTheTimeline(t *testing.T) {
	b := newBrg(t, 1)
	b.Stock(b.béchamelIng, 500) // exactly the 500 g one Batch calls for
	tl := b.timeline()
	if len(tl.Items) != 2 || tl.TotalMinutes != 40 || tl.Items[0].Step == nil || tl.Items[1].Step == nil {
		t.Fatalf("%d items over %d minutes: %+v; want Layer and Bake only, 40 minutes", len(tl.Items), tl.TotalMinutes, tl.Items)
	}
	layer, bake := tl.Items[0], tl.Items[1]
	if layer.Text != "Layer the lasagne" || bake.Text != "Bake" || layer.Number != 1 || bake.Number != 2 {
		t.Errorf("items = %+v %+v", layer, bake)
	}
	// Stock never moves an index: Layer is still Step 2 and Bake Step 3 of the composed list.
	if *layer.Step != 2 || *bake.Step != 3 {
		t.Errorf("steps %d and %d, want the composed indexes 2 and 3", *layer.Step, *bake.Step)
	}
	if layer.BaseRecipe != nil || bake.BaseRecipe != nil {
		t.Errorf("labels on Lasagne's own Steps: %+v %+v", layer.BaseRecipe, bake.BaseRecipe)
	}
	if len(tl.Covered) != 1 {
		t.Fatalf("covered = %+v, want Béchamel", tl.Covered)
	}
	wantLabel(t, "covered", &tl.Covered[0], b.béchamel, "Béchamel")

	v := b.view()
	if len(v.Steps) != 2 || v.Steps[0].Text != "Layer the lasagne" || v.Steps[0].Index != 2 || v.Steps[0].Number != 1 || v.Steps[0].Of != 2 {
		t.Errorf("view steps = %+v, want Layer (index 2, 1 of 2) and Bake", v.Steps)
	}
	if len(v.Covered) != 1 || v.Covered[0].Name != "Béchamel" {
		t.Errorf("view covered = %+v", v.Covered)
	}
	// A covered Step is a zero-length Active Step: it has no timer to start.
	wantErr(t, "a covered Step", b.User.Post("/api/cook/timers", map[string]any{"scope": mainScope(b.World), "step": 1}), 422, "not_passive_step")
}

func TestAJarThatCoversPartOfItLeavesTheBlockWhole(t *testing.T) {
	b := newBrg(t, 1)
	b.Stock(b.béchamelIng, 300)
	tl := b.timeline()
	if len(tl.Items) != 4 || tl.TotalMinutes != 65 || len(tl.Covered) != 0 {
		t.Errorf("%d items over %d minutes, covered %+v; want the whole block and 65 minutes", len(tl.Items), tl.TotalMinutes, tl.Covered)
	}
}

func TestTheBatchesDecideWhatTheJarCovers(t *testing.T) {
	b := newBrg(t, 2) // 2 Batches call for 1000 g
	b.Stock(b.béchamelIng, 500)
	if tl := b.timeline(); len(tl.Items) != 4 || len(tl.Covered) != 0 {
		t.Errorf("500 g does not cover 1000 g: %d items, covered %+v", len(tl.Items), tl.Covered)
	}
	b.Stock(b.béchamelIng, 500)
	if tl := b.timeline(); len(tl.Items) != 2 || len(tl.Covered) != 1 {
		t.Errorf("1000 g covers 1000 g: %d items, covered %+v", len(tl.Items), tl.Covered)
	}
}

func TestARecipeOpenedOnItsOwnAssumesEverythingIsMade(t *testing.T) {
	b := newBrg(t, 1)
	b.Stock(b.béchamelIng, 5000)
	r := b.User.Get(fmt.Sprintf("/api/cook/recipes/%d?batches=1", b.lasagne))
	if r.Status != 200 {
		t.Fatalf("GET Cook view of the Recipe = %d %s", r.Status, r.Body)
	}
	var v brgView
	r.MustJSON(t, &v)
	if len(v.Steps) != 4 || len(v.Covered) != 0 {
		t.Errorf("steps %d covered %+v; want all four Steps, nothing covered, whatever Stock holds", len(v.Steps), v.Covered)
	}
	wantLabel(t, "Recipe view Melt the butter", v.Steps[0].BaseRecipe, b.béchamel, "Béchamel")
}

func TestAnAdvanceStepOfABaseRecipeIsLabelledAndNeverCoveredByAnEmptyJar(t *testing.T) {
	b := newBrg(t, 1)
	// Béchamel gets a 6-hour Advance Step ("Chill the milk"): it goes on the Recipe's Advance list, labelled.
	r := b.Admin.Put(fmt.Sprintf("/api/recipes/%d", b.béchamel), map[string]any{"name": "Béchamel", "yield": 1000, "yieldUnit": "g", "baseRecipe": true, "tags": []string{},
		"lines": []map[string]any{line(b.milk, 800), line(b.Ingredient("butter2"), 100)},
		"steps": []map[string]any{
			{"text": "Chill the milk", "kind": "advance", "durationMinutes": 0, "leadTimeMinutes": 360, "after": []int{}, "uses": []any{}},
			step("Melt the butter", "active", 5), step("Simmer the sauce", "passive", 20, 1)}})
	if r.Status != 200 {
		t.Fatalf("edit Béchamel = %d %s", r.Status, r.Body)
	}
	tl := b.timeline()
	if len(tl.Advance) != 1 || tl.Advance[0].Text != "Chill the milk" {
		t.Fatalf("advance = %+v, want Béchamel's Advance Step", tl.Advance)
	}
	wantLabel(t, "advance", tl.Advance[0].BaseRecipe, b.béchamel, "Béchamel")
	v := b.view()
	if len(v.Advance) != 1 {
		t.Fatalf("view advance = %+v", v.Advance)
	}
	wantLabel(t, "view advance", v.Advance[0].BaseRecipe, b.béchamel, "Béchamel")
}
