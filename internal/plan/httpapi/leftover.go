package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// Leftovers by hand (ADR 0012, docs/dev/design/b5-lo.md §6). STUBS for the test commit: the Developer writes the
// handlers (thin: parse, call the runner, respond), maps the runner's errors in writeFieldErr and fills leftoverOut
// from runner.LeftoverViews in GET /api/plan/leftovers.

func (a *api) leftoverRoutes(r *app.Router) {
	r.User("POST /api/plan/leftovers/{id}/had-it", a.notBuilt)
	r.User("POST /api/plan/leftovers/{id}/threw-out", a.notBuilt)
	r.User("POST /api/plan/leftovers/{id}/freeze", a.notBuilt)
	r.User("POST /api/plan/leftovers/{id}/take-out", a.notBuilt)
	r.User("POST /api/plan/leftovers/{id}/answer", a.notBuilt)
}

func (a *api) notBuilt(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "Leftovers by hand are not built yet")
}
