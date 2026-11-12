package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Team TG-R (docs/dev/design/tg-plan.md §3.1a): a new Slot Rule or Variety Rule must name a Tag that exists. The
// check is the api's TagExists dependency, here a stub. A refusal comes before the runner is touched, so these
// handlers run on an api with no runner.

type tagStub struct {
	known map[string]bool
	err   error
	calls []string
}

func (s *tagStub) exists(_ context.Context, key string) (bool, error) {
	s.calls = append(s.calls, key)
	return s.known[key], s.err
}

func tagRefusal(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422; body: %s", rec.Code, rec.Body)
	}
	var out struct {
		Error map[string]any `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("body: %v", err)
	}
	return out.Error
}

func TestAddSlotRuleRefusesAnUnknownTag(t *testing.T) {
	stub := &tagStub{known: map[string]bool{"pizza": true}}
	a := &api{tagExists: stub.exists}
	rec := httptest.NewRecorder()
	a.addSlotRule(rec, httptest.NewRequest("POST", "/api/slot-rules", strings.NewReader(`{"mealSlotId":1,"tag":"Dessert "}`)))

	e := tagRefusal(t, rec)
	if e["code"] != "tag_unknown" || e["field"] != "tag" {
		t.Fatalf("error = %v, want code tag_unknown, field tag", e)
	}
	if len(stub.calls) != 1 || stub.calls[0] != "dessert" {
		t.Fatalf("TagExists called with %v, want the key [dessert]", stub.calls)
	}
}

func TestSetVarietyRuleRefusesAnUnknownTag(t *testing.T) {
	stub := &tagStub{known: map[string]bool{}}
	a := &api{tagExists: stub.exists}
	req := httptest.NewRequest("PUT", "/api/variety-rules/Dessert", strings.NewReader(`{"maxPerWeek":1}`))
	req.SetPathValue("tag", "Dessert")
	rec := httptest.NewRecorder()
	a.setVarietyRule(rec, req)

	e := tagRefusal(t, rec)
	if e["code"] != "tag_unknown" || e["field"] != "tag" {
		t.Fatalf("error = %v, want code tag_unknown, field tag", e)
	}
	if len(stub.calls) != 1 || stub.calls[0] != "dessert" {
		t.Fatalf("TagExists called with %v, want the key [dessert]", stub.calls)
	}
}

func TestRequireTagAcceptsAKnownTagAndSkipsTheLookupForARecipeRule(t *testing.T) {
	stub := &tagStub{known: map[string]bool{"pizza": true}}
	a := &api{tagExists: stub.exists}

	if err := a.requireTag(context.Background(), "pizza"); err != nil {
		t.Fatalf("known Tag refused: %v", err)
	}
	if len(stub.calls) != 1 {
		t.Fatalf("TagExists calls = %v, want one", stub.calls)
	}
	stub.calls = nil
	if err := a.requireTag(context.Background(), ""); err != nil {
		t.Fatalf("a rule with no Tag refused: %v", err)
	}
	if len(stub.calls) != 0 {
		t.Fatalf("a Recipe rule called TagExists with %v", stub.calls)
	}
}

func TestRequireTagReportsALookupFailureAsIs(t *testing.T) {
	boom := errors.New("db down")
	a := &api{tagExists: (&tagStub{err: boom}).exists}
	err := a.requireTag(context.Background(), "pizza")
	if !errors.Is(err, boom) || errors.Is(err, errTagUnknown) {
		t.Fatalf("err = %v, want the lookup error, not tag_unknown", err)
	}
}
