// Package httpapi exposes the Tags routes of spec §17 (list, add, update, impact, merge, delete).
// Handlers only parse, call internal/tag/store and respond; the events follow
// docs/dev/design/tg-api.md (tags, then recipes, then plan.invalidate rules_changed last).
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/tag/store"
)

func init() { app.Register(app.Module{Name: "tags", Mount: mount}) }

// api bundles what the handlers need.
type api struct {
	d  app.Deps
	st *store.Store
}

// STUB (TG-API test author): GET /api/tags is still served by internal/recipe/httpapi. The developer
// moves it here (list), removes it there, and replaces notImplemented below with the real handlers.
func mount(r *app.Router, d app.Deps) {
	a := &api{d: d, st: store.New(d.DB)}
	_ = a
	r.User("POST /api/tags", notImplemented)
	r.User("PATCH /api/tags/{id}", notImplemented)
	r.User("GET /api/tags/{id}/impact", notImplemented)
	r.User("POST /api/tags/{id}/merge", notImplemented)
	r.User("DELETE /api/tags/{id}", notImplemented)
}

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "TG-API is not implemented yet")
}
