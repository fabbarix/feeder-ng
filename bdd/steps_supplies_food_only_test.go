package bdd

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Step definitions for bdd/features/supplies/supplies_food_only.feature (H3: the food-only guards for Supplies).
// They reuse the Recipes, Ingredients, Supplies, Members and Import Review steps of the other sets; the step set is named
// supplies-food-only so H8's steps_supplies_test.go can register its own.

func init() { RegisterSteps("supplies-food-only", suppliesFoodOnlySteps) }

var foodOnlyPlaceholder = regexp.MustCompile(`<(id|recipe|member):([^>]+)>`)

func suppliesFoodOnlySteps(sc *godog.ScenarioContext, w *World) {
	// fill replaces <id:Ingredient>, <recipe:Name> and <member:Name> with the ids this scenario set up.
	fill := func(s string) string {
		return foodOnlyPlaceholder.ReplaceAllStringFunc(s, func(m string) string {
			p := foodOnlyPlaceholder.FindStringSubmatch(m)
			prefix := map[string]string{"id": "ingredient:", "recipe": "recipe:", "member": "member:"}[p[1]]
			return fmt.Sprint(w.Vars[prefix+p[2]])
		})
	}

	sc.Step(`^I send (POST|PUT|PATCH) "([^"]*)" with ids filled in:$`, func(method, path string, body *godog.DocString) {
		w.Last = w.Client.Do(method, fill(path), []byte(fill(body.Content)))
	})

	sc.Step(`^the error field is "([^"]*)"$`, func(want string) error {
		var b struct {
			Error struct {
				Field string `json:"field"`
			} `json:"error"`
		}
		if err := w.Last.JSON(&b); err != nil {
			return err
		}
		if b.Error.Field != want {
			return fmt.Errorf("error field = %q, want %q; body: %s", b.Error.Field, want, w.Last.Body)
		}
		return nil
	})

	plan := func() recipefile.Plan { p, _ := w.Vars["rf-plan"].(recipefile.Plan); return p }
	row := func(name string) (recipefile.IngredientMatch, error) {
		for _, m := range plan().Ingredients {
			if m.Key == units.NormalizeName(name) {
				return m, nil
			}
		}
		return recipefile.IngredientMatch{}, fmt.Errorf("no row for the Ingredient %q in %+v", name, plan().Ingredients)
	}

	sc.Step(`^the review lists the Ingredient "([^"]*)" as a Supply name$`, func(name string) error {
		m, err := row(name)
		if err != nil {
			return err
		}
		if m.Status != "supply" || m.Match != nil || m.Resolved {
			return fmt.Errorf("row %q = status %q, match %v, resolved %v; want status supply, no match, unresolved", name, m.Status, m.Match, m.Resolved)
		}
		return nil
	})

	sc.Step(`^the review offers no suggestion for "([^"]*)"$`, func(name string) error {
		m, err := row(name)
		if err != nil {
			return err
		}
		if len(m.Suggestions) != 0 {
			return fmt.Errorf("suggestions for %q = %+v, want none", name, m.Suggestions)
		}
		return nil
	})

	sc.Step(`^the review has a problem "([^"]*)" saying "([^"]*)"$`, func(code, text string) error {
		for _, p := range plan().Problems {
			if p.Code == code && strings.Contains(p.Message, text) {
				return nil
			}
		}
		return fmt.Errorf("no problem %q saying %q in %+v", code, text, plan().Problems)
	})
}
