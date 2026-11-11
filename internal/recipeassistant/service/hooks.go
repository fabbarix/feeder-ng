package service

import (
	"sync"

	"github.com/fabbarix/feeder-ng/internal/safehttp"
)

// Hooks let tests point the page and photo-URL fetchers at httptest servers. They are keyed by the app's data
// directory (unique per testkit.Env), looked up when a fetch starts, never at mount time, and are never set in
// production.
type Hooks struct {
	Safehttp safehttp.Options // LookupIP, Allow, TLSConfig
}

var (
	hooksMu sync.Mutex
	hooks   = map[string]Hooks{}
)

// SetTestHooks installs hooks for the app whose Config.DataDir is dataDir and removes them in t.Cleanup.
func SetTestHooks(t interface{ Cleanup(func()) }, dataDir string, h Hooks) {
	hooksMu.Lock()
	hooks[dataDir] = h
	hooksMu.Unlock()
	t.Cleanup(func() { hooksMu.Lock(); delete(hooks, dataDir); hooksMu.Unlock() })
}

// HooksFor returns the hooks for a data directory (zero value: production behaviour).
func HooksFor(dataDir string) Hooks {
	hooksMu.Lock()
	defer hooksMu.Unlock()
	return hooks[dataDir]
}
