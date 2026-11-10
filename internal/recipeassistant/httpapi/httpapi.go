// Package httpapi exposes the Recipe Assistant's status, settings, models and connection-test routes
// (design §7). Handlers are thin: parse, call internal/recipeassistant/service, respond. The reads routes live in
// internal/recipefile/httpapi/reads.go because that package owns the in-memory Import Review sessions.
// Registers itself in init().
package httpapi

import "github.com/fabbarix/feeder-ng/internal/app"

func init() { app.Register(app.Module{Name: "recipeassistant", Mount: mount}) }

// mount registers, with app.Router:
//
//	r.User("GET /api/recipe-assistant/status")
//	r.Admin("GET /api/recipe-assistant/settings")
//	r.Admin("PUT /api/recipe-assistant/settings")
//	r.Admin("DELETE /api/recipe-assistant/settings/api-key")
//	r.Admin("POST /api/recipe-assistant/models")
//	r.Admin("POST /api/recipe-assistant/test")
//
// TODO(ra-c developer): implement (red stub: registers nothing).
func mount(r *app.Router, d app.Deps) {}
