package httpapi

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/app"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/plan"
	planstore "github.com/fabbarix/feeder-ng/internal/plan/store"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// names looks up the display names the JSON carries next to ids (Recipe, Member and Ingredient names in why chips,
// meal and rule rows).
type names struct {
	hh     *householdstore.Store
	recipe *recipestore.Store
	ing    *ingredientstore.Store
	plan   *planstore.Store
}

func newNames(d app.Deps) *names {
	ing := ingredientstore.New(d.DB, d.Clock)
	return &names{
		hh:     householdstore.New(d.DB, d.Clock),
		recipe: recipestore.New(d.DB, d.Clock, ingredientUnits{ing}),
		ing:    ing,
		plan:   planstore.New(d.DB, d.Clock),
	}
}

// ingredientUnits gives the recipe store the Ingredients' unit conversions.
type ingredientUnits struct{ st *ingredientstore.Store }

func (u ingredientUnits) Units(ctx context.Context, id int64) (units.Ingredient, bool, error) {
	ing, err := u.st.Get(ctx, id)
	if err == ingredientstore.ErrNotFound {
		return units.Ingredient{}, false, nil
	}
	if err != nil {
		return units.Ingredient{}, false, err
	}
	return ing.Units(), true, nil
}

// table is one snapshot of the names, plus the Recipe and Member facts the JSON carries next to them.
type table struct {
	recipes       map[int64]string
	recipeMinutes map[int64]int    // total time of a Recipe in minutes (0 when unknown)
	recipePhoto   map[int64]string // photo URL of a Recipe ("" without one)
	members       map[int64]string
	memberColour  map[int64]string
	ingredients   map[int64]string
	slots         map[int64]string
	// leftoverFrom is the source Meal Slot of each stored Leftover by id (N1): a meal served from a stored Leftover
	// takes its "Leftover from <day>" date from here when the meal row does not carry it.
	leftoverFrom map[int64]plan.Key
}

// photoURL is the URL the image store serves an image id at (the recipe httpapi's imageURL).
func photoURL(id string) string {
	if id == "" {
		return ""
	}
	return "/api/images/" + id
}

func (n *names) load(ctx context.Context) (table, error) {
	t := table{recipes: map[int64]string{}, recipeMinutes: map[int64]int{}, recipePhoto: map[int64]string{},
		members: map[int64]string{}, memberColour: map[int64]string{}, ingredients: map[int64]string{}, slots: map[int64]string{}}
	ss, err := n.hh.Slots(ctx)
	if err != nil {
		return t, err
	}
	for _, s := range ss {
		t.slots[s.ID] = s.Name
	}
	rs, err := n.recipe.List(ctx, recipestore.ListFilter{Archived: "all"})
	if err != nil {
		return t, err
	}
	for _, r := range rs {
		t.recipes[r.ID] = r.Name
		t.recipeMinutes[r.ID] = r.TotalMinutes
		t.recipePhoto[r.ID] = photoURL(r.Image)
	}
	ms, err := n.hh.Members(ctx)
	if err != nil {
		return t, err
	}
	for _, m := range ms {
		t.members[m.ID] = m.Name
		t.memberColour[m.ID] = m.Colour
	}
	is, err := n.ing.List(ctx)
	if err != nil {
		return t, err
	}
	for _, i := range is {
		t.ingredients[i.ID] = i.Name
	}
	if t.leftoverFrom, err = n.plan.LeftoverSources(ctx); err != nil {
		return t, err
	}
	return t, nil
}
