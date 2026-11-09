// Package httpapi exposes the Scan routes under /api/scan. Handlers are thin: parse, call the scan service
// (built in wiring.go over Stock, Products, Ingredients and the Shopping List), respond. Stubs: every route
// answers 501 until implemented.
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "scan", Mount: mount}) }

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "not implemented")
}

// mount registers the routes listed in docs/dev/design/t13-shopping-scan.md (all r.User).
func mount(r *app.Router, _ app.Deps) {
	r.User("GET /api/scan/bundle", notImplemented)
	r.User("POST /api/scan", notImplemented)
	r.User("POST /api/scan/sync", notImplemented)
	r.User("POST /api/scan/{clientUuid}/undo", notImplemented)
	r.User("PATCH /api/scan/{clientUuid}", notImplemented)
}
