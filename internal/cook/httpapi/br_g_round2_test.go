package httpapi_test

import (
	"bytes"
	"log/slog"
	"strings"
	"sync"
	"testing"
)

// BR-G round 2: a Base recipe cycle written straight into SQL (the API refuses one) must not break Cook Mode. The cook adapter's
// Steps and MealSteps fall back to the Recipe's own Steps, as before Base recipes, and log a warning (slog's default logger:
// the adapter has no logger of its own).

type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) { s.mu.Lock(); defer s.mu.Unlock(); return s.b.Write(p) }
func (s *syncBuf) String() string              { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

func TestACycleLeavesCookModeOnTheRecipesOwnStepsAndLogsAWarning(t *testing.T) {
	b := newBrg(t, 1)
	roux, rouxIng := b.create(map[string]any{"name": "Roux", "yield": 300, "yieldUnit": "g", "baseRecipe": true,
		"lines": []map[string]any{line(b.Ingredient("lard"), 150)}})
	b.Exec(`INSERT INTO recipe_lines (recipe_id, position, ingredient_id, quantity, unit) VALUES (?, 9, ?, 10, 'g')`, b.béchamel, rouxIng)
	b.Exec(`INSERT INTO recipe_lines (recipe_id, position, ingredient_id, quantity, unit) VALUES (?, 9, ?, 10, 'g')`, roux, b.béchamelIng)

	logs := &syncBuf{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	tl := b.timeline() // the Planned Meal path: MealSteps
	if len(tl.Items) != 2 || tl.Items[0].Text != "Layer the lasagne" || tl.Items[1].Text != "Bake" || tl.TotalMinutes != 40 {
		t.Fatalf("timeline = %d items over %d minutes: %+v; want Lasagne's own two Steps, 40 minutes", len(tl.Items), tl.TotalMinutes, tl.Items)
	}
	for _, it := range tl.Items {
		if it.BaseRecipe != nil {
			t.Errorf("%q is labelled %+v on a cycle", it.Text, it.BaseRecipe)
		}
	}
	if v := b.view(); len(v.Steps) != 2 || v.Steps[0].Text != "Layer the lasagne" {
		t.Errorf("Course view steps = %+v, want Lasagne's own two", v.Steps)
	}
	r := b.User.Get("/api/cook/recipes/" + id(b.lasagne) + "?batches=1") // the Recipe path: Steps
	var rv brgView
	if r.Status != 200 || r.JSON(&rv) != nil || len(rv.Steps) != 2 {
		t.Errorf("Recipe view = %d %s, want 200 with Lasagne's own two Steps", r.Status, r.Body)
	}
	out := logs.String()
	if !strings.Contains(out, "level=WARN") {
		t.Errorf("no warning logged for the cycle; log:\n%s", out)
	}
}
