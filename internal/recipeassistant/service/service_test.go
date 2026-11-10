package service_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"log/slog"
	"math/rand"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/store"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/safehttp"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
)

const (
	savedKey   = "sk-test-key-SECRET-1234"
	savedModel = "claude-haiku-5-5"
	savedBase  = "https://api.anthropic.com"
	masterB64  = "W1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1s="
)

var t0 = time.Date(2026, 11, 10, 9, 0, 0, 0, time.UTC)

// ---- stubs -----------------------------------------------------------------------------------------------------

type reply struct {
	resp service.Response
	err  error
}

// stubClaude answers Message from a script; the last entry repeats. block, when set, is called first (it can wait for ctx).
type stubClaude struct {
	mu      sync.Mutex
	calls   []service.Request
	ctxs    []context.Context
	script  []reply
	block   func(ctx context.Context)
	info    service.ModelInfo
	models  []service.ModelInfo
	started chan struct{}
}

func okText(text string) reply {
	return reply{resp: service.Response{Text: text, StopReason: "end_turn", RequestID: "req_1"}}
}

func (c *stubClaude) Message(ctx context.Context, r service.Request) (service.Response, error) {
	c.mu.Lock()
	c.calls = append(c.calls, r)
	c.ctxs = append(c.ctxs, ctx)
	i := len(c.calls) - 1
	if i >= len(c.script) {
		i = len(c.script) - 1
	}
	rep := c.script[i]
	block, started := c.block, c.started
	c.mu.Unlock()
	if started != nil {
		select {
		case started <- struct{}{}:
		default:
		}
	}
	if block != nil {
		block(ctx)
		if ctx.Err() != nil {
			return service.Response{}, ctx.Err()
		}
	}
	return rep.resp, rep.err
}
func (c *stubClaude) Models(context.Context) ([]service.ModelInfo, error) { return c.models, nil }
func (c *stubClaude) Model(_ context.Context, id string) (service.ModelInfo, error) {
	for _, m := range c.models {
		if m.ID == id {
			return m, nil
		}
	}
	return service.ModelInfo{}, &recipeassistant.Error{Code: recipeassistant.CodeModelUnavailable}
}
func (c *stubClaude) callCount() int { c.mu.Lock(); defer c.mu.Unlock(); return len(c.calls) }
func (c *stubClaude) call(i int) service.Request {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.calls[i]
}

type stubPages struct {
	mu    sync.Mutex
	n     int
	page  safehttp.Page
	err   error
	block func(context.Context)
}

func (p *stubPages) FetchPage(ctx context.Context, u string) (safehttp.Page, error) {
	p.mu.Lock()
	p.n++
	page, err := p.page, p.err
	p.mu.Unlock()
	if p.block != nil {
		p.block(ctx)
	}
	return page, err
}
func (p *stubPages) count() int { p.mu.Lock(); defer p.mu.Unlock(); return p.n }

type stubPhotos struct {
	err  error
	out  []service.PreparedPhoto
	seen []service.PhotoInput
}

func (p *stubPhotos) Prepare(_ context.Context, in []service.PhotoInput) ([]service.PreparedPhoto, error) {
	p.seen = in
	if p.err != nil {
		return nil, p.err
	}
	return p.out, nil
}

type recSink struct {
	mu     sync.Mutex
	opened []sinkCall
}
type sinkCall struct {
	user   int64
	file   recipefile.File
	photos []recipefile.CandidatePhoto
}

func (s *recSink) OpenReview(_ context.Context, user int64, f recipefile.File, _ recipefile.ImageSet, photos []recipefile.CandidatePhoto) (service.ReviewRef, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.opened = append(s.opened, sinkCall{user, f, photos})
	return service.ReviewRef{ID: fmt.Sprintf("review-%d", len(s.opened))}, nil
}
func (s *recSink) calls() []sinkCall {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]sinkCall(nil), s.opened...)
}

type noImages struct{}

func (noImages) Fetch(context.Context, string) ([]byte, string, error) {
	return nil, "", errors.New("no network in tests")
}

// ---- environment -----------------------------------------------------------------------------------------------

type env struct {
	svc    *service.Service
	st     *store.Store
	clk    *clock.Fake
	claude *stubClaude
	pages  *stubPages
	photos *stubPhotos
	sink   *recSink
	log    *bytes.Buffer
	conns  []service.Conn
}

type opts struct {
	enabled   bool
	noSecret  bool
	otherMast bool // the row was sealed under another master key
	overall   time.Duration
	model     service.ModelInfo
}

func newEnv(t *testing.T, o opts) *env {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(t0)
	st := store.New(d, clk)
	mk, err := secretbox.ParseMasterKey(masterB64)
	if err != nil {
		t.Fatal(err)
	}
	box, _ := secretbox.New(mk)
	sealed, _ := box.Seal([]byte(savedKey))
	masterID := mk.ID()
	if o.otherMast {
		masterID = "0000000000000000"
	}
	if err := st.Save(context.Background(), store.SaveInput{
		Settings: recipeassistant.Settings{Enabled: o.enabled, BaseURL: savedBase, Model: savedModel, HasKey: true, KeyLast4: "1234"},
		Key:      &store.SealedKey{Ciphertext: sealed, MasterID: masterID, Last4: "1234"}, Actor: store.Actor{UserID: 1, Email: "admin@example.test"},
	}); err != nil {
		t.Fatal(err)
	}
	e := &env{st: st, clk: clk, pages: &stubPages{}, photos: &stubPhotos{}, sink: &recSink{}, log: &bytes.Buffer{}}
	info := o.model
	if info.ID == "" {
		info = service.ModelInfo{ID: savedModel, DisplayName: "Claude Haiku 5.5", StructuredOutputs: true, ImageInput: true, Lifecycle: "active"}
	}
	e.claude = &stubClaude{script: []reply{okText(fakeanthropic.ValidFile())}, info: info, models: []service.ModelInfo{info}}
	deps := service.Deps{
		Store: st, Box: box, MasterID: mk.ID(), Pages: e.pages, Images: noImages{}, Photos: e.photos, Clock: clk,
		Claude:  func(c service.Conn) service.Claude { e.conns = append(e.conns, c); return e.claude },
		Logger:  slog.New(slog.NewTextHandler(e.log, &slog.HandlerOptions{Level: slog.LevelDebug})),
		Overall: o.overall,
	}
	if o.noSecret {
		deps.Box, deps.MasterID = nil, ""
	}
	e.svc = service.New(deps)
	return e
}

var (
	user  = recipeassistant.Caller{UserID: 10, HouseholdID: 1}
	user2 = recipeassistant.Caller{UserID: 11, HouseholdID: 1}
	admin = recipeassistant.Caller{UserID: 1, HouseholdID: 1, Admin: true}
)

func textIn(s string) service.ReadInput {
	return service.ReadInput{Kind: recipeassistant.KindText, Text: s}
}

func (e *env) start(t *testing.T, c recipeassistant.Caller, in service.ReadInput) service.JobView {
	t.Helper()
	jv, err := e.svc.StartRead(c, in, e.sink)
	if err != nil {
		t.Fatalf("StartRead: %v", err)
	}
	return jv
}

func (e *env) wait(t *testing.T, c recipeassistant.Caller, id string, states ...string) service.JobView {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if jv, ok := e.svc.Job(c.UserID, id); ok {
			for _, s := range states {
				if jv.State == s {
					return jv
				}
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	jv, _ := e.svc.Job(c.UserID, id)
	t.Fatalf("job %s never reached %v; now %+v", id, states, jv)
	return jv
}

func (e *env) done(t *testing.T, c recipeassistant.Caller, in service.ReadInput) service.JobView {
	t.Helper()
	jv := e.start(t, c, in)
	return e.wait(t, c, jv.ID, service.StateDone, service.StateFailed, service.StateCancelled)
}

func code(err error) string { return recipeassistant.CodeOf(err) }

func jobCode(jv service.JobView) string {
	if jv.Error == nil {
		return ""
	}
	return jv.Error.Code
}

func noisyJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	r := rand.New(rand.NewSource(2))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = uint8(r.Intn(256)), uint8(r.Intn(256)), uint8(r.Intn(256)), 255
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 80}); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// ---- lifecycle -------------------------------------------------------------------------------------------------

func TestATextReadGoesReadingCheckingImagesDoneAndOpensTheReview(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	jv := e.start(t, user, textIn("Pancakes: 200 g flour, 2 eggs. Mix and fry."))
	if jv.ID == "" || jv.State != service.StateReading {
		t.Fatalf("a text read starts in reading: %+v", jv)
	}
	jv = e.wait(t, user, jv.ID, service.StateDone, service.StateFailed)
	if jv.State != service.StateDone || jv.Error != nil {
		t.Fatalf("job = %+v", jv)
	}
	want := []string{service.StateReading, service.StateChecking, service.StateImages, service.StateDone}
	if strings.Join(jv.States, ",") != strings.Join(want, ",") {
		t.Errorf("states = %v, want %v", jv.States, want)
	}
	if jv.Review == nil || jv.Review.ID != "review-1" || jv.Source == nil || jv.Source.Kind != recipeassistant.KindText {
		t.Errorf("review/source = %+v / %+v", jv.Review, jv.Source)
	}
	if jv.Model == nil || jv.Model.ID != savedModel || jv.Model.Name == "" {
		t.Errorf("model = %+v", jv.Model)
	}
	calls := e.sink.calls()
	if len(calls) != 1 || calls[0].user != user.UserID || len(calls[0].file.Recipes) != 2 || len(calls[0].photos) != 0 {
		t.Fatalf("sink = %+v", calls)
	}
	for i, r := range calls[0].file.Recipes {
		if r.Source != nil && r.Source.URL != "" {
			t.Errorf("recipe %d: text reads never carry source.url, got %q", i, r.Source.URL)
		}
	}
	if calls[0].file.Format != recipefile.Format {
		t.Errorf("format = %q", calls[0].file.Format)
	}
}

func TestTheRequestToTheModelHasTheDocumentedShape(t *testing.T) {
	e := newEnv(t, opts{enabled: true, model: service.ModelInfo{ID: savedModel, DisplayName: "Claude Haiku 5.5", StructuredOutputs: true, ImageInput: true, Effort: true}})
	e.done(t, user, textIn("Toast with butter #fake:valid"))
	if e.claude.callCount() != 1 {
		t.Fatalf("calls = %d", e.claude.callCount())
	}
	r := e.claude.call(0)
	schema, _ := recipeassistant.OutputSchema(spec.Schema)
	if r.Model != savedModel || r.MaxTokens != 16000 || string(r.Schema) != string(schema) {
		t.Errorf("model/max_tokens/schema wrong: %q %d schema-equal=%v", r.Model, r.MaxTokens, string(r.Schema) == string(schema))
	}
	if !strings.HasSuffix(r.System, recipeassistant.Addendum) || !strings.Contains(r.System, "feeder-recipe-file") {
		t.Errorf("system must be Agent Prompt + addendum")
	}
	if r.Effort != "medium" {
		t.Errorf("effort = %q, want medium for a model whose capabilities say effort is supported", r.Effort)
	}
	if len(r.Turns) != 1 || r.Turns[0].Role != "user" || !strings.HasPrefix(r.Turns[0].Text, `<source kind="text">`) || len(r.Turns[0].Images) != 0 {
		t.Errorf("turns = %+v", r.Turns)
	}
	// effort is not sent to a model that does not say it supports it
	e2 := newEnv(t, opts{enabled: true})
	e2.done(t, user, textIn("Toast"))
	if got := e2.claude.call(0).Effort; got != "" {
		t.Errorf("effort = %q, want none", got)
	}
}

func TestAPageReadFetchesThenReadsAndForcesTheFinalURLOnEveryRecipe(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.pages.page = safehttp.Page{ContentType: "text/html", FinalURL: "https://cook.example/recipes/tikka", Body: []byte(`<html><head><title>Tikka</title>
<script type="application/ld+json">{"@type":"Recipe","name":"Tikka","recipeIngredient":["500 g chicken"],"recipeInstructions":["Bake"]}</script></head>
<body><main><h1>Tikka</h1><ul><li>500 g chicken</li></ul><p>Bake it.</p></main></body></html>`)}
	jv := e.start(t, user, service.ReadInput{Kind: recipeassistant.KindPage, URL: "https://cook.example/recipes/tikka?utm=1"})
	if jv.State != service.StateFetching {
		t.Errorf("a page read starts in fetching: %q", jv.State)
	}
	jv = e.wait(t, user, jv.ID, service.StateDone, service.StateFailed)
	if jv.State != service.StateDone {
		t.Fatalf("job = %+v", jv)
	}
	if got := strings.Join(jv.States, ","); got != "fetching,reading,checking,images,done" {
		t.Errorf("states = %s", got)
	}
	if jv.Source == nil || jv.Source.URL != "https://cook.example/recipes/tikka" || !jv.Source.StructuredData || jv.Source.Title == "" {
		t.Errorf("source = %+v", jv.Source)
	}
	turn := e.claude.call(0).Turns[0].Text
	iData, iText := strings.Index(turn, "<structured_data>"), strings.Index(turn, "<page_text>")
	if iData < 0 || iText < iData || !strings.Contains(turn, `url="https://cook.example/recipes/tikka"`) {
		t.Errorf("user turn must carry structured_data before page_text and the final url: %s", turn)
	}
	for i, r := range e.sink.calls()[0].file.Recipes {
		if r.Source == nil || r.Source.URL != "https://cook.example/recipes/tikka" {
			t.Errorf("recipe %d source = %+v, want the final URL", i, r.Source)
		}
	}
}

func TestAPageThatCannotBeOpenedFailsGenericallyWithoutCallingTheModel(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.pages.err = safehttp.ErrBlocked
	jv := e.done(t, user, service.ReadInput{Kind: recipeassistant.KindPage, URL: "https://cook.example/x"})
	if jv.State != service.StateFailed || jobCode(jv) != service.CodePageUnavailable {
		t.Fatalf("job = %+v", jv)
	}
	if strings.Contains(jv.Error.Message, "blocked") || e.claude.callCount() != 0 {
		t.Errorf("the cause must not leak to the User (no SSRF oracle); calls=%d msg=%q", e.claude.callCount(), jv.Error.Message)
	}
	if err := e.svc.Check(user); err != nil {
		t.Errorf("a failed read releases the slot: %v", err)
	}
}

func TestPhotoReadPreparesThenReadsAndHandsShrunkCandidatesToTheSink(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.photos.out = []service.PreparedPhoto{
		{JPEG: noisyJPEG(t, 2576, 1800), Width: 2576, Height: 1800},
		{JPEG: noisyJPEG(t, 900, 1200), Width: 900, Height: 1200},
	}
	in := service.ReadInput{Kind: recipeassistant.KindPhoto, Photos: []service.PhotoInput{{DataURL: "data:image/png;base64,AAAA"}, {URL: "https://img.example/b.jpg"}}}
	jv := e.start(t, user, in)
	if jv.State != service.StatePreparing {
		t.Errorf("a photo read starts in preparing: %q", jv.State)
	}
	jv = e.wait(t, user, jv.ID, service.StateDone, service.StateFailed)
	if jv.State != service.StateDone || jv.Source.PhotoCount != 2 {
		t.Fatalf("job = %+v", jv)
	}
	if got := strings.Join(jv.States, ","); got != "preparing,reading,checking,images,done" {
		t.Errorf("states = %s", got)
	}
	if len(e.photos.seen) != 2 {
		t.Errorf("Prepare got %d photos", len(e.photos.seen))
	}
	turn := e.claude.call(0).Turns[0]
	if len(turn.Images) != 2 || turn.Images[0].MediaType != "image/jpeg" || !strings.HasPrefix(turn.Text, `<source kind="photo"`) {
		t.Errorf("turn = images %d, text %.40q", len(turn.Images), turn.Text)
	}
	got := e.sink.calls()[0].photos
	if len(got) != 2 {
		t.Fatalf("candidates = %d, want 2", len(got))
	}
	if got[0].Width != recipefile.CandidateMaxSide || got[0].Height >= 1600 {
		t.Errorf("candidate 0 = %dx%d, want long side %d (shrunk from 2576)", got[0].Width, got[0].Height, recipefile.CandidateMaxSide)
	}
	if got[1].Width != 900 || got[1].Height != 1200 {
		t.Errorf("candidate 1 = %dx%d, must not be upscaled or changed", got[1].Width, got[1].Height)
	}
	for i, r := range e.sink.calls()[0].file.Recipes {
		if r.Image != "" {
			t.Errorf("recipe %d: photo reads keep no images, got %q", i, r.Image)
		}
		for _, s := range r.Steps {
			if s.Image != "" {
				t.Errorf("recipe %d: step image kept", i)
			}
		}
	}
}

func TestAFailedOrDeclinedPhotoReadKeepsNoPhotos(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.photos.out = []service.PreparedPhoto{{JPEG: noisyJPEG(t, 300, 200), Width: 300, Height: 200}}
	e.claude.script = []reply{{err: &recipeassistant.Error{Code: recipeassistant.CodeDeclined, Model: savedModel}}}
	jv := e.done(t, user, service.ReadInput{Kind: recipeassistant.KindPhoto, Photos: []service.PhotoInput{{DataURL: "data:image/png;base64,AAAA"}}})
	if jv.State != service.StateFailed || len(e.sink.calls()) != 0 {
		t.Fatalf("a failed read opens no Review (so no candidates exist): %+v sink=%d", jv, len(e.sink.calls()))
	}
	e2 := newEnv(t, opts{enabled: true})
	e2.photos.err = &recipeassistant.Error{Code: service.CodePhotoTooLarge}
	jv = e2.done(t, user, service.ReadInput{Kind: recipeassistant.KindPhoto, Photos: []service.PhotoInput{{DataURL: "data:image/png;base64,AAAA"}}})
	if jobCode(jv) != service.CodePhotoTooLarge || e2.claude.callCount() != 0 {
		t.Errorf("photo errors are reported as they are, before any model call: %+v calls=%d", jv, e2.claude.callCount())
	}
}

// ---- repair, refusal, errors -----------------------------------------------------------------------------------

func TestOneRepairTurnAppendsTheAnswerUnchangedAndListsTheErrors(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	bad := fakeanthropic.InvalidFile()
	e.claude.script = []reply{okText(bad), okText(fakeanthropic.ValidFile())}
	jv := e.done(t, user, textIn("Lasagne"))
	if jv.State != service.StateDone || e.claude.callCount() != 2 {
		t.Fatalf("state %s, calls %d, want done after exactly 2 calls: %+v", jv.State, e.claude.callCount(), jv)
	}
	_, ferr := recipeassistant.Finish([]byte(bad), recipeassistant.FinishInput{Kind: recipeassistant.KindText})
	var ae *recipeassistant.Error
	if !errors.As(ferr, &ae) || len(ae.Paths) == 0 {
		t.Fatalf("fixture must be invalid: %v", ferr)
	}
	first, second := e.claude.call(0), e.claude.call(1)
	if second.Model != first.Model || second.System != first.System || string(second.Schema) != string(first.Schema) {
		t.Error("the repair is the same request with more turns: same model, system and schema")
	}
	if len(second.Turns) != 3 || second.Turns[1].Role != "assistant" || second.Turns[1].Text != bad || second.Turns[2].Role != "user" ||
		second.Turns[2].Text != recipeassistant.RepairPrompt(ae.Paths) || second.Turns[0].Text != first.Turns[0].Text {
		t.Errorf("repair turns = %+v", second.Turns)
	}
}

func TestStillInvalidAfterTheRepairFailsWithThePathsAndNeverAsksAThirdTime(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.claude.script = []reply{okText(fakeanthropic.InvalidFile())}
	jv := e.done(t, user, textIn("Lasagne"))
	if jv.State != service.StateFailed || jobCode(jv) != recipeassistant.CodeInvalidOutput || len(jv.Error.Paths) == 0 {
		t.Fatalf("job = %+v", jv)
	}
	if e.claude.callCount() != 2 || len(e.sink.calls()) != 0 {
		t.Errorf("calls = %d (want 2), sink = %d (want 0)", e.claude.callCount(), len(e.sink.calls()))
	}
}

func TestARefusalIsReportedWithTheModelAndNeverRetriedOnAnotherModel(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.claude.script = []reply{{resp: service.Response{StopReason: "refusal"}, err: &recipeassistant.Error{Code: recipeassistant.CodeDeclined, Model: savedModel}}}
	jv := e.done(t, user, textIn("something"))
	if jobCode(jv) != recipeassistant.CodeDeclined || jv.Error.Model != savedModel {
		t.Fatalf("job = %+v", jv)
	}
	if e.claude.callCount() != 1 {
		t.Errorf("a refusal gets exactly one call (no repair, no fallback), got %d", e.claude.callCount())
	}
	if len(e.conns) != 1 {
		t.Errorf("one client per read, got %d", len(e.conns))
	}
}

func TestModelAndAPIErrorsPassThroughWithTheirDetails(t *testing.T) {
	for name, tc := range map[string]struct {
		err   *recipeassistant.Error
		check func(*recipeassistant.Error) bool
	}{
		"max tokens":   {&recipeassistant.Error{Code: recipeassistant.CodeOutputTooLong}, func(e *recipeassistant.Error) bool { return true }},
		"rate limited": {&recipeassistant.Error{Code: recipeassistant.CodeRateLimited, RetryAfterSeconds: 30}, func(e *recipeassistant.Error) bool { return e.RetryAfterSeconds == 30 }},
		"bad key":      {&recipeassistant.Error{Code: recipeassistant.CodeBadKey}, func(e *recipeassistant.Error) bool { return true }},
	} {
		e := newEnv(t, opts{enabled: true})
		e.claude.script = []reply{{err: tc.err}}
		jv := e.done(t, user, textIn("x"))
		if jv.State != service.StateFailed || jobCode(jv) != tc.err.Code || !tc.check(jv.Error) {
			t.Errorf("%s: %+v", name, jv)
		}
		if e.claude.callCount() != 1 {
			t.Errorf("%s: calls = %d, want 1 (retries live in the adapter)", name, e.claude.callCount())
		}
	}
}

func TestNoRecipeAnswerFailsAsNoRecipeFound(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.claude.script = []reply{okText(`{"format":"feeder-recipe-file","version":1,"recipes":[],"noRecipe":true}`)}
	jv := e.done(t, user, textIn("hello"))
	if jobCode(jv) != recipeassistant.CodeNoRecipeFound || e.claude.callCount() != 1 {
		t.Errorf("job = %+v calls = %d", jv, e.claude.callCount())
	}
}

// ---- 180 s cap, cancel -----------------------------------------------------------------------------------------

func TestTheWholeReadIsCappedAndTheSlotIsReleased(t *testing.T) {
	e := newEnv(t, opts{enabled: true, overall: 150 * time.Millisecond})
	e.claude.block = func(ctx context.Context) { <-ctx.Done() }
	jv := e.done(t, user, textIn("slow"))
	if jv.State != service.StateFailed || jobCode(jv) != recipeassistant.CodeUnreachable {
		t.Fatalf("an overall timeout is assistant_unreachable: %+v", jv)
	}
	if e.claude.ctxs[0].Err() == nil {
		t.Error("the model call must have been cancelled")
	}
	if err := e.svc.Check(user); err != nil {
		t.Errorf("slot not released: %v", err)
	}
}

func TestTheDefaultCapIs180Seconds(t *testing.T) {
	if service.DefaultOverall != 180*time.Second {
		t.Fatalf("DefaultOverall = %v", service.DefaultOverall)
	}
	e := newEnv(t, opts{enabled: true})
	e.claude.started = make(chan struct{}, 1)
	release := make(chan struct{})
	e.claude.block = func(ctx context.Context) {
		select {
		case <-release:
		case <-ctx.Done():
		}
	}
	jv := e.start(t, user, textIn("x"))
	<-e.claude.started
	dl, ok := e.claude.ctxs[0].Deadline()
	if !ok || dl.Sub(time.Now()) > 181*time.Second || dl.Sub(time.Now()) < 170*time.Second {
		t.Errorf("deadline of the model call = %v (ok=%v), want about 180 s from now", dl, ok)
	}
	close(release)
	e.wait(t, user, jv.ID, service.StateDone, service.StateFailed)
}

func TestCancelStopsTheCallDropsTheJobsWorkAndFreesTheSlot(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.claude.started = make(chan struct{}, 1)
	e.claude.block = func(ctx context.Context) { <-ctx.Done() }
	jv := e.start(t, user, textIn("x"))
	<-e.claude.started
	if e.svc.CancelJob(user2.UserID, jv.ID) {
		t.Error("another User must not cancel the read")
	}
	if _, ok := e.svc.Job(user2.UserID, jv.ID); ok {
		t.Error("another User must not see the read")
	}
	if !e.svc.CancelJob(user.UserID, jv.ID) {
		t.Fatal("CancelJob = false for the owner")
	}
	got := e.wait(t, user, jv.ID, service.StateCancelled)
	if got.Review != nil || len(e.sink.calls()) != 0 {
		t.Errorf("a cancelled read opens nothing: %+v", got)
	}
	if e.claude.ctxs[0].Err() == nil {
		t.Error("cancel must cancel the in-flight model call")
	}
	if err := e.svc.Check(user); err != nil {
		t.Errorf("slot not released: %v", err)
	}
}

// ---- limits ----------------------------------------------------------------------------------------------------

func TestLimitsCheckComesBeforeAnyWorkAndNeverCountsOrHolds(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.claude.started = make(chan struct{}, 1)
	release := make(chan struct{})
	e.claude.block = func(ctx context.Context) {
		select {
		case <-release:
		case <-ctx.Done():
		}
	}
	jv := e.start(t, user, textIn("first"))
	<-e.claude.started
	callsBefore, pagesBefore := e.claude.callCount(), e.pages.count()
	if code(e.svc.Check(user)) != recipeassistant.CodeReadInProgress {
		t.Errorf("Check while running = %v", e.svc.Check(user))
	}
	_, err := e.svc.StartRead(user, service.ReadInput{Kind: recipeassistant.KindPage, URL: "https://cook.example/x"}, e.sink)
	if code(err) != recipeassistant.CodeReadInProgress {
		t.Errorf("a second read of the same User = %v", err)
	}
	adm := admin
	adm.UserID = user.UserID // the same person as an Admin: still one running read per User
	adm.Admin = true
	if code(e.svc.Check(adm)) != recipeassistant.CodeReadInProgress {
		t.Error("Admins are not exempt from one running read")
	}
	if e.claude.callCount() != callsBefore || e.pages.count() != pagesBefore {
		t.Error("a refused read must not fetch or call anything")
	}
	if err := e.svc.Check(user2); err != nil {
		t.Errorf("another User is not blocked: %v", err)
	}
	close(release)
	e.wait(t, user, jv.ID, service.StateDone)
}

func TestThirtyReadsAnHourPerHouseholdAdminsExemptAndUncounted(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	for i := 0; i < recipeassistant.HourlyReadLimit; i++ {
		who := user
		if i%2 == 1 {
			who = user2 // same Household
		}
		if jv := e.done(t, who, textIn(fmt.Sprintf("recipe %d", i))); jv.State != service.StateDone {
			t.Fatalf("read %d: %+v", i, jv)
		}
	}
	err := e.svc.Check(user)
	var ae *recipeassistant.Error
	if code(err) != recipeassistant.CodeTooManyReads || !errors.As(err, &ae) || ae.RetryAfterSeconds <= 0 {
		t.Fatalf("Check at the limit = %v", err)
	}
	if _, err := e.svc.StartRead(user2, textIn("one more"), e.sink); code(err) != recipeassistant.CodeTooManyReads {
		t.Errorf("31st read = %v", err)
	}
	for i := 0; i < 5; i++ { // an Admin keeps reading, and does not use the Household's budget
		if jv := e.done(t, admin, textIn(fmt.Sprintf("admin %d", i))); jv.State != service.StateDone {
			t.Fatalf("admin read %d: %+v", i, jv)
		}
	}
	e.clk.Advance(time.Hour + time.Second)
	if err := e.svc.Check(user); err != nil {
		t.Errorf("after the window: %v", err)
	}
}

func TestRefusedStartsCountNothing(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	for i := 0; i < recipeassistant.HourlyReadLimit-1; i++ {
		e.done(t, user, textIn(fmt.Sprintf("r%d", i)))
	}
	for name, in := range map[string]service.ReadInput{
		"empty text":   textIn("   "),
		"long text":    textIn(strings.Repeat("a", recipeassistant.MaxTextChars+1)),
		"no photos":    {Kind: recipeassistant.KindPhoto},
		"five photos":  {Kind: recipeassistant.KindPhoto, Photos: make([]service.PhotoInput, 5)},
		"http url":     {Kind: recipeassistant.KindPage, URL: "http://cook.example/x"},
		"not a url":    {Kind: recipeassistant.KindPage, URL: "pancakes"},
		"url userinfo": {Kind: recipeassistant.KindPage, URL: "https://u:p@cook.example/x"},
	} {
		if _, err := e.svc.StartRead(user, in, e.sink); err == nil {
			t.Errorf("%s: want a validation error", name)
		}
	}
	if err := e.svc.Check(user); err != nil {
		t.Fatalf("refused starts must not count or hold: %v", err)
	}
	if jv := e.done(t, user, textIn("the 30th")); jv.State != service.StateDone {
		t.Fatalf("30th read: %+v", jv)
	}
	if err := e.svc.Check(user); code(err) != recipeassistant.CodeTooManyReads {
		t.Errorf("now at the limit: %v", err)
	}
}

func TestValidationCodes(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	for want, in := range map[string]service.ReadInput{
		recipeassistant.CodeTextEmpty:   textIn(" \n "),
		recipeassistant.CodeTextTooLong: textIn(strings.Repeat("é", recipeassistant.MaxTextChars+1)),
		service.CodePhotosEmpty:         {Kind: recipeassistant.KindPhoto},
		service.CodeTooManyPhotos:       {Kind: recipeassistant.KindPhoto, Photos: make([]service.PhotoInput, service.MaxPhotos+1)},
		service.CodeURLInvalid:          {Kind: recipeassistant.KindPage, URL: "ftp://cook.example/x"},
	} {
		if _, err := e.svc.StartRead(user, in, e.sink); code(err) != want {
			t.Errorf("want %s, got %v", want, err)
		}
	}
	if _, err := e.svc.StartRead(user, textIn(strings.Repeat("é", recipeassistant.MaxTextChars)), e.sink); err != nil {
		t.Errorf("exactly 50,000 characters is fine (runes, not bytes): %v", err)
	}
}

// ---- availability ----------------------------------------------------------------------------------------------

func TestAReadNeedsAnAvailableAssistant(t *testing.T) {
	for name, o := range map[string]opts{
		"off":                  {enabled: false},
		"no secret key":        {enabled: true, noSecret: true},
		"key sealed elsewhere": {enabled: true, otherMast: true},
	} {
		e := newEnv(t, o)
		if _, err := e.svc.StartRead(user, textIn("x"), e.sink); code(err) != service.CodeAssistantOff {
			t.Errorf("%s: StartRead = %v, want assistant_off", name, err)
		}
		if e.claude.callCount() != 0 {
			t.Errorf("%s: no model call", name)
		}
	}
	e := newEnv(t, opts{enabled: true, model: service.ModelInfo{ID: savedModel, DisplayName: "Text only", StructuredOutputs: true, ImageInput: false}})
	e.photos.out = []service.PreparedPhoto{{JPEG: noisyJPEG(t, 50, 50), Width: 50, Height: 50}}
	if _, err := e.svc.StartRead(user, service.ReadInput{Kind: recipeassistant.KindPhoto, Photos: []service.PhotoInput{{DataURL: "data:image/png;base64,AAAA"}}}, e.sink); code(err) != service.CodePhotosNotSupport {
		t.Errorf("a model known to lack image input: %v", err)
	}
}

func TestStatusReasonsAndLimit(t *testing.T) {
	ctx := context.Background()
	for reason, o := range map[string]opts{
		"off":               {enabled: false},
		"no_secret_key":     {enabled: true, noSecret: true},
		"key_unreadable":    {enabled: true, otherMast: true},
		"model_unavailable": {enabled: true, model: service.ModelInfo{ID: "something-else", DisplayName: "x", StructuredOutputs: true}},
	} {
		e := newEnv(t, o)
		st, err := e.svc.Status(ctx, user)
		if err != nil || st.Available || st.Reason != reason {
			t.Errorf("%s: %+v %v", reason, st, err)
		}
	}
	e := newEnv(t, opts{enabled: true})
	st, err := e.svc.Status(ctx, user)
	if err != nil || !st.Available || st.Reason != "" || !st.Photos || st.Model == nil || st.Model.ID != savedModel || st.Limit == nil || st.Limit.Remaining != 30 {
		t.Fatalf("status = %+v %v", st, err)
	}
	e.done(t, user, textIn("x"))
	if st, _ = e.svc.Status(ctx, user2); st.Limit == nil || st.Limit.Remaining != 29 || st.Limit.ResetsInSeconds <= 0 {
		t.Errorf("remaining is per Household: %+v", st.Limit)
	}
	if st, _ = e.svc.Status(ctx, admin); st.Limit != nil {
		t.Errorf("Admins have no limit: %+v", st.Limit)
	}
	e2 := newEnv(t, opts{enabled: true, model: service.ModelInfo{ID: savedModel, DisplayName: "T", StructuredOutputs: true, ImageInput: false}})
	if st, _ = e2.svc.Status(ctx, user); !st.Available || st.Photos {
		t.Errorf("photos must be false for a model without image input: %+v", st)
	}
}

// ---- jobs ------------------------------------------------------------------------------------------------------

func TestFinishedJobsAreKeptTenMinutesAndThreePerUser(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	var ids []string
	for i := 0; i < 4; i++ {
		jv := e.done(t, user, textIn(fmt.Sprintf("r%d", i)))
		ids = append(ids, jv.ID)
		e.clk.Advance(time.Second)
	}
	if _, ok := e.svc.Job(user.UserID, ids[0]); ok {
		t.Error("only the newest 3 finished jobs are kept per User")
	}
	for _, id := range ids[1:] {
		if _, ok := e.svc.Job(user.UserID, id); !ok {
			t.Errorf("job %s should still be there", id)
		}
	}
	e.clk.Advance(11 * time.Minute)
	if _, ok := e.svc.Job(user.UserID, ids[3]); ok {
		t.Error("a finished job is dropped 10 minutes after it finished")
	}
}

// ---- origin-bound key ------------------------------------------------------------------------------------------

func TestModelsAndTestResolveTheKeyWithKeyForBeforeAnyClientIsBuilt(t *testing.T) {
	ctx := context.Background()
	e := newEnv(t, opts{enabled: true})
	for name, call := range map[string]func(in service.ConnInput) error{
		"models": func(in service.ConnInput) error { _, err := e.svc.Models(ctx, in, false); return err },
		"test":   func(in service.ConnInput) error { _, err := e.svc.TestConnection(ctx, in); return err },
	} {
		before := len(e.conns)
		err := call(service.ConnInput{BaseURL: "https://other.example", Model: savedModel})
		if code(err) != recipeassistant.CodeKeyRequiredNewBaseURL || len(e.conns) != before {
			t.Errorf("%s: other origin without a key: err=%v clients built=%d", name, err, len(e.conns)-before)
		}
		for _, same := range []string{"", savedBase, savedBase + "/gateway", "https://api.anthropic.com:443"} {
			_ = call(service.ConnInput{BaseURL: same, Model: savedModel})
			last := e.conns[len(e.conns)-1]
			if last.Key.Reveal() != savedKey {
				t.Errorf("%s: same origin (%q) must use the saved key", name, same)
			}
		}
		_ = call(service.ConnInput{BaseURL: "https://other.example", APIKey: "sk-new-0000", Model: savedModel})
		if last := e.conns[len(e.conns)-1]; last.Key.Reveal() != "sk-new-0000" || last.BaseURL != "https://other.example" {
			t.Errorf("%s: other origin with a key uses only the typed key: %+v", name, last)
		}
	}
	for _, c := range e.conns {
		if c.BaseURL != savedBase && !strings.HasPrefix(c.BaseURL, "https://other.example") && !strings.HasPrefix(c.BaseURL, savedBase) {
			t.Errorf("unexpected conn %+v", c)
		}
		if c.BaseURL == "https://other.example" && c.Key.Reveal() == savedKey {
			t.Error("the saved key was handed to another origin")
		}
	}
}

func TestSaveSettingsAtANewOriginNeedsAKeyAndChangesNothingWithout(t *testing.T) {
	ctx := context.Background()
	e := newEnv(t, opts{enabled: true})
	adm := store.Actor{UserID: 1, Email: "admin@example.test"}
	_, err := e.svc.SaveSettings(ctx, adm, recipeassistant.Update{Enabled: true, BaseURL: "http://127.0.0.1:9999", Model: savedModel})
	var se *service.SettingsError
	if !errors.As(err, &se) && code(err) != recipeassistant.CodeKeyRequiredNewBaseURL {
		t.Fatalf("err = %v, want key_required_for_new_base_url", err)
	}
	if se != nil && (len(se.Errors) != 1 || se.Errors[0].Code != recipeassistant.CodeKeyRequiredNewBaseURL) {
		t.Errorf("errors = %+v", se.Errors)
	}
	if len(e.conns) != 0 {
		t.Error("no client may be built for the refused save")
	}
	row, _ := e.st.Load(ctx)
	if row.Settings.BaseURL != savedBase || !row.Settings.HasKey {
		t.Errorf("nothing may change: %+v", row.Settings)
	}
}

// ---- logging ---------------------------------------------------------------------------------------------------

func TestLogsHoldTheOutcomeAndNeverTheKeySourceOrOutput(t *testing.T) {
	e := newEnv(t, opts{enabled: true})
	e.pages.page = safehttp.Page{ContentType: "text/html", FinalURL: "https://cook.example/private-path/dish?token=abc123", Body: []byte(`<html><body><main>UNIQUEPAGEWORDS flour</main></body></html>`)}
	e.done(t, user, service.ReadInput{Kind: recipeassistant.KindPage, URL: "https://cook.example/private-path/dish?token=abc123"})
	e.done(t, user, textIn("UNIQUESOURCEWORDS pancakes"))
	e.claude.script = []reply{{err: &recipeassistant.Error{Code: recipeassistant.CodeBadKey}}}
	e.done(t, user, textIn("another"))
	out := e.log.String()
	for _, banned := range []string{savedKey, "SECRET-1234", "UNIQUESOURCEWORDS", "UNIQUEPAGEWORDS", "private-path", "abc123", "Chicken tikka", "feeder-recipe-file"} {
		if strings.Contains(out, banned) {
			t.Errorf("log leaks %q:\n%s", banned, out)
		}
	}
	for _, want := range []string{"cook.example", savedModel, "assistant_bad_key"} {
		if !strings.Contains(out, want) {
			t.Errorf("log should mention %q:\n%s", want, out)
		}
	}
}
