package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/receipt"
	rhttp "github.com/fabbarix/feeder-ng/internal/receipt/httpapi"
	scanhttpapi "github.com/fabbarix/feeder-ng/internal/scan/httpapi"
)

// RR3 (docs/design/receipt-reading.md §7.2, §8). Apply, over HTTP, on the real app and SQLite.
//
//	POST /api/scan/receipt/apply   (r.User)
//	  {"readId":"r1", "fingerprint":"<optional>", "clientUuids":["a","b"], "accept":[{"id":"price:0"}],
//	   "adds":[{"id":"add:1","ingredient":{"id":7}|{"name":"dish soap","baseUnit":"piece","kind":"supply"},
//	            "productName":"Fairy soap","packSize":1,"scope":"global"}]}
//	  200 {"applied":<number of accepted proposals>, "results":[<scan Result>...]}   the Results of the scans the plan
//	      created or re-priced, once each (the phone rebuilds its session from them)
//	  409 receipt_session_changed   the fingerprint of the events of the CURRENT clientUuids (this Shop, applied, not
//	      undone) differs from the read's (or from the body's fingerprint when it is sent), or the read's Shop is not the
//	      Shop of those events (Change Shop), or the read's day is not today (a new day): nothing written
//	  410 receipt_read_gone         the read is unknown, expired, or another User's (rhttp.ErrReadGone)
//	  409 receipt_read_not_done      the read is still running or failed (rhttp.ErrReadNotDone)
//	  409 assistant_unavailable      the lookup says the assistant is off (*rhttp.UnavailableError{Reason})
//	  422 unknown_proposal | add_incomplete   {"error":{"code","message","id":"<proposal id>"}}  nothing written
//	  500 receipt_apply_failed       a step failed; every step before it was put back
//
// The seams RR2 provides (apply.go registers the route itself, in init()):
//
//	type ReadLookup interface { Lookup(ctx, userID int64, readID string) (ApplyRead, error) }
//	type ApplyRead struct { ID string; ShopID int64; Fingerprint string; Rows []receipt.Row; Ctx receipt.Context; Proposals []receipt.Proposal }
//	func SetReadLookup(db *sql.DB, l ReadLookup)   // RR2's mount calls SetReadLookup(d.DB, ...); tests call it with env.DB
//
// and the scan side (internal/scan/httpapi/receipt.go): scanhttpapi.NewReceiptApplier(d) shares the scan module's one
// *service.Service (so one lock) and has SessionEvents(ctx, shopID, uuids), the loader of the read and the apply, and
// Service(); scanhttpapi.ServiceFor(d) returns that one service (one per d.DB), which the scan routes' mount uses too.

type lookup struct {
	reads map[string]rhttp.ApplyRead
	err   error
}

func (l *lookup) Lookup(_ context.Context, _ int64, id string) (rhttp.ApplyRead, error) {
	if l.err != nil {
		return rhttp.ApplyRead{}, l.err
	}
	r, ok := l.reads[id]
	if !ok {
		return rhttp.ApplyRead{}, rhttp.ErrReadGone
	}
	return r, nil
}

type receiptFixture struct {
	pricesFixture
	lk *lookup
	ap *scanhttpapi.ReceiptApplier
}

func newReceiptFixture(t *testing.T) receiptFixture {
	t.Helper()
	f := newPricesFixture(t)
	lk := &lookup{reads: map[string]rhttp.ApplyRead{}}
	rhttp.SetReadLookup(f.env.DB, lk)
	return receiptFixture{pricesFixture: f, lk: lk, ap: scanhttpapi.NewReceiptApplier(f.env.App.Deps)}
}

func intp(n int) *int { return &n }

// session scans the Mutti passata twice at Coop (129 each) as "a" and "b" and returns the uuids.
func (f receiptFixture) session(t *testing.T) []string {
	t.Helper()
	for _, u := range []string{"a", "b"} {
		f.scan(t, u, func(op map[string]any) { op["priceCents"] = 129 })
	}
	return []string{"a", "b"}
}

// read seeds the read "r1" for the session: the rows and the proposals come from RR1 on the lines given.
func (f receiptFixture) read(t *testing.T, uuids []string, lines ...receipt.Line) rhttp.ApplyRead {
	t.Helper()
	events, err := f.ap.SessionEvents(context.Background(), f.shop, uuids)
	if err != nil || len(events) != len(uuids) {
		t.Fatalf("session events = %d, %v", len(events), err)
	}
	rows := receipt.GroupRows(events)
	ctx := receipt.Context{Today: "2026-11-09", SessionShop: receipt.Shop{ID: f.shop, Name: "Coop"}, SessionDate: "2026-11-09",
		Shops: []receipt.Shop{{ID: f.shop, Name: "Coop"}, {ID: f.shop2, Name: "Esselunga"}}, Currency: "EUR", MinorDigits: 2}
	res := receipt.Propose(rows, receipt.Answer{Lines: lines}, ctx)
	r := rhttp.ApplyRead{ID: "r1", ShopID: f.shop, Fingerprint: receipt.Fingerprint(events), Rows: rows, Ctx: ctx, Proposals: res.Proposals}
	f.lk.reads["r1"] = r
	return r
}

func priceLine(cents int) receipt.Line {
	return receipt.Line{Row: 0, Text: "MUTTI PASSATA", Count: 2, PriceCents: intp(cents)}
}

func addLine(name string, cents int) receipt.Line {
	return receipt.Line{Row: -1, Text: name, Count: 1, PriceCents: intp(cents), Name: name, PackSize: 1, PackUnit: "piece"}
}

func (r receiptFixture) addIDs(read rhttp.ApplyRead) []string {
	var out []string
	for _, p := range read.Proposals {
		if p.Kind == receipt.KindAdd {
			out = append(out, p.ID)
		}
	}
	return out
}

func (f receiptFixture) apply(body map[string]any) *struct {
	Status int
	Code   string
	Body   []byte
} {
	r := f.user.Post("/api/scan/receipt/apply", body)
	return &struct {
		Status int
		Code   string
		Body   []byte
	}{r.Status, r.ErrorCode(), r.Body}
}

func accept(ids ...string) []map[string]string {
	out := make([]map[string]string, 0, len(ids))
	for _, id := range ids {
		out = append(out, map[string]string{"id": id})
	}
	return out
}

func body(uuids []string, ids ...string) map[string]any {
	return map[string]any{"readId": "r1", "clientUuids": uuids, "accept": accept(ids...), "adds": []any{}}
}

type applied struct {
	Applied int `json:"applied"`
	Results []struct {
		ClientUUID string `json:"clientUuid"`
		Status     string `json:"status"`
		Scan       struct {
			ProductName    string `json:"productName"`
			IngredientKind string `json:"ingredientKind"`
			PriceCents     *int   `json:"priceCents"`
		} `json:"scan"`
	} `json:"results"`
}

func (f receiptFixture) lots(t *testing.T) int {
	t.Helper()
	var l struct {
		Lots []struct{} `json:"lots"`
	}
	f.user.Get("/api/stock/lots").MustJSON(t, &l)
	return len(l.Lots)
}

type productRow struct {
	ID       int64   `json:"id"`
	Name     string  `json:"name"`
	PackSize float64 `json:"packSize"`
}

func (f receiptFixture) products(t *testing.T) []productRow {
	t.Helper()
	var l []productRow
	f.user.Get("/api/products").MustJSON(t, &l)
	return l
}

func (f receiptFixture) named(t *testing.T, name string) []productRow {
	var out []productRow
	for _, p := range f.products(t) {
		if p.Name == name {
			out = append(out, p)
		}
	}
	return out
}

func TestTheReceiptApplyRouteRequiresSignIn(t *testing.T) {
	f := newReceiptFixture(t)
	if r := f.env.Anonymous().Post("/api/scan/receipt/apply", map[string]any{}); r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
		t.Fatalf("anonymous = %d %s", r.Status, r.Body)
	}
}

func TestAcceptedPricesAreAppliedAndTheResultsAreReturned(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, priceLine(270)) // 135 per pack
	r := f.apply(body(uuids, "price:0"))
	if r.Status != 200 {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
	var out applied
	if err := jsonInto(r.Body, &out); err != nil {
		t.Fatal(err)
	}
	if out.Applied != 1 || len(out.Results) != 2 {
		t.Fatalf("response = %s", r.Body)
	}
	for _, res := range out.Results {
		if (res.ClientUUID != "a" && res.ClientUUID != "b") || res.Status != "applied" || res.Scan.PriceCents == nil || *res.Scan.PriceCents != 135 {
			t.Errorf("result = %+v", res)
		}
	}
	if got := f.latest(t, f.product, f.shop); got.PriceCents == nil || *got.PriceCents != 135 {
		t.Errorf("latest Price = %+v", got)
	}
	if f.spent(t) != 270 {
		t.Errorf("spent = %d, want 270", f.spent(t))
	}
}

func TestNothingAcceptedWritesNothing(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, priceLine(270))
	r := f.apply(body(uuids))
	if r.Status != 200 || f.spent(t) != 258 {
		t.Fatalf("apply = %d %s, spent %d", r.Status, r.Body, f.spent(t))
	}
}

// ---- the session fingerprint --------------------------------------------------------------------------------------

func TestAScanSinceTheReadIs409AndWritesNothing(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, priceLine(270))
	f.scan(t, "c", func(op map[string]any) { op["priceCents"] = 129 })
	r := f.apply(body(append(uuids, "c"), "price:0"))
	if r.Status != 409 || r.Code != "receipt_session_changed" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
	if f.spent(t) != 387 {
		t.Errorf("spent = %d: a refused apply wrote Prices", f.spent(t))
	}
}

func TestAnUndoSincetheReadIs409(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, priceLine(270))
	if r := f.user.Post("/api/scan/b/undo", nil); r.Status != 200 {
		t.Fatalf("undo = %d", r.Status)
	}
	r := f.apply(body([]string{"a"}, "price:0")) // the phone's session no longer holds b
	if r.Status != 409 || r.Code != "receipt_session_changed" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
}

func TestAPriceEditSinceTheReadIs409(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, priceLine(270))
	if r := f.user.Patch("/api/scan/prices", map[string]any{"clientUuids": uuids, "priceCents": 140}); r.Status != 200 {
		t.Fatalf("edit = %d", r.Status)
	}
	if r := f.apply(body(uuids, "price:0")); r.Status != 409 || r.Code != "receipt_session_changed" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
	if f.spent(t) != 280 {
		t.Errorf("spent = %d", f.spent(t))
	}
}

func TestApplyingTwiceIsRefusedTheSecondTime(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, priceLine(270))
	if r := f.apply(body(uuids, "price:0")); r.Status != 200 {
		t.Fatalf("first apply = %d %s", r.Status, r.Body)
	}
	if r := f.apply(body(uuids, "price:0")); r.Status != 409 || r.Code != "receipt_session_changed" {
		t.Fatalf("second apply = %d %s (the Prices changed the fingerprint)", r.Status, r.Body)
	}
	if f.spent(t) != 270 {
		t.Errorf("spent = %d", f.spent(t))
	}
}

func TestAFingerprintInTheBodyThatIsNotTheReadsIs409(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, priceLine(270))
	b := body(uuids, "price:0")
	b["fingerprint"] = "0000"
	if r := f.apply(b); r.Status != 409 || r.Code != "receipt_session_changed" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
}

func TestChangeShopIs409(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, priceLine(270))
	// the phone pressed Change Shop: its session is empty, or it is another Shop's scans
	if r := f.apply(body([]string{}, "price:0")); r.Status != 409 || r.Code != "receipt_session_changed" {
		t.Fatalf("empty session: %d %s", r.Status, r.Body)
	}
	f.scan(t, "x1", func(op map[string]any) { op["shopId"] = f.shop2; op["priceCents"] = 129 })
	f.scan(t, "x2", func(op map[string]any) { op["shopId"] = f.shop2; op["priceCents"] = 129 })
	if r := f.apply(body([]string{"x1", "x2"}, "price:0")); r.Status != 409 || r.Code != "receipt_session_changed" {
		t.Fatalf("another Shop's scans: %d %s", r.Status, r.Body)
	}
	if f.spent(t) != 516 {
		t.Errorf("spent = %d, nothing was to be written", f.spent(t))
	}
}

func TestANewDayIs409(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, priceLine(270))
	f.env.Clock.Advance(26 * time.Hour)
	if r := f.apply(body(uuids, "price:0")); r.Status != 409 || r.Code != "receipt_session_changed" {
		t.Fatalf("apply on the next day = %d %s", r.Status, r.Body)
	}
}

// ---- the read ---------------------------------------------------------------------------------------------------

func TestAnUnknownOrExpiredReadIs410(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	b := body(uuids, "price:0")
	b["readId"] = "no-such-read"
	if r := f.apply(b); r.Status != 410 || r.Code != "receipt_read_gone" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
	f.read(t, uuids, priceLine(270))
	f.lk.err = rhttp.ErrReadGone // expired, or another User's
	if r := f.apply(body(uuids, "price:0")); r.Status != 410 || r.Code != "receipt_read_gone" {
		t.Fatalf("expired = %d %s", r.Status, r.Body)
	}
}

func TestAReadThatIsNotDoneIs409(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.lk.err = rhttp.ErrReadNotDone
	if r := f.apply(body(uuids, "price:0")); r.Status != 409 || r.Code != "receipt_read_not_done" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
}

func TestAnUnavailableAssistantIs409WithItsReason(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.lk.err = &rhttp.UnavailableError{Reason: "off"}
	r := f.apply(body(uuids, "price:0"))
	if r.Status != 409 || r.Code != "assistant_unavailable" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
}

// ---- plan errors ------------------------------------------------------------------------------------------------

func TestAnAcceptedIdThatIsNotAProposalIs422WithItsId(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, priceLine(270))
	r := f.apply(body(uuids, "price:0", "price:9"))
	if r.Status != 422 || r.Code != "unknown_proposal" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
	var e struct {
		Error struct {
			ID string `json:"id"`
		} `json:"error"`
	}
	if err := jsonInto(r.Body, &e); err != nil || e.Error.ID != "price:9" {
		t.Errorf("error = %s (%v)", r.Body, err)
	}
	if f.spent(t) != 258 {
		t.Errorf("a refused plan wrote Prices: spent %d", f.spent(t))
	}
}

func TestAnAddWithoutItsChoicesIs422WithTheProposalId(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	read := f.read(t, uuids, priceLine(270), addLine("Fairy soap", 299))
	id := f.addIDs(read)[0]
	r := f.apply(body(uuids, "price:0", id)) // no adds[]
	if r.Status != 422 || r.Code != "add_incomplete" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
	if f.spent(t) != 258 {
		t.Errorf("spent = %d", f.spent(t))
	}
}

// ---- the Adds ---------------------------------------------------------------------------------------------------

func TestAnAddedSupplyCreatesTheIngredientAsASupplyTheProductAndTheScan(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	read := f.read(t, uuids, addLine("Fairy soap", 299))
	id := f.addIDs(read)[0]
	b := body(uuids, id)
	b["adds"] = []any{map[string]any{"id": id, "ingredient": map[string]any{"name": "dish soap", "baseUnit": "piece", "kind": "supply"},
		"productName": "Fairy soap", "packSize": 1, "scope": "global"}}
	r := f.apply(b)
	if r.Status != 200 {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
	var out applied
	if err := jsonInto(r.Body, &out); err != nil || out.Applied != 1 || len(out.Results) != 1 {
		t.Fatalf("response = %s (%v)", r.Body, err)
	}
	res := out.Results[0]
	if res.ClientUUID != "receipt:r1:0" || res.Status != "applied" || res.Scan.ProductName != "Fairy soap" || res.Scan.IngredientKind != "supply" ||
		res.Scan.PriceCents == nil || *res.Scan.PriceCents != 299 {
		t.Errorf("result = %+v", res)
	}
	var ings []struct{ Name, Kind string }
	f.user.Get("/api/ingredients").MustJSON(t, &ings)
	found := false
	for _, i := range ings {
		found = found || (i.Name == "dish soap" && i.Kind == "supply")
	}
	if !found {
		t.Errorf("the Ingredient was not created as a Supply: %+v", ings)
	}
	if len(f.named(t, "Fairy soap")) != 1 || f.lots(t) != 3 {
		t.Errorf("Products %v, Lots %d (2 scans + the Add)", f.named(t, "Fairy soap"), f.lots(t))
	}
}

func TestAnAddOfAFoodWithoutAKindIsAFood(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	read := f.read(t, uuids, addLine("Pane", 225))
	id := f.addIDs(read)[0]
	b := body(uuids, id)
	b["adds"] = []any{map[string]any{"id": id, "ingredient": map[string]any{"name": "bread", "baseUnit": "g"}, "productName": "Pane casereccio", "packSize": 450}}
	var out applied
	if r := f.apply(b); r.Status != 200 || jsonInto(r.Body, &out) != nil || out.Results[0].Scan.IngredientKind != "food" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
}

func TestRetryingAnApplyOfAnAddDoesNotDoubleIt(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	read := f.read(t, uuids, addLine("Fairy soap", 299))
	id := f.addIDs(read)[0]
	b := body(uuids, id)
	b["adds"] = []any{map[string]any{"id": id, "ingredient": map[string]any{"name": "dish soap", "baseUnit": "piece", "kind": "supply"},
		"productName": "Fairy soap", "packSize": 1}}
	if r := f.apply(b); r.Status != 200 {
		t.Fatalf("first apply = %d %s", r.Status, r.Body)
	}
	// the response was lost: the phone sends the same body (its clientUuids did not change, so the fingerprint holds)
	r := f.apply(b)
	if r.Status != 200 {
		t.Fatalf("retry = %d %s", r.Status, r.Body)
	}
	var out applied
	if err := jsonInto(r.Body, &out); err != nil || len(out.Results) != 1 || out.Results[0].Status != "duplicate" {
		t.Errorf("retry response = %s (%v)", r.Body, err)
	}
	if len(f.named(t, "Fairy soap")) != 1 || f.lots(t) != 3 {
		t.Errorf("a retry doubled it: Products %v, Lots %d", f.named(t, "Fairy soap"), f.lots(t))
	}
}

// ---- the Product port ------------------------------------------------------------------------------------------

func TestANameCorrectionUpdatesTheProduct(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, receipt.Line{Row: 0, Text: "PASSATA", Count: 2, PriceCents: intp(258), Name: "Passata di pomodoro Mutti"})
	r := f.apply(body(uuids, "name:0"))
	if r.Status != 200 {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
	if len(f.named(t, "Passata di pomodoro Mutti")) != 1 || len(f.named(t, "Mutti passata 700 g")) != 0 {
		t.Errorf("Products = %+v", f.products(t))
	}
}

func TestAPackSizeCorrectionUpdatesTheProductAndScansAgain(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	f.read(t, uuids, receipt.Line{Row: 0, Text: "PASSATA", Count: 2, PriceCents: intp(258), PackSize: 690, PackUnit: "g"})
	r := f.apply(body(uuids, "pack_size:0"))
	if r.Status != 200 {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
	var got productRow
	f.user.Get("/api/products/"+strconv.FormatInt(f.product, 10)).MustJSON(t, &got)
	if got.PackSize != 690 {
		t.Errorf("pack size = %v, want 690", got.PackSize)
	}
	var out applied
	if err := jsonInto(r.Body, &out); err != nil || len(out.Results) != 2 || out.Results[0].ClientUUID == "a" {
		t.Errorf("the two scans were scanned again at the new size: %s (%v)", r.Body, err)
	}
	if f.lots(t) != 2 {
		t.Errorf("Lots = %d, want 2 (the old ones were undone)", f.lots(t))
	}
}

// ---- compensation, end to end ---------------------------------------------------------------------------------------------

func TestAFailureHalfWayPutsBackThePricesAndTheProductAndAnswers500(t *testing.T) {
	f := newReceiptFixture(t)
	uuids := f.session(t)
	read := f.read(t, uuids, priceLine(270), addLine("Fairy soap", 299), addLine("Pasta", 100))
	ids := f.addIDs(read)
	if len(ids) != 2 {
		t.Fatalf("adds = %v", ids)
	}
	b := body(uuids, "price:0", ids[0], ids[1])
	b["adds"] = []any{
		map[string]any{"id": ids[0], "ingredient": map[string]any{"name": "dish soap", "baseUnit": "piece", "kind": "supply"}, "productName": "Fairy soap", "packSize": 1},
		map[string]any{"id": ids[1], "ingredient": map[string]any{"id": 999999}, "productName": "Pasta", "packSize": 500}, // no such Ingredient
	}
	r := f.apply(b)
	if r.Status != 500 || r.Code != "receipt_apply_failed" {
		t.Fatalf("apply = %d %s", r.Status, r.Body)
	}
	if f.spent(t) != 258 || f.lots(t) != 2 || len(f.named(t, "Fairy soap")) != 0 || len(f.named(t, "Pasta")) != 0 {
		t.Errorf("not put back: spent %d, Lots %d, Products %+v", f.spent(t), f.lots(t), f.products(t))
	}
	if got := f.latest(t, f.product, f.shop); got.PriceCents == nil || *got.PriceCents != 129 {
		t.Errorf("latest Price = %+v, want 129 again", got)
	}
	// the phone can try again after the fault is gone: the session is as it was, so the fingerprint still holds
	if r := f.apply(body(uuids, "price:0")); r.Status != 200 {
		t.Errorf("retry without the bad Add = %d %s", r.Status, r.Body)
	}
}

func TestTheApplyUsesTheScanLockWithTheOtherScanRoutes(t *testing.T) {
	f := newReceiptFixture(t)
	if f.ap.Service() != scanhttpapi.ServiceFor(f.env.App.Deps) || scanhttpapi.ServiceFor(f.env.App.Deps) != scanhttpapi.ServiceFor(f.env.App.Deps) {
		t.Error("the receipt apply must use the scan module's own *service.Service: one mutex for every scan write")
	}
}

func jsonInto(b []byte, v any) error { return json.Unmarshal(b, v) }

// ---- the review's additions (RR3 review) --------------------------------------------------------------------------

// A phone cannot send a scan under a "receipt:" uuid: only the receipt Apply writes those.
func TestAScanWithAReceiptUUIDIsRejected(t *testing.T) {
	f := newReceiptFixture(t)
	r := f.user.Post("/api/scan", f.op("receipt:r1:0"))
	var res struct {
		Status string `json:"status"`
		Error  struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := jsonInto(r.Body, &res); err != nil || r.Status != 422 || res.Status != "rejected" || res.Error.Code != "validation_failed" {
		t.Fatalf("scan = %d %s", r.Status, r.Body)
	}
	if f.lots(t) != 0 {
		t.Errorf("Lots = %d: the rejected scan wrote", f.lots(t))
	}
}
