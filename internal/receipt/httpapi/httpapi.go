// Package httpapi exposes the receipt routes: the reads (docs/design/receipt-reading.md §7.1, reads.go) and the apply
// (§7.2, apply.go). Handlers are thin: parse, call internal/receipt/service or the scan service, respond. Registers
// itself in init() as module "receipt".
//
// Adding routes: this package mounts the route groups listed in routes, in order, on the same router. A file that
// adds routes appends its group in its own init(), as apply.go does:
//
//	func init() { routes = append(routes, mountApply) }
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/receipt/service"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/claude"
	rasvc "github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
	scanhttpapi "github.com/fabbarix/feeder-ng/internal/scan/httpapi"
)

func init() { app.Register(app.Module{Name: "receipt", Mount: mount}) }

// routes are the route groups of this package, mounted by mount in order (see the package comment).
var routes = []func(r *app.Router, a *api){mountReads}

type api struct {
	svc     *service.Service
	applier *applier
}

func mount(r *app.Router, d app.Deps) {
	// The Recipe Assistant's service is shared: the same availability, client, photo preparer and Limiter.
	ra := rasvc.For(d, claude.Factory(d.Logger))
	sqlEvents := service.NewSQLEvents(d.DB, d.Clock)
	scan := scanhttpapi.NewReceiptApplier(d)
	a := &api{applier: newApplier(d, scan), svc: service.New(service.Deps{
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
