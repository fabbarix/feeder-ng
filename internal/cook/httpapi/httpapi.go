// Package httpapi exposes Cook Mode and the kitchen board under /api/cook and
// /api/board. Handlers are thin: parse, call the cook service, respond. It
// registers itself in init(). See docs/dev/design/t14-cook-board.md.
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "cook", Mount: mount}) }

// mount registers the routes (all r.User). Until the Developer implements
// them every route answers 501.
func mount(r *app.Router, d app.Deps) {
	for _, route := range []string{
		"GET /api/cook/meals/{date}/{slotId}",
		"GET /api/cook/recipes/{id}",
		"PUT /api/cook/marks",
		"GET /api/cook/timers",
		"POST /api/cook/timers",
		"POST /api/cook/timers/{id}/pause",
		"POST /api/cook/timers/{id}/resume",
		"DELETE /api/cook/timers/{id}",
		"GET /api/board",
	} {
		r.User(route, notImplemented)
	}
}

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "not implemented yet")
}
