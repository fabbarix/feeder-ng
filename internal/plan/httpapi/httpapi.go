// Package httpapi exposes the planning module (route table and JSON shapes in
// docs/dev/design/t11-planning.md). Handlers are thin: parse, call the runner or
// store, respond. The module also wires everything at Mount: the Runner (with the
// household, recipe, product and stock adapters), the invalidation subscription,
// the PlannedChecker and the nightly job on app.Deps.Scheduler.
//
// This file is the Designer's stub: every route answers 501 until the Developer
// fills it in.
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	_ "github.com/fabbarix/feeder-ng/internal/plan/store" // registers the PlannedChecker "planning"
)

func init() { app.Register(app.Module{Name: "planning", Mount: mount}) }

func mount(r *app.Router, d app.Deps) {
	// Every route needs a signed-in User; none is Admin-only (spec §2 lists the Admin duties and
	// Slot Rules, Variety Rules and the plan are not among them).
	for _, route := range []string{
		"GET /api/plan",
		"GET /api/plan/to-confirm",
		"GET /api/plan/couldnt-plan",
		"GET /api/plan/leftovers",
		"POST /api/plan/regenerate",
		"PUT /api/plan/{date}/{slotId}",
		"POST /api/plan/{date}/{slotId}/confirm",
		"POST /api/plan/{date}/{slotId}/unpin",
		"GET /api/plan/{date}/{slotId}/alternatives",
		"GET /api/plan/{date}/{slotId}/cook",
		"POST /api/plan/{date}/{slotId}/cooked",
		"POST /api/plan/{date}/{slotId}/not-cooked",
		"GET /api/slot-rules",
		"POST /api/slot-rules",
		"DELETE /api/slot-rules/{id}",
		"GET /api/variety-rules",
		"PUT /api/variety-rules/{tag}",
		"DELETE /api/variety-rules/{tag}",
	} {
		r.User(route, notImplemented)
	}
}

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "Planning is not implemented yet")
}
