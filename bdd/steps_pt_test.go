package bdd

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("pt", ptSteps) }

// ptSteps adds the checks the Recipe detail's preferences table relies on (docs/dev/design/rx-pt.md section 5.2): each Member's
// preferences are read with memberId, and "excludedIngredients" is always a list (the table works out "via garlic" from it).
func ptSteps(sc *godog.ScenarioContext, w *World) {
	excludedOf := func(member string) ([]string, error) {
		r := w.Client.Get(fmt.Sprintf("/api/recipe-preferences?memberId=%v", w.Vars["member:"+member]))
		if r.Status != 200 {
			return nil, fmt.Errorf("preferences of %s: %d %s", member, r.Status, r.Body)
		}
		var raw map[string]json.RawMessage
		if err := json.Unmarshal([]byte(r.Body), &raw); err != nil {
			return nil, err
		}
		list, ok := raw["excludedIngredients"]
		if !ok || strings.TrimSpace(string(list)) == "null" {
			return nil, fmt.Errorf("preferences of %s have no excludedIngredients list: %s", member, r.Body)
		}
		var ids []float64
		if err := json.Unmarshal(list, &ids); err != nil {
			return nil, err
		}
		var out []string
		for name := range w.Vars {
			if !strings.HasPrefix(name, "ingredient:") {
				continue
			}
			for _, id := range ids {
				if fmt.Sprint(int64(id)) == fmt.Sprint(w.Vars[name]) {
					out = append(out, strings.TrimPrefix(name, "ingredient:"))
				}
			}
		}
		sort.Strings(out)
		return out, nil
	}
	sc.Step(`^the preferences of the Member "([^"]*)" list the excluded Ingredients "([^"]*)"$`, func(m, want string) error {
		got, err := excludedOf(m)
		if err != nil {
			return err
		}
		wanted := strings.Split(want, ",")
		sort.Strings(wanted)
		if strings.Join(got, ",") != strings.Join(wanted, ",") {
			return fmt.Errorf("%s excludes %v, want %v", m, got, wanted)
		}
		return nil
	})
	sc.Step(`^the preferences of the Member "([^"]*)" list no excluded Ingredients$`, func(m string) error {
		got, err := excludedOf(m)
		if err != nil {
			return err
		}
		if len(got) != 0 {
			return fmt.Errorf("%s excludes %v, want none", m, got)
		}
		return nil
	})
}
