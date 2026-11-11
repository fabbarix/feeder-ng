package app_test

import (
	"context"
	"database/sql"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"testing/fstest"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/db"
)

type harness struct {
	app *app.App
	db  *sql.DB
	clk *clock.Fake
}

func build(t *testing.T, spa fstest.MapFS, reg *app.Registry) *harness {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	cfg := config.Config{AdminEmail: "admin@example.test", DataDir: t.TempDir()}
	a, err := app.New(cfg, d, clk, spa, app.WithRegistry(reg))
	if err != nil {
		t.Fatal(err)
	}
	return &harness{app: a, db: d, clk: clk}
}

func (h *harness) get(path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest("GET", path, nil)
	if token != "" {
		req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: token})
	}
	rec := httptest.NewRecorder()
	h.app.Handler.ServeHTTP(rec, req)
	return rec
}

func (h *harness) token(t *testing.T, email string, admin bool) string {
	t.Helper()
	ctx := context.Background()
	u, err := h.app.Deps.Auth.AddUser(ctx, email, "X", admin)
	if err != nil {
		t.Fatal(err)
	}
	tok, _, err := h.app.Deps.Auth.CreateSession(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

var spaFS = fstest.MapFS{
	"index.html":    {Data: []byte("<html>SPA index</html>")},
	"assets/app.js": {Data: []byte("console.log('app')")},
}

func TestRegistryRejectsBadModules(t *testing.T) {
	mount := func(*app.Router, app.Deps) {}
	for name, f := range map[string]func(*app.Registry){
		"empty name": func(g *app.Registry) { g.Register(app.Module{Mount: mount}) },
		"nil mount":  func(g *app.Registry) { g.Register(app.Module{Name: "x"}) },
		"duplicate": func(g *app.Registry) {
			g.Register(app.Module{Name: "x", Mount: mount})
			g.Register(app.Module{Name: "x", Mount: mount})
		},
	} {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("expected panic")
				}
			}()
			f(app.NewRegistry())
		})
	}
}

func TestRegistryModulesSortedByName(t *testing.T) {
	g := app.NewRegistry()
	mount := func(*app.Router, app.Deps) {}
	for _, n := range []string{"stock", "auth", "recipes"} {
		g.Register(app.Module{Name: n, Mount: mount})
	}
	var names []string
	for _, m := range g.Modules() {
		names = append(names, m.Name)
	}
	if strings.Join(names, ",") != "auth,recipes,stock" {
		t.Fatalf("names = %v", names)
	}
}

func TestNewSeedsAdminAndHealth(t *testing.T) {
	h := build(t, spaFS, app.NewRegistry())
	if _, err := h.app.Deps.Auth.UserByEmail(context.Background(), "admin@example.test"); err != nil {
		t.Fatalf("admin not seeded: %v", err)
	}
	rec := h.get("/api/health", "")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"status":"ok"`) {
		t.Fatalf("health = %d %s", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q", ct)
	}
}

func TestModulesMountWithPublicUserAndAdminRoutes(t *testing.T) {
	reg := app.NewRegistry()
	reg.Register(app.Module{Name: "demo", Mount: func(r *app.Router, d app.Deps) {
		if d.DB == nil || d.Clock == nil || d.Events == nil || d.Auth == nil {
			panic("Deps not fully populated")
		}
		r.Public("GET /api/demo/public", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("public")) })
		r.User("GET /api/demo/user/{id}", func(w http.ResponseWriter, r *http.Request) {
			u, _ := auth.UserFrom(r.Context())
			w.Write([]byte(u.Email + ":" + r.PathValue("id")))
		})
		r.Admin("GET /api/demo/admin", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("admin")) })
	}})
	h := build(t, spaFS, reg)
	user := h.token(t, "user@example.test", false)
	admin := h.token(t, "boss@example.test", true)

	cases := []struct {
		path, tok string
		code      int
		body      string
	}{
		{"/api/demo/public", "", 200, "public"},
		{"/api/demo/user/42", "", 401, ""},
		{"/api/demo/user/42", user, 200, "user@example.test:42"},
		{"/api/demo/admin", "", 401, ""},
		{"/api/demo/admin", user, 403, ""},
		{"/api/demo/admin", admin, 200, "admin"},
	}
	for _, c := range cases {
		rec := h.get(c.path, c.tok)
		if rec.Code != c.code || (c.body != "" && rec.Body.String() != c.body) {
			t.Errorf("GET %s: %d %q, want %d %q", c.path, rec.Code, rec.Body, c.code, c.body)
		}
	}
}

func TestUnknownAPIPathIsJSON404(t *testing.T) {
	h := build(t, spaFS, app.NewRegistry())
	rec := h.get("/api/nope", "")
	if rec.Code != 404 || !strings.Contains(rec.Body.String(), `"not_found"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if strings.Contains(rec.Body.String(), "SPA index") {
		t.Fatal("unknown /api paths must never fall back to the SPA")
	}
}

func TestPanickingHandlerBecomesJSON500(t *testing.T) {
	reg := app.NewRegistry()
	reg.Register(app.Module{Name: "boom", Mount: func(r *app.Router, _ app.Deps) {
		r.Public("GET /api/boom", func(http.ResponseWriter, *http.Request) { panic("kaboom") })
	}})
	h := build(t, spaFS, reg)
	rec := h.get("/api/boom", "")
	if rec.Code != 500 || !strings.Contains(rec.Body.String(), `"internal"`) || strings.Contains(rec.Body.String(), "kaboom") {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
}

func TestSPAServesFilesAndFallsBackToIndex(t *testing.T) {
	h := build(t, spaFS, app.NewRegistry())
	if rec := h.get("/assets/app.js", ""); rec.Code != 200 || rec.Body.String() != "console.log('app')" {
		t.Fatalf("asset: %d %q", rec.Code, rec.Body)
	}
	for _, p := range []string{"/", "/plan", "/recipes/42/edit"} {
		rec := h.get(p, "")
		if rec.Code != 200 || !strings.Contains(rec.Body.String(), "SPA index") {
			t.Errorf("%s: %d %q, want index.html fallback", p, rec.Code, rec.Body)
		}
	}
	req := httptest.NewRequest("POST", "/plan", nil)
	rec := httptest.NewRecorder()
	h.app.Handler.ServeHTTP(rec, req)
	if rec.Code == 200 {
		t.Error("POST to an SPA path must not be served the index")
	}
}

func TestFrontendNotBuilt(t *testing.T) {
	for name, fsys := range map[string]fstest.MapFS{
		"empty":            {},
		"only placeholder": {".gitkeep": {Data: nil}},
	} {
		t.Run(name, func(t *testing.T) {
			h := build(t, fsys, app.NewRegistry())
			rec := h.get("/", "")
			body, _ := io.ReadAll(rec.Body)
			if rec.Code != 503 || !strings.Contains(strings.ToLower(string(body)), "frontend not built") {
				t.Fatalf("got %d %q", rec.Code, body)
			}
			if rec := h.get("/api/health", ""); rec.Code != 200 {
				t.Fatalf("API must work without a frontend: %d", rec.Code)
			}
		})
	}
}

func TestEventsEndpointRequiresUser(t *testing.T) {
	h := build(t, spaFS, app.NewRegistry())
	if rec := h.get("/api/events", ""); rec.Code != 401 {
		t.Fatalf("anonymous /api/events = %d, want 401", rec.Code)
	}
}

func TestNewFailsWithoutAdminEmail(t *testing.T) {
	d, _ := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	defer d.Close()
	db.MigrateEmbedded(context.Background(), d)
	_, err := app.New(config.Config{DataDir: t.TempDir()}, d, clock.System{}, spaFS, app.WithRegistry(app.NewRegistry()))
	if err == nil {
		t.Fatal("app.New must refuse an empty AdminEmail")
	}
}

func TestAppRejectsCrossOriginAndNonJSONWrites(t *testing.T) {
	reg := app.NewRegistry()
	reg.Register(app.Module{Name: "echo", Mount: func(r *app.Router, _ app.Deps) {
		r.Public("POST /api/echo", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	}})
	h := build(t, fstest.MapFS{"index.html": {Data: []byte("x")}}, reg)
	post := func(ct, origin string) int {
		req := httptest.NewRequest("POST", "/api/echo", strings.NewReader(`{}`))
		req.Host = "feeder.example.test"
		if ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		rec := httptest.NewRecorder()
		h.app.Handler.ServeHTTP(rec, req)
		return rec.Code
	}
	if c := post("application/json", ""); c != 204 {
		t.Errorf("JSON, no Origin: %d", c)
	}
	if c := post("text/plain", ""); c != 415 {
		t.Errorf("text/plain: %d, want 415", c)
	}
	if c := post("application/json", "https://evil.example"); c != 403 {
		t.Errorf("foreign Origin: %d, want 403", c)
	}
	if c := post("application/json", "http://feeder.example.test"); c != 204 {
		t.Errorf("same-host Origin: %d, want 204", c)
	}
}

func TestCloseWaitsForWorkersStartedWithDepsGo(t *testing.T) {
	var stopped atomic.Bool
	reg := app.NewRegistry()
	reg.Register(app.Module{Name: "worker", Mount: func(_ *app.Router, d app.Deps) {
		d.Go(func() {
			<-d.Context.Done()
			time.Sleep(30 * time.Millisecond) // a worker finishing its last step after the context ends
			stopped.Store(true)
		})
	}})
	h := build(t, spaFS, reg)
	h.app.Close()
	if !stopped.Load() {
		t.Fatal("Close returned before the worker had stopped")
	}
	h.app.Close() // a second Close is harmless
}

// N10: crawlers get a real robots.txt (disallow everything: a private household app), not the SPA index.
func TestRobotsTxtIsServedNotTheSPAIndex(t *testing.T) {
	h := build(t, spaFS, app.NewRegistry())
	rec := h.get("/robots.txt", "")
	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("Content-Type = %q, want text/plain", ct)
	}
	body := rec.Body.String()
	if strings.Contains(body, "SPA index") || !strings.Contains(body, "User-agent: *") || !strings.Contains(body, "Disallow: /") {
		t.Errorf("body = %q", body)
	}
}

// R11a N10: only SPA client routes (no file extension) fall back to index.html. A missing file (a favicon, a stale hashed
// asset) or anything under /.well-known/ is a real 404, never the app shell with 200.
func TestMissingFilesAndWellKnownAre404NotTheSPAIndex(t *testing.T) {
	h := build(t, spaFS, app.NewRegistry())
	for _, p := range []string{
		"/favicon.ico", "/assets/index-STALE.js", "/assets/old.css", "/apple-touch-icon.png", "/sitemap.xml",
		"/.well-known/security.txt", "/.well-known/assetlinks.json", "/.well-known/anything-at-all", "/.well-known/",
	} {
		for _, method := range []string{http.MethodGet, http.MethodHead} {
			req := httptest.NewRequest(method, p, nil)
			rec := httptest.NewRecorder()
			h.app.Handler.ServeHTTP(rec, req)
			if rec.Code != 404 {
				t.Errorf("%s %s: status = %d, want 404", method, p, rec.Code)
			}
			if strings.Contains(rec.Body.String(), "SPA index") {
				t.Errorf("%s %s: body is the SPA index", method, p)
			}
		}
	}
}

func TestClientRoutesWithoutAnExtensionStillGetTheSPAIndex(t *testing.T) {
	h := build(t, spaFS, app.NewRegistry())
	for _, p := range []string{"/", "/plan", "/settings/planning", "/recipes/42", "/shop"} {
		rec := h.get(p, "")
		if rec.Code != 200 || !strings.Contains(rec.Body.String(), "SPA index") {
			t.Errorf("%s: %d %q, want the index.html fallback", p, rec.Code, rec.Body)
		}
	}
}

// L9: the web app manifest is served as application/manifest+json (not text/plain), or the browser does not treat the app as installable.
func TestWebManifestIsServedWithItsOwnType(t *testing.T) {
	fs := fstest.MapFS{
		"index.html":           {Data: []byte("<html>SPA index</html>")},
		"manifest.webmanifest": {Data: []byte(`{"name":"Feeder"}`)},
	}
	h := build(t, fs, app.NewRegistry())
	rec := h.get("/manifest.webmanifest", "")
	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/manifest+json") {
		t.Errorf("Content-Type = %q, want application/manifest+json", ct)
	}
}

// R11a N10: the brand favicon is a real file of the built frontend (web/public/favicon.svg), served with its own type.
func TestFaviconSVGIsServedAsAnImage(t *testing.T) {
	fs := fstest.MapFS{
		"index.html":  {Data: []byte("<html>SPA index</html>")},
		"favicon.svg": {Data: []byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"></svg>`)},
	}
	h := build(t, fs, app.NewRegistry())
	rec := h.get("/favicon.svg", "")
	if rec.Code != 200 {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "image/svg+xml") {
		t.Errorf("Content-Type = %q, want image/svg+xml", ct)
	}
	if strings.Contains(rec.Body.String(), "SPA index") {
		t.Errorf("body is the SPA index")
	}
	// the decision: SVG only; there is no /favicon.ico, so it is a plain 404
	if rec := h.get("/favicon.ico", ""); rec.Code != 404 {
		t.Errorf("/favicon.ico status = %d, want 404", rec.Code)
	}
}

// R13: modules with start-up work register an idle check; App.WaitIdle blocks until every one reports idle.
func TestWaitIdleBlocksUntilEveryRegisteredModuleIsIdle(t *testing.T) {
	var busy atomic.Bool
	busy.Store(true)
	g := app.NewRegistry()
	g.Register(app.Module{Name: "slow", Mount: func(_ *app.Router, d app.Deps) {
		d.Idle(func(ctx context.Context) error {
			for busy.Load() {
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(time.Millisecond):
				}
			}
			return nil
		})
	}})
	h := build(t, spaFS, g)
	t.Cleanup(h.app.Close)

	short, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if err := h.app.WaitIdle(short); err == nil {
		t.Fatal("WaitIdle returned while a module was still busy")
	}
	go func() { time.Sleep(20 * time.Millisecond); busy.Store(false) }()
	ctx, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel2()
	if err := h.app.WaitIdle(ctx); err != nil {
		t.Fatalf("WaitIdle = %v after the module went idle", err)
	}
}
