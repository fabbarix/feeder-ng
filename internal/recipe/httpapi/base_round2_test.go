package httpapi_test

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// BR-B round 2 (review of 9f4eb444): API additions the web needs, and events. Red until implemented.

type stream struct {
	mu    sync.Mutex
	lines []string
}

func openEvents(t *testing.T, env *testkit.Env, c *testkit.Client) *stream {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", env.URL()+"/api/events", nil)
	ck := c.Cookie(auth.CookieName)
	if ck == nil {
		t.Fatal("no session cookie")
	}
	req.AddCookie(ck)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("open stream: %v %v", resp, err)
	}
	t.Cleanup(func() { cancel(); resp.Body.Close() })
	s := &stream{}
	ready := make(chan struct{})
	go func() {
		sc := bufio.NewScanner(resp.Body)
		first := true
		for sc.Scan() {
			if first {
				first = false
				close(ready)
				continue
			}
			s.mu.Lock()
			s.lines = append(s.lines, sc.Text())
			s.mu.Unlock()
		}
	}()
	<-ready
	return s
}

// seen reports whether an event of the topic arrived whose data contains all the parts, waiting up to a second.
func (s *stream) seen(topic string, parts ...string) bool {
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		for i, l := range s.lines {
			if l == "event: "+topic && i+1 < len(s.lines) {
				ok := true
				for _, p := range parts {
					ok = ok && strings.Contains(s.lines[i+1], p)
				}
				if ok {
					s.mu.Unlock()
					return true
				}
			}
		}
		s.mu.Unlock()
		time.Sleep(20 * time.Millisecond)
	}
	return false
}

func TestTheListSummaryCarriesBaseIngredientIdAndLinesCarryNeededAtDefault(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	steps := []map[string]any{{"text": "Prep", "kind": "active", "durationMinutes": 5}, {"text": "Layer the lasagne with béchamel", "kind": "active", "durationMinutes": 10}}
	line := baseLineOf(bech.ID, 500, "ml")
	line["neededAtStep"] = 0
	lasagne := mustCreate(t, user, map[string]any{"name": "Lasagne", "yield": 4, "lines": []any{line}, "steps": steps})

	var list []struct {
		Name             string `json:"name"`
		BaseIngredientID int64  `json:"baseIngredientId"`
	}
	user.Get("/api/recipes?kind=all").MustJSON(t, &list)
	for _, s := range list {
		want := int64(0)
		if s.Name == "Béchamel" {
			want = bech.BaseIngredientID
		}
		if s.BaseIngredientID != want {
			t.Errorf("%s baseIngredientId = %d, want %d", s.Name, s.BaseIngredientID, want)
		}
	}
	var got struct {
		Lines []struct {
			NeededAt        int  `json:"neededAt"`
			NeededAtDefault *int `json:"neededAtDefault"`
		} `json:"lines"`
	}
	user.Get(fmt.Sprintf("/api/recipes/%d", lasagne.ID)).MustJSON(t, &got)
	if l := got.Lines[0]; l.NeededAt != 0 || l.NeededAtDefault == nil || *l.NeededAtDefault != 1 {
		t.Errorf("line = %+v, want neededAt 0 (override) and neededAtDefault 1", l)
	}
}

func TestListForARecipeMarksWouldCycle(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	milk := ingredient(t, env, "milk", "ml")
	roux := mustCreate(t, user, baseBody("Roux", 1, "kg", map[string]any{"lines": []any{lineOf(milk, 1, "l")}}))
	mustCreate(t, user, baseBody("Béchamel", 1, "l", map[string]any{"lines": []any{baseLineOf(roux.ID, 100, "g")}}))
	mustCreate(t, user, baseBody("Stock", 1, "l", map[string]any{"lines": []any{lineOf(milk, 1, "l")}}))
	var list []struct {
		Name       string `json:"name"`
		WouldCycle bool   `json:"wouldCycle"`
	}
	r := user.Get(fmt.Sprintf("/api/recipes?kind=base&for=%d", roux.ID))
	r.MustJSON(t, &list)
	got := map[string]bool{}
	for _, s := range list {
		got[s.Name] = s.WouldCycle
	}
	if r.Status != 200 || len(got) != 3 || !got["Roux"] || !got["Béchamel"] || got["Stock"] {
		t.Errorf("for=Roux = %d %s, want wouldCycle on Roux and Béchamel, not Stock", r.Status, r.Body)
	}
	wantRich(t, "bad for", user.Get("/api/recipes?kind=base&for=abc"), 422, "validation_failed", "for", "for_invalid")
	var plain []struct {
		WouldCycle bool `json:"wouldCycle"`
	}
	user.Get("/api/recipes?kind=base").MustJSON(t, &plain)
	for _, s := range plain {
		if s.WouldCycle {
			t.Error("without for nothing is marked")
		}
	}
}

func TestLinkCandidatesCarryTheBaseUnitAndTheMergeOfferCountsExclusions(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	jar := ingredient(t, env, "béchamel", "ml")
	mustCreate(t, user, body(jar, "Lasagne", map[string]any{"lines": []any{lineOf(jar, 500, "ml")}}))
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", map[string]any{"takeOver": false}))
	member := mustExec(t, env, `INSERT INTO members(name, colour, avatar, portion_factor, created_at) VALUES ('Sam', '#336699', '', 1.0, '2026-11-09T12:00:00Z')`)
	mustExec(t, env, `INSERT INTO member_ingredient_exclusions(member_id, ingredient_id) VALUES (?,?)`, member, jar)

	var c struct {
		BaseUnit string `json:"baseUnit"`
		Lines    []struct {
			LineID int64 `json:"lineId"`
		} `json:"lines"`
	}
	user.Get(fmt.Sprintf("/api/recipes/%d/link-candidates", bech.ID)).MustJSON(t, &c)
	if c.BaseUnit != "ml" || len(c.Lines) != 1 {
		t.Fatalf("candidates = %+v, want baseUnit ml (so the web can offer the Unit Conversion prompt)", c)
	}
	var res struct {
		MergeOffer []struct {
			Exclusions int `json:"exclusions"`
		} `json:"mergeOffer"`
	}
	user.Post(fmt.Sprintf("/api/recipes/%d/link", bech.ID), map[string]any{"lineIds": []int64{c.Lines[0].LineID}}).MustJSON(t, &res)
	if len(res.MergeOffer) != 1 || res.MergeOffer[0].Exclusions != 1 {
		t.Errorf("mergeOffer = %+v, want exclusions 1", res.MergeOffer)
	}
}

func TestUseAsAPlainIngredientRouteTakesIngredientIdFallsBackToTheRememberedOneAndOtherwiseAsks(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	gravy := ingredient(t, env, "gravy", "ml")
	other := ingredient(t, env, "stock", "ml")
	roast := mustCreate(t, user, body(gravy, "Roast", map[string]any{"lines": []any{lineOf(gravy, 200, "ml")}}))
	mustCreate(t, user, baseBody("Gravy", 1, "l", map[string]any{"takeOver": true})) // lines become Base recipe lines, nothing remembered
	line := roast.Lines[0].ID
	path := fmt.Sprintf("/api/recipes/%d/lines/%d/base", roast.ID, line)

	wantRich(t, "nothing remembered", user.Do("DELETE", path, nil), 422, "validation_failed", "ingredientId", "ingredient_required")
	r := user.Do("DELETE", path, map[string]any{"ingredientId": other})
	var out baseRecipeOut
	r.MustJSON(t, &out)
	if r.Status != 200 || out.Lines[0].IngredientID != other || out.Lines[0].BaseRecipe != nil {
		t.Fatalf("with ingredientId = %d %s, want the line on that Ingredient", r.Status, r.Body)
	}

	// Remembered fallback, and a deleted remembered Ingredient asks again.
	jar := ingredient(t, env, "béchamel", "ml")
	lasagne := mustCreate(t, user, body(jar, "Lasagne", map[string]any{"lines": []any{lineOf(jar, 500, "ml")}}))
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", map[string]any{"takeOver": false}))
	lp := fmt.Sprintf("/api/recipes/%d/lines/%d/base", lasagne.ID, lasagne.Lines[0].ID)
	user.Post(lp, map[string]any{"baseRecipeId": bech.ID})
	back := user.Do("DELETE", lp, nil)
	back.MustJSON(t, &out)
	if back.Status != 200 || out.Lines[0].IngredientID != jar {
		t.Errorf("remembered fallback = %d %s", back.Status, back.Body)
	}
	user.Post(lp, map[string]any{"baseRecipeId": bech.ID})
	mustExec(t, env, `UPDATE recipe_lines SET linked_from_ingredient_id = NULL WHERE id = ?`, lasagne.Lines[0].ID)
	wantRich(t, "remembered gone", user.Do("DELETE", lp, nil), 422, "validation_failed", "ingredientId", "ingredient_required")
}

func TestTheUnknownUnitOfALinkNamesTheLineInTheField(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	jar := ingredient(t, env, "béchamel", "ml")
	milk := ingredient(t, env, "milk", "ml")
	mustExec(t, env, `INSERT INTO ingredient_conversions(ingredient_id, unit, to_base) VALUES (?, 'jar', 400)`, jar)
	cann := mustCreate(t, user, map[string]any{"name": "Cannelloni", "yield": 4, "lines": []any{lineOf(milk, 5, "ml"), lineOf(jar, 2, "jar")}})
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", map[string]any{"takeOver": false}))
	r := user.Post(fmt.Sprintf("/api/recipes/%d/lines/%d/base", cann.ID, cann.Lines[1].ID), map[string]any{"baseRecipeId": bech.ID})
	var e struct {
		Error struct {
			Code  string `json:"code"`
			Field string `json:"field"`
		} `json:"error"`
	}
	r.MustJSON(t, &e)
	if r.Status != 422 || e.Error.Code != "unknown_unit" || e.Error.Field != "lines[1].unit" {
		t.Errorf("link = %d %s, want unknown_unit on field lines[1].unit (the line's position in its Recipe)", r.Status, r.Body)
	}
}

func TestBulkLinkAndUnlinkOfANonBaseRecipeIs404(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	jar := ingredient(t, env, "béchamel", "ml")
	lasagne := mustCreate(t, user, body(jar, "Lasagne", map[string]any{"lines": []any{lineOf(jar, 500, "ml")}}))
	ids := map[string]any{"lineIds": []int64{lasagne.Lines[0].ID}}
	for _, route := range []string{"link", "unlink", "link-candidates"} {
		var r *testkit.Response
		if route == "link-candidates" {
			r = user.Get(fmt.Sprintf("/api/recipes/%d/%s", lasagne.ID, route))
		} else {
			r = user.Post(fmt.Sprintf("/api/recipes/%d/%s", lasagne.ID, route), ids)
		}
		if r.Status != 404 {
			t.Errorf("%s of a plannable Recipe = %d %s, want 404", route, r.Status, r.Body)
		}
	}
}

func TestRenamingATakingOverAndLinkingPublishEvents(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	ev := openEvents(t, env, user)

	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	put := baseBody("White sauce", 1, "l", nil)
	if r := user.Put(fmt.Sprintf("/api/recipes/%d", bech.ID), put); r.Status != 200 {
		t.Fatalf("rename = %d %s", r.Status, r.Body)
	}
	if !ev.seen("ingredients") {
		t.Error("renaming a Base recipe renames its Ingredient: an `ingredients` event is expected")
	}

	jar := ingredient(t, env, "gravy", "ml")
	mustCreate(t, user, body(jar, "Roast", map[string]any{"lines": []any{lineOf(jar, 200, "ml")}}))
	ev2 := openEvents(t, env, user)
	mustCreate(t, user, baseBody("Gravy", 1, "l", map[string]any{"takeOver": true}))
	if !ev2.seen("ingredients", fmt.Sprint(jar)) {
		t.Error("a take-over re-keys an Ingredient: an `ingredients` event naming it is expected")
	}
	if !ev2.seen("recipes") {
		t.Error("a take-over turns Recipes' lines into Base recipe lines: a `recipes` event is expected")
	}
}

func TestBulkLinkAndUnlinkPublishARecipesEventForEveryAffectedRecipe(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	jar := ingredient(t, env, "béchamel", "ml")
	lasagne := mustCreate(t, user, body(jar, "Lasagne", map[string]any{"lines": []any{lineOf(jar, 500, "ml")}}))
	moussaka := mustCreate(t, user, body(jar, "Moussaka", map[string]any{"lines": []any{lineOf(jar, 300, "ml")}}))
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", map[string]any{"takeOver": false}))
	ids := []int64{lasagne.Lines[0].ID, moussaka.Lines[0].ID}

	ev := openEvents(t, env, user)
	if r := user.Post(fmt.Sprintf("/api/recipes/%d/link", bech.ID), map[string]any{"lineIds": ids}); r.Status != 200 {
		t.Fatalf("link = %d %s", r.Status, r.Body)
	}
	for _, id := range []int64{lasagne.ID, moussaka.ID} {
		if !ev.seen("recipes", fmt.Sprintf(`"id":%d`, id)) {
			t.Errorf("link: no `recipes` event for Recipe %d", id)
		}
	}
	ev2 := openEvents(t, env, user)
	if r := user.Post(fmt.Sprintf("/api/recipes/%d/unlink", bech.ID), map[string]any{"lineIds": ids}); r.Status != 200 {
		t.Fatalf("unlink = %d %s", r.Status, r.Body)
	}
	for _, id := range []int64{lasagne.ID, moussaka.ID} {
		if !ev2.seen("recipes", fmt.Sprintf(`"id":%d`, id)) {
			t.Errorf("unlink: no `recipes` event for Recipe %d", id)
		}
	}
}

func TestToBaseAndALinkThatWouldCycleAre422WithThePathAndChangeNothing(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	pestoIng := ingredient(t, env, "pesto", "g")
	sauce := mustCreate(t, user, baseBody("Sauce", 100, "g", map[string]any{"lines": []any{lineOf(pestoIng, 10, "g")}}))
	pesto := mustCreate(t, user, map[string]any{"name": "Pesto", "yield": 4, "lines": []any{baseLineOf(sauce.ID, 50, "g")}})

	ask := user.Post(fmt.Sprintf("/api/recipes/%d/to-base", pesto.ID), map[string]any{"yield": 200, "yieldUnit": "g"})
	var a askOut
	ask.MustJSON(t, &a)
	if ask.Status != 409 || a.Error.Code != "base_recipe_take_over" || a.Error.Ingredient.ID != pestoIng {
		t.Fatalf("to-base without an answer = %d %s, want the 409 ask", ask.Status, ask.Body)
	}
	r := user.Post(fmt.Sprintf("/api/recipes/%d/to-base", pesto.ID), map[string]any{"yield": 200, "yieldUnit": "g", "takeOver": true})
	e := wantRich(t, "to-base Yes", r, 422, "validation_failed", "lines[0]", "base_recipe_cycle")
	if len(e.Error.Path) != 3 || e.Error.Path[0] != "Pesto" || e.Error.Path[1] != "Sauce" {
		t.Errorf("path = %v, want [Pesto Sauce Pesto]", e.Error.Path)
	}
	var got baseRecipeOut
	user.Get(fmt.Sprintf("/api/recipes/%d", pesto.ID)).MustJSON(t, &got)
	if got.BaseRecipe {
		t.Error("nothing was written")
	}

	line := fmt.Sprintf("/api/recipes/%d/lines/%d/base", sauce.ID, sauce.Lines[0].ID)
	wantRich(t, "convert link", user.Post(line, map[string]any{"convertRecipeId": pesto.ID, "yield": 200, "yieldUnit": "g", "takeOver": false}), 422, "validation_failed", "lines[0]", "base_recipe_cycle")
}
