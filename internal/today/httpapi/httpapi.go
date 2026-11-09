// Package httpapi serves the two Today endpoints no other feature provides:
// Advance Steps due today and the zero-waste streak.
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "today", Mount: mount}) }

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "not implemented yet")
}

func mount(r *app.Router, _ app.Deps) {
	r.User("GET /api/today/advance-steps", notImplemented)
	r.User("GET /api/today/streak", notImplemented)
}
