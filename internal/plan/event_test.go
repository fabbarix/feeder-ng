package plan_test

import (
	"encoding/json"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

type recorder struct {
	topics []string
	data   []any
}

func (r *recorder) Publish(topic string, data any) {
	r.topics = append(r.topics, topic)
	r.data = append(r.data, data)
}

func TestInvalidatePublishesTheReasonOnTheInvalidateTopic(t *testing.T) {
	var rec recorder
	plan.Invalidate(&rec, plan.ReasonStockTake)
	if len(rec.topics) != 1 || rec.topics[0] != plan.InvalidateTopic {
		t.Fatalf("topics = %v, want [%s]", rec.topics, plan.InvalidateTopic)
	}
	raw, _ := json.Marshal(rec.data[0])
	if string(raw) != `{"reason":"stock_take"}` {
		t.Errorf("data = %s, want {\"reason\":\"stock_take\"}", raw)
	}
	// What Invalidate publishes, ReasonForEvent reads back.
	if r, ok := plan.ReasonForEvent(plan.InvalidateTopic, raw); !ok || r != plan.ReasonStockTake {
		t.Errorf("round trip = %q, %v", r, ok)
	}
}

func TestReasonForEvent(t *testing.T) {
	cases := []struct {
		name, topic, data string
		want              plan.Reason
		ok                bool
	}{
		{"explicit hook", "plan.invalidate", `{"reason":"unpinned"}`, plan.ReasonUnpinned, true},
		{"explicit hook, empty reason", "plan.invalidate", `{"reason":""}`, "", false},
		{"explicit hook, unknown reason", "plan.invalidate", `{"reason":"bored"}`, "", false},
		{"a Recipe was edited", "recipes", `{"id":4}`, plan.ReasonRecipeChanged, true},
		{"a Member's preferences changed", "recipes", `{"preferences":2}`, plan.ReasonRecipeChanged, true},
		{"Attendance changed", "household", `{"changed":"attendance"}`, plan.ReasonAttendanceChanged, true},
		{"Meal Slots changed", "household", `{"changed":"mealSlots"}`, plan.ReasonAttendanceChanged, true},
		{"Members changed", "household", `{"changed":"members"}`, plan.ReasonAttendanceChanged, true},
		{"settings changed (horizon, style)", "household", `{"changed":"settings"}`, plan.ReasonAttendanceChanged, true},
		{"household, something else", "household", `{"changed":"preferences"}`, "", false},
		{"Stock lots changed", "stock", `{"changed":"lots","ingredientIds":[1]}`, plan.ReasonStockTake, true},
		{"Stock waste only", "stock", `{"changed":"waste"}`, "", false},
		{"the plan topic itself must not loop", "plan", `{"changed":"plan"}`, "", false},
		{"products", "products", `{"changed":"x"}`, "", false},
		{"garbage payload on a topic that needs one", "household", `nope`, "", false},
	}
	for _, c := range cases {
		got, ok := plan.ReasonForEvent(c.topic, []byte(c.data))
		if got != c.want || ok != c.ok {
			t.Errorf("%s: ReasonForEvent(%q, %s) = %q, %v; want %q, %v", c.name, c.topic, c.data, got, ok, c.want, c.ok)
		}
	}
}
