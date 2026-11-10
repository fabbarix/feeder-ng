package runner

import (
	"context"
	"database/sql"
	"log/slog"
	"sort"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/household"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
	productstore "github.com/fabbarix/feeder-ng/internal/product/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// DBSources adapts the household, recipe, product and ingredient stores (over one
// database) to Sources.
type DBSources struct {
	hh   *householdstore.Store
	rc   *recipestore.Store
	ing  *ingredientstore.Store
	prod *productstore.Store
	log  *slog.Logger
}

// NewDBSources returns the Sources of the real features.
func NewDBSources(db *sql.DB, clk clock.Clock, logger *slog.Logger) *DBSources {
	ing := ingredientstore.New(db, clk)
	return &DBSources{
		hh:   householdstore.New(db, clk),
		rc:   recipestore.New(db, clk, ingredientUnits{ing}),
		ing:  ing,
		prod: productstore.New(db, clk),
		log:  logger,
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

// Zone returns the household time zone (UTC when unset or unknown).
func (s *DBSources) zone(ctx context.Context) (plan.Settings, *time.Location, error) {
	hs, err := s.hh.Settings(ctx)
	if err != nil {
		return plan.Settings{}, nil, err
	}
	loc := time.UTC
	if hs.TimeZone != "" {
		if l, err := time.LoadLocation(hs.TimeZone); err == nil {
			loc = l
		}
	}
	return plan.Settings{
		HorizonDays:         hs.PlanningHorizonDays,
		DefaultCooldownDays: hs.DefaultCooldownDays,
		DefaultUseByDays:    hs.DefaultLeftoverUseByDays,
		Style:               hs.PlannerStyle,
	}, loc, nil
}

// Settings implements Sources.
func (s *DBSources) Settings(ctx context.Context) (plan.Settings, *time.Location, error) {
	return s.zone(ctx)
}

// MealSlots implements Sources.
func (s *DBSources) MealSlots(ctx context.Context) ([]MealSlotDef, error) {
	slots, err := s.hh.Slots(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]MealSlotDef, 0, len(slots))
	for _, m := range slots {
		out = append(out, MealSlotDef{ID: m.ID, Weekday: m.Weekday, Name: m.Name, Time: m.Time})
	}
	return out, nil
}

// Attendance implements Sources: the usual Attendance of the slot, or the date's override, with each Member's
// effective Portion Factor.
func (s *DBSources) Attendance(ctx context.Context, mealSlotID int64, date string) ([]plan.Attendee, error) {
	slots, err := s.hh.Slots(ctx)
	if err != nil {
		return nil, err
	}
	var usual []household.Attendee
	for _, m := range slots {
		if m.ID == mealSlotID {
			usual = m.Attendance
		}
	}
	override, hasOverride, err := s.hh.DateAttendance(ctx, mealSlotID, date)
	if err != nil {
		return nil, err
	}
	att := household.ResolveAttendance(usual, override, hasOverride)
	members, err := s.members(ctx)
	if err != nil {
		return nil, err
	}
	var out []plan.Attendee
	for _, a := range att {
		m, ok := members[a.MemberID]
		if !ok {
			continue
		}
		out = append(out, plan.Attendee{MemberID: a.MemberID, Factor: household.EffectiveFactor(m, a)})
	}
	return out, nil
}

func (s *DBSources) members(ctx context.Context) (map[int64]household.Member, error) {
	list, err := s.hh.Members(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[int64]household.Member, len(list))
	for _, m := range list {
		out[m.ID] = m
	}
	return out, nil
}

// Recipes implements Sources: every Recipe, archived ones included, with the Needs of one Batch in Base Units.
// A line whose unit cannot be converted is left out (it is not deducted and not planned for).
func (s *DBSources) Recipes(ctx context.Context) ([]planner.Recipe, error) {
	list, err := s.rc.List(ctx, recipestore.ListFilter{Archived: "all"})
	if err != nil {
		return nil, err
	}
	ings := map[int64]ingredient.Ingredient{}
	out := make([]planner.Recipe, 0, len(list))
	for _, sum := range list {
		rec, err := s.rc.Get(ctx, sum.ID)
		if err != nil {
			return nil, err
		}
		pr := planner.Recipe{ID: planner.RecipeID(rec.ID), Name: rec.Name, Yield: rec.Yield, Archived: rec.Archived,
			CooldownDays: rec.CooldownDays, UseByDays: rec.LeftoverUseByDays}
		for _, t := range rec.Tags {
			pr.Tags = append(pr.Tags, planner.Tag(t))
		}
		for _, a := range rec.Timing.Advance {
			pr.AdvanceSteps = append(pr.AdvanceSteps, planner.AdvanceStep{Lead: time.Duration(a.LeadTimeMinutes) * time.Minute})
		}
		for _, line := range rec.Lines {
			ing, ok := ings[line.IngredientID]
			if !ok {
				ing, err = s.ing.Get(ctx, line.IngredientID)
				if err != nil {
					s.log.Warn("recipe line with an unknown Ingredient skipped", "recipe", rec.ID, "ingredient", line.IngredientID)
					continue
				}
				ings[line.IngredientID] = ing
			}
			q, err := units.ToBase(line.Quantity, line.Unit, ing.Units())
			if err != nil {
				s.log.Warn("recipe line with an unconvertible unit skipped", "recipe", rec.ID, "ingredient", line.IngredientID)
				continue
			}
			pr.Needs = append(pr.Needs, planner.Need{IngredientID: planner.IngredientID(line.IngredientID), Quantity: q, Optional: line.Optional})
		}
		out = append(out, pr)
	}
	return out, nil
}

// Preferences implements Sources: each Member's Favourites, Dislikes, Exclusions and excluded Ingredients.
func (s *DBSources) Preferences(ctx context.Context) (map[int64]planner.Preferences, error) {
	members, err := s.hh.Members(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[int64]planner.Preferences, len(members))
	for _, m := range members {
		p, err := s.rc.Preferences(ctx, m.ID)
		if err != nil {
			return nil, err
		}
		var pr planner.Preferences
		ids := make([]int64, 0, len(p.Recipes))
		for id := range p.Recipes {
			ids = append(ids, id)
		}
		sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
		for _, id := range ids {
			switch p.Recipes[id] {
			case recipe.StateFavourite:
				pr.Favourites = append(pr.Favourites, planner.RecipeID(id))
			case recipe.StateDislike:
				pr.Dislikes = append(pr.Dislikes, planner.RecipeID(id))
			case recipe.StateExclusion:
				pr.ExcludedRecipes = append(pr.ExcludedRecipes, planner.RecipeID(id))
			}
		}
		for _, id := range p.ExcludedIngredients {
			pr.ExcludedIngredients = append(pr.ExcludedIngredients, planner.IngredientID(id))
		}
		out[m.ID] = pr
	}
	return out, nil
}

// Packs implements Sources: the pack size of the Product last bought for each Ingredient.
func (s *DBSources) Packs(ctx context.Context, ingredients []planner.IngredientID) (map[planner.IngredientID]planner.Pack, error) {
	ids := make([]int64, 0, len(ingredients))
	for _, id := range ingredients {
		ids = append(ids, int64(id))
	}
	bought, err := s.prod.LastBoughtMany(ctx, ids, nil)
	if err != nil {
		return nil, err
	}
	out := make(map[planner.IngredientID]planner.Pack, len(bought))
	for id, p := range bought {
		out[planner.IngredientID(id)] = planner.Pack{ProductID: planner.ProductID(p.ID), Size: p.PackSize}
	}
	return out, nil
}
