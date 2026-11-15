package httpapi_test

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Ruling 3 (main session, B9-27): the detail read gives the reason beside `deletable`: `deleteBlockedBy` is "planned" or
// "in_use", and absent when the Recipe can be deleted. A Base recipe in use gets its own dialog copy from it.
func TestDetailSaysWhyABaseRecipeInUseCannotBeDeleted(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	bech := mustCreate(t, user, baseBody("Béchamel", 1, "l", nil))
	detail := func(id int64) map[string]json.RawMessage {
		t.Helper()
		r := user.Get(fmt.Sprintf("/api/recipes/%d", id))
		var out map[string]json.RawMessage
		r.MustJSON(t, &out)
		if r.Status != 200 {
			t.Fatalf("GET %d = %d %s", id, r.Status, r.Body)
		}
		return out
	}
	unused := detail(bech.ID)
	if string(unused["deletable"]) != "true" {
		t.Errorf("an unused Base recipe: deletable = %s, want true", unused["deletable"])
	}
	if v, ok := unused["deleteBlockedBy"]; ok {
		t.Errorf("an unused Base recipe: deleteBlockedBy = %s, want the key absent", v)
	}
	lasagne := mustCreate(t, user, map[string]any{"name": "Lasagne", "yield": 4, "lines": []any{baseLineOf(bech.ID, 500, "ml")}})
	inUse := detail(bech.ID)
	if string(inUse["deletable"]) != "false" || string(inUse["deleteBlockedBy"]) != `"in_use"` {
		t.Errorf("a Base recipe in use: deletable = %s, deleteBlockedBy = %s; want false, \"in_use\"", inUse["deletable"], inUse["deleteBlockedBy"])
	}
	caller := detail(lasagne.ID)
	if _, ok := caller["deleteBlockedBy"]; ok || string(caller["deletable"]) != "true" {
		t.Errorf("the caller: deletable = %s, deleteBlockedBy present %v; want true and absent", caller["deletable"], ok)
	}
}
