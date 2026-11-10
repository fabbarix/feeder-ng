package httpapi_test

// WP-C: the Recipe Assistant reads routes and the Import Review photo routes (design §7). These tests use the
// fake Anthropic server and no network.

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"context"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/safehttp"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

const (
	raMaster = "W1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1s="
	raKey    = "sk-ant-api03-READSKEY-4242"
)

type raWorld struct {
	env   *testkit.Env
	admin *testkit.Client
	user  *testkit.Client
	fake  *fakeanthropic.Server
}

// raStart boots Feeder with a secret key and the fake Anthropic saved as the assistant's address, turned on.
func raStart(t *testing.T, fakeOpts ...fakeanthropic.Option) *raWorld {
	t.Helper()
	mk, err := secretbox.ParseMasterKey(raMaster)
	if err != nil {
		t.Fatal(err)
	}
	env := testkit.Start(t, testkit.WithConfig(func(c *config.Config) { c.SecretKey = mk }))
	f := fakeanthropic.New(fakeOpts...)
	t.Cleanup(f.Close)
	w := &raWorld{env: env, admin: env.LoginAdmin(t), user: env.LoginUser(t), fake: f}
	mustStatus(t, w.admin.Put("/api/recipe-assistant/settings", obj{"enabled": true, "baseUrl": f.URL, "model": "claude-haiku-5-5", "apiKey": raKey}), 200)
	return w
}

// allowLoopback lets page and photo-URL fetches reach httptest TLS servers.
func (w *raWorld) allowLoopback(t *testing.T) {
	t.Helper()
	service.SetTestHooks(t, w.env.DataDir, service.Hooks{Safehttp: safehttp.Options{
		LookupIP: func(context.Context, string) ([]netip.Addr, error) {
			return []netip.Addr{netip.MustParseAddr("127.0.0.1")}, nil
		},
		Allow:     func(netip.AddrPort) bool { return true },
		TLSConfig: &tls.Config{InsecureSkipVerify: true},
	}})
}

func gradientJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 255 / w), G: uint8(y * 255 / h), B: 120, A: 255})
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 85}); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func jpegDataURL(t *testing.T, w, h int) string {
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(gradientJPEG(t, w, h))
}

type readView struct {
	ID     string
	State  string
	Review *struct {
		ID     string
		Plan   recipefile.Plan
		Photos []struct{ Index, Width, Height int }
	}
	Source *struct {
		Kind           string
		Title, URL     string
		StructuredData bool
		PhotoCount     int
	}
	Model *struct{ ID, Name string }
	Error *struct {
		Code              string
		Message           string
		RetryAfterSeconds int
		Model             string
		Errors            []struct{ Path, Message string }
	}
}

func raPost(t *testing.T, c *testkit.Client, body any, want int) *testkit.Response {
	t.Helper()
	return mustStatus(t, c.Post("/api/recipe-assistant/reads", body), want)
}

func raPoll(t *testing.T, c *testkit.Client, id string) readView {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	var v readView
	for time.Now().Before(deadline) {
		r := mustStatus(t, c.Get("/api/recipe-assistant/reads/"+id), 200)
		v = readView{}
		r.MustJSON(t, &v)
		switch v.State {
		case "done", "failed", "cancelled":
			return v
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("read %s never finished: %+v", id, v)
	return v
}

// raRead posts a body, expects 202 and waits for the end of the read.
func raRead(t *testing.T, c *testkit.Client, body any) readView {
	t.Helper()
	var a struct{ ID, State string }
	raPost(t, c, body, 202).MustJSON(t, &a)
	if a.ID == "" || a.State == "" {
		t.Fatalf("202 must carry id and state: %+v", a)
	}
	return raPoll(t, c, a.ID)
}

func raText(t *testing.T, c *testkit.Client, text string) readView {
	return raRead(t, c, obj{"text": text})
}

// ---- access, validation ----------------------------------------------------------------------------------------

func TestReadsRoutesNeedASignedInUser(t *testing.T) {
	w := raStart(t)
	anon := w.env.Anonymous()
	for _, rt := range []struct{ method, path string }{
		{"POST", "/api/recipe-assistant/reads"}, {"GET", "/api/recipe-assistant/reads/abc"}, {"DELETE", "/api/recipe-assistant/reads/abc"},
		{"GET", "/api/imports/abc/photos/0"},
	} {
		if r := anon.Do(rt.method, rt.path, obj{}); r.Status != 401 {
			t.Errorf("%s %s = %d, want 401", rt.method, rt.path, r.Status)
		}
	}
}

func TestReadsAreOffUntilTheAssistantIsOn(t *testing.T) {
	env := testkit.Start(t) // no secret key at all
	c := env.LoginUser(t)
	for _, body := range []string{`{"text":"pancakes"}`, `not even json`} {
		r := c.Post("/api/recipe-assistant/reads", body)
		if r.Status != 503 || r.ErrorCode() != "assistant_off" {
			t.Errorf("body %q: %d %s, want 503 assistant_off before the body matters", body, r.Status, r.Body)
		}
	}
	w := raStart(t)
	mustStatus(t, w.admin.Put("/api/recipe-assistant/settings", obj{"enabled": false, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5"}), 200)
	if r := w.user.Post("/api/recipe-assistant/reads", obj{"text": "x"}); r.Status != 503 || r.ErrorCode() != "assistant_off" {
		t.Errorf("turned off: %d %s", r.Status, r.Body)
	}
}

func TestBodyAndSourceValidation(t *testing.T) {
	w := raStart(t)
	long := strings.Repeat("a", 50001)
	manyPhotos := []obj{}
	for i := 0; i < 5; i++ {
		manyPhotos = append(manyPhotos, obj{"dataUrl": jpegDataURL(t, 20, 20)})
	}
	for name, tc := range map[string]struct {
		body   any
		status int
		code   string
	}{
		"nothing":                 {obj{}, 400, "bad_request"},
		"two sources":             {obj{"text": "a", "url": "https://x.example/a"}, 400, "bad_request"},
		"not json":                {`{`, 400, "bad_request"},
		"empty text":              {obj{"text": "  \n "}, 422, "text_empty"},
		"too long":                {obj{"text": long}, 422, "text_too_long"},
		"http page":               {obj{"url": "http://cook.example/a"}, 422, "url_invalid"},
		"not a url":               {obj{"url": "pancakes"}, 422, "url_invalid"},
		"no photos":               {obj{"photos": []obj{}}, 422, "photos_empty"},
		"five photos":             {obj{"photos": manyPhotos}, 422, "too_many_photos"},
		"not an image":            {obj{"photos": []obj{{"dataUrl": "data:text/plain;base64,aGVsbG8="}}}, 422, "photo_unsupported"},
		"neither dataUrl nor url": {obj{"photos": []obj{{}}}, 400, "bad_request"},
		"photo over 8 MB":         {obj{"photos": []obj{{"dataUrl": "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 9<<20))}}}, 422, "photo_too_large"},
	} {
		r := w.user.Post("/api/recipe-assistant/reads", tc.body)
		if r.Status != tc.status || r.ErrorCode() != tc.code {
			t.Errorf("%s: %d %s, want %d %s", name, r.Status, r.ErrorCode(), tc.status, tc.code)
		}
	}
	if n := len(w.fake.Messages()); n != 0 {
		t.Errorf("refused requests reached Anthropic: %d", n)
	}
	// A refused request neither holds a slot nor counts: the first real read is still allowed, and so is the 30th.
	var st struct{ Limit struct{ Remaining int } }
	mustStatus(t, w.user.Get("/api/recipe-assistant/status"), 200).MustJSON(t, &st)
	if st.Limit.Remaining != 30 {
		t.Errorf("remaining = %d, want 30 after only refused requests", st.Limit.Remaining)
	}
	// 50,000 characters exactly is accepted.
	if v := raText(t, w.user, strings.Repeat("é", 50000)); v.State != "done" {
		t.Errorf("50,000 characters: %+v", v)
	}
}

func TestPhotosNeedAModelThatCanSeeThem(t *testing.T) {
	w := raStart(t)
	mustStatus(t, w.admin.Put("/api/recipe-assistant/settings", obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-text-only"}), 200)
	r := w.user.Post("/api/recipe-assistant/reads", obj{"photos": []obj{{"dataUrl": jpegDataURL(t, 40, 30)}}})
	if r.Status != 422 || r.ErrorCode() != "photos_not_supported_by_model" {
		t.Errorf("%d %s", r.Status, r.Body)
	}
	if v := raText(t, w.user, "text still works"); v.State != "done" {
		t.Errorf("text reads are unaffected: %+v", v)
	}
}

// ---- limits answered before the body is read -------------------------------------------------------------------

// zeroReader produces n bytes after an optional prefix and counts what the server consumed.
type zeroReader struct {
	prefix []byte
	left   int64
	sent   atomic.Int64
}

func (z *zeroReader) Read(p []byte) (int, error) {
	if len(z.prefix) > 0 {
		n := copy(p, z.prefix)
		z.prefix = z.prefix[n:]
		z.sent.Add(int64(n))
		return n, nil
	}
	if z.left <= 0 {
		return 0, io.EOF
	}
	n := int64(len(p))
	if n > z.left {
		n = z.left
	}
	for i := int64(0); i < n; i++ {
		p[i] = 'a'
	}
	z.left -= n
	z.sent.Add(n)
	return int(n), nil
}

// bigPost sends prefix + size filler bytes with a Content-Length, signed in as c, and reports the status, body and
// how many bytes the client had to send before the answer arrived.
func bigPost(t *testing.T, w *raWorld, c *testkit.Client, prefix string, size int64) (int, []byte, int64) {
	t.Helper()
	z := &zeroReader{prefix: []byte(prefix), left: size}
	req, _ := http.NewRequest("POST", w.env.URL()+"/api/recipe-assistant/reads", z)
	req.ContentLength = int64(len(prefix)) + size
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(c.Cookie(auth.CookieName))
	cl := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}, Timeout: 30 * time.Second}
	resp, err := cl.Do(req)
	if err != nil {
		t.Fatalf("big POST: %v", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b, z.sent.Load()
}

const unread = 20 << 20 // of 40 MiB offered: the server may buffer some, never take it all

func TestAUserWithAReadRunningGets409BeforeTheBodyIsRead(t *testing.T) {
	w := raStart(t, fakeanthropic.WithSlow(20*time.Second))
	var a struct{ ID string }
	raPost(t, w.user, obj{"text": "slow one #fake:slow"}, 202).MustJSON(t, &a)
	waitFor(t, func() bool { return len(w.fake.Messages()) == 1 })
	st, body, sent := bigPost(t, w, w.user, `{"photos":[{"dataUrl":"data:image/jpeg;base64,`, 40<<20)
	if st != 409 || !strings.Contains(string(body), "read_in_progress") {
		t.Fatalf("%d %s, want 409 read_in_progress", st, body)
	}
	if sent > unread {
		t.Errorf("the server consumed %d MiB of a 40 MiB body before refusing; the limiter check must come first", sent>>20)
	}
	// An Admin has the same one-running-read rule.
	var b struct{ ID string }
	raPost(t, w.admin, obj{"text": "admin slow #fake:slow"}, 202).MustJSON(t, &b)
	if r := w.admin.Post("/api/recipe-assistant/reads", obj{"text": "second"}); r.Status != 409 {
		t.Errorf("Admin second read = %d", r.Status)
	}
	// Cancelling frees the slot at once.
	for _, id := range []string{a.ID, b.ID} {
		cli := w.user
		if id == b.ID {
			cli = w.admin
		}
		mustStatus(t, cli.Delete("/api/recipe-assistant/reads/"+id), 204)
	}
	if v := raText(t, w.user, "after cancel"); v.State != "done" {
		t.Errorf("after cancel: %+v", v)
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("condition never became true")
}

func TestThirtyReadsAnHourThen429BeforeTheBodyAdminsExempt(t *testing.T) {
	w := raStart(t)
	for i := 0; i < 30; i++ {
		if v := raText(t, w.user, fmt.Sprintf("recipe %d", i)); v.State != "done" {
			t.Fatalf("read %d: %+v", i, v)
		}
	}
	st, body, sent := bigPost(t, w, w.user, `{"photos":[{"dataUrl":"data:image/jpeg;base64,`, 40<<20)
	var e struct {
		Error struct {
			Code              string
			RetryAfterSeconds int
		}
	}
	_ = json.Unmarshal(body, &e)
	if st != 429 || e.Error.Code != "too_many_reads" || e.Error.RetryAfterSeconds <= 0 || e.Error.RetryAfterSeconds > 3600 {
		t.Fatalf("%d %s, want 429 too_many_reads with retryAfterSeconds", st, body)
	}
	if sent > unread {
		t.Errorf("the server consumed %d MiB of a 40 MiB body before refusing", sent>>20)
	}
	var s struct {
		Limit struct{ Remaining, ResetsInSeconds int }
	}
	mustStatus(t, w.user.Get("/api/recipe-assistant/status"), 200).MustJSON(t, &s)
	if s.Limit.Remaining != 0 || s.Limit.ResetsInSeconds <= 0 {
		t.Errorf("limit = %+v", s.Limit)
	}
	for i := 0; i < 3; i++ { // the Admin is exempt and does not use the Household's budget
		if v := raText(t, w.admin, fmt.Sprintf("admin %d", i)); v.State != "done" {
			t.Fatalf("admin read %d: %+v", i, v)
		}
	}
	var adminStatus map[string]any
	mustStatus(t, w.admin.Get("/api/recipe-assistant/status"), 200).MustJSON(t, &adminStatus)
	if _, has := adminStatus["limit"]; has {
		t.Error("limit is omitted for Admins")
	}
	w.env.Clock.Advance(time.Hour + time.Second)
	if v := raText(t, w.user, "next hour"); v.State != "done" {
		t.Errorf("after the window: %+v", v)
	}
}

func TestAnOversizedNonPhotoBodyIs413AfterAtMost256KiBAreRead(t *testing.T) {
	w := raStart(t)
	st, body, sent := bigPost(t, w, w.user, `{"text":"`, 30<<20)
	if st != 413 || !strings.Contains(string(body), "request_too_large") {
		t.Fatalf("%d %s, want 413 request_too_large", st, body)
	}
	if sent > unread {
		t.Errorf("sent %d MiB before the 413; a non-photo body is cut at 256 KiB", sent>>20)
	}
	st, body, sent = bigPost(t, w, w.user, `{"url":"`, 30<<20)
	if st != 413 {
		t.Errorf("url body: %d %s", st, body)
	}
	_ = sent
}

func TestAContentLengthAbove45MiBIsRefusedUnread(t *testing.T) {
	w := raStart(t)
	st, body, sent := bigPost(t, w, w.user, `{"photos":[{"dataUrl":"data:image/jpeg;base64,`, 46<<20)
	if st != 413 || !strings.Contains(string(body), "request_too_large") {
		t.Fatalf("%d %s, want 413", st, body)
	}
	if sent > unread {
		t.Errorf("sent %d MiB; the declared length alone must be enough to refuse", sent>>20)
	}
}

// ---- text and page reads ---------------------------------------------------------------------------------------

func TestATextReadOpensAnImportReviewAndSavesNothingUntilConfirm(t *testing.T) {
	w := raStart(t)
	v := raText(t, w.user, "Chicken tikka traybake: chicken, yoghurt. #fake:valid")
	if v.State != "done" || v.Review == nil || v.Review.ID == "" || len(v.Review.Plan.Recipes) != 2 {
		t.Fatalf("read = %+v", v)
	}
	if v.Source == nil || v.Source.Kind != "text" || v.Model == nil || v.Model.ID != "claude-haiku-5-5" {
		t.Errorf("source/model = %+v / %+v", v.Source, v.Model)
	}
	if n := countRecipes(t, w.user); n != 0 {
		t.Fatalf("%d recipes saved before Confirm", n)
	}
	mustStatus(t, w.user.Post("/api/imports/"+v.Review.ID+"/plan", obj{"decisions": obj{}}), 200)
	var done struct{ Recipes []struct{ ID int64 } }
	mustStatus(t, w.user.Post("/api/imports/"+v.Review.ID+"/confirm", obj{"decisions": obj{}}), 200).MustJSON(t, &done)
	if len(done.Recipes) != 2 || countRecipes(t, w.user) != 2 {
		t.Errorf("confirm: %+v", done)
	}
	// The wire: one non-beta call with the saved key.
	ms := w.fake.Messages()
	if len(ms) != 1 || ms[0].APIKey != raKey || ms[0].Header.Get("anthropic-beta") != "" {
		t.Errorf("fake saw %d messages", len(ms))
	}
	if _, has := ms[0].JSON()["fallbacks"]; has {
		t.Error("no fallbacks, ever")
	}
}

func TestInjectedInstructionsCannotChangeServerControlledFields(t *testing.T) {
	w := raStart(t)
	v := raText(t, w.user, "Recipe text #fake:injection")
	if v.State != "done" {
		t.Fatalf("read = %+v (format 'evil' must have been forced back)", v)
	}
	var done struct{ Recipes []struct{ ID int64 } }
	mustStatus(t, w.user.Post("/api/imports/"+v.Review.ID+"/confirm", obj{"decisions": obj{}}), 200).MustJSON(t, &done)
	var rec struct {
		Image  string
		Source *struct{ URL, Attribution string }
	}
	mustStatus(t, w.user.Get(fmt.Sprintf("/api/recipes/%d", done.Recipes[0].ID)), 200).MustJSON(t, &rec)
	if rec.Image != "" {
		t.Errorf("an image URL that is not in the source must be dropped, got %q", rec.Image)
	}
	if rec.Source != nil && rec.Source.URL != "" {
		t.Errorf("text reads never keep source.url, got %q", rec.Source.URL)
	}
	if rec.Source == nil || rec.Source.Attribution != "Family recipe" {
		t.Errorf("attribution is kept: %+v", rec.Source)
	}
}

func TestEveryReadErrorHasItsCodeAndNothingIsSavedOrRetriedOnAnotherModel(t *testing.T) {
	w := raStart(t, fakeanthropic.WithRetryAfter("600"))
	type exp struct {
		marker, code string
		calls        int // exact number of calls to the fake; 0 = at least one
	}
	for _, tc := range []exp{
		{"no-recipe", "no_recipe_found", 1}, {"max-tokens", "assistant_output_too_long", 1}, {"refusal", "assistant_declined", 1},
		{"401", "assistant_bad_key", 0}, {"403", "assistant_forbidden", 0}, {"404-model", "assistant_model_unavailable", 0},
		{"429", "assistant_rate_limited", 0}, {"529", "assistant_busy", 0}, {"invalid", "assistant_invalid_output", 2},
	} {
		w.env.Clock.Advance(2 * time.Minute) // keep the clock moving; the hourly count is far from 30
		before := len(w.fake.Messages())
		v := raText(t, w.user, "x #fake:"+tc.marker)
		if v.State != "failed" || v.Error == nil || v.Error.Code != tc.code {
			t.Errorf("%s: %+v", tc.marker, v)
			continue
		}
		n := len(w.fake.Messages()) - before
		if tc.calls > 0 && n != tc.calls || n < 1 {
			t.Errorf("%s: %d calls to Anthropic, want %d", tc.marker, n, tc.calls)
		}
		switch tc.marker {
		case "refusal":
			if v.Error.Model != "claude-haiku-5-5" {
				t.Errorf("refusal names the model: %+v", v.Error)
			}
		case "429":
			if v.Error.RetryAfterSeconds != 600 {
				t.Errorf("retryAfterSeconds = %d, want 600 (retry-after beyond the budget stops at once)", v.Error.RetryAfterSeconds)
			}
		case "invalid":
			if len(v.Error.Errors) == 0 || v.Error.Errors[0].Path == "" {
				t.Errorf("invalid output carries the paths: %+v", v.Error)
			}
		}
		if v.Review != nil {
			t.Errorf("%s: a failed read opens no review", tc.marker)
		}
	}
	for _, m := range w.fake.Messages() {
		if m.JSON()["model"] != "claude-haiku-5-5" {
			t.Fatalf("another model was tried: %v", m.JSON()["model"])
		}
	}
	if countRecipes(t, w.user) != 0 {
		t.Error("nothing saved")
	}
}

func TestInvalidThenValidTakesExactlyOneRepairTurn(t *testing.T) {
	w := raStart(t)
	v := raText(t, w.user, "x #fake:invalid-then-valid")
	if v.State != "done" || len(w.fake.Messages()) != 2 {
		t.Fatalf("state %s, calls %d", v.State, len(w.fake.Messages()))
	}
	msgs := w.fake.Messages()[1].JSON()["messages"].([]any)
	if len(msgs) != 3 || msgs[1].(map[string]any)["role"] != "assistant" {
		t.Errorf("repair request messages = %d", len(msgs))
	}
}

func TestACancelledReadStopsAndAnotherUserCannotSeeOrCancelIt(t *testing.T) {
	w := raStart(t, fakeanthropic.WithSlow(20*time.Second))
	var a struct{ ID string }
	raPost(t, w.user, obj{"text": "x #fake:slow"}, 202).MustJSON(t, &a)
	waitFor(t, func() bool { return len(w.fake.Messages()) == 1 })
	mustStatus(t, w.admin.Get("/api/recipe-assistant/reads/"+a.ID), 404)
	mustStatus(t, w.admin.Delete("/api/recipe-assistant/reads/"+a.ID), 404)
	mustStatus(t, w.user.Delete("/api/recipe-assistant/reads/"+a.ID), 204)
	v := raPoll(t, w.user, a.ID)
	if v.State != "cancelled" || v.Review != nil {
		t.Errorf("read = %+v", v)
	}
	mustStatus(t, w.user.Get("/api/recipe-assistant/reads/nope"), 404)
}

func TestAPageReadSendsStructuredDataAndPageTextAndKeepsTheFinalURL(t *testing.T) {
	w := raStart(t)
	w.allowLoopback(t)
	ld := httptest.NewTLSServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		rw.Header().Set("Content-Type", "text/html; charset=utf-8")
		if r.URL.Path == "/plain" {
			_, _ = io.WriteString(rw, `<html><head><title>Plain</title></head><body><main>UNIQUEPLAIN 200 g flour, 2 eggs.</main></body></html>`)
			return
		}
		_, _ = io.WriteString(rw, `<html><head><title>Tikka</title><script type="application/ld+json">{"@type":"Recipe","name":"Tikka","recipeIngredient":["500 g chicken"],"recipeInstructions":["Bake"]}</script></head><body><main>UNIQUELD bake it</main></body></html>`)
	}))
	defer ld.Close()
	v := raRead(t, w.user, obj{"url": ld.URL + "/tikka"})
	if v.State != "done" || v.Source == nil || v.Source.Kind != "page" || !v.Source.StructuredData || v.Source.URL != ld.URL+"/tikka" {
		t.Fatalf("read = %+v", v)
	}
	text := strings.Join(w.fake.Messages()[0].UserTexts(), "\n")
	if i, j := strings.Index(text, "<structured_data>"), strings.Index(text, "<page_text>"); i < 0 || j < i || !strings.Contains(text, "UNIQUELD") {
		t.Errorf("structured_data must precede page_text: %.300s", text)
	}
	v = raRead(t, w.user, obj{"url": ld.URL + "/plain"})
	if v.State != "done" || v.Source.StructuredData {
		t.Fatalf("plain read = %+v", v)
	}
	text = strings.Join(w.fake.Messages()[1].UserTexts(), "\n")
	if strings.Contains(text, "<structured_data>") || !strings.Contains(text, "<page_text>") || !strings.Contains(text, "UNIQUEPLAIN") {
		t.Errorf("page without JSON-LD: %.300s", text)
	}
}

func TestAPageOnAPrivateAddressFailsGenericallyAndNothingIsSent(t *testing.T) {
	w := raStart(t) // no loopback hook: the SSRF guard is real
	srv := httptest.NewTLSServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(rw, "<html></html>") }))
	defer srv.Close()
	v := raRead(t, w.user, obj{"url": srv.URL + "/x"})
	if v.State != "failed" || v.Error.Code != "page_unavailable" {
		t.Fatalf("read = %+v", v)
	}
	for _, leak := range []string{"blocked", "private", "127.0.0.1", "loopback"} {
		if strings.Contains(strings.ToLower(v.Error.Message), leak) {
			t.Errorf("message %q reveals why (%s): that would be an SSRF oracle", v.Error.Message, leak)
		}
	}
	if len(w.fake.Messages()) != 0 {
		t.Error("the model must not be called")
	}
}

// ---- photo reads -----------------------------------------------------------------------------------------------

func photoBody(t *testing.T, sizes ...[2]int) obj {
	ps := []obj{}
	for _, s := range sizes {
		ps = append(ps, obj{"dataUrl": jpegDataURL(t, s[0], s[1])})
	}
	return obj{"photos": ps}
}

func TestAPhotoReadSendsPreparedJPEGsBeforeTheTextAndKeepsNoImages(t *testing.T) {
	w := raStart(t)
	v := raRead(t, w.user, photoBody(t, [2]int{3000, 2000}, [2]int{800, 600}))
	if v.State != "done" || v.Source == nil || v.Source.Kind != "photo" || v.Source.PhotoCount != 2 {
		t.Fatalf("read = %+v", v)
	}
	m := w.fake.Messages()
	if len(m) != 1 {
		t.Fatalf("calls = %d", len(m))
	}
	imgs := m[0].Images()
	if len(imgs) != 2 || imgs[0].MediaType != "image/jpeg" || imgs[1].MediaType != "image/jpeg" {
		t.Fatalf("images = %+v", imgs)
	}
	if imgs[0].Width != 2576 || imgs[0].Height < 1700 || imgs[0].Height > 1730 {
		t.Errorf("photo 1 = %dx%d, want 2576 on the long side (shrunk from 3000x2000)", imgs[0].Width, imgs[0].Height)
	}
	if imgs[1].Width != 800 || imgs[1].Height != 600 {
		t.Errorf("photo 2 = %dx%d, must not be changed or upscaled", imgs[1].Width, imgs[1].Height)
	}
	blocks := m[0].JSON()["messages"].([]any)[0].(map[string]any)["content"].([]any)
	if blocks[0].(map[string]any)["type"] != "image" || blocks[1].(map[string]any)["type"] != "image" || blocks[2].(map[string]any)["type"] != "text" ||
		!strings.Contains(blocks[2].(map[string]any)["text"].(string), `<source kind="photo"`) {
		t.Error("image blocks first, then the <source kind=\"photo\"> text")
	}
	// TODO(IP1): EXIF orientation is applied by internal/imaging once IP1 merges; add the fixture check here.
	mustStatus(t, w.user.Post("/api/imports/"+v.Review.ID+"/confirm", obj{"decisions": obj{}}), 200)
	for _, id := range recipeIDs(t, w.user) {
		var rec struct{ Image string }
		mustStatus(t, w.user.Get(fmt.Sprintf("/api/recipes/%d", id)), 200).MustJSON(t, &rec)
		if rec.Image != "" {
			t.Errorf("Confirm without a photo choice stores no image, got %q", rec.Image)
		}
	}
}

func TestAPhotoReadReportsBrokenAndUnreachablePhotosWithoutCallingTheModel(t *testing.T) {
	w := raStart(t)
	bad := "data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("this is not a png"))
	v := raRead(t, w.user, obj{"photos": []obj{{"dataUrl": bad}}})
	if v.State != "failed" || v.Error.Code != "photo_unsupported" {
		t.Errorf("undecodable bytes: %+v", v)
	}
	srv := httptest.NewTLSServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) { _, _ = rw.Write(gradientJPEG(t, 50, 50)) }))
	defer srv.Close()
	v = raRead(t, w.user, obj{"photos": []obj{{"url": srv.URL + "/a.jpg"}}}) // loopback: refused by the SSRF guard
	if v.State != "failed" || v.Error.Code != "photo_unavailable" {
		t.Errorf("private address: %+v", v)
	}
	if len(w.fake.Messages()) != 0 {
		t.Error("the model must not be called")
	}
}

func TestAPhotoURLIsFetchedByTheServerThroughTheGuard(t *testing.T) {
	w := raStart(t)
	w.allowLoopback(t)
	var hits atomic.Int32
	srv := httptest.NewTLSServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		rw.Header().Set("Content-Type", "image/jpeg")
		_, _ = rw.Write(gradientJPEG(t, 640, 480))
	}))
	defer srv.Close()
	v := raRead(t, w.user, obj{"photos": []obj{{"url": srv.URL + "/card.jpg"}}})
	if v.State != "done" || hits.Load() != 1 {
		t.Fatalf("read = %+v hits %d", v, hits.Load())
	}
	if imgs := w.fake.Messages()[0].Images(); len(imgs) != 1 || imgs[0].Width != 640 {
		t.Errorf("images = %+v", imgs)
	}
}

// ---- candidate photos in Import Review -------------------------------------------------------------------------

type photoRead struct {
	w  *raWorld
	v  readView
	id string // review id
}

func startPhotoReview(t *testing.T, w *raWorld, c *testkit.Client) photoRead {
	t.Helper()
	v := raRead(t, c, photoBody(t, [2]int{3000, 2000}, [2]int{800, 600}))
	if v.State != "done" || v.Review == nil {
		t.Fatalf("photo read = %+v", v)
	}
	return photoRead{w, v, v.Review.ID}
}

func decodeJPEG(t *testing.T, b []byte) image.Config {
	t.Helper()
	cfg, format, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil || format != "jpeg" {
		t.Fatalf("not a JPEG: %v %s", err, format)
	}
	return cfg
}

func TestTheReviewOffersTheCandidatePhotosShrunkToTheKeptSize(t *testing.T) {
	w := raStart(t)
	p := startPhotoReview(t, w, w.user)
	if len(p.v.Review.Photos) != 2 {
		t.Fatalf("review.photos = %+v", p.v.Review.Photos)
	}
	if ph := p.v.Review.Photos[0]; ph.Index != 0 || ph.Width != 1600 || ph.Height < 1060 || ph.Height > 1075 {
		t.Errorf("photo 0 = %+v, want 1600 on the long side (2,576 px photos are shrunk to the 1,600 px that is ever kept)", ph)
	}
	if ph := p.v.Review.Photos[1]; ph.Index != 1 || ph.Width != 800 || ph.Height != 600 {
		t.Errorf("photo 1 = %+v", ph)
	}
	r := mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/0"), 200)
	if r.Header.Get("Content-Type") != "image/jpeg" || r.Header.Get("Cache-Control") != "no-store" || r.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("headers = %v", r.Header)
	}
	if cfg := decodeJPEG(t, r.Body); cfg.Width != 1600 {
		t.Errorf("served photo 0 is %dx%d", cfg.Width, cfg.Height)
	}
	if cfg := decodeJPEG(t, mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/1"), 200).Body); cfg.Width != 800 {
		t.Errorf("served photo 1 is %dx%d", cfg.Width, cfg.Height)
	}
	for _, bad := range []string{"2", "-1", "abc", "99999999999999999999"} {
		mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/"+bad), 404)
	}
	mustStatus(t, w.user.Get("/api/imports/unknown/photos/0"), 404)
}

func TestAnotherUserGets404ForSomeoneElsesReviewPhoto(t *testing.T) {
	w := raStart(t)
	p := startPhotoReview(t, w, w.user)
	w.env.AddUser(t, "second@example.test", "Second", false)
	second := w.env.LoginAs(t, "second@example.test")
	mustStatus(t, second.Get("/api/imports/"+p.id+"/photos/0"), 404)
	mustStatus(t, w.admin.Get("/api/imports/"+p.id+"/photos/0"), 404) // an Admin is not special
	mustStatus(t, w.env.Anonymous().Get("/api/imports/"+p.id+"/photos/0"), 401)
	if r := second.Post("/api/imports/"+p.id+"/confirm", obj{"decisions": obj{}}); r.Status != 404 {
		t.Errorf("confirm by another User = %d", r.Status)
	}
	// The owner still has everything.
	mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/0"), 200)
}

func TestCandidatePhotosEndWithTheReview(t *testing.T) {
	w := raStart(t)
	// Close
	p := startPhotoReview(t, w, w.user)
	mustStatus(t, w.user.Delete("/api/imports/"+p.id), 204)
	mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/0"), 404)
	// Confirm without choosing a photo: candidates are gone, nothing stored
	p = startPhotoReview(t, w, w.user)
	mustStatus(t, w.user.Post("/api/imports/"+p.id+"/confirm", obj{"decisions": obj{}}), 200)
	mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/0"), 404)
	// Idle TTL, renewed by looking at the thumbnails (Sessions.Get renews)
	w2 := raStart(t)
	p = startPhotoReview(t, w2, w2.user)
	w2.env.Clock.Advance(recipefile.SessionTTL - time.Minute)
	mustStatus(t, w2.user.Get("/api/imports/"+p.id+"/photos/0"), 200)
	w2.env.Clock.Advance(recipefile.SessionTTL - time.Minute)
	mustStatus(t, w2.user.Get("/api/imports/"+p.id+"/photos/1"), 200) // the first GET renewed the timer
	w2.env.Clock.Advance(recipefile.SessionTTL + time.Second)
	mustStatus(t, w2.user.Get("/api/imports/"+p.id+"/photos/0"), 404)
	// Eviction past MaxUserReviews
	w3 := raStart(t)
	first := startPhotoReview(t, w3, w3.user)
	for i := 0; i < recipefile.MaxUserReviews; i++ {
		startPhotoReview(t, w3, w3.user)
	}
	mustStatus(t, w3.user.Get("/api/imports/"+first.id+"/photos/0"), 404)
}

func TestAFailedPhotoReadLeavesNothingBehind(t *testing.T) {
	w := raStart(t)
	w.fake.Queue(fakeanthropic.Reply{StopReason: "refusal"})
	v := raRead(t, w.user, photoBody(t, [2]int{400, 300}))
	if v.State != "failed" || v.Error.Code != "assistant_declined" || v.Review != nil {
		t.Fatalf("read = %+v", v)
	}
}

func recipeIDs(t *testing.T, c *testkit.Client) []int64 {
	t.Helper()
	var list []struct{ ID int64 }
	mustStatus(t, c.Get("/api/recipes?archived=all"), 200).MustJSON(t, &list)
	var ids []int64
	for _, r := range list {
		ids = append(ids, r.ID)
	}
	return ids
}

func TestConfirmWithAPhotoStoresExactlyThatPhotoAsThatRecipesImage(t *testing.T) {
	w := raStart(t)
	p := startPhotoReview(t, w, w.user)
	var done struct {
		Recipes []struct {
			Index int
			ID    int64
		}
	}
	mustStatus(t, w.user.Post("/api/imports/"+p.id+"/confirm", obj{"decisions": obj{}, "photo": obj{"index": 1, "recipe": 0}}), 200).MustJSON(t, &done)
	if len(done.Recipes) != 2 {
		t.Fatalf("done = %+v", done)
	}
	byIndex := map[int]int64{}
	for _, r := range done.Recipes {
		byIndex[r.Index] = r.ID
	}
	var with, without struct{ Image, ImageURL string }
	mustStatus(t, w.user.Get(fmt.Sprintf("/api/recipes/%d", byIndex[0])), 200).MustJSON(t, &with)
	mustStatus(t, w.user.Get(fmt.Sprintf("/api/recipes/%d", byIndex[1])), 200).MustJSON(t, &without)
	if with.Image == "" || without.Image != "" {
		t.Fatalf("image on recipe 0 = %q, on recipe 1 = %q; want exactly one", with.Image, without.Image)
	}
	img := mustStatus(t, w.user.Get(with.ImageURL), 200)
	if img.Header.Get("Content-Type") != "image/webp" {
		t.Errorf("stored image type = %s, want image/webp (the normal Recipe image path)", img.Header.Get("Content-Type"))
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(img.Body))
	if err != nil || cfg.Width != 800 || cfg.Height != 600 {
		t.Errorf("stored image = %+v %v, want the second photo, 800x600", cfg, err)
	}
	mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/0"), 404) // a successful Confirm drops the candidates
}

func TestAFailedConfirmKeepsThePhotosSoARetryWithThePhotoSucceeds(t *testing.T) {
	w := raStart(t)
	// First import the same Recipes, so the photo read's Review has conflicts to answer.
	first := raText(t, w.user, "#fake:valid")
	mustStatus(t, w.user.Post("/api/imports/"+first.Review.ID+"/confirm", obj{"decisions": obj{}}), 200)
	p := startPhotoReview(t, w, w.user)
	choice := obj{"index": 1, "recipe": 0}

	// 1) not ready (conflicts unanswered): refused, the Review and its photos stay
	r := w.user.Post("/api/imports/"+p.id+"/confirm", obj{"decisions": obj{}, "photo": choice})
	if r.Status != 422 || r.ErrorCode() != "import_not_ready" {
		t.Fatalf("confirm = %d %s", r.Status, r.Body)
	}
	mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/0"), 200)
	mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/1"), 200)

	// 2) a bad photo choice: refused as validation_failed on field photo, the Review and its photos stay
	d := obj{"recipes": []obj{{"index": 0, "action": "keep_both"}, {"index": 1, "action": "keep_both"}}}
	for _, bad := range []obj{{"index": 5, "recipe": 0}, {"index": -1, "recipe": 0}, {"index": 0, "recipe": 7}} {
		r = w.user.Post("/api/imports/"+p.id+"/confirm", obj{"decisions": d, "photo": bad})
		if r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(string(r.Body), `"photo"`) {
			t.Errorf("bad choice %v = %d %s, want 422 validation_failed on photo", bad, r.Status, r.Body)
		}
		mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/1"), 200)
	}
	if n := countRecipes(t, w.user); n != 2 {
		t.Fatalf("%d recipes after refused confirms, want 2", n)
	}

	// 3) the retry with the photo succeeds
	var done struct {
		Recipes []struct {
			Index int
			ID    int64
		}
	}
	mustStatus(t, w.user.Post("/api/imports/"+p.id+"/confirm", obj{"decisions": d, "photo": choice}), 200).MustJSON(t, &done)
	if len(done.Recipes) != 2 || countRecipes(t, w.user) != 4 {
		t.Fatalf("retry: %+v", done)
	}
	var rec struct{ Image string }
	for _, r := range done.Recipes {
		if r.Index == 0 {
			mustStatus(t, w.user.Get(fmt.Sprintf("/api/recipes/%d", r.ID)), 200).MustJSON(t, &rec)
		}
	}
	if rec.Image == "" {
		t.Error("the retried Confirm must store the chosen photo")
	}
	mustStatus(t, w.user.Get("/api/imports/"+p.id+"/photos/0"), 404)
}

func TestAPhotoChoiceOnANonPhotoReviewIs422AndTheReviewStaysOpen(t *testing.T) {
	w := raStart(t)
	v := raText(t, w.user, "#fake:valid")
	mustStatus(t, w.user.Get("/api/imports/"+v.Review.ID+"/photos/0"), 404)
	r := w.user.Post("/api/imports/"+v.Review.ID+"/confirm", obj{"decisions": obj{}, "photo": obj{"index": 0, "recipe": 0}})
	if r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Fatalf("%d %s", r.Status, r.Body)
	}
	mustStatus(t, w.user.Post("/api/imports/"+v.Review.ID+"/confirm", obj{"decisions": obj{}}), 200)
}

func TestNoSecretShowsInAnyReadResponse(t *testing.T) {
	w := raStart(t)
	v := raText(t, w.user, "#fake:401")
	b, _ := json.Marshal(v)
	if strings.Contains(string(b), raKey) || strings.Contains(string(b), "READSKEY") {
		t.Errorf("read view leaks the key: %s", b)
	}
	for _, m := range w.fake.Messages() {
		if m.APIKey != raKey {
			t.Errorf("unexpected key %q", m.APIKey)
		}
	}
}
