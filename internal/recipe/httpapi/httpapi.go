// Package httpapi exposes the recipes module: Recipes, Tags, images and Member
// preferences (see docs/dev/design/t8-recipes.md for the route table). Handlers
// are thin: parse, call internal/recipe/store, respond. Registers itself in init().
//
// STUB: every route answers 501 until the Developer implements it.
package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "recipes", Mount: mount}) }

func notImplemented(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "recipes: not implemented yet")
}

func mount(r *app.Router, _ app.Deps) {
	for _, pattern := range []string{
		"GET /api/recipes", "POST /api/recipes",
		"GET /api/recipes/{id}", "PUT /api/recipes/{id}", "DELETE /api/recipes/{id}",
		"POST /api/recipes/{id}/archive", "POST /api/recipes/{id}/unarchive",
		"GET /api/tags",
		"POST /api/images", "GET /api/images/{id}",
		"GET /api/recipe-preferences",
		"PUT /api/recipes/{id}/preference", "PUT /api/ingredient-exclusions/{ingredientId}",
	} {
		r.User(pattern, notImplemented)
	}
}
