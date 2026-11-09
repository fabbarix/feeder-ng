// Package httpapi exposes the Ingredient routes (see docs/dev/design/t2-ingredients.md).
// It registers itself with the app registry; handlers stay thin: parse, call
// internal/ingredient or its store, respond.
package httpapi

import "github.com/fabbarix/feeder-ng/internal/app"

func init() { app.Register(app.Module{Name: "ingredients", Mount: mount}) }

// mount registers the routes. TODO(developer): all routes in the design note.
func mount(r *app.Router, d app.Deps) {}
