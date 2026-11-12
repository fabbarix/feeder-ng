package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B5-SD round 2 (PM decision): a Guests-only save counts as non-empty and serves a Not served date again.

func TestSavingGuestsOnlyServesANotServedDateAgain(t *testing.T) {
	w := crsc2.New(t)
	w.User.Patch(sdURL(w, sdToday), map[string]any{"notServed": true})
	if r := w.User.Put(whoURL(w, sdToday), map[string]any{"guests": 2}); r.Status != 200 {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	if d := sdGet(t, w, sdToday); d.NotServed || d.Guests != 2 {
		t.Errorf("date = %+v, want served with 2 Guests", d)
	}
}
