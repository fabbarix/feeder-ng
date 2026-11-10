package app

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"sync"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/scheduler"
)

type options struct {
	registry *Registry
	logger   *slog.Logger
}

// Option configures New.
type Option func(*options)

// WithRegistry uses g instead of the default registry (tests use this).
func WithRegistry(g *Registry) Option { return func(o *options) { o.registry = g } }

// WithLogger sets the logger used for recovered panics.
func WithLogger(l *slog.Logger) Option { return func(o *options) { o.logger = l } }

// App is the assembled application.
type App struct {
	Handler http.Handler
	Deps    Deps
	stop    context.CancelFunc
	workers *sync.WaitGroup
}

// Close ends Deps.Context and waits until the workers the modules started with Deps.Go have returned.
// Safe to call more than once.
func (a *App) Close() {
	if a.stop != nil {
		a.stop()
	}
	a.workers.Wait()
}

// New builds the application: the event bus and auth service, the first Admin
// seeded from cfg.AdminEmail, the built-in routes, then every registered module.
// spa is the built frontend (index.html at its root); nil or missing index.html
// makes non-API pages answer 503 "frontend not built".
func New(cfg config.Config, d *sql.DB, clk clock.Clock, spa fs.FS, opts ...Option) (*App, error) {
	o := options{registry: defaultRegistry, logger: slog.Default()}
	for _, opt := range opts {
		opt(&o)
	}
	if cfg.AdminEmail == "" {
		return nil, fmt.Errorf("app: %w", config.ErrAdminEmailRequired)
	}

	authSvc := auth.NewService(d, clk, cfg.SecureCookies())
	if _, err := authSvc.SeedAdmin(context.Background(), cfg.AdminEmail); err != nil {
		return nil, fmt.Errorf("app: seed admin: %w", err)
	}
	lifetime, stop := context.WithCancel(context.Background())
	workers := &sync.WaitGroup{}
	deps := Deps{DB: d, Clock: clk, Config: cfg, Events: events.NewBus(), Auth: authSvc, Logger: o.logger,
		Scheduler: scheduler.New(clk, scheduler.NewSQLRunStore(d), o.logger), Context: lifetime, workers: workers}
	// Removal and sign-out end the live-update streams of the affected User or session.
	authSvc.OnRevoke(deps.Events.CloseOwner)

	mux := http.NewServeMux()
	r := &Router{mux: mux, auth: authSvc}
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.Handle("GET /api/events", authSvc.RequireUser(eventStream(deps.Events, authSvc)))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "No such API route")
	})
	mux.Handle("/", spaHandler(spa))

	for _, m := range o.registry.Modules() {
		m.Mount(r, deps)
	}
	return &App{Handler: recoverPanics(o.logger, httpx.CSRFGuard(cfg.BaseURL, mux)), Deps: deps, stop: stop, workers: workers}, nil
}

// eventStream serves GET /api/events for a signed-in request. The stream is
// registered under the request's User and session keys, so revoking either
// ends it. Each ping re-checks the session as a second line of defence.
func eventStream(bus *events.Bus, authSvc *auth.Service) http.Handler {
	h := bus.Handler(events.WithRevalidate(func(r *http.Request) bool {
		c, err := r.Cookie(auth.CookieName)
		if err != nil {
			return false
		}
		_, err = authSvc.Authenticate(r.Context(), c.Value)
		return err == nil
	}))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFrom(r.Context())
		ctx := events.WithOwners(r.Context(), auth.UserKey(u.ID), auth.SessionKeyFrom(r.Context()))
		h.ServeHTTP(w, r.WithContext(ctx))
	})
}

func recoverPanics(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				if rec == http.ErrAbortHandler {
					panic(rec)
				}
				logger.Error("handler panicked", "path", r.URL.Path, "panic", rec)
				httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// BindServer makes srv.Shutdown end the open event streams promptly instead of
// waiting for them (http.Server.Shutdown does not close hijacked or long-lived
// handlers on its own).
func (a *App) BindServer(srv *http.Server) {
	// stub: implemented by the Developer
	_ = srv
}
