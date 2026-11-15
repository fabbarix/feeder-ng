package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// B9-27 (SAFE-05, RX-07): the detail says `deletable`, the list says `stepCount`.

type plannedIDs map[int64]bool

func (p plannedIDs) WasPlanned(_ context.Context, _ store.Querier, id int64) (bool, error) {
	return p[id], nil
}

// detail returns the raw JSON object of GET /api/recipes/{id}.
func (f *lcFixture) detail(t *testing.T, name string) map[string]json.RawMessage {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/recipes/x", nil)
	req.SetPathValue("id", strconv.FormatInt(f.ids[name], 10))
	rec := httptest.NewRecorder()
	f.a.get(rec, req)
	var out map[string]json.RawMessage
	if rec.Code != http.StatusOK || json.Unmarshal(rec.Body.Bytes(), &out) != nil {
		t.Fatalf("GET %s: %d %s", name, rec.Code, rec.Body)
	}
	return out
}

func TestDetailSaysDeletableForARecipeNeverPlanned(t *testing.T) {
	f := newLC(t, []string{"Borscht", "Chilli"}, nil)
	got, ok := f.detail(t, "Borscht")["deletable"]
	if !ok || string(got) != "true" {
		t.Errorf("deletable = %q (present %v), want true", got, ok)
	}
}

func TestDetailSaysNotDeletableForARecipeThatWasPlanned(t *testing.T) {
	f := newLC(t, []string{"Borscht", "Chilli"}, nil)
	store.RegisterPlannedChecker("httpapi deletable test", plannedIDs{f.ids["Chilli"]: true})
	t.Cleanup(func() { store.DefaultPlannedCheckers.Unregister("httpapi deletable test") })
	if got := f.detail(t, "Chilli")["deletable"]; string(got) != "false" {
		t.Errorf("planned Recipe: deletable = %q, want false", got)
	}
	if got := f.detail(t, "Borscht")["deletable"]; string(got) != "true" {
		t.Errorf("the other Recipe: deletable = %q, want true (the flag is per Recipe)", got)
	}
}

func TestListRowsCarryAStepCountAsANumber(t *testing.T) {
	f := newLC(t, []string{"Borscht"}, nil)
	_, _, body := f.list(t, "")
	var raw []map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatal(err)
	}
	if v, ok := raw[0]["stepCount"]; !ok || string(v) != "0" {
		t.Errorf("stepCount = %q (present %v), want the key with 0 for a Recipe without Steps", v, ok)
	}
}

func TestDetailSaysAPlannedRecipeIsBlockedBecauseItWasPlanned(t *testing.T) {
	f := newLC(t, []string{"Borscht", "Chilli"}, nil)
	store.RegisterPlannedChecker("httpapi blocked test", plannedIDs{f.ids["Chilli"]: true})
	t.Cleanup(func() { store.DefaultPlannedCheckers.Unregister("httpapi blocked test") })
	if got := f.detail(t, "Chilli")["deleteBlockedBy"]; string(got) != `"planned"` {
		t.Errorf("planned Recipe: deleteBlockedBy = %s, want \"planned\"", got)
	}
	if got, ok := f.detail(t, "Borscht")["deleteBlockedBy"]; ok {
		t.Errorf("a deletable Recipe: deleteBlockedBy = %s, want the key absent", got)
	}
}
