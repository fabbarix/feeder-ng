// Package httpapi exposes the receipt read routes (docs/design/receipt-reading.md §7.1). Handlers are thin: parse, call
// internal/receipt/service, respond. Registers itself in init().
//
// Adding routes: this package mounts the route groups listed in routes, in order, on the same router. A file that
// adds routes (RR3's apply.go) appends its group in its own init(), and the group registers its routes on the router
// it is given:
//
//	func init() {
//		routes = append(routes, func(r *app.Router, a *api) {
//			r.User("POST /api/scan/receipt/apply", a.apply)
//		})
//	}
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/receipt/service"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/claude"
	rasvc "github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

func init() { app.Register(app.Module{Name: "receipt", Mount: mount}) }

// routes are the route groups of this package, mounted by mount in order (see the package comment).
var routes = []func(r *app.Router, a *api){mountReads}

type api struct {
	svc *service.Service
}

func mount(r *app.Router, d app.Deps) {
	// The Recipe Assistant's service is shared: the same availability, client, photo preparer and Limiter.
	ra := rasvc.For(d, claude.Factory(d.Logger))
	sqlEvents := service.NewSQLEvents(d.DB, d.Clock)
	a := &api{svc: service.New(service.Deps{
		Assistant: service.FromRecipeAssistant(ra),
		Events:    sqlEvents, // the loader the apply shares replaces this line (RR3: scanhttpapi.NewReceiptApplier(d))
		Contexts:  sqlEvents,
		Photos:    ra.Photos(),
		Clock:     d.Clock,
		Logger:    d.Logger,
	})}
	for _, f := range routes {
		f(r, a)
	}
}

// mountReads registers the read routes (reads.go).
func mountReads(r *app.Router, a *api) {
	r.User("POST /api/scan/receipt/reads", a.start)
	r.User("GET /api/scan/receipt/reads/{id}", a.get)
	r.User("DELETE /api/scan/receipt/reads/{id}", a.cancel)
}

// writeNoContent answers 204 with no body.
func writeNoContent(w http.ResponseWriter) { w.WriteHeader(http.StatusNoContent) }
