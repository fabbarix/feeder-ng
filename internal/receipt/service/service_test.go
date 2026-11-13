package service_test

// RR2 (red): the receipt read service (docs/design/receipt-reading.md §4, §5.1, §6, §7.1, §9, §13; ADR 0018).
//
// The API these tests pin (package github.com/fabbarix/feeder-ng/internal/receipt/service, imported as rsvc):
//
//	rsvc.New(rsvc.Deps{Assistant, Events, Photos, Clock, Logger, Overall}) *rsvc.Service    // Overall 0 = rsvc.DefaultOverall (120 s)
//	(*Service).Start(c recipeassistant.Caller, in rsvc.ReadInput) (rsvc.JobView, error)
//	(*Service).Job(userID int64, id string) (rsvc.JobView, bool)       // only the owner sees a job
//	(*Service).Cancel(userID int64, id string) bool
//	(*Service).Check(c) error                                          // the Limiter's Check, before the body is read
//	(*Service).Available(ctx) error                                    // *rsvc.Unavailable{Reason}, nil when a read can start
//	rsvc.FromRecipeAssistant(*rasvc.Service) rsvc.Assistant            // the shared Limiter, availability and client factory
//	                                                                   // (internal/recipeassistant/service/shared.go, new)
//
// Ports (all stubbed here, so the tests are hermetic):
//
//	Assistant: Ready(ctx) (rsvc.Ready{Model, Claude, ImagesOK}, error)   // *rsvc.Unavailable when off / no key
//	           Check(c) error; Acquire(c) (release func(), error)         // the Recipe Assistant's Limiter, shared
//	Events:    SessionEvents(ctx, shopID, uuids) ([]receipt.ScanEvent, error)
//	           // applied, not undone, shop_scan / shop_unknown events among uuids (unknown uuids are not returned); the
//	           // service itself keeps only this Shop's events of today (Context.Today) (Q5), so Change Shop and an old
//	           // day end in scans_empty. The same method as the scan service's loader (RR3), so it swaps in one line.
//	Contexts:  Context(ctx, shopID) (receipt.Context, error)
//	Photos:    rasvc.Photos (Prepare data URLs to JPEG)
//
//	rsvc.JobView{ID, Status (running|done|failed), Fingerprint, Rows []receipt.Row, Result receipt.Result,
//	             Warnings []receipt.Warning, Error *recipeassistant.Error}   // prints and logs as a summary, like the RR1 types
//
// Codes: rsvc.CodeScansEmpty "scans_empty", rsvc.CodeCancelled "cancelled", the photo codes of the Recipe Assistant's
// service package, and the Recipe Assistant's own error codes for the provider.

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/receipt/receipttest"
	rsvc "github.com/fabbarix/feeder-ng/internal/receipt/service"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	rasvc "github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

const today = "2026-11-13"

var userA = recipeassistant.Caller{UserID: 7, HouseholdID: 1}

// ---- stubs -----------------------------------------------------------------------------------------------------

type claudeStub struct {
	mu   sync.Mutex
	reqs []rasvc.Request
	fn   func(ctx context.Context, r rasvc.Request) (rasvc.Response, error)
}

func (c *claudeStub) Message(ctx context.Context, r rasvc.Request) (rasvc.Response, error) {
	c.mu.Lock()
	c.reqs = append(c.reqs, r)
	fn := c.fn
	c.mu.Unlock()
	return fn(ctx, r)
}
func (c *claudeStub) Models(context.Context) ([]rasvc.ModelInfo, error) { return nil, nil }
func (c *claudeStub) Model(context.Context, string) (rasvc.ModelInfo, error) {
	return rasvc.ModelInfo{}, nil
}
func (c *claudeStub) calls() []rasvc.Request {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]rasvc.Request(nil), c.reqs...)
}

func says(text string) func(context.Context, rasvc.Request) (rasvc.Response, error) {
	return func(context.Context, rasvc.Request) (rasvc.Response, error) {
		return rasvc.Response{Text: text, StopReason: "end_turn", Usage: rasvc.Usage{InputTokens: 100, OutputTokens: 50}}, nil
	}
}

type assistantStub struct {
	claude      *claudeStub
	unavailable string // a reason: Ready answers *rsvc.Unavailable
	imagesOK    bool
	checkErr    error
	acquireErr  error
	acquired    atomic.Int32
	released    atomic.Int32
}

func (a *assistantStub) Ready(context.Context) (rsvc.Ready, error) {
	if a.unavailable != "" {
		return rsvc.Ready{}, &rsvc.Unavailable{Reason: a.unavailable}
	}
	return rsvc.Ready{Model: "claude-haiku-5-5", Claude: a.claude, ImagesOK: a.imagesOK}, nil
}
func (a *assistantStub) Check(recipeassistant.Caller) error { return a.checkErr }
func (a *assistantStub) Acquire(recipeassistant.Caller) (func(), error) {
	if a.acquireErr != nil {
		return nil, a.acquireErr
	}
	a.acquired.Add(1)
	var once sync.Once
	return func() { once.Do(func() { a.released.Add(1) }) }, nil
}

type eventsStub struct {
	all []receipt.ScanEvent
	ctx receipt.Context
	// the last call
	shopID int64
	uuids  []string
	err    error
}

func (e *eventsStub) Context(context.Context, int64) (receipt.Context, error) { return e.ctx, nil }

func (e *eventsStub) SessionEvents(_ context.Context, shopID int64, uuids []string) ([]receipt.ScanEvent, error) {
	e.shopID, e.uuids = shopID, append([]string(nil), uuids...)
	if e.err != nil {
		return nil, e.err
	}
	want := map[string]bool{}
	for _, u := range uuids {
		want[u] = true
	}
	var out []receipt.ScanEvent
	for _, ev := range e.all {
		if want[ev.UUID] {
			out = append(out, ev)
		}
	}
	return out, nil
}

const photoMarker = "PHOTO-BYTES-MARKER-0001"

type photosStub struct{ calls atomic.Int32 }

func (p *photosStub) Prepare(_ context.Context, in []rasvc.PhotoInput) ([]rasvc.PreparedPhoto, error) {
	p.calls.Add(1)
	out := make([]rasvc.PreparedPhoto, len(in))
	for i := range in {
		out[i] = rasvc.PreparedPhoto{JPEG: []byte(fmt.Sprintf("%s-%d", photoMarker, i)), Width: 100, Height: 200}
	}
	return out, nil
}

func scanEv(uuid string, product int64, name, barcode string, packSize int, qty float64, price int) receipt.ScanEvent {
	return receipt.ScanEvent{UUID: uuid, ProductID: product, Product: name, Barcode: barcode, BaseUnit: "g", PackSize: packSize,
		Quantity: qty, PriceCents: price, PerKgCents: -1, ShopID: 1, Date: today}
}

// The names, barcodes and prices below are distinctive on purpose: the log tests look for them.
const (
	nameMutti   = "Qvx Mutti passata 700 g"
	barcodeMut  = "8005110170003"
	nameBarilla = "Qvx Barilla spaghetti 500 g"
	barcodeBar  = "8076800195057"
	priceMutti  = 7771
)

func sessionEvents() []receipt.ScanEvent {
	return []receipt.ScanEvent{
		scanEv("e1", 10, nameMutti, barcodeMut, 700, 700, priceMutti),
		scanEv("e2", 10, nameMutti, barcodeMut, 700, 700, priceMutti),
		scanEv("e3", 12, nameBarilla, barcodeBar, 500, 500, -1),
	}
}

func sessionContext() receipt.Context {
	return receipt.Context{Today: today, SessionShop: receipt.Shop{ID: 1, Name: "Esselunga"}, SessionDate: today,
		Shops: []receipt.Shop{{ID: 1, Name: "Esselunga"}, {ID: 2, Name: "Coop"}}, Currency: "EUR", MinorDigits: 2}
}

// goodAnswer: the receipt prints 1,49 for each passata (row 0), one spaghetti (row 1) at 0,89, and total 387.
func goodAnswer() string {
	return receipttest.Answer("Esselunga", today, 387,
		receipttest.Line(map[string]any{"row": 0, "text": "QVX MUTTI PASSATA 2 x 1,49", "count": 2, "priceCents": 298, "unitPriceCents": 149}),
		receipttest.Line(map[string]any{"row": 1, "text": "QVX BARILLA SPAGHETTI", "count": 1, "priceCents": 89}),
	)
}

type world struct {
	svc    *rsvc.Service
	asst   *assistantStub
	claude *claudeStub
	events *eventsStub
	photos *photosStub
	clk    *clock.Fake
	logs   *syncBuf
}

type syncBuf struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *syncBuf) Write(p []byte) (int, error) { s.mu.Lock(); defer s.mu.Unlock(); return s.b.Write(p) }
func (s *syncBuf) String() string              { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }

func newWorld(t *testing.T, answer string, overall time.Duration) *world {
	t.Helper()
	cl := &claudeStub{fn: says(answer)}
	w := &world{claude: cl, asst: &assistantStub{claude: cl, imagesOK: true}, events: &eventsStub{all: sessionEvents(), ctx: sessionContext()},
		photos: &photosStub{}, clk: clock.NewFake(time.Date(2026, 11, 13, 12, 0, 0, 0, time.UTC)), logs: &syncBuf{}}
	w.svc = rsvc.New(rsvc.Deps{Assistant: w.asst, Events: w.events, Contexts: w.events, Photos: w.photos, Clock: w.clk, Overall: overall,
		Logger: slog.New(slog.NewTextHandler(w.logs, &slog.HandlerOptions{Level: slog.LevelDebug}))})
	return w
}

func photo() rasvc.PhotoInput { return rasvc.PhotoInput{DataURL: receipttest.JPEGDataURL(20, 20)} }

func input(uuids ...string) rsvc.ReadInput {
	return rsvc.ReadInput{ShopID: 1, ClientUUIDs: uuids, Photos: []rasvc.PhotoInput{photo()}}
}

func (w *world) wait(t *testing.T, userID int64, id string) rsvc.JobView {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		v, ok := w.svc.Job(userID, id)
		if !ok {
			t.Fatalf("job %s vanished", id)
		}
		if v.Status != rsvc.StatusRunning {
			return v
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("job %s never finished", id)
	return rsvc.JobView{}
}

func (w *world) read(t *testing.T, in rsvc.ReadInput) rsvc.JobView {
	t.Helper()
	v, err := w.svc.Start(userA, in)
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if v.ID == "" || v.Status != rsvc.StatusRunning {
		t.Fatalf("Start must answer a running job with an id: %+v", v)
	}
	return w.wait(t, userA.UserID, v.ID)
}

func code(err error) string { return recipeassistant.CodeOf(err) }

func errCode(v rsvc.JobView) string {
	if v.Error == nil {
		return ""
	}
	return v.Error.Code
}

// ---- the call --------------------------------------------------------------------------------------------------

func TestTheProviderGetsPhotosBeforeTheRowsTextTheSchemaAndTheSystemPrompt(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	in := input("e1", "e2", "e3")
	in.Photos = []rasvc.PhotoInput{photo(), photo()}
	v := w.read(t, in)
	if v.Status != rsvc.StatusDone {
		t.Fatalf("job = %+v", v)
	}
	calls := w.claude.calls()
	if len(calls) != 1 {
		t.Fatalf("the receipt read is one Messages call, got %d", len(calls))
	}
	r := calls[0]
	if r.Model != "claude-haiku-5-5" || r.System != receipt.SystemPrompt() || r.MaxTokens != 8000 {
		t.Errorf("model/system/max tokens = %q / system ok=%v / %d", r.Model, r.System == receipt.SystemPrompt(), r.MaxTokens)
	}
	if string(r.Schema) != string(receipt.OutputSchema()) {
		t.Errorf("the schema must be receipt.OutputSchema() byte for byte")
	}
	if len(r.Turns) != 1 || r.Turns[0].Role != "user" || len(r.Turns[0].Images) != 2 {
		t.Fatalf("one user turn with the 2 photos: %+v", r.Turns)
	}
	for i, im := range r.Turns[0].Images {
		if im.MediaType != "image/jpeg" || string(im.Data) != fmt.Sprintf("%s-%d", photoMarker, i) {
			t.Errorf("image %d = %q %q: the prepared JPEGs go in order", i, im.MediaType, im.Data)
		}
	}
	rows := receipt.GroupRows(sessionEvents())
	want, err := receipt.BuildRequestText(receipt.RequestInput{Shop: "Esselunga", Date: today, Currency: "EUR", MinorDigits: 2, Rows: rows, PhotoCount: 2})
	if err != nil {
		t.Fatal(err)
	}
	if r.Turns[0].Text != want {
		t.Errorf("the text block must be receipt.BuildRequestText of the grouped rows:\n got %q\nwant %q", r.Turns[0].Text, want)
	}
}

func TestADoneJobHoldsTheFingerprintRowsProposalsNotesTotalsAndWarnings(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	v := w.read(t, input("e1", "e2", "e3"))
	if v.Status != rsvc.StatusDone || v.Error != nil {
		t.Fatalf("job = %+v", v)
	}
	events := sessionEvents()
	rows := receipt.GroupRows(events)
	ans, warns, err := receipt.Finish([]byte(goodAnswer()), rows, today)
	if err != nil {
		t.Fatal(err)
	}
	if v.Fingerprint != receipt.Fingerprint(events) {
		t.Errorf("fingerprint = %q, want receipt.Fingerprint of the session's events", v.Fingerprint)
	}
	if !reflect.DeepEqual(v.Rows, rows) {
		t.Errorf("rows are receipt.GroupRows of the events, in first-scan order")
	}
	if want := receipt.Propose(rows, ans, sessionContext()); !reflect.DeepEqual(v.Result, want) {
		t.Errorf("result is receipt.Propose(rows, Finish(answer), ctx):\n got %v\nwant %v", v.Result, want)
	}
	if len(v.Result.Proposals) == 0 {
		t.Errorf("the fixture answer must propose at least a Price")
	}
	if !reflect.DeepEqual(v.Warnings, warns) {
		t.Errorf("warnings are Finish's: got %v want %v", v.Warnings, warns)
	}
}

// The apply (RR3) looks a done read up by the five things the User reviewed: its Shop, fingerprint, rows, context and
// proposals. A failed or running job holds none of them.
func TestADoneJobKeepsWhatTheApplyNeeds(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	v := w.read(t, input("e1", "e2", "e3"))
	if v.Status != rsvc.StatusDone {
		t.Fatalf("job = %+v", v)
	}
	if v.ShopID != 1 || v.Fingerprint == "" || len(v.Rows) == 0 || len(v.Result.Proposals) == 0 {
		t.Errorf("shop %d, fingerprint %q, %d rows, %d proposals", v.ShopID, v.Fingerprint, len(v.Rows), len(v.Result.Proposals))
	}
	if !reflect.DeepEqual(v.Ctx, sessionContext()) {
		t.Errorf("ctx = %+v, want the session's Context", v.Ctx)
	}

	w = newWorld(t, "not json", 0)
	v = w.read(t, input("e1"))
	if v.Status != rsvc.StatusFailed || v.ShopID != 0 || v.Fingerprint != "" || v.Rows != nil || v.Ctx.Today != "" {
		t.Errorf("a failed job holds no read: %+v", v)
	}
}

func TestFinishWarningsReachTheJob(t *testing.T) {
	// row 9 is outside [-1, 2): Finish keeps the line as unmatched with row_out_of_range.
	ans := receipttest.Answer("Esselunga", today, -1,
		receipttest.Line(map[string]any{"row": 0, "text": "A", "count": 1, "priceCents": 149}),
		receipttest.Line(map[string]any{"row": 9, "text": "B", "count": 1, "priceCents": 50, "name": "Mystery"}))
	w := newWorld(t, ans, 0)
	v := w.read(t, input("e1", "e3"))
	if v.Status != rsvc.StatusDone || len(v.Warnings) != 1 || v.Warnings[0].Code != receipt.WarnRowOutOfRange || v.Warnings[0].Line != 1 {
		t.Fatalf("job = %+v", v)
	}
}

// ---- the session: today's Scanned list only (Q5) ---------------------------------------------------------------

func TestOnlyThisShopsScansOfTodayAreRead(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	other := scanEv("e4", 13, "Latte", "8001234567890", 1000, 1000, 150)
	other.ShopID = 2 // another Shop: the phone changed Shop, or a stale uuid
	yesterday := scanEv("e5", 14, "Pane", "8009999999999", 500, 500, 200)
	yesterday.Date = "2026-11-12"
	w.events.all = append(w.events.all, other, yesterday)
	v := w.read(t, input("e1", "e2", "e3", "e4", "e5"))
	if v.Status != rsvc.StatusDone {
		t.Fatalf("job = %+v", v)
	}
	if len(v.Rows) != 2 {
		t.Fatalf("rows = %d, want the 2 of this Shop today", len(v.Rows))
	}
	if v.Fingerprint != receipt.Fingerprint(sessionEvents()) {
		t.Errorf("the fingerprint covers only the events that were read")
	}
	if w.events.shopID != 1 || len(w.events.uuids) != 5 {
		t.Errorf("the port gets the Shop and all uuids: %d %v", w.events.shopID, w.events.uuids)
	}
}

func TestNoScansLeftIsScansEmptyBeforeAnythingIsHeldOrSent(t *testing.T) {
	other := scanEv("e4", 13, "Latte", "8001234567890", 1000, 1000, 150)
	other.ShopID = 2
	old := scanEv("e5", 14, "Pane", "8009999999999", 500, 500, 200)
	old.Date = "2026-11-12"
	for name, uuids := range map[string][]string{
		"no uuids":                          nil,
		"only unknown uuids":                {"nope-1", "nope-2"},
		"only another Shop's (Change Shop)": {"e4"},
		"only an earlier day's":             {"e5"},
	} {
		w := newWorld(t, goodAnswer(), 0)
		w.events.all = append(w.events.all, other, old)
		_, err := w.svc.Start(userA, input(uuids...))
		if code(err) != rsvc.CodeScansEmpty {
			t.Errorf("%s: err = %v, want scans_empty", name, err)
		}
		if w.asst.acquired.Load() != 0 || len(w.claude.calls()) != 0 || w.photos.calls.Load() != 0 {
			t.Errorf("%s: a refusal must hold no Limiter slot, prepare no photo and call no model", name)
		}
	}
}

func TestUuidsThePhoneHasNotSyncedAreLeftOutAndTheRestIsRead(t *testing.T) {
	// Offline (§7.3): the phone checks first, but the server also simply ignores an unknown uuid.
	w := newWorld(t, goodAnswer(), 0)
	v := w.read(t, input("e1", "not-synced-yet"))
	if v.Status != rsvc.StatusDone || len(v.Rows) != 1 {
		t.Fatalf("job = %+v", v)
	}
	if v.Fingerprint != receipt.Fingerprint(sessionEvents()[:1]) {
		t.Errorf("fingerprint covers only the known event")
	}
}

func TestAnEventsPortFailureIsNotASessionError(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	w.events.err = errors.New("db down")
	_, err := w.svc.Start(userA, input("e1"))
	if err == nil || code(err) == rsvc.CodeScansEmpty || w.asst.acquired.Load() != 0 {
		t.Errorf("err = %v; a store failure is an internal error, not scans_empty, and holds nothing", err)
	}
}

// ---- the photos ------------------------------------------------------------------------------------------------

func TestPhotoLimitsAreCheckedBeforeAnythingIsHeld(t *testing.T) {
	big := "data:image/jpeg;base64," + strings.Repeat("A", 12<<20) // ~9 MB decoded: over imaging.MaxBytes (8 MB)
	five := make([]rasvc.PhotoInput, 5)
	for i := range five {
		five[i] = photo()
	}
	for name, tc := range map[string]struct {
		photos []rasvc.PhotoInput
		code   string
	}{
		"none":              {nil, rasvc.CodePhotosEmpty},
		"five":              {five, rasvc.CodeTooManyPhotos},
		"too large":         {[]rasvc.PhotoInput{{DataURL: big}}, rasvc.CodePhotoTooLarge},
		"not an image":      {[]rasvc.PhotoInput{{DataURL: "data:text/plain;base64,aGVsbG8="}}, rasvc.CodePhotoUnsupported},
		"a gif":             {[]rasvc.PhotoInput{{DataURL: "data:image/gif;base64,R0lGODlh"}}, rasvc.CodePhotoUnsupported},
		"an address":        {[]rasvc.PhotoInput{{URL: "https://example.test/receipt.jpg"}}, rasvc.CodePhotoUnsupported},
		"neither":           {[]rasvc.PhotoInput{{}}, rasvc.CodePhotoUnsupported},
		"the second is bad": {[]rasvc.PhotoInput{photo(), {DataURL: "data:text/plain;base64,aGVsbG8="}}, rasvc.CodePhotoUnsupported},
	} {
		w := newWorld(t, goodAnswer(), 0)
		in := input("e1")
		in.Photos = tc.photos
		_, err := w.svc.Start(userA, in)
		if code(err) != tc.code {
			t.Errorf("%s: err = %v, want %s", name, err, tc.code)
		}
		if w.asst.acquired.Load() != 0 || len(w.claude.calls()) != 0 {
			t.Errorf("%s: nothing may be held or sent", name)
		}
	}
}

func TestFourPhotosAreAllowed(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	in := input("e1")
	in.Photos = []rasvc.PhotoInput{photo(), photo(), photo(), photo()}
	if v := w.read(t, in); v.Status != rsvc.StatusDone || len(w.claude.calls()[0].Turns[0].Images) != 4 {
		t.Fatalf("job = %+v", v)
	}
}

func TestAModelWithoutImageInputRefusesTheRead(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	w.asst.imagesOK = false
	_, err := w.svc.Start(userA, input("e1"))
	if code(err) != rasvc.CodePhotosNotSupport || w.asst.acquired.Load() != 0 {
		t.Errorf("err = %v", err)
	}
}

func TestAnUnreadableImageFailsTheJobWithThePhotoCode(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	w.svc = rsvc.New(rsvc.Deps{Assistant: w.asst, Events: w.events, Contexts: w.events, Clock: w.clk,
		Photos: failingPhotos{&recipeassistant.Error{Code: rasvc.CodePhotoUnsupported}}})
	v := w.read(t, input("e1"))
	if v.Status != rsvc.StatusFailed || errCode(v) != rasvc.CodePhotoUnsupported || len(w.claude.calls()) != 0 {
		t.Errorf("job = %+v", v)
	}
}

type failingPhotos struct{ err error }

func (f failingPhotos) Prepare(context.Context, []rasvc.PhotoInput) ([]rasvc.PreparedPhoto, error) {
	return nil, f.err
}

// ---- availability and the shared Limiter ----------------------------------------------------------------------

func TestUnavailableCarriesTheReasonAndNothingIsHeld(t *testing.T) {
	for _, reason := range []string{"off", "no_key", "no_secret_key", "key_unreadable"} {
		w := newWorld(t, goodAnswer(), 0)
		w.asst.unavailable = reason
		_, err := w.svc.Start(userA, input("e1"))
		var u *rsvc.Unavailable
		if !errors.As(err, &u) || u.Reason != reason {
			t.Errorf("%s: err = %v", reason, err)
		}
		if err := w.svc.Available(context.Background()); !errors.As(err, &u) || u.Reason != reason {
			t.Errorf("%s: Available = %v", reason, err)
		}
		if w.asst.acquired.Load() != 0 {
			t.Errorf("%s: nothing may be held", reason)
		}
	}
	w := newWorld(t, goodAnswer(), 0)
	if err := w.svc.Available(context.Background()); err != nil {
		t.Errorf("Available = %v when the assistant is on", err)
	}
}

func TestTheSharedLimiterRefusalsAreReturnedAsTheyAre(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	w.asst.acquireErr = &recipeassistant.Error{Code: recipeassistant.CodeTooManyReads, RetryAfterSeconds: 1234}
	_, err := w.svc.Start(userA, input("e1"))
	var ae *recipeassistant.Error
	if !errors.As(err, &ae) || ae.Code != recipeassistant.CodeTooManyReads || ae.RetryAfterSeconds != 1234 {
		t.Errorf("err = %v", err)
	}
	w.asst.checkErr = &recipeassistant.Error{Code: recipeassistant.CodeReadInProgress}
	if code(w.svc.Check(userA)) != recipeassistant.CodeReadInProgress {
		t.Errorf("Check must be the Limiter's Check")
	}
}

func TestTheSlotIsHeldWhileReadingAndFreedBeforeTheTerminalStateShows(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	gate := make(chan struct{})
	w.claude.fn = func(ctx context.Context, r rasvc.Request) (rasvc.Response, error) {
		<-gate
		return says(goodAnswer())(ctx, r)
	}
	v, err := w.svc.Start(userA, input("e1"))
	if err != nil || w.asst.acquired.Load() != 1 || w.asst.released.Load() != 0 {
		t.Fatalf("Start: %v, acquired %d released %d", err, w.asst.acquired.Load(), w.asst.released.Load())
	}
	close(gate)
	done := w.wait(t, userA.UserID, v.ID)
	if done.Status != rsvc.StatusDone || w.asst.released.Load() != 1 {
		t.Errorf("a client that sees the end can read again at once: status %s released %d", done.Status, w.asst.released.Load())
	}
}

// ---- failures --------------------------------------------------------------------------------------------------

func TestProviderFailuresAndBadAnswersBecomeFailedJobsWithTheRightCode(t *testing.T) {
	apiErr := func(c string, retry int) func(context.Context, rasvc.Request) (rasvc.Response, error) {
		return func(context.Context, rasvc.Request) (rasvc.Response, error) {
			return rasvc.Response{}, &recipeassistant.Error{Code: c, RetryAfterSeconds: retry}
		}
	}
	for name, tc := range map[string]struct {
		fn    func(context.Context, rasvc.Request) (rasvc.Response, error)
		code  string
		retry int
	}{
		"bad key":                 {apiErr(recipeassistant.CodeBadKey, 0), recipeassistant.CodeBadKey, 0},
		"billing":                 {apiErr(recipeassistant.CodeBilling, 0), recipeassistant.CodeBilling, 0},
		"forbidden":               {apiErr(recipeassistant.CodeForbidden, 0), recipeassistant.CodeForbidden, 0},
		"model unavailable":       {apiErr(recipeassistant.CodeModelUnavailable, 0), recipeassistant.CodeModelUnavailable, 0},
		"rate limited by the API": {apiErr(recipeassistant.CodeRateLimited, 42), recipeassistant.CodeRateLimited, 42},
		"busy":                    {apiErr(recipeassistant.CodeBusy, 0), recipeassistant.CodeBusy, 0},
		"unreachable":             {apiErr(recipeassistant.CodeUnreachable, 0), recipeassistant.CodeUnreachable, 0},
		"refusal":                 {apiErr(recipeassistant.CodeDeclined, 0), recipeassistant.CodeDeclined, 0},
		"too long":                {apiErr(recipeassistant.CodeOutputTooLong, 0), recipeassistant.CodeOutputTooLong, 0},
		"not JSON":                {says("LEAK-RAW-ANSWER this is prose"), recipeassistant.CodeInvalidOutput, 0},
		"a field missing":         {says(`{"readable":true}`), recipeassistant.CodeInvalidOutput, 0},
		"not a receipt":           {says(receipttest.Unreadable()), receipt.CodeNoReceiptFound, 0},
		"no lines":                {says(receipttest.Answer("", "", -1)), receipt.CodeNoReceiptFound, 0},
	} {
		w := newWorld(t, "", 0)
		w.claude.fn = tc.fn
		v := w.read(t, input("e1", "e2", "e3"))
		if v.Status != rsvc.StatusFailed || errCode(v) != tc.code || v.Error.RetryAfterSeconds != tc.retry {
			t.Errorf("%s: job = %+v err=%+v, want failed %s retry %d", name, v, v.Error, tc.code, tc.retry)
		}
		if len(v.Result.Proposals) != 0 {
			t.Errorf("%s: a failed job proposes nothing", name)
		}
		if w.asst.released.Load() != 1 {
			t.Errorf("%s: the slot must be released", name)
		}
	}
}

func TestAnOverlongReceiptIs200LinesPlusOne(t *testing.T) {
	lines := make([]map[string]any, 201)
	for i := range lines {
		lines[i] = receipttest.Line(map[string]any{"row": -1, "text": "x", "count": 1, "priceCents": 1, "name": "x"})
	}
	w := newWorld(t, receipttest.Answer("", "", -1, lines...), 0)
	if v := w.read(t, input("e1")); errCode(v) != recipeassistant.CodeOutputTooLong {
		t.Errorf("job = %+v", v)
	}
}

func TestATimeoutIsUnreachable(t *testing.T) {
	w := newWorld(t, "", 50*time.Millisecond)
	w.claude.fn = func(ctx context.Context, _ rasvc.Request) (rasvc.Response, error) {
		<-ctx.Done()
		return rasvc.Response{}, ctx.Err()
	}
	v := w.read(t, input("e1"))
	if v.Status != rsvc.StatusFailed || errCode(v) != recipeassistant.CodeUnreachable || w.asst.released.Load() != 1 {
		t.Errorf("job = %+v", v)
	}
}

func TestTheDefaultCapIs120Seconds(t *testing.T) {
	if rsvc.DefaultOverall != 120*time.Second {
		t.Errorf("DefaultOverall = %v, want 120s (design §9)", rsvc.DefaultOverall)
	}
}

func TestCancelStopsTheModelCallFreesTheSlotAndFailsTheJobAsCancelled(t *testing.T) {
	w := newWorld(t, "", 0)
	started := make(chan struct{})
	stopped := make(chan struct{})
	w.claude.fn = func(ctx context.Context, _ rasvc.Request) (rasvc.Response, error) {
		close(started)
		<-ctx.Done()
		close(stopped)
		return rasvc.Response{}, ctx.Err()
	}
	v, err := w.svc.Start(userA, input("e1"))
	if err != nil {
		t.Fatal(err)
	}
	<-started
	if !w.svc.Cancel(userA.UserID, v.ID) {
		t.Fatal("Cancel of a running job must report true")
	}
	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("the model call's context was not cancelled")
	}
	got := w.wait(t, userA.UserID, v.ID)
	if got.Status != rsvc.StatusFailed || errCode(got) != rsvc.CodeCancelled || len(got.Result.Proposals) != 0 {
		t.Errorf("job = %+v", got)
	}
	if w.asst.released.Load() != 1 {
		t.Errorf("released = %d", w.asst.released.Load())
	}
	if w.svc.Cancel(userA.UserID, "nope") || w.svc.Cancel(999, v.ID) {
		t.Errorf("Cancel of an unknown id or of another User's job must report false")
	}
}

// ---- jobs ------------------------------------------------------------------------------------------------------

func TestOnlyTheStartingUserSeesAJob(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	v := w.read(t, input("e1"))
	if _, ok := w.svc.Job(userA.UserID, v.ID); !ok {
		t.Fatal("the owner must see it")
	}
	if _, ok := w.svc.Job(8, v.ID); ok {
		t.Errorf("another User must not")
	}
}

func TestJobsAreKeptTenMinutesAndThreePerUser(t *testing.T) {
	w := newWorld(t, goodAnswer(), 0)
	var ids []string
	for i := 0; i < 4; i++ {
		ids = append(ids, w.read(t, input("e1")).ID)
	}
	if _, ok := w.svc.Job(userA.UserID, ids[0]); ok {
		t.Errorf("the oldest of 4 finished jobs must be gone (at most 3 per User)")
	}
	for _, id := range ids[1:] {
		if _, ok := w.svc.Job(userA.UserID, id); !ok {
			t.Errorf("job %s should still be kept", id)
		}
	}
	w.clk.Advance(9*time.Minute + 59*time.Second)
	if _, ok := w.svc.Job(userA.UserID, ids[3]); !ok {
		t.Errorf("a job is kept for 10 minutes after it finishes")
	}
	w.clk.Advance(2 * time.Second)
	if _, ok := w.svc.Job(userA.UserID, ids[3]); ok {
		t.Errorf("a job is dropped 10 minutes after it finishes")
	}
}

// ---- privacy: photos are never stored, never logged (Q4, ADR 0018 decision 4) -----------------------------

func TestNothingIsWrittenToDiskAndTheJobViewHoldsNoPhotoBytes(t *testing.T) {
	work, tmp := t.TempDir(), t.TempDir()
	t.Setenv("TMPDIR", tmp)
	wd, _ := os.Getwd()
	if err := os.Chdir(work); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(wd) })

	w := newWorld(t, goodAnswer(), 0)
	v := w.read(t, input("e1", "e2", "e3"))
	if v.Status != rsvc.StatusDone {
		t.Fatalf("job = %+v", v)
	}
	for _, dir := range []string{work, tmp} {
		if ents, _ := os.ReadDir(dir); len(ents) != 0 {
			t.Errorf("%s is not empty after a read: the photo must live in memory only (%d entries)", dir, len(ents))
		}
	}
	seen, _ := w.svc.Job(userA.UserID, v.ID)
	raw, _ := json.Marshal(seen)
	for _, s := range []string{string(raw), fmt.Sprintf("%+v", seen), fmt.Sprintf("%#v", seen)} {
		if strings.Contains(s, photoMarker) || strings.Contains(s, "data:image") {
			t.Errorf("a kept job holds photo bytes: %.80s", s)
		}
	}
}

func TestLogsCarryNoRowsLinesPricesOrPhotos(t *testing.T) {
	leaks := []string{nameMutti, nameBarilla, barcodeMut, barcodeBar, "QVX MUTTI", "QVX BARILLA", "7771", "77.71", "77,71",
		photoMarker, "data:image", "/9j/", "LEAK-RAW-ANSWER", "Esselunga", "Mutti", "Barilla"}
	for name, fn := range map[string]func(context.Context, rasvc.Request) (rasvc.Response, error){
		"done":           says(goodAnswer()),
		"invalid output": says("LEAK-RAW-ANSWER " + nameMutti + " 7771"),
		"unreadable":     says(receipttest.Unreadable()),
		"provider error": func(context.Context, rasvc.Request) (rasvc.Response, error) {
			return rasvc.Response{}, errors.New("provider said: " + nameMutti + " " + barcodeMut)
		},
	} {
		w := newWorld(t, "", 0)
		w.claude.fn = fn
		w.read(t, input("e1", "e2", "e3"))
		out := w.logs.String()
		for _, leak := range leaks {
			if strings.Contains(out, leak) {
				t.Errorf("%s: the logs contain %q:\n%s", name, leak, out)
			}
		}
	}
}

func TestLoggingAJobViewByMistakeIsSafe(t *testing.T) {
	// The RR1 types print summaries; the job view must be as careful when a developer logs or prints it.
	w := newWorld(t, goodAnswer(), 0)
	v := w.read(t, input("e1", "e2", "e3"))
	var b bytes.Buffer
	l := slog.New(slog.NewTextHandler(&b, nil))
	l.Info("job", "view", v)
	out := b.String() + fmt.Sprintf("%v %+v", v, v)
	for _, leak := range []string{nameMutti, barcodeMut, "7771", "QVX"} {
		if strings.Contains(out, leak) {
			t.Errorf("printing or slogging a JobView leaks %q: %s", leak, out)
		}
	}
}
