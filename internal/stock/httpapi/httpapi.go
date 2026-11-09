// Package httpapi exposes the Stock routes under /api/stock. Handlers are thin:
// parse, call the stock service, respond. It registers itself in init().
package httpapi

import "github.com/fabbarix/feeder-ng/internal/app"

func init() { app.Register(app.Module{Name: "stock", Mount: mount}) }

// mount registers the routes listed in docs/dev/design/t10-stock.md (all r.User).
// It builds the service from app.Deps: store.New(d.DB, d.Clock), the Ingredient
// adapter and the household "today" adapter (wiring.go), d.Events as Publisher.
func mount(r *app.Router, d app.Deps) {
	// TODO(Developer)
}
