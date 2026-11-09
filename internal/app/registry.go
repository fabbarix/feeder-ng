// Package app assembles the HTTP application from feature modules: the module
// registry, the router with its auth rules, the SPA fallback and recovery.
package app

import (
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
