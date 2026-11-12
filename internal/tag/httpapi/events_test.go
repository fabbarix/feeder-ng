package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Events (tg-plan §3.1a, spec §17), after the commit and in this order: tags on every write; then
// recipes on a rename, merge and delete; then plan.invalidate {"reason":"rules_changed"}, last, only when a
// Slot Rule or Variety Rule moved or went. plan.invalidate goes last because the Runner keeps the last
// reason of the invalidations it coalesces: recipes alone would keep the Planned Meals a rule placed.

const (
	evTags       = `tags {"changed":"tags"}`
	evRecipes    = `recipes {"changed":"tags"}`
	evRulesMoved = `plan.invalidate {"reason":"rules_changed"}`
)

func TestEventsOfEveryWriteInOrder(t *testing.T) {
	cases := []struct {
		name string
		// seed makes the Tags and rules, and returns the request to make.
		run  func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response
		want []string
	}{
		{"add", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			return c.Post("/api/tags", map[string]any{"name": "Roast"})
		}, []string{evTags}},
		{"recolour only", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			fish := seedTag(t, env, "fish", "tomato")
			seedVariety(t, env, "fish", 1, 0)
			return c.Patch(path("/api/tags/%d", fish), map[string]any{"colour": "sky"})
		}, []string{evTags}},
		{"respell", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			fish := seedTag(t, env, "fish", "tomato")
			seedVariety(t, env, "fish", 1, 0) // a respell touches no rule
			return c.Patch(path("/api/tags/%d", fish), map[string]any{"name": "Fish"})
		}, []string{evTags, evRecipes}},
		{"rename, no rule on the Tag", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			fish := seedTag(t, env, "fish", "tomato")
			return c.Patch(path("/api/tags/%d", fish), map[string]any{"name": "Seafood"})
		}, []string{evTags, evRecipes}},
		{"rename moving a Slot Rule", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			fish := seedTag(t, env, "fish", "tomato")
			seedSlotRule(t, env, seedSlot(t, env, 5, "Dinner", "19:00"), courseID(t, env, "Main"), "fish")
			return c.Patch(path("/api/tags/%d", fish), map[string]any{"name": "Seafood"})
		}, []string{evTags, evRecipes, evRulesMoved}},
		{"rename moving a Variety Rule, with a new colour", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			fish := seedTag(t, env, "fish", "tomato")
			seedVariety(t, env, "fish", 1, 0)
			return c.Patch(path("/api/tags/%d", fish), map[string]any{"name": "Seafood", "colour": "rose"})
		}, []string{evTags, evRecipes, evRulesMoved}},
		{"merge, no rule", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			fish, sea := seedTag(t, env, "fish", "tomato"), seedTag(t, env, "Seafood", "apricot")
			seedRecipe(t, env, "Salmon", 0, fish)
			return c.Post(path("/api/tags/%d/merge", fish), map[string]any{"into": sea})
		}, []string{evTags, evRecipes}},
		{"merge moving a Slot Rule", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			fish, sea := seedTag(t, env, "fish", "tomato"), seedTag(t, env, "Seafood", "apricot")
			seedSlotRule(t, env, seedSlot(t, env, 5, "Dinner", "19:00"), courseID(t, env, "Main"), "fish")
			return c.Post(path("/api/tags/%d/merge", fish), map[string]any{"into": sea})
		}, []string{evTags, evRecipes, evRulesMoved}},
		{"merge dropping only the source's Variety Rule", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			fish, sea := seedTag(t, env, "fish", "tomato"), seedTag(t, env, "Seafood", "apricot")
			seedVariety(t, env, "fish", 1, 0)
			seedVariety(t, env, "seafood", 2, 0)
			return c.Post(path("/api/tags/%d/merge", fish), map[string]any{"into": sea})
		}, []string{evTags, evRecipes, evRulesMoved}},
		{"delete, no rule", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			fish := seedTag(t, env, "fish", "tomato")
			seedRecipe(t, env, "Salmon", 0, fish)
			return c.Delete(path("/api/tags/%d", fish))
		}, []string{evTags, evRecipes}},
		{"delete removing a rule", func(t *testing.T, env *testkit.Env, c *testkit.Client) *testkit.Response {
			fish := seedTag(t, env, "fish", "tomato")
			seedVariety(t, env, "fish", 1, 0)
			return c.Delete(path("/api/tags/%d", fish))
		}, []string{evTags, evRecipes, evRulesMoved}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := testkit.Start(t)
			c := env.LoginUser(t)
			ch, cancel := env.App.Deps.Events.Subscribe("tags", "recipes", "plan.invalidate")
			defer cancel()
			r := tc.run(t, env, c)
			if r.Status >= 300 {
				t.Fatalf("request = %d %s", r.Status, r.Body)
			}
			if got := drain(ch); !sameStrings(got, tc.want) {
				t.Errorf("events = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestARefusedWritePublishesNothing(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish := seedTag(t, env, "fish", "tomato")
	sea := seedTag(t, env, "Seafood", "apricot")
	seedVariety(t, env, "fish", 1, 0)
	ch, cancel := env.App.Deps.Events.Subscribe("tags", "recipes", "plan.invalidate")
	defer cancel()
	refused := []*testkit.Response{
		c.Post("/api/tags", map[string]any{"name": "FISH"}),
		c.Post("/api/tags", map[string]any{"name": ""}),
		c.Patch(path("/api/tags/%d", fish), map[string]any{"name": "seafood"}),
		c.Patch(path("/api/tags/%d", fish), map[string]any{}),
		c.Patch("/api/tags/9999", map[string]any{"colour": "sky"}),
		c.Post(path("/api/tags/%d/merge", fish), map[string]any{"into": fish}),
		c.Post(path("/api/tags/%d/merge", sea), map[string]any{"into": 9999}),
		c.Delete("/api/tags/9999"),
	}
	for i, r := range refused {
		if r.Status < 400 {
			t.Errorf("request %d = %d %s, want a refusal", i, r.Status, r.Body)
		}
	}
	if got := drain(ch); len(got) != 0 {
		t.Errorf("events after refusals = %q, want none", got)
	}
}

func TestReadsPublishNothing(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	fish := seedTag(t, env, "fish", "tomato")
	sea := seedTag(t, env, "Seafood", "apricot")
	ch, cancel := env.App.Deps.Events.Subscribe("tags", "recipes", "plan.invalidate")
	defer cancel()
	c.Get("/api/tags")
	c.Get(path("/api/tags/%d/impact?into=%d", fish, sea))
	if got := drain(ch); len(got) != 0 {
		t.Errorf("events after reads = %q, want none", got)
	}
}
