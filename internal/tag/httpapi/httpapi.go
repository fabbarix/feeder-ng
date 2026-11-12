// Package httpapi exposes the Tags routes of spec §17 (list, add, update, impact, merge, delete).
// Handlers only parse, call internal/tag/store and respond; the events follow
// docs/dev/design/tg-api.md (tags, then recipes, then plan.invalidate rules_changed last).
package httpapi

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/tag"
	"github.com/fabbarix/feeder-ng/internal/tag/store"
)

func init() { app.Register(app.Module{Name: "tags", Mount: mount}) }

// Live-update topics. A Tag write publishes tags; a rename, merge or delete also publishes recipes
// (their Tags changed). plan.invalidate comes from internal/plan.
const (
	tagsTopic    = "tags"
	recipesTopic = "recipes"
)

// api bundles what the handlers need.
type api struct {
	d  app.Deps
	st *store.Store
}

func mount(r *app.Router, d app.Deps) {
	a := &api{d: d, st: store.New(d.DB)}
	r.User("GET /api/tags", a.list)
	r.User("POST /api/tags", a.create)
	r.User("PATCH /api/tags/{id}", a.patch)
	r.User("GET /api/tags/{id}/impact", a.impact)
	r.User("POST /api/tags/{id}/merge", a.merge)
	r.User("DELETE /api/tags/{id}", a.remove)
}

// changed publishes a Tag write (tags) and, when the Recipes' Tags moved, recipes.
func (a *api) changed(recipes bool) {
	a.d.Events.Publish(tagsTopic, map[string]string{"changed": "tags"})
	if recipes {
		a.d.Events.Publish(recipesTopic, map[string]string{"changed": "tags"})
	}
}

// listing returns one Tag with its counts. tag.ErrNotFound when absent.
func (a *api) listing(ctx context.Context, id int64) (tag.Listing, error) {
	all, err := a.st.List(ctx)
	if err != nil {
		return tag.Listing{}, err
	}
	for _, l := range all {
		if l.ID == id {
			return l, nil
		}
	}
	return tag.Listing{}, tag.ErrNotFound
}
