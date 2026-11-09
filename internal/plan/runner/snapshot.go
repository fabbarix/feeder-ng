package runner

import (
	"context"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/planner"
	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// info is the household context every run and action starts from.
type info struct {
	now      time.Time
	zone     *time.Location
	today    string
	settings plan.Settings
	defs     []MealSlotDef
}

func (r *Runner) info(ctx context.Context) (info, error) {
	settings, zone, err := r.d.Source.Settings(ctx)
	if err != nil {
		return info{}, err
	}
	defs, err := r.d.Source.MealSlots(ctx)
	if err != nil {
		return info{}, err
	}
	now := r.d.Clock.Now()
	return info{now: now, zone: zone, today: plan.Today(now, zone), settings: settings, defs: defs}, nil
}

// weekdayOf is 1 (Monday) .. 7 (Sunday) for a YYYY-MM-DD date.
func weekdayOf(date string) int {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return 0
	}
	if wd := int(d.Weekday()); wd != 0 {
		return wd
	}
	return 7
}

func findDef(defs []MealSlotDef, id int64) (MealSlotDef, bool) {
	for _, d := range defs {
		if d.ID == id {
			return d, true
		}
	}
	return MealSlotDef{}, false
}

// slotDef returns the Meal Slot of key when it exists and falls on the key's weekday.
func (in info) slotDef(key plan.Key) (MealSlotDef, bool) {
	def, ok := findDef(in.defs, key.MealSlotID)
	return def, ok && def.Weekday == weekdayOf(key.Date)
}

// instant is the start of the slot at key in the household zone.
func (in info) instant(key plan.Key) (time.Time, bool) {
	def, ok := in.slotDef(key)
	if !ok {
		return time.Time{}, false
	}
	at, err := plan.SlotInstant(key.Date, def.Time, in.zone)
	return at, err == nil
}

// snapshot reads everything one planning run needs (see plan.Snapshot). It runs inside
// the caller's transaction when st is bound to one.
func (r *Runner) snapshot(ctx context.Context, st *store.Store, o runOpts) (plan.Snapshot, error) {
	in, err := r.info(ctx)
	if err != nil {
		return plan.Snapshot{}, err
	}
	src := r.d.Source
	unresolved, err := st.UnresolvedBefore(ctx, in.today)
	if err != nil {
		return plan.Snapshot{}, err
	}

	var slots []plan.SlotInfo
	seen := map[plan.Key]bool{}
	add := func(key plan.Key, def MealSlotDef) error {
		if seen[key] {
			return nil
		}
		seen[key] = true
		att, err := src.Attendance(ctx, def.ID, key.Date)
		if err != nil {
			return err
		}
		slots = append(slots, plan.SlotInfo{Key: key, Name: def.Name, Time: def.Time, Attendance: att})
		return nil
	}
	// Unconfirmed meals of past days first, then the Planning Horizon.
	for _, m := range unresolved {
		if def, ok := in.slotDef(m.Key); ok {
			if err := add(m.Key, def); err != nil {
				return plan.Snapshot{}, err
			}
		}
	}
	for _, date := range plan.HorizonDates(in.today, in.settings.HorizonDays) {
		for _, def := range in.defs {
			if def.Weekday == weekdayOf(date) {
				if err := add(plan.Key{Date: date, MealSlotID: def.ID}, def); err != nil {
					return plan.Snapshot{}, err
				}
			}
		}
	}

	from := in.today
	if len(unresolved) > 0 {
		from = unresolved[0].Key.Date
	}
	meals, err := st.Meals(ctx, from, "")
	if err != nil {
		return plan.Snapshot{}, err
	}

	recipes, err := r.d.Source.Recipes(ctx)
	if err != nil {
		return plan.Snapshot{}, err
	}
	rules, err := st.SlotRules(ctx)
	if err != nil {
		return plan.Snapshot{}, err
	}
	var clear []plan.Key
	switch {
	case o.clearAll:
		for _, s := range slots {
			clear = append(clear, s.Key)
		}
	case o.after != nil:
		target, ok := in.instant(*o.after)
		if !ok {
			return plan.Snapshot{}, ErrUnknownSlot
		}
		for _, s := range slots {
			at, ok := in.instant(s.Key)
			if !ok {
				continue
			}
			if at.After(target) || (at.Equal(target) && s.Key.MealSlotID > o.after.MealSlotID) {
				clear = append(clear, s.Key)
			}
		}
	}

	clear = append(clear, invalidOnRead(slots, meals, rules, recipes, clear)...)
	vrules, err := st.VarietyRules(ctx)
	if err != nil {
		return plan.Snapshot{}, err
	}
	prefs, err := src.Preferences(ctx)
	if err != nil {
		return plan.Snapshot{}, err
	}
	var ingredients []planner.IngredientID
	seenIng := map[planner.IngredientID]bool{}
	for _, rc := range recipes {
		for _, n := range rc.Needs {
			if !seenIng[n.IngredientID] {
				seenIng[n.IngredientID] = true
				ingredients = append(ingredients, n.IngredientID)
			}
		}
	}
	packs, err := src.Packs(ctx, ingredients)
	if err != nil {
		return plan.Snapshot{}, err
	}
	lots, shelf, err := r.d.Stock.Lots(ctx)
	if err != nil {
		return plan.Snapshot{}, err
	}
	leftovers, err := st.Leftovers(ctx)
	if err != nil {
		return plan.Snapshot{}, err
	}
	history, err := st.History(ctx, in.today)
	if err != nil {
		return plan.Snapshot{}, err
	}
	gen, err := st.Generation(ctx)
	if err != nil {
		return plan.Snapshot{}, err
	}
	return plan.Snapshot{
		Now: in.now, Zone: in.zone, Seed: plan.SeedFor(gen), Settings: in.settings,
		Slots: slots, Meals: meals, Clear: clear,
		SlotRules: rules, VarietyRules: vrules,
		Recipes: recipes, Preferences: prefs,
		Lots: lots, ShelfLife: shelf, Packs: packs,
		Leftovers: leftovers, History: history,
	}, nil
}

// invalidOnRead lists the unpinned Planned Meals the planner would keep although they are no longer valid, so that
// they are treated as empty: a slot nobody attends, or a meal that breaks the slot's Slot Rules (the planner keeps
// valid unpinned meals without re-checking Slot Rules). Keys already in clear are not repeated.
func invalidOnRead(slots []plan.SlotInfo, meals []plan.Meal, rules []plan.SlotRule, recipes []planner.Recipe, clear []plan.Key) []plan.Key {
	already := map[plan.Key]bool{}
	for _, k := range clear {
		already[k] = true
	}
	planned := map[plan.Key]plan.Meal{}
	for _, m := range meals {
		if m.State == plan.StatePlanned && !m.Pinned {
			planned[m.Key] = m
		}
	}
	var out []plan.Key
	for _, s := range slots {
		m, ok := planned[s.Key]
		if !ok || already[s.Key] {
			continue
		}
		if attendancePortions(s.Attendance) <= 0 {
			out = append(out, s.Key)
			continue
		}
		var slotRules []plan.SlotRule
		for _, rule := range rules {
			if rule.MealSlotID == s.Key.MealSlotID {
				slotRules = append(slotRules, rule)
			}
		}
		if len(slotRules) == 0 || m.From != nil {
			continue
		}
		if rc, ok := recipeOf(recipes, m.RecipeID); !ok || !matchesAnyRule(rc, slotRules) {
			out = append(out, s.Key)
		}
	}
	return out
}

// matchesAnyRule reports whether the Recipe satisfies one of the Slot Rules (by id, or by Tag key).
func matchesAnyRule(rc planner.Recipe, rules []plan.SlotRule) bool {
	for _, rule := range rules {
		if rule.Tag != "" {
			for _, t := range rc.Tags {
				if string(t) == recipe.TagKey(rule.Tag) {
					return true
				}
			}
			continue
		}
		if int64(rc.ID) == rule.RecipeID {
			return true
		}
	}
	return false
}

// unpinMisfits unpins the Pinned Planned Meals served from the Leftover of the fresh
// meal at source that no longer fit the available portions (plan.DependantsToUnpin).
func (r *Runner) unpinMisfits(ctx context.Context, st *store.Store, source plan.Key, available float64, in info) error {
	deps, err := st.Dependants(ctx, source)
	if err != nil {
		return err
	}
	ds := make([]plan.Dependant, 0, len(deps))
	for _, m := range deps {
		at, _ := in.instant(m.Key)
		ds = append(ds, plan.Dependant{Key: m.Key, At: at, Portions: m.Portions, Pinned: m.Pinned})
	}
	for _, k := range plan.DependantsToUnpin(available, ds) {
		if err := st.SetPinned(ctx, k, false); err != nil && !errors.Is(err, store.ErrNotFound) {
			return err
		}
	}
	return nil
}

// recipeOf returns the Recipe with id.
func recipeOf(recipes []planner.Recipe, id int64) (planner.Recipe, bool) {
	for _, rc := range recipes {
		if int64(rc.ID) == id {
			return rc, true
		}
	}
	return planner.Recipe{}, false
}

// needsFor is what Stock is asked to deduct for batches of the Recipe: the non-optional lines.
func needsFor(rc planner.Recipe, batches float64) []Need {
	var out []Need
	for _, n := range rc.Needs {
		if n.Optional {
			continue
		}
		out = append(out, Need{IngredientID: int64(n.IngredientID), Quantity: n.Quantity * batches})
	}
	return out
}

// attendancePortions sums the Portion Factors of an attendance.
func attendancePortions(att []plan.Attendee) float64 {
	var sum float64
	for _, a := range att {
		if a.Factor > 0 {
			sum += a.Factor
		}
	}
	return sum
}

// mapStoreErr maps the store's not-found to the runner's.
func mapStoreErr(err error) error {
	if errors.Is(err, store.ErrNotFound) {
		return ErrNotFound
	}
	return err
}
