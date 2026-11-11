package cook

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

// The cases are shared with web/src/features/cook/lib/reheat.test.ts through
// docs/spec/fixtures/reheat-defaults.json, so the Go and TypeScript formulas cannot drift.
func TestDefaultReheatSecondsFixture(t *testing.T) {
	raw, err := os.ReadFile("../../docs/spec/fixtures/reheat-defaults.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Cases []struct {
			Name          string `json:"name"`
			Portions      any    `json:"portions"`
			ReheatMinutes int    `json:"reheatMinutes"`
			Seconds       int    `json:"seconds"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	if len(fx.Cases) < 15 {
		t.Fatalf("only %d fixture cases", len(fx.Cases))
	}
	for _, c := range fx.Cases {
		var portions float64
		switch v := c.Portions.(type) {
		case float64:
			portions = v
		case string:
			switch v {
			case "NaN":
				portions = math.NaN()
			case "Infinity":
				portions = math.Inf(1)
			case "-Infinity":
				portions = math.Inf(-1)
			default:
				t.Fatalf("%s: bad portions %q", c.Name, v)
			}
		default:
			t.Fatalf("%s: bad portions %v", c.Name, c.Portions)
		}
		if got := DefaultReheatSeconds(portions, c.ReheatMinutes); got != c.Seconds {
			t.Errorf("%s: DefaultReheatSeconds(%v, %d) = %d, want %d", c.Name, portions, c.ReheatMinutes, got, c.Seconds)
		}
	}
}
