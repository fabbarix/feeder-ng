// Package httpapi exposes the Shopping List routes under /api/shopping. Handlers are thin: parse, call the
// shopping service (built in wiring.go from the real Stock, Products, Planning, Ingredients and household
// adapters), respond. Stubs: every route answers 501 until implemented.
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "shopping", Mount: mount}) }

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "not implemented")
}

// mount registers the routes listed in docs/dev/design/t13-shopping-scan.md (all r.User).
func mount(r *app.Router, _ app.Deps) {
	r.User("GET /api/shopping/list", notImplemented)
	r.User("POST /api/shopping/extras", notImplemented)
	r.User("DELETE /api/shopping/extras/{id}", notImplemented)
	r.User("POST /api/shopping/extras/{id}/tick", notImplemented)
	r.User("DELETE /api/shopping/extras/{id}/tick", notImplemented)
	r.User("POST /api/shopping/ticks", notImplemented)
	r.User("DELETE /api/shopping/ticks", notImplemented)
}
