package httpapi_test

// RR2 (red): POST/GET/DELETE /api/scan/receipt/reads (docs/design/receipt-reading.md §7.1; the user's answers §13).
// These tests run the whole Feeder in process (testkit) with the fake Anthropic server: no network, no key.
//
// The API pinned here.
//
// POST /api/scan/receipt/reads (r.User; any signed-in Member, Admin or not). JSON body (the doc's shape; the receipt
// photos are data URLs in JSON, as for recipe photos, not multipart):
//
//	{"shopId": 3, "clientUuids": ["u1", "u2"], "photos": [{"dataUrl": "data:image/jpeg;base64,..."}]}   // 1 to 4 photos
//
//	202 {"id": "...", "status": "running"}
//	409 {"error": {"code": "assistant_unavailable", "message": "...", "reason": "off|no_key|no_secret_key|key_unreadable"}}
//	409 read_in_progress                  429 too_many_reads (+ "retryAfterSeconds")      (the Recipe Assistant's Limiter)
//	422 scans_empty                       none of the uuids is an applied, not undone scan of this Shop made today
//	422 photos_empty | too_many_photos | photo_too_large | photo_unsupported | photos_not_supported_by_model
//	400 bad_request (not JSON)    413 request_too_large (above 45 MiB)
//	Order: availability (409) and Limiter Check (409/429) come before the body is read; then body, photos, session.
//
// GET /api/scan/receipt/reads/{id} (404 not_found for an unknown id or another User's):
//
//	{"status":"running"}
//	{"status":"done","fingerprint":"<64 hex>","rows":[{"row","productId","product","barcode","baseUnit","packSize","scans",
//	   "quantity","weighed","priceCents","perKgCents"}],"proposals":[{"id","kind","row","line","text","checked","needsInput",
//	   "before":{...},"after":{"priceCents","perKg","grams","count","packSize","packUnit","name","date","shop","shopId"}}],
//	 "notes":[{"code","text","cents"}],"totals":{"scannedCents","projectedCents","receiptCents","lines"},
//	 "warnings":[{"code","line"}]}      // arrays are [] never null; optional value fields are omitted when unset
//	{"status":"failed","error":{"code","message","retryAfterSeconds"?}}      // a cancelled read: code "cancelled"
//
// DELETE /api/scan/receipt/reads/{id}: 204 for a running (or finished) job of the caller, 404 otherwise.

import (
	"bytes"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/receipt/receipttest"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

const (
	master  = "W1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1s="
	apiKey  = "sk-ant-api03-RECEIPTKEY-4242"
	day     = "2026-11-09" // testkit's fixed clock
	nameMut = "Qvx Mutti passata 700 g"
	nameBar = "Qvx Barilla spaghetti 500 g"
	barMut  = "8000500310427"
	barBar  = "8076800195057"
	secret  = "zq-ingredient-secret-name" // an Ingredient name: never sent (§4.1)
)

type obj = map[string]any

type world struct {
	env     *testkit.Env
	admin   *testkit.Client
	user    *testkit.Client
	fake    *fakeanthropic.Server
	shop    int64
	other   int64 // another saved Shop
	mutti   int64
	barilla int64
	logs    *syncBuf
	dataDir string
}

type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) { s.mu.Lock(); defer s.mu.Unlock(); return s.b.Write(p) }
func (s *syncBuf) String() string              { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

func mustStatus(t *testing.T, r *testkit.Response, want int) *testkit.Response {
	t.Helper()
	if r.Status != want {
		t.Fatalf("status = %d, want %d; body: %s", r.Status, want, r.Body)
	}
	return r
}

// start boots Feeder with the secret key, the fake Anthropic saved as the assistant (on), a Shop "Esselunga", a second
// Shop "Coop", and two Products. Logs go to w.logs (the app's default slog logger is replaced for the test).
func start(t *testing.T, fakeOpts ...fakeanthropic.Option) *world {
	t.Helper()
	logs := &syncBuf{}
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(prev) })

	mk, err := secretbox.ParseMasterKey(master)
	if err != nil {
		t.Fatal(err)
	}
	env := testkit.Start(t, testkit.WithConfig(func(c *config.Config) { c.SecretKey = mk }))
	f := fakeanthropic.New(fakeOpts...)
	t.Cleanup(f.Close)
	w := &world{env: env, admin: env.LoginAdmin(t), user: env.LoginUser(t), fake: f, logs: logs, dataDir: env.DataDir}
	mustStatus(t, w.admin.Put("/api/recipe-assistant/settings", obj{"enabled": true, "baseUrl": f.URL, "model": "claude-haiku-5-5", "apiKey": apiKey}), 200)

	res, err := env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
		VALUES (?, ?, 'g', NULL, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, secret, secret)
	if err != nil {
		t.Fatal(err)
	}
	ing, _ := res.LastInsertId()
	var id struct {
		ID int64 `json:"id"`
	}
	mustStatus(t, w.admin.Post("/api/shops", obj{"name": "Esselunga"}), 201).MustJSON(t, &id)
	w.shop = id.ID
	mustStatus(t, w.admin.Post("/api/shops", obj{"name": "Coop"}), 201).MustJSON(t, &id)
	w.other = id.ID
	mustStatus(t, w.user.Post("/api/products", obj{"name": nameMut, "ingredientId": ing, "packSize": 700, "barcodes": []string{barMut}}), 201).MustJSON(t, &id)
	w.mutti = id.ID
	mustStatus(t, w.user.Post("/api/products", obj{"name": nameBar, "ingredientId": ing, "packSize": 500, "barcodes": []string{barBar}}), 201).MustJSON(t, &id)
	w.barilla = id.ID
	return w
}

func (w *world) scan(t *testing.T, c *testkit.Client, uuid string, shop, product int64, qty float64, price int) {
	t.Helper()
	op := obj{"clientUuid": uuid, "scannedAt": day + "T12:00:00Z", "kind": "shop_scan", "shopId": shop, "productId": product,
		"quantity": qty, "priceCents": price, "rangeTo": "2026-11-15"}
	mustStatus(t, c.Post("/api/scan", op), 200)
}

// session scans passata twice at 7771 (a distinctive price) and spaghetti once at 119, in this Shop, today.
func (w *world) session(t *testing.T) []string {
	t.Helper()
	w.scan(t, w.user, "s1", w.shop, w.mutti, 700, 7771)
	w.scan(t, w.user, "s2", w.shop, w.mutti, 700, 7771)
	w.scan(t, w.user, "s3", w.shop, w.barilla, 500, 119)
	return []string{"s1", "s2", "s3"}
}

func okAnswer() string {
	return receipttest.Answer("Esselunga", day, 7800,
		receipttest.Line(map[string]any{"row": 0, "text": "QVX MUTTI PASSATA 2 x 149", "count": 2, "priceCents": 298, "unitPriceCents": 149}),
		receipttest.Line(map[string]any{"row": 1, "text": "QVX BARILLA SPAGHETTI", "count": 1, "priceCents": 119}))
}

func (w *world) body(shop int64, uuids []string, photos ...string) obj {
	if photos == nil {
		photos = []string{receipttest.JPEGDataURL(40, 60)}
	}
	ph := make([]obj, len(photos))
	for i, p := range photos {
		ph[i] = obj{"dataUrl": p}
	}
	return obj{"shopId": shop, "clientUuids": uuids, "photos": ph}
}

type readView struct {
	Status      string `json:"status"`
	Fingerprint string `json:"fingerprint"`
	Rows        []struct {
		Row        int     `json:"row"`
		ProductID  int64   `json:"productId"`
		Product    string  `json:"product"`
		Barcode    string  `json:"barcode"`
		BaseUnit   string  `json:"baseUnit"`
		PackSize   int     `json:"packSize"`
		Scans      int     `json:"scans"`
		Quantity   float64 `json:"quantity"`
		Weighed    bool    `json:"weighed"`
		PriceCents int     `json:"priceCents"`
		PerKgCents int     `json:"perKgCents"`
	} `json:"rows"`
	Proposals []struct {
		ID         string `json:"id"`
		Kind       string `json:"kind"`
		Row        int    `json:"row"`
		Checked    bool   `json:"checked"`
		NeedsInput bool   `json:"needsInput"`
		Before     struct {
			PriceCents *int `json:"priceCents"`
		} `json:"before"`
		After struct {
			PriceCents *int `json:"priceCents"`
		} `json:"after"`
	} `json:"proposals"`
	Notes []struct {
		Code string `json:"code"`
	} `json:"notes"`
	Totals *struct {
		ScannedCents   int  `json:"scannedCents"`
		ProjectedCents int  `json:"projectedCents"`
		ReceiptCents   *int `json:"receiptCents"`
		Lines          int  `json:"lines"`
	} `json:"totals"`
	Warnings []struct {
		Code string `json:"code"`
		Line int    `json:"line"`
	} `json:"warnings"`
	Error *struct {
		Code              string `json:"code"`
		Message           string `json:"message"`
		RetryAfterSeconds int    `json:"retryAfterSeconds"`
	} `json:"error"`
}

func (v readView) errCode() string {
	if v.Error == nil {
		return ""
	}
	return v.Error.Code
}

func post(t *testing.T, c *testkit.Client, body any, want int) *testkit.Response {
	t.Helper()
	return mustStatus(t, c.Post("/api/scan/receipt/reads", body), want)
}

func poll(t *testing.T, c *testkit.Client, id string) readView {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	var v readView
	for time.Now().Before(deadline) {
		r := mustStatus(t, c.Get("/api/scan/receipt/reads/"+id), 200)
		v = readView{}
		r.MustJSON(t, &v)
		if v.Status == "done" || v.Status == "failed" {
			return v
		}
		if v.Status != "running" {
			t.Fatalf("unexpected status %q", v.Status)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("read %s never finished: %+v", id, v)
	return v
}

func startRead(t *testing.T, c *testkit.Client, body any) string {
	t.Helper()
	var a struct{ ID, Status string }
	post(t, c, body, 202).MustJSON(t, &a)
	if a.ID == "" || a.Status != "running" {
		t.Fatalf("202 must carry {id, status:running}: %+v", a)
	}
	return a.ID
}

func read(t *testing.T, c *testkit.Client, body any) readView {
	t.Helper()
	return poll(t, c, startRead(t, c, body))
}

// ---- access ----------------------------------------------------------------------------------------------------

func TestReceiptReadRoutesNeedASignedInUser(t *testing.T) {
	w := start(t)
	anon := w.env.Anonymous()
	for _, rt := range []struct{ method, path string }{
		{"POST", "/api/scan/receipt/reads"}, {"GET", "/api/scan/receipt/reads/abc"}, {"DELETE", "/api/scan/receipt/reads/abc"},
	} {
		var body any
		if rt.method == "POST" {
			body = obj{}
		}
		if r := anon.Do(rt.method, rt.path, body); r.Status != 401 {
			t.Errorf("%s %s = %d, want 401", rt.method, rt.path, r.Status)
		}
	}
}

func TestAnyMemberMayReadAReceiptAndAnAdminToo(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()}, fakeanthropic.Reply{Text: okAnswer()})
	if v := read(t, w.user, w.body(w.shop, uuids)); v.Status != "done" {
		t.Errorf("a non-Admin Member's read = %+v", v)
	}
	if v := read(t, w.admin, w.body(w.shop, uuids)); v.Status != "done" {
		t.Errorf("an Admin's read = %+v", v)
	}
}

func TestOnlyTheStarterSeesOrCancelsAReadAndUnknownIdsAre404(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	id := startRead(t, w.user, w.body(w.shop, uuids))
	poll(t, w.user, id)
	mustStatus(t, w.admin.Get("/api/scan/receipt/reads/"+id), 404)
	mustStatus(t, w.admin.Delete("/api/scan/receipt/reads/"+id), 404)
	mustStatus(t, w.user.Get("/api/scan/receipt/reads/does-not-exist"), 404)
	mustStatus(t, w.user.Delete("/api/scan/receipt/reads/does-not-exist"), 404)
}

// ---- the happy path: what goes out, what comes back -------------------------------------------------------------

func TestADoneReadReturnsFingerprintRowsProposalsNotesTotalsAndWarnings(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	id := startRead(t, w.user, w.body(w.shop, uuids))
	v := poll(t, w.user, id)
	raw := string(w.user.Get("/api/scan/receipt/reads/" + id).Body)
	if v.Status != "done" || v.Error != nil {
		t.Fatalf("read = %+v", v)
	}
	if !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(v.Fingerprint) {
		t.Errorf("fingerprint = %q, want 64 hex digits (SHA-256)", v.Fingerprint)
	}
	if len(v.Rows) != 2 || v.Rows[0].Row != 0 || v.Rows[0].Product != nameMut || v.Rows[0].Scans != 2 || v.Rows[0].Quantity != 1400 ||
		v.Rows[0].PriceCents != 7771 || v.Rows[0].ProductID != w.mutti || v.Rows[0].Barcode != "08000500310427" || v.Rows[0].BaseUnit != "g" || v.Rows[0].PackSize != 700 ||
		v.Rows[1].Row != 1 || v.Rows[1].Product != nameBar || v.Rows[1].Scans != 1 {
		t.Errorf("rows = %+v (the grouped Scanned rows in first-scan order, with the index the model answered with)", v.Rows)
	}
	var price *struct {
		ID         string `json:"id"`
		Kind       string `json:"kind"`
		Row        int    `json:"row"`
		Checked    bool   `json:"checked"`
		NeedsInput bool   `json:"needsInput"`
		Before     struct {
			PriceCents *int `json:"priceCents"`
		} `json:"before"`
		After struct {
			PriceCents *int `json:"priceCents"`
		} `json:"after"`
	}
	for i := range v.Proposals {
		if v.Proposals[i].ID == "price:0" {
			price = &v.Proposals[i]
		}
	}
	if price == nil || price.Kind != "price" || price.Row != 0 || !price.Checked || price.After.PriceCents == nil || *price.After.PriceCents != 149 ||
		price.Before.PriceCents == nil || *price.Before.PriceCents != 7771 {
		t.Errorf("proposals = %+v, want price:0 checked, 7771 to 149", v.Proposals)
	}
	if v.Totals == nil || v.Totals.Lines != 2 || v.Totals.ScannedCents != 7771*2+119 || v.Totals.ProjectedCents != 298+119 ||
		v.Totals.ReceiptCents == nil || *v.Totals.ReceiptCents != 7800 {
		t.Errorf("totals = %+v", v.Totals)
	}
	if v.Notes == nil || v.Warnings == nil {
		t.Errorf("notes and warnings are always arrays, never null: %s", raw)
	}
	hasTotalNote := false
	for _, n := range v.Notes {
		if n.Code == "total_differs" {
			hasTotalNote = true
		}
	}
	if !hasTotalNote {
		t.Errorf("the total printed (7800) differs from the lines (417): a total_differs note is expected, notes = %+v", v.Notes)
	}
}

func TestTheProviderIsCalledOnceWithPhotosFirstThenTheWrappedRowsTextTheSchemaAndNoIngredientNames(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	before := len(w.fake.Messages())
	v := read(t, w.user, w.body(w.shop, uuids, receipttest.JPEGDataURL(300, 200), receipttest.ReceiptPNGDataURL([]string{"A", "B"})))
	if v.Status != "done" {
		t.Fatalf("read = %+v", v)
	}
	msgs := w.fake.Messages()[before:]
	if len(msgs) != 1 {
		t.Fatalf("the read is one Messages call, got %d", len(msgs))
	}
	req := msgs[0]
	if req.APIKey != apiKey {
		t.Errorf("the Admin's saved key must be used")
	}
	imgs := req.Images()
	if len(imgs) != 2 || imgs[0].MediaType != "image/jpeg" || imgs[1].MediaType != "image/jpeg" || imgs[0].Index != 0 || imgs[1].Index != 1 {
		t.Errorf("images = %+v, want 2 JPEGs before the text, in order (PNG converted)", imgs)
	}
	texts := req.UserTexts()
	if len(texts) != 1 {
		t.Fatalf("one text block, got %d", len(texts))
	}
	for _, want := range []string{"<source", nameMut, nameBar, `"row":0`, `"row":1`, `"shop":"Esselunga"`, `"date":"` + day + `"`, barMut, `"currency"`, "7771"} {
		if !strings.Contains(texts[0], want) {
			t.Errorf("the text block lacks %q: %s", want, texts[0])
		}
	}
	if strings.Contains(texts[0], secret) || strings.Contains(string(req.Body), secret) {
		t.Errorf("an Ingredient name must never be sent (§4.1)")
	}
	body := string(req.Body)
	for _, want := range []string{"You read a shop receipt", `"readable"`, `"unitPriceCents"`, `"max_tokens":8000`} {
		if !strings.Contains(body, want) {
			t.Errorf("the request lacks %q", want)
		}
	}
	if strings.Contains(body, "#fake:") {
		t.Errorf("sanity: no marker")
	}
}

func TestTheFingerprintCoversTheSessionsEventsAndTheirPricesAndQuantities(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()}, fakeanthropic.Reply{Text: okAnswer()}, fakeanthropic.Reply{Text: okAnswer()},
		fakeanthropic.Reply{Text: okAnswer()}, fakeanthropic.Reply{Text: okAnswer()})
	a := read(t, w.user, w.body(w.shop, uuids)).Fingerprint
	b := read(t, w.user, w.body(w.shop, uuids)).Fingerprint
	if a == "" || a != b {
		t.Fatalf("the same session must give the same fingerprint: %q %q", a, b)
	}
	if c := read(t, w.user, w.body(w.shop, uuids[:2])).Fingerprint; c == a {
		t.Errorf("fewer events, same fingerprint")
	}
	mustStatus(t, w.user.Patch("/api/scan/s3", obj{"priceCents": 120}), 200)
	if d := read(t, w.user, w.body(w.shop, uuids)).Fingerprint; d == a {
		t.Errorf("a Price edit since must change the fingerprint (the apply recomputes it)")
	}
	mustStatus(t, w.user.Post("/api/scan/s3/undo", obj{}), 200)
	if e := read(t, w.user, w.body(w.shop, uuids)).Fingerprint; e == a {
		t.Errorf("an Undo since must change the fingerprint")
	}
}

// ---- today's session only (Q5) ---------------------------------------------------------------------------------

func TestAnotherShopsUuidsAreNotRead_ChangeShop(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.scan(t, w.user, "c1", w.other, w.mutti, 700, 150)
	// the phone changed Shop to Coop but sends the old session's uuids for the new Shop
	r := post(t, w.user, w.body(w.other, uuids), 422)
	if r.ErrorCode() != "scans_empty" {
		t.Errorf("code = %s", r.ErrorCode())
	}
	// and the new Shop's own session reads only its own scan
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	v := read(t, w.user, w.body(w.other, []string{"c1", "s1", "s2"}))
	if v.Status != "done" || len(v.Rows) != 1 {
		t.Errorf("only Coop's scan is read: %+v", v)
	}
	if len(w.fake.Messages()) == 0 {
		t.Errorf("the provider must have been called")
	}
}

func TestScansOfAnEarlierDayCannotBeRead(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.env.Clock.Advance(24 * time.Hour) // the household day turns
	before := len(w.fake.Messages())
	r := post(t, w.user, w.body(w.shop, uuids), 422)
	if r.ErrorCode() != "scans_empty" || len(w.fake.Messages()) != before {
		t.Errorf("%d %s: a read of yesterday's Scanned list is refused before the model is called", r.Status, r.Body)
	}
}

func TestEmptyUnknownAndUndoneUuidsAreScansEmptyAndHoldNothing(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	mustStatus(t, w.user.Post("/api/scan/s1/undo", obj{}), 200)
	mustStatus(t, w.user.Post("/api/scan/s2/undo", obj{}), 200)
	mustStatus(t, w.user.Post("/api/scan/s3/undo", obj{}), 200)
	for name, u := range map[string][]string{"none": {}, "nil": nil, "unknown": {"zz-1", "zz-2"}, "all undone": uuids} {
		if r := post(t, w.user, w.body(w.shop, u), 422); r.ErrorCode() != "scans_empty" {
			t.Errorf("%s: %s", name, r.Body)
		}
	}
	// 40 refusals later the Limiter has not counted any of them (30 per hour): a real read still starts.
	for i := 0; i < 40; i++ {
		post(t, w.user, w.body(w.shop, nil), 422)
	}
	w.scan(t, w.user, "n1", w.shop, w.mutti, 700, 159)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	if v := read(t, w.user, w.body(w.shop, []string{"n1"})); v.Status != "done" {
		t.Errorf("read = %+v", v)
	}
}

func TestUuidsNotSyncedYetAreLeftOutAndTheKnownOnesAreRead(t *testing.T) {
	w := start(t)
	w.session(t)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	v := read(t, w.user, w.body(w.shop, []string{"s3", "still-in-the-phones-queue"}))
	if v.Status != "done" || len(v.Rows) != 1 || v.Rows[0].Product != nameBar {
		t.Errorf("read = %+v (offline: the server simply leaves an unknown uuid out; the phone checks its queue first)", v)
	}
}

// ---- photos: limits, then never stored, never logged -----------------------------------------------------------

func TestPhotoLimitsAnswer422WithThePhotoCodes(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	good := receipttest.JPEGDataURL(20, 20)
	big := "data:image/jpeg;base64," + strings.Repeat("A", 12<<20)
	for name, tc := range map[string]struct {
		photos []obj
		status int
		code   string
	}{
		"none":          {[]obj{}, 422, "photos_empty"},
		"five":          {[]obj{{"dataUrl": good}, {"dataUrl": good}, {"dataUrl": good}, {"dataUrl": good}, {"dataUrl": good}}, 422, "too_many_photos"},
		"over 8 MB":     {[]obj{{"dataUrl": big}}, 422, "photo_too_large"},
		"a text file":   {[]obj{{"dataUrl": "data:text/plain;base64,aGVsbG8="}}, 422, "photo_unsupported"},
		"an address":    {[]obj{{"url": "https://example.test/r.jpg"}}, 422, "photo_unsupported"},
		"second is bad": {[]obj{{"dataUrl": good}, {"dataUrl": "data:text/plain;base64,aGVsbG8="}}, 422, "photo_unsupported"},
	} {
		r := w.user.Post("/api/scan/receipt/reads", obj{"shopId": w.shop, "clientUuids": uuids, "photos": tc.photos})
		if r.Status != tc.status || r.ErrorCode() != tc.code {
			t.Errorf("%s: %d %s, want %d %s", name, r.Status, r.Body, tc.status, tc.code)
		}
	}
	if len(w.fake.Messages()) != 0 {
		t.Errorf("a refused photo set must never reach the provider")
	}
}

func TestMalformedBodiesAreBadRequests(t *testing.T) {
	w := start(t)
	for name, body := range map[string]any{"not json": "not even json", "an array": "[]", "empty": ""} {
		if r := w.user.Post("/api/scan/receipt/reads", body); r.Status != 400 || r.ErrorCode() != "bad_request" {
			t.Errorf("%s: %d %s", name, r.Status, r.Body)
		}
	}
}

func TestAModelWithoutImageInputRefusesWith422(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	mustStatus(t, w.admin.Put("/api/recipe-assistant/settings", obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-text-only"}), 200)
	if r := w.user.Post("/api/scan/receipt/reads", w.body(w.shop, uuids)); r.Status != 422 || r.ErrorCode() != "photos_not_supported_by_model" {
		t.Errorf("%d %s", r.Status, r.Body)
	}
}

func TestACorruptImageFailsTheReadWithAPhotoCode(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	v := read(t, w.user, w.body(w.shop, uuids, "data:image/jpeg;base64,bm90IGEgcmVhbCBqcGVnLCBqdXN0IHRleHQ="))
	if v.Status != "failed" || !strings.HasPrefix(v.errCode(), "photo_") || len(w.fake.Messages()) != 0 {
		t.Errorf("read = %+v", v)
	}
}

// storedImageEvidence lists the files in the data directory (the SQLite files aside) and the database cells that
// look like a stored photo: image bytes, a data URL, or a big BLOB.
func storedImageEvidence(t *testing.T, w *world) (files []string, cells []string) {
	t.Helper()
	dbName := filepath.Base(w.env.Config.DBPath())
	_ = filepath.WalkDir(w.dataDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(w.dataDir, p)
		if !strings.HasPrefix(rel, dbName) {
			files = append(files, rel)
		}
		return nil
	})
	tables, err := w.env.DB.Query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for tables.Next() {
		var n string
		_ = tables.Scan(&n)
		names = append(names, n)
	}
	tables.Close()
	for _, n := range names {
		rs, err := w.env.DB.Query(`SELECT * FROM "` + n + `"`)
		if err != nil {
			continue
		}
		cols, _ := rs.Columns()
		for rs.Next() {
			vals := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			_ = rs.Scan(ptrs...)
			for i, v := range vals {
				var text string
				switch x := v.(type) {
				case []byte:
					text = string(x)
					if len(x) > 512 {
						cells = append(cells, fmt.Sprintf("%s.%s: a BLOB of %d bytes", n, cols[i], len(x)))
					}
				case string:
					text = x
				}
				if strings.Contains(text, "data:image") || strings.HasPrefix(text, "/9j/") || strings.Contains(text, "\xff\xd8\xff") || strings.Contains(text, "\x89PNG") {
					cells = append(cells, fmt.Sprintf("%s.%s: image bytes", n, cols[i]))
				}
			}
		}
		rs.Close()
	}
	return files, cells
}

func TestThePhotoIsDiscardedAfterTheReadNoFileNoRow(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	filesBefore, rowsBefore := storedImageEvidence(t, w)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()}, fakeanthropic.Reply{Text: receipttest.Unreadable()})
	if v := read(t, w.user, w.body(w.shop, uuids, receipttest.ReceiptPNGDataURL([]string{"MUTTI 1,49"}), receipttest.JPEGDataURL(80, 80))); v.Status != "done" {
		t.Fatalf("read = %+v", v)
	}
	if v := read(t, w.user, w.body(w.shop, uuids)); v.errCode() != receipt.CodeNoReceiptFound {
		t.Fatalf("read = %+v", v)
	}
	files, rows := storedImageEvidence(t, w)
	if len(rowsBefore) != 0 {
		t.Fatalf("test setup: images in the DB before: %v", rowsBefore)
	}
	if len(rows) != 0 {
		t.Errorf("a database row holds image bytes after the read: %v", rows)
	}
	if strings.Join(files, ",") != strings.Join(filesBefore, ",") {
		t.Errorf("files appeared in the data directory during a read: before %v, after %v", filesBefore, files)
	}
	if entries, _ := os.ReadDir(filepath.Join(w.dataDir, "images")); len(entries) != 0 {
		t.Errorf("/data/images must stay empty: %d entries", len(entries))
	}
}

func TestLogsHoldNoRowsLinesPricesPhotosKeyOrAnswers(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	w.fake.Queue(
		fakeanthropic.Reply{Text: okAnswer()},
		fakeanthropic.Reply{Text: "LEAK-RAW-ANSWER " + nameMut + " 7771"},
		fakeanthropic.Reply{Text: receipttest.Unreadable()},
		fakeanthropic.Reply{Status: 401, ErrorType: "authentication_error", ErrorMsg: "invalid x-api-key " + nameMut},
	)
	for i := 0; i < 4; i++ {
		read(t, w.user, w.body(w.shop, uuids, receipttest.ReceiptPNGDataURL([]string{"QVX MUTTI PASSATA 1,49", "LINE-TEXT-LEAK-CHECK"})))
	}
	out := w.logs.String()
	if out == "" {
		t.Fatalf("test setup: the app's logs were not captured")
	}
	for _, leak := range []string{nameMut, nameBar, barMut, barBar, "QVX MUTTI", "LINE-TEXT-LEAK-CHECK", "7771", "77.71", "77,71", "LEAK-RAW-ANSWER",
		"data:image", "/9j/", "iVBOR", apiKey, secret} {
		if strings.Contains(out, leak) {
			i := strings.Index(out, leak)
			lo, hi := max(0, i-80), min(len(out), i+80)
			t.Errorf("the logs contain %q: ...%s...", leak, out[lo:hi])
		}
	}
}

// ---- availability and the shared Limiter -----------------------------------------------------------------------

func TestUnavailableAnswers409WithTheReasonBeforeTheBodyIsRead(t *testing.T) {
	env := testkit.Start(t) // no secret key at all
	c := env.LoginUser(t)
	for _, body := range []string{`{"shopId":1}`, `not even json`} {
		r := c.Post("/api/scan/receipt/reads", body)
		var b struct {
			Error struct{ Code, Reason string }
		}
		r.MustJSON(t, &b)
		if r.Status != 409 || b.Error.Code != "assistant_unavailable" || b.Error.Reason != "no_secret_key" {
			t.Errorf("body %q: %d %s", body, r.Status, r.Body)
		}
	}
	w := start(t)
	uuids := w.session(t)
	mustStatus(t, w.admin.Put("/api/recipe-assistant/settings", obj{"enabled": false, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5"}), 200)
	check := func(reason string) {
		t.Helper()
		r := w.user.Post("/api/scan/receipt/reads", w.body(w.shop, uuids))
		var b struct {
			Error struct{ Code, Reason string }
		}
		r.MustJSON(t, &b)
		if r.Status != 409 || b.Error.Code != "assistant_unavailable" || b.Error.Reason != reason {
			t.Errorf("%s: %d %s", reason, r.Status, r.Body)
		}
	}
	check("off")
	// Removing the key through the API turns the assistant off too (ApplyKeyRemoval), so that is "off", not "no_key".
	mustStatus(t, w.admin.Put("/api/recipe-assistant/settings", obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5"}), 200)
	mustStatus(t, w.admin.Delete("/api/recipe-assistant/settings/api-key"), 200)
	check("off")
	// no_key needs enabled with no key, which the API never produces: set the row directly.
	if _, err := w.env.DB.Exec(`UPDATE recipe_assistant_settings SET enabled = 1, api_key_ciphertext = NULL,
		api_key_last4 = NULL, api_key_master_id = NULL WHERE id = 1`); err != nil {
		t.Fatal(err)
	}
	check("no_key")
}

func (w *world) recipeRead(t *testing.T) {
	t.Helper()
	var a struct{ ID string }
	mustStatus(t, w.user.Post("/api/recipe-assistant/reads", obj{"text": "pancakes: flour, milk, eggs"}), 202).MustJSON(t, &a)
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		var v struct{ State string }
		mustStatus(t, w.user.Get("/api/recipe-assistant/reads/"+a.ID), 200).MustJSON(t, &v)
		if v.State == "done" || v.State == "failed" {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("the recipe read never finished")
}

func TestReceiptReadsShareTheRecipeAssistantsLimit(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	// 15 receipt reads and 15 recipe reads are 30 accepted reads of the Household in the hour: the 31st is refused.
	for i := 0; i < 15; i++ {
		w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
		if v := read(t, w.user, w.body(w.shop, uuids)); v.Status != "done" {
			t.Fatalf("receipt read %d = %+v", i, v)
		}
	}
	for i := 0; i < 15; i++ {
		w.recipeRead(t)
	}
	r := w.user.Post("/api/scan/receipt/reads", w.body(w.shop, uuids))
	var b struct {
		Error struct {
			Code              string
			RetryAfterSeconds int
		}
	}
	r.MustJSON(t, &b)
	if r.Status != 429 || b.Error.Code != "too_many_reads" || b.Error.RetryAfterSeconds <= 0 {
		t.Fatalf("the 31st accepted read of the hour (recipe and receipt reads together) must be 429 too_many_reads with retryAfterSeconds: %d %s", r.Status, r.Body)
	}
	// An Admin is exempt from the hourly limit, as for recipes.
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	if r := w.admin.Post("/api/scan/receipt/reads", w.body(w.shop, uuids)); r.Status != 202 {
		t.Errorf("an Admin's read: %d %s", r.Status, r.Body)
	}
}

// slowProduct is a Product whose name carries the fake's "#fake:slow" marker: a read that includes it is held by the
// fake for 10 s, so the test can look at a running read.
func (w *world) slowProduct(t *testing.T) int64 {
	t.Helper()
	var id struct {
		ID int64 `json:"id"`
	}
	var ing int64
	if err := w.env.DB.QueryRow(`SELECT id FROM ingredients LIMIT 1`).Scan(&ing); err != nil {
		t.Fatal(err)
	}
	mustStatus(t, w.user.Post("/api/products", obj{"name": "Slow #fake:slow", "ingredientId": ing, "packSize": 100, "barcodes": []string{"5449000000996"}}), 201).MustJSON(t, &id)
	return id.ID
}

func TestOneRunningReadPerUserAcrossRecipesAndReceipts(t *testing.T) {
	w := start(t)
	w.session(t)
	var a struct{ ID string }
	// a running recipe read blocks a receipt read ...
	mustStatus(t, w.user.Post("/api/recipe-assistant/reads", obj{"text": "Slow soup #fake:slow"}), 202).MustJSON(t, &a)
	r := w.user.Post("/api/scan/receipt/reads", w.body(w.shop, []string{"s1"}))
	if r.Status != 409 || r.ErrorCode() != "read_in_progress" {
		t.Errorf("a receipt read while a recipe read runs: %d %s", r.Status, r.Body)
	}
	mustStatus(t, w.user.Delete("/api/recipe-assistant/reads/"+a.ID), 204)
	// ... and a running receipt read blocks a recipe read.
	w.scan(t, w.user, "slow1", w.shop, w.slowProduct(t), 100, 99)
	id := startRead(t, w.user, w.body(w.shop, []string{"slow1"}))
	time.Sleep(100 * time.Millisecond)
	if r := w.user.Post("/api/recipe-assistant/reads", obj{"text": "pancakes"}); r.Status != 409 || r.ErrorCode() != "read_in_progress" {
		t.Errorf("a recipe read while a receipt read runs: %d %s", r.Status, r.Body)
	}
	mustStatus(t, w.user.Delete("/api/scan/receipt/reads/"+id), 204)
}

// ---- failures --------------------------------------------------------------------------------------------------

func TestFailedReadsReportTheRecipeAssistantsCodes(t *testing.T) {
	w := start(t)
	uuids := w.session(t)
	for name, tc := range map[string]struct {
		reply fakeanthropic.Reply
		code  string
	}{
		"refusal":         {fakeanthropic.Reply{StopReason: "refusal"}, "assistant_declined"},
		"max tokens":      {fakeanthropic.Reply{StopReason: "max_tokens", Text: `{"readable":tr`}, "assistant_output_too_long"},
		"bad key":         {fakeanthropic.Reply{Status: 401, ErrorType: "authentication_error", ErrorMsg: "invalid x-api-key"}, "assistant_bad_key"},
		"forbidden":       {fakeanthropic.Reply{Status: 403, ErrorType: "permission_error", ErrorMsg: "no"}, "assistant_forbidden"},
		"not JSON":        {fakeanthropic.Reply{Text: "I could not read that."}, "assistant_invalid_output"},
		"wrong shape":     {fakeanthropic.Reply{Text: `{"format":"feeder-recipe-file"}`}, "assistant_invalid_output"},
		"not a receipt":   {fakeanthropic.Reply{Text: receipttest.Unreadable()}, "no_receipt_found"},
		"no lines at all": {fakeanthropic.Reply{Text: receipttest.Answer("", "", -1)}, "no_receipt_found"},
	} {
		w.fake.Queue(tc.reply)
		v := read(t, w.user, w.body(w.shop, uuids))
		if v.Status != "failed" || v.errCode() != tc.code || v.Error.Message == "" || len(v.Proposals) != 0 {
			t.Errorf("%s: %+v (error %+v), want failed %s with a message", name, v, v.Error, tc.code)
		}
	}
}

func TestCancelStopsARunningReadAndFreesTheUser(t *testing.T) {
	w := start(t)
	w.scan(t, w.user, "slow1", w.shop, w.slowProduct(t), 100, 99)
	id := startRead(t, w.user, w.body(w.shop, []string{"slow1"}))
	time.Sleep(100 * time.Millisecond)
	var v readView
	mustStatus(t, w.user.Get("/api/scan/receipt/reads/"+id), 200).MustJSON(t, &v)
	if v.Status != "running" {
		t.Fatalf("the read should still be running: %+v", v)
	}
	mustStatus(t, w.user.Delete("/api/scan/receipt/reads/"+id), 204)
	v = poll(t, w.user, id)
	if v.Status != "failed" || v.errCode() != "cancelled" {
		t.Errorf("a cancelled read is failed with code cancelled: %+v", v)
	}
	// the slot is free at once: another read is accepted (not 409 read_in_progress)
	w.fake.Queue(fakeanthropic.Reply{Text: okAnswer()})
	w.scan(t, w.user, "n1", w.shop, w.mutti, 700, 159)
	if r := w.user.Post("/api/scan/receipt/reads", w.body(w.shop, []string{"n1"})); r.Status != 202 {
		t.Errorf("after the cancel the User can read again: %d %s", r.Status, r.Body)
	}
}
