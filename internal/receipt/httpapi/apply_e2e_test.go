package httpapi_test

// The receipt read and the apply together, in the whole app (testkit) with the fake Anthropic server: the read's
// fingerprint and rows are the ones the apply recomputes (one session loader), and the apply finds the read the read
// routes made (design §7.1, §7.2).

import (
	"strconv"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

type applyResult struct {
	Applied int `json:"applied"`
	Results []struct {
		ClientUUID string `json:"clientUuid"`
		Status     string `json:"status"`
		Scan       struct {
			PriceCents *int `json:"priceCents"`
		} `json:"scan"`
	} `json:"results"`
}

func (w *world) latestPrice(t *testing.T, product int64) int {
	t.Helper()
	var p struct {
		PriceCents *int `json:"priceCents"`
	}
	mustStatus(t, w.user.Get("/api/products/"+strconv.FormatInt(product, 10)+"/prices/latest?shop="+strconv.FormatInt(w.shop, 10)), 200).MustJSON(t, &p)
	if p.PriceCents == nil {
		return -1
	}
	return *p.PriceCents
}

// checkedIDs are the ids of the proposals the review checks by default (Prices, Weights, Quantities).
func checkedIDs(v readView) []obj {
	var out []obj
	for _, p := range v.Proposals {
		if p.Checked {
			out = append(out, obj{"id": p.ID})
		}
	}
	return out
}

func applyBody(id string, v readView, uuids []string, accept []obj) obj {
	return obj{"readId": id, "fingerprint": v.Fingerprint, "clientUuids": uuids, "accept": accept, "adds": []any{}}
}

func applyRead(t *testing.T, c *testkit.Client, body obj) *testkit.Response {
	t.Helper()
	return c.Post("/api/scan/receipt/apply", body)
}

func TestAReadIsAppliedOnceAndItsPricesAreUpdated(t *testing.T) {
	w := start(t)
	uuids := w.session(t) // passata 2 × 7771, spaghetti 1 × 119
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	id := startRead(t, w.user, w.body(w.shop, uuids))
	v := poll(t, w.user, id)
	if v.Status != "done" {
		t.Fatalf("read = %+v", v)
	}
	accept := checkedIDs(v)
	found := false
	for _, a := range accept {
		found = found || a["id"] == "price:0"
	}
	if !found {
		t.Fatalf("the passata's Price (149, scanned 7771) must be a checked proposal: %+v", v.Proposals)
	}

	var out applyResult
	mustStatus(t, applyRead(t, w.user, applyBody(id, v, uuids, accept)), 200).MustJSON(t, &out)
	if out.Applied != len(accept) {
		t.Errorf("applied = %d, want %d", out.Applied, len(accept))
	}
	priced := map[string]int{}
	for _, r := range out.Results {
		if r.Scan.PriceCents != nil {
			priced[r.ClientUUID] = *r.Scan.PriceCents
		}
	}
	if priced["s1"] != 149 || priced["s2"] != 149 {
		t.Errorf("results = %+v, want s1 and s2 re-priced at 149", out.Results)
	}
	if got := w.latestPrice(t, w.mutti); got != 149 {
		t.Errorf("the passata's latest Price = %d, want 149", got)
	}
	if got := w.latestPrice(t, w.barilla); got != 119 {
		t.Errorf("the spaghetti's latest Price = %d, want 119 (unchanged)", got)
	}

	// The session changed with the apply (its Prices), so the same read cannot be applied twice.
	r := applyRead(t, w.user, applyBody(id, v, uuids, accept))
	if r.Status != 409 || r.ErrorCode() != "receipt_session_changed" {
		t.Errorf("second apply = %d %s, want 409 receipt_session_changed", r.Status, r.Body)
	}
	if got := w.latestPrice(t, w.mutti); got != 149 {
		t.Errorf("after the refused apply the Price = %d, want 149", got)
	}
}

func TestAScanBetweenTheReadAndTheApplyIsSessionChanged(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	id := startRead(t, w.user, w.body(w.shop, uuids))
	v := poll(t, w.user, id)
	if v.Status != "done" {
		t.Fatalf("read = %+v", v)
	}
	w.scan(t, w.user, "s4", w.shop, w.barilla, 500, 119)
	r := applyRead(t, w.user, applyBody(id, v, append(uuids, "s4"), checkedIDs(v)))
	if r.Status != 409 || r.ErrorCode() != "receipt_session_changed" {
		t.Fatalf("apply = %d %s, want 409 receipt_session_changed", r.Status, r.Body)
	}
	if got := w.latestPrice(t, w.mutti); got != 7771 {
		t.Errorf("nothing is written: the passata's Price = %d, want 7771", got)
	}
}

func TestTheApplyFindsOnlyTheCallersDoneRead(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	id := startRead(t, w.user, w.body(w.shop, uuids))
	v := poll(t, w.user, id)
	if r := applyRead(t, w.admin, applyBody(id, v, uuids, checkedIDs(v))); r.Status != 410 || r.ErrorCode() != "receipt_read_gone" {
		t.Errorf("another User's read = %d %s, want 410 receipt_read_gone", r.Status, r.Body)
	}
	if r := applyRead(t, w.user, applyBody("no-such-read", v, uuids, nil)); r.Status != 410 || r.ErrorCode() != "receipt_read_gone" {
		t.Errorf("unknown read = %d %s, want 410 receipt_read_gone", r.Status, r.Body)
	}
	w.env.Clock.Advance(10*time.Minute + time.Second)
	if r := applyRead(t, w.user, applyBody(id, v, uuids, checkedIDs(v))); r.Status != 410 || r.ErrorCode() != "receipt_read_gone" {
		t.Errorf("a read past 10 minutes = %d %s, want 410 receipt_read_gone", r.Status, r.Body)
	}
}

func TestTheApplyOfARunningReadIsNotDone(t *testing.T) {
	w := start(t)
	uuids := []string{"slow1"}
	w.scan(t, w.user, "slow1", w.shop, w.slowProduct(t), 100, 99) // the fake holds this read 10 s
	id := startRead(t, w.user, w.body(w.shop, uuids))
	r := applyRead(t, w.user, obj{"readId": id, "clientUuids": uuids, "accept": []obj{}, "adds": []any{}})
	if r.Status != 409 || r.ErrorCode() != "receipt_read_not_done" {
		t.Errorf("apply of a running read = %d %s, want 409 receipt_read_not_done", r.Status, r.Body)
	}
	mustStatus(t, w.user.Delete("/api/scan/receipt/reads/"+id), 204)
}

func TestTheApplyWhileTheAssistantIsOffIsUnavailable(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	id := startRead(t, w.user, w.body(w.shop, uuids))
	v := poll(t, w.user, id)
	mustStatus(t, w.admin.Put("/api/recipe-assistant/settings", obj{"enabled": false, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5"}), 200)
	if r := applyRead(t, w.user, applyBody(id, v, uuids, checkedIDs(v))); r.Status != 409 || r.ErrorCode() != "assistant_unavailable" {
		t.Errorf("apply with the assistant off = %d %s, want 409 assistant_unavailable", r.Status, r.Body)
	}
}
