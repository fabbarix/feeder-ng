// Package app assembles the HTTP application from feature modules: the module
// registry, the router with its auth rules, the SPA fallback and recovery.
package app

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"sort"
	"sync"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/scheduler"
)

// Deps are the shared services handed to every module when it mounts.
type Deps struct {
	DB     *sql.DB
	Clock  clock.Clock
	Config config.Config
	Events *events.Bus
	Auth   *auth.Service
	Logger *slog.Logger
	// Scheduler runs household-time daily jobs (planning's nightly run, later backups and
	// notification sweeps). Modules register jobs in Mount; cmd/feeder starts it with Run.
	Scheduler *scheduler.Scheduler
	// Context ends when the application is closed (App.Close): long-running workers a module starts (planning's
	// invalidation worker and Events subscription) stop when it is done.
	Context context.Context
	// workers counts the goroutines started with Go; App.Close waits for them.
	workers *sync.WaitGroup
}

// Go starts f on a goroutine that App.Close waits for, so a module's long-running
// worker has finished (after Context is done) when Close returns.
func (d Deps) Go(f func()) {
	if d.workers == nil {
		go f()
		return
	}
	d.workers.Add(1)
	go func() {
		defer d.workers.Done()
		f()
	}()
}

// Module is one feature's HTTP surface.
type Module struct {
	Name  string
	Mount func(r *Router, d Deps)
}

// Registry holds modules by name.
type Registry struct {
	mu   sync.Mutex
	mods map[string]Module
}

// NewRegistry returns an empty registry.
func NewRegistry() *Registry { return &Registry{mods: map[string]Module{}} }

// Register adds a module. It panics on an empty name, a nil Mount or a duplicate
// name, because those are programming errors.
func (g *Registry) Register(m Module) {
	if m.Name == "" {
		panic("app: module with empty name")
	}
	if m.Mount == nil {
		panic(fmt.Sprintf("app: module %q has no Mount", m.Name))
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if _, dup := g.mods[m.Name]; dup {
		panic(fmt.Sprintf("app: module %q registered twice", m.Name))
	}
	g.mods[m.Name] = m
}

// Modules returns the registered modules sorted by name.
func (g *Registry) Modules() []Module {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make([]Module, 0, len(g.mods))
	for _, m := range g.mods {
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

var defaultRegistry = NewRegistry()

// Register adds a module to the default registry. Modules call it from init().
func Register(m Module) { defaultRegistry.Register(m) }
