package httpapi_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// PE: the plan's attendees carry the Member's Photo and emoji so every Avatar can draw them
// (docs/dev/design/pe-pictures-everywhere.md). Wire keys: `photoUrl` ("/api/images/<id>") and `avatar` (the emoji), both omitted when empty.

const photoID = "0123456789abcdef0123456789abcdef"

// attendances collects every `attendance` array in a JSON document, wherever the view nests it.
func attendances(v any) [][]map[string]any {
	var out [][]map[string]any
	switch n := v.(type) {
	case map[string]any:
		for k, x := range n {
			if arr, ok := x.([]any); ok && k == "attendance" {
				var rows []map[string]any
				for _, e := range arr {
					if m, ok := e.(map[string]any); ok {
						rows = append(rows, m)
					}
				}
				out = append(out, rows)
				continue
			}
			out = append(out, attendances(x)...)
		}
	case []any:
		for _, x := range n {
			out = append(out, attendances(x)...)
		}
	}
	return out
}

func TestPlanAttendeesCarryThePhotoAndTheEmoji(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	var anna, sam struct {
		ID int64 `json:"id"`
	}
	admin.Post("/api/members", map[string]any{"name": "Anna", "colour": "#3366cc", "portionFactor": 1, "avatar": "🦊"}).MustJSON(t, &anna)
	admin.Post("/api/members", map[string]any{"name": "Sam", "colour": "#81b29a", "portionFactor": 1}).MustJSON(t, &sam)
	if anna.ID == 0 || sam.ID == 0 {
		t.Fatalf("members: %+v %+v", anna, sam)
	}
	if _, err := env.DB.Exec(`UPDATE members SET photo = ? WHERE id = ?`, photoID, anna.ID); err != nil {
		t.Fatal(err)
	}
	r := admin.Post("/api/meal-slots", map[string]any{"weekday": 1, "name": "Dinner", "time": "19:00",
		"attendance": []map[string]any{{"memberId": anna.ID}, {"memberId": sam.ID}}})
	if r.Status != 201 {
		t.Fatalf("slot = %d %s", r.Status, r.Body)
	}
	var rows []map[string]any
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline) && rows == nil; time.Sleep(30 * time.Millisecond) {
		var doc any
		admin.Get("/api/plan?from=2026-11-09&to=2026-11-09").MustJSON(t, &doc)
		for _, a := range attendances(doc) {
			if len(a) == 2 {
				rows = a
			}
		}
	}
	if rows == nil {
		t.Fatal("no slot with two attendees in the plan view")
	}
	byName := map[string]map[string]any{}
	for _, m := range rows {
		byName[m["name"].(string)] = m
	}
	if byName["Anna"]["photoUrl"] != "/api/images/"+photoID || byName["Anna"]["avatar"] != "🦊" {
		t.Errorf("Anna = %v; want photoUrl and avatar", byName["Anna"])
	}
	for _, k := range []string{"photoUrl", "avatar"} {
		if _, has := byName["Sam"][k]; has {
			t.Errorf("Sam has %q = %v; the key is omitted when empty", k, byName["Sam"][k])
		}
	}
}
