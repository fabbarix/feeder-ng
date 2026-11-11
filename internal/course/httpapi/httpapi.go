// Package httpapi exposes the Courses routes of spec §16 (list, add, rename and Make main, reorder,
// impact, delete, archive, unarchive). Handlers only parse, call internal/course/store and respond.
package httpapi

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/course"
	"github.com/fabbarix/feeder-ng/internal/course/store"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
)

func init() { app.Register(app.Module{Name: "courses", Mount: mount}) }

// Live-update topics. A Course change replans the plan (household topic, mealSlots); a Course taken off
// Recipes also refreshes the Recipes screens.
const (
	householdTopic = "household"
	recipesTopic   = "recipes"
)

// api bundles what the handlers need.
type api struct {
	d       app.Deps
	st      *store.Store
	recipes *recipestore.Store
}

func mount(r *app.Router, d app.Deps) {
	// The Recipe store is read here for names only (List), which needs no ingredient source.
	a := &api{d: d, st: store.New(d.DB, d.Clock), recipes: recipestore.New(d.DB, d.Clock, nil)}

	r.User("GET /api/courses", a.list)
	r.Admin("POST /api/courses", a.add)
	r.Admin("PUT /api/courses/order", a.reorder)
	r.Admin("PATCH /api/courses/{id}", a.patch)
	r.User("GET /api/courses/{id}/impact", a.impact)
	r.Admin("DELETE /api/courses/{id}", a.remove)
	r.Admin("POST /api/courses/{id}/archive", a.archive)
	r.Admin("POST /api/courses/{id}/unarchive", a.unarchive)
}

// changed publishes a household change so open screens and the plan refresh.
func (a *api) changed(what string) {
	a.d.Events.Publish(householdTopic, map[string]string{"changed": what})
}

// recipesChanged tells the Recipes screens that Courses were taken off Recipes.
func (a *api) recipesChanged(what string) {
	a.d.Events.Publish(recipesTopic, map[string]string{"changed": what})
}

// listing returns one Course with its counts, of any state. course.ErrNotFound when absent.
func (a *api) listing(ctx context.Context, id int64) (course.Listing, error) {
	all, err := a.st.List(ctx, true)
	if err != nil {
		return course.Listing{}, err
	}
	for _, l := range all {
		if l.ID == id {
			return l, nil
		}
	}
	return course.Listing{}, course.ErrNotFound
}

// recipeNames maps every Recipe id, archived ones included, to its name.
func (a *api) recipeNames(ctx context.Context) (map[int64]string, error) {
	list, err := a.recipes.List(ctx, recipestore.ListFilter{Archived: "all"})
	if err != nil {
		return nil, err
	}
	out := make(map[int64]string, len(list))
	for _, s := range list {
		out[s.ID] = s.Name
	}
	return out, nil
}
