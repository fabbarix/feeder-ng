package app

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/httpx"
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
	deps := Deps{DB: d, Clock: clk, Config: cfg, Events: events.NewBus(), Auth: authSvc, Logger: o.logger}

	mux := http.NewServeMux()
	r := &Router{mux: mux, auth: authSvc}
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.Handle("GET /api/events", authSvc.RequireUser(deps.Events.Handler()))
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "No such API route")
	})
	mux.Handle("/", spaHandler(spa))

	for _, m := range o.registry.Modules() {
		m.Mount(r, deps)
	}
	return &App{Handler: recoverPanics(o.logger, mux), Deps: deps}, nil
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
