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
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
	productstore "github.com/fabbarix/feeder-ng/internal/product/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// DBSources adapts the household, recipe, product and ingredient stores (over one
// database) to Sources.
type DBSources struct {
	hh   *householdstore.Store
	rc   *recipestore.Store
	prod *productstore.Store
	log  *slog.Logger
}

// NewDBSources returns the Sources of the real features.
func NewDBSources(db *sql.DB, clk clock.Clock, logger *slog.Logger) *DBSources {
	ing := ingredientstore.New(db, clk)
	return &DBSources{
		hh:   householdstore.New(db, clk),
		rc:   recipestore.New(db, clk, ingredientUnits{ing}),
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
		def := MealSlotDef{ID: m.ID, Weekday: m.Weekday, Name: m.Name, Time: m.Time}
		for _, c := range m.Courses {
			def.Courses = append(def.Courses, c.CourseID)
			if c.Main {
				def.MainCourse = c.CourseID
			}
		}
		out = append(out, def)
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

// SlotCourses implements Sources: the Courses of the Meal Slot on the date in the slot's order, each with its Course
// Attendance (household CoursesOn) resolved to effective Portion Factors.
func (s *DBSources) SlotCourses(ctx context.Context, mealSlotID int64, date string) ([]plan.SlotCourse, error) {
	days, err := s.hh.CoursesOn(ctx, mealSlotID, date)
	if err != nil {
		return nil, err
	}
	members, err := s.members(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]plan.SlotCourse, 0, len(days))
	for _, d := range days {
		sc := plan.SlotCourse{CourseID: d.CourseID, Main: d.Main, Optional: d.Optional}
		for _, a := range d.Attendance {
			m, ok := members[a.MemberID]
			if !ok {
				continue
			}
			sc.Attendance = append(sc.Attendance, plan.Attendee{MemberID: a.MemberID, Factor: household.EffectiveFactor(m, a)})
		}
		out = append(out, sc)
	}
	return out, nil
}

// SlotDate implements Sources: the effective time, Not served and Guests of the Meal Slot on the date, read through
// household.EffectiveTime and household.IsNotServed.
func (s *DBSources) SlotDate(ctx context.Context, mealSlotID int64, date string) (SlotDateDef, error) {
	slot, err := s.hh.Slot(ctx, mealSlotID)
	if err != nil {
		return SlotDateDef{}, err
	}
	row, err := s.hh.SlotDate(ctx, mealSlotID, date)
	if err != nil {
		return SlotDateDef{}, err
	}
	att, hasOverride, err := s.hh.DateAttendance(ctx, mealSlotID, date)
	if err != nil {
		return SlotDateDef{}, err
	}
	return SlotDateDef{
		Time:      household.EffectiveTime(slot.Time, row),
		UsualTime: slot.Time,
		NotServed: household.IsNotServed(row, att, hasOverride),
		Guests:    row.Guests,
	}, nil
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

// Recipes implements Sources: every plannable Recipe, archived ones included, with the Needs of one Batch in Base
// Units. A Base recipe line is flattened (baserecipe.Flatten over the batch need trees): the Base recipe's own leaves at
// full Quantity, and the Base recipe itself as an optional line of 0, so an Exclusion of any Ingredient inside it rules
// the Recipe out (section 5). A line whose unit cannot be converted is left out (it is not deducted and not planned
// for). A Base recipe is never passed: it could never be a candidate.
//
// The reads are one List (the Recipe fields, composed lead time included in its summary) and one batch of need trees;
// no Recipe is loaded or composed on its own.
func (s *DBSources) Recipes(ctx context.Context) ([]planner.Recipe, error) {
	list, err := s.rc.List(ctx, recipestore.ListFilter{Archived: "all"})
	if err != nil {
		return nil, err
	}
	trees, err := s.treeResults(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]planner.Recipe, 0, len(list))
	for _, sum := range list {
		tr, ok := trees[sum.ID]
		if !ok {
			s.log.Warn("recipe without a need tree left out of the planner", "recipe", sum.ID)
			continue
		}
		if tr.Err != nil {
			// A cycle: treeResults has logged it. With no Needs it would pass every Exclusion, so it is never planned.
			continue
		}
		pr := planner.Recipe{ID: planner.RecipeID(sum.ID), Name: sum.Name, Yield: sum.Yield, Archived: sum.Archived,
			CooldownDays: sum.CooldownDays, UseByDays: sum.LeftoverUseByDays, CourseIDs: sum.CourseIDs, WholeMeal: sum.WholeMeal}
		for _, t := range sum.Tags {
			pr.Tags = append(pr.Tags, planner.Tag(t))
		}
		// The longest lead of the composed Advance Steps (its own and its Base recipes') is the one the lead-time filter
		// needs: a cell is blocked when any Advance Step starts too late, so one step of that lead covers them all.
		if sum.AdvanceMinutes > 0 {
			pr.AdvanceSteps = []planner.AdvanceStep{{Lead: time.Duration(sum.AdvanceMinutes) * time.Minute}}
		}
		for _, n := range baserecipe.Flatten(tr.Needs) {
			pr.Needs = append(pr.Needs, planner.Need{IngredientID: planner.IngredientID(n.IngredientID), Quantity: n.Quantity, Optional: n.Optional})
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
