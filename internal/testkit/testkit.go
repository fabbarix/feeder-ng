// Package testkit boots the whole Feeder in-process for tests: a temporary data
// directory, a migrated database, a fixed clock and an httptest server. It can
// sign people in without Google.
package testkit

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing/fstest"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/db"
	_ "github.com/fabbarix/feeder-ng/internal/modules" // the same module set as cmd/feeder
)

// StartTime is the fixed clock's starting instant.
var StartTime = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

const (
	// AdminEmail is the default Admin seeded at start-up.
	AdminEmail = "admin@example.test"
	// UserEmail is a non-Admin User seeded at start-up.
	UserEmail = "user@example.test"
)

// TB is the subset of *testing.T that testkit needs. godog's TestingT lacks
// Cleanup and TempDir, so BDD scenarios supply their own.
type TB interface {
	Helper()
	Fatalf(format string, args ...any)
	Cleanup(func())
	TempDir() string
}

// Option adjusts the configuration before the app starts.
type Option func(*config.Config)

// WithConfig returns an Option that applies f to the configuration.
func WithConfig(f func(*config.Config)) Option { return Option(f) }

// stubSPA stands in for the built frontend, so tests need no web build.
var stubSPA = fstest.MapFS{"index.html": {Data: []byte("<!doctype html><title>Feeder</title>")}}

// Env is one running Feeder.
type Env struct {
	Config  config.Config
	DataDir string
	DB      *sql.DB
	Clock   *clock.Fake
	App     *app.App
	Auth    *auth.Service

	server *httptest.Server
	tb     TB
}

// Start boots a Feeder with a temp data dir, a migrated database, the fixed
// clock, and a seeded Admin (Config.AdminEmail) and User (UserEmail). Everything
// is torn down via t.Cleanup.
func Start(t TB, opts ...Option) *Env {
	t.Helper()
	cfg := config.Config{AdminEmail: AdminEmail, DataDir: t.TempDir()}
	for _, o := range opts {
		o(&cfg)
	}
	d, err := db.Open(cfg.DBPath())
	if err != nil {
		t.Fatalf("testkit: open db: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("testkit: migrate: %v", err)
	}
	env := &Env{Config: cfg, DataDir: cfg.DataDir, DB: d, Clock: clock.NewFake(StartTime), tb: t}
	env.boot(t)
	t.Cleanup(func() {
		if env.server != nil {
			env.server.Close()
		}
		if env.App != nil {
			env.App.Close() // stops the planning workers
		}
	})
	env.AddUser(t, UserEmail, "User", false)
	return env
}

func (e *Env) boot(t TB) {
	a, err := app.New(e.Config, e.DB, e.Clock, stubSPA)
	if err != nil {
		t.Fatalf("testkit: build app: %v", err)
	}
	if e.server != nil {
		e.server.Close()
	}
	if e.App != nil {
		e.App.Close()
	}
	e.App = a
	e.Auth = a.Deps.Auth
	// The start-up replan publishes "plan" asynchronously: wait for it so no scenario sees it mid-step.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := a.WaitIdle(ctx); err != nil {
		t.Fatalf("testkit: waiting for the start-up replan: %v", err)
	}
	e.server = httptest.NewServer(a.Handler)
}

// URL is the base URL of the running server. It changes after Restart.
func (e *Env) URL() string { return e.server.URL }

// Restart stops the server and starts a new app on the same database, data
// dir and clock, as if the Feeder had been restarted.
func (e *Env) Restart(t TB) {
	t.Helper()
	e.boot(t)
}

// AddUser adds a User to the allowlist and returns it.
func (e *Env) AddUser(t TB, email, name string, admin bool) auth.User {
	t.Helper()
	u, err := e.Auth.AddUser(context.Background(), email, name, admin)
	if err != nil {
		t.Fatalf("testkit: add user %s: %v", email, err)
	}
	return u
}

// Anonymous returns a client without a session.
func (e *Env) Anonymous() *Client {
	return &Client{env: e, cookies: map[string]*http.Cookie{}}
}

// LoginAs returns a client signed in as email, with a session created directly.
func (e *Env) LoginAs(t TB, email string) *Client {
	t.Helper()
	u, err := e.Auth.UserByEmail(context.Background(), email)
	if err != nil {
		t.Fatalf("testkit: login as %s: %v", email, err)
	}
	token, _, err := e.Auth.CreateSession(context.Background(), u.ID)
	if err != nil {
		t.Fatalf("testkit: session for %s: %v", email, err)
	}
	c := e.Anonymous()
	c.cookies[auth.CookieName] = &http.Cookie{Name: auth.CookieName, Value: token, Path: "/", HttpOnly: true}
	return c
}

// LoginAdmin signs in as the configured Admin.
func (e *Env) LoginAdmin(t TB) *Client { t.Helper(); return e.LoginAs(t, e.Config.AdminEmail) }

// LoginUser signs in as the non-Admin User.
func (e *Env) LoginUser(t TB) *Client { t.Helper(); return e.LoginAs(t, UserEmail) }

// Client is an HTTP client for one Env. It keeps the session cookies it has
// been given or has received, and resolves the base URL on every call.
type Client struct {
	env     *Env
	cookies map[string]*http.Cookie
}

var httpClient = &http.Client{
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

// Do sends a request. body may be nil, a []byte or string (sent raw), or any
// value (sent as JSON).
func (c *Client) Do(method, path string, body any) *Response {
	var rdr io.Reader
	contentType := ""
	switch b := body.(type) {
	case nil:
	case []byte:
		rdr, contentType = bytes.NewReader(b), "application/json"
	case string:
		rdr, contentType = strings.NewReader(b), "application/json"
	default:
		raw, err := json.Marshal(b)
		if err != nil {
			c.env.tb.Fatalf("testkit: encode body: %v", err)
		}
		rdr, contentType = bytes.NewReader(raw), "application/json"
	}
	req, err := http.NewRequest(method, c.env.URL()+path, rdr)
	if err != nil {
		c.env.tb.Fatalf("testkit: %s %s: %v", method, path, err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for _, ck := range c.cookies {
		req.AddCookie(ck)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		c.env.tb.Fatalf("testkit: %s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		c.env.tb.Fatalf("testkit: read %s %s: %v", method, path, err)
	}
	for _, ck := range resp.Cookies() {
		if ck.MaxAge < 0 || ck.Value == "" {
			delete(c.cookies, ck.Name)
		} else {
			c.cookies[ck.Name] = ck
		}
	}
	return &Response{Status: resp.StatusCode, Header: resp.Header, Body: data}
}

// Get sends a GET.
func (c *Client) Get(path string) *Response { return c.Do(http.MethodGet, path, nil) }

// Post sends a POST.
func (c *Client) Post(path string, body any) *Response { return c.Do(http.MethodPost, path, body) }

// Put sends a PUT.
func (c *Client) Put(path string, body any) *Response { return c.Do(http.MethodPut, path, body) }

// Patch sends a PATCH.
func (c *Client) Patch(path string, body any) *Response { return c.Do(http.MethodPatch, path, body) }

// Delete sends a DELETE.
func (c *Client) Delete(path string) *Response { return c.Do(http.MethodDelete, path, nil) }

// Cookie returns the named cookie the client holds, or nil.
func (c *Client) Cookie(name string) *http.Cookie { return c.cookies[name] }

// Response is a captured HTTP response.
type Response struct {
	Status int
	Header http.Header
	Body   []byte
}

// JSON decodes the body into v.
func (r *Response) JSON(v any) error { return json.Unmarshal(r.Body, v) }

// MustJSON decodes the body into v, failing t on error.
func (r *Response) MustJSON(t TB, v any) {
	t.Helper()
	if err := r.JSON(v); err != nil {
		t.Fatalf("testkit: body is not JSON: %v; body: %s", err, r.Body)
	}
}

// ErrorCode returns the error code of a {"error":{"code"}} body, or "".
func (r *Response) ErrorCode() string {
	var b struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if json.Unmarshal(r.Body, &b) != nil {
		return ""
	}
	return b.Error.Code
}

// String returns the body as text.
func (r *Response) String() string { return string(r.Body) }
