// Package httpapi lets an Admin list the nightly snapshots and take one now.
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "backup", Mount: mount}) }

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "not implemented yet")
}

func mount(r *app.Router, _ app.Deps) {
	r.Admin("GET /api/admin/backups", notImplemented)
	r.Admin("POST /api/admin/backups", notImplemented)
}
