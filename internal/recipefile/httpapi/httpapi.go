// Package httpapi exposes Recipe File import and export (routes in
// docs/dev/design/t12-import-export.md). Handlers are thin: parse, call
// internal/recipefile (+ its store), respond. Registers itself in init().
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "recipefile", Mount: mount}) }

func mount(r *app.Router, d app.Deps) {
	r.Public("GET /schema/recipe-file-v1.json", notImplemented)
	r.User("GET /api/recipe-file/agent-prompt", notImplemented)
	r.User("GET /api/recipe-file/export", notImplemented)
	r.User("POST /api/imports", notImplemented)
	r.User("POST /api/imports/{id}/plan", notImplemented)
	r.User("POST /api/imports/{id}/confirm", notImplemented)
	r.User("DELETE /api/imports/{id}", notImplemented)
}

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "Not implemented yet")
}
