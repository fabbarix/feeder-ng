// Package httpapi exposes the household module's routes (settings, Members,
// Meal Slots, Attendance, per-User preferences). Handlers only parse, call the
// household package and store, and respond.
package httpapi

import "github.com/fabbarix/feeder-ng/internal/app"

func init() { app.Register(app.Module{Name: "household", Mount: mount}) }

func mount(r *app.Router, d app.Deps) { /* routes: see docs/dev/design/t1-auth-household.md */ }
