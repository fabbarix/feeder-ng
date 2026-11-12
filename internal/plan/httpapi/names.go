package httpapi

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/app"
	coursestore "github.com/fabbarix/feeder-ng/internal/course/store"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/images"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
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
	course *coursestore.Store
}

func newNames(d app.Deps) *names {
	ing := ingredientstore.New(d.DB, d.Clock)
	return &names{
		hh:     householdstore.New(d.DB, d.Clock),
		recipe: recipestore.New(d.DB, d.Clock, ingredientUnits{ing}),
		ing:    ing,
		plan:   planstore.New(d.DB, d.Clock),
		course: coursestore.New(d.DB, d.Clock),
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
	courses       map[int64]string // Course names (crs-c2)
	whole         map[int64]bool   // Whole meal Recipes
	recipes       map[int64]string
	recipeReheat  map[int64]int    // R12: reheat time of a Recipe in minutes (0 when none)
	recipeMinutes map[int64]int    // total time of a Recipe in minutes (0 when unknown)
	recipePhoto   map[int64]string // photo URL of a Recipe ("" without one)
	members       map[int64]string
	memberColour  map[int64]string
	memberPhoto   map[int64]string // photo URL of a Member ("" without one)
	memberAvatar  map[int64]string // emoji of a Member
	ingredients   map[int64]string
	slots         map[int64]string
	// leftoverFrom is the source Meal Slot of each stored Leftover by id (N1): a meal served from a stored Leftover
	// takes its "Leftover from <day>" date from here when the meal row does not carry it.
	leftoverFrom map[int64]plan.Key
}

// load builds the names table. meals are the Meals about to be rendered: the source Meal Slot of the stored Leftovers
// they are served from is looked up by id (N1).
func (n *names) load(ctx context.Context, meals ...*plan.Meal) (table, error) {
	t := table{courses: map[int64]string{}, whole: map[int64]bool{}, recipes: map[int64]string{}, recipeReheat: map[int64]int{}, recipeMinutes: map[int64]int{}, recipePhoto: map[int64]string{},
		members: map[int64]string{}, memberColour: map[int64]string{}, memberPhoto: map[int64]string{}, memberAvatar: map[int64]string{}, ingredients: map[int64]string{}, slots: map[int64]string{}}
	ss, err := n.hh.Slots(ctx)
	if err != nil {
		return t, err
	}
	for _, s := range ss {
		t.slots[s.ID] = s.Name
	}
	cs, err := n.course.List(ctx, true)
	if err != nil {
		return t, err
	}
	for _, c := range cs {
		t.courses[c.ID] = c.Name
	}
	rs, err := n.recipe.List(ctx, recipestore.ListFilter{Archived: "all"})
	if err != nil {
		return t, err
	}
	for _, r := range rs {
		t.recipes[r.ID] = r.Name
		t.whole[r.ID] = r.WholeMeal
		t.recipeMinutes[r.ID] = r.TotalMinutes
		t.recipeReheat[r.ID] = r.ReheatMinutes
		t.recipePhoto[r.ID] = images.URL(r.Image)
	}
	ms, err := n.hh.Members(ctx)
	if err != nil {
		return t, err
	}
	for _, m := range ms {
		t.members[m.ID] = m.Name
		t.memberColour[m.ID] = m.Colour
		t.memberPhoto[m.ID] = images.URL(m.Photo)
		t.memberAvatar[m.ID] = m.Avatar
	}
	is, err := n.ing.List(ctx)
	if err != nil {
		return t, err
	}
	for _, i := range is {
		t.ingredients[i.ID] = i.Name
	}
	if t.leftoverFrom, err = n.plan.LeftoverSources(ctx, leftoverIDs(meals)); err != nil {
		return t, err
	}
	return t, nil
}

// leftoverIDs are the distinct ids of the stored Leftovers the meals are served from.
func leftoverIDs(meals []*plan.Meal) []int64 {
	seen := map[int64]bool{}
	var ids []int64
	for _, m := range meals {
		if m == nil || m.From == nil || m.From.LeftoverID == 0 || seen[m.From.LeftoverID] {
			continue
		}
		seen[m.From.LeftoverID] = true
		ids = append(ids, m.From.LeftoverID)
	}
	return ids
}

// viewMeals are the Meals of the slot views: each Course row's.
func viewMeals(views []runner.SlotView) []*plan.Meal {
	out := make([]*plan.Meal, 0, len(views))
	for _, v := range views {
		for i := range v.Courses {
			out = append(out, v.Courses[i].Meal)
		}
	}
	return out
}

// listMeals are the Meals of the flat list entries (to-confirm).
func listMeals(entries []runner.ListEntry) []*plan.Meal {
	out := make([]*plan.Meal, 0, len(entries))
	for _, e := range entries {
		out = append(out, e.Meal)
	}
	return out
}
