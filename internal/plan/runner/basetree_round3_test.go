package runner_test

import (
	"fmt"
	"strings"
	"testing"
	"time"
)

// BR-F round 3: the batch NeedTrees feeds the logs (a cycle, the skipped lines with the Base recipe they sit in), and the
// planner sees the composed lead time of a Recipe, kept fresh when a Base recipe is edited.

func TestACyclicRecipeIsLoggedOnceAsAWarningNamingTheRecipe(t *testing.T) {
	s := newBRSrc(t)
	lasagne, _ := s.seedCycle()
	src, logs := loggedSources(s)
	if _, err := src.Recipes(ctx); err != nil {
		t.Fatal(err)
	}
	out := logs.String()
	want := fmt.Sprintf("recipe=%d", lasagne)
	n := 0
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "level=WARN") && strings.Contains(line, "cycle") && strings.Contains(line, want) {
			n++
		}
	}
	if n != 1 {
		t.Errorf("%d warnings name the cycle of Recipe %d, want exactly 1 (NeedTrees leaves it out; Recipes must not log it a second time):\n%s", n, lasagne, out)
	}
}

func TestASkippedLineInsideABaseRecipeIsLoggedWithTheBaseRecipeItSitsIn(t *testing.T) {
	s := newBRSrc(t)
	bech := s.base("Béchamel", 1, "l", nil, brLine(s.milk, 1000, "ml"), brLine(s.flour, 100, "g"))
	lasagne := s.plain("Lasagne", brLine(s.butter, 50, "g"), brCall(bech.ID, 500, "ml"))
	// A cup of flour (a weight Ingredient) cannot be converted: the API refuses it, an old row can hold it.
	if _, err := s.env.DB.Exec(`UPDATE recipe_lines SET unit = 'cup' WHERE recipe_id = ? AND ingredient_id = ?`, bech.ID, s.flour); err != nil {
		t.Fatal(err)
	}
	src, logs := loggedSources(s)
	all, err := src.Recipes(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range all {
		if int64(r.ID) != lasagne.ID {
			continue
		}
		for _, n := range r.Needs {
			if int64(n.IngredientID) == s.flour {
				t.Errorf("Lasagne still needs the skipped flour: %+v", n)
			}
		}
	}
	var hit string
	for _, line := range strings.Split(logs.String(), "\n") {
		if strings.Contains(line, "level=WARN") && strings.Contains(line, "unconvertible") && strings.Contains(line, fmt.Sprintf("ingredient=%d", s.flour)) {
			hit = line
			break
		}
	}
	if hit == "" {
		t.Fatalf("no warning for the skipped nested line:\n%s", logs.String())
	}
	if !strings.Contains(hit, fmt.Sprintf("recipe=%d ", bech.ID)) {
		t.Errorf("warning %q must carry recipe=%d, the Base recipe the line sits in", hit, bech.ID)
	}
	if strings.Contains(hit, fmt.Sprintf("recipe=%d ", lasagne.ID)) {
		t.Errorf("warning %q names the calling Recipe as the owner of the line", hit)
	}
}

// ---- the planner sees the composed lead time ----

func advanceStep(lead int) []map[string]any {
	return []map[string]any{{"text": "Prepare ahead", "kind": "advance", "durationMinutes": 0, "leadTimeMinutes": lead, "after": []int{}, "uses": []any{}}}
}

func (s *brSrc) longestLead(name string) time.Duration {
	s.t.Helper()
	var longest time.Duration
	for _, a := range s.recipe(name).AdvanceSteps {
		longest = max(longest, a.Lead)
	}
	return longest
}

func (s *brSrc) editBase(id int64, name string, steps []map[string]any, lines ...map[string]any) {
	s.t.Helper()
	body := map[string]any{"name": name, "yield": 300, "yieldUnit": "g", "baseRecipe": true, "lines": lines, "steps": steps, "tags": []string{}}
	if r := s.user.Put(fmt.Sprintf("/api/recipes/%d", id), body); r.Status != 200 {
		s.t.Fatalf("edit %s = %d %s", name, r.Status, r.Body)
	}
}

func TestThePlannerSeesTheComposedLeadTimeAfterABaseRecipeIsEdited(t *testing.T) {
	s := newBRSrc(t)
	roux := s.base("Roux", 300, "g", nil, brLine(s.butter, 150, "g"))
	bech := s.base("Béchamel", 1, "l", advanceStep(60), brLine(s.milk, 1000, "ml"), brCall(roux.ID, 100, "g"))
	s.plain("Lasagne", brCall(bech.ID, 500, "ml"))
	if got := s.longestLead("Lasagne"); got != 60*time.Minute {
		t.Fatalf("Lasagne longest lead = %v, want the Béchamel's 1 hour", got)
	}
	// The nested Roux gets a longer Advance Step: Lasagne's cached summary must follow, two levels up.
	s.editBase(roux.ID, "Roux", advanceStep(600), brLine(s.butter, 150, "g"))
	if got := s.longestLead("Lasagne"); got != 600*time.Minute {
		t.Errorf("Lasagne longest lead = %v after editing the nested Roux, want 10 hours: the planner must see the composed lead time, not a stale cache", got)
	}
}
