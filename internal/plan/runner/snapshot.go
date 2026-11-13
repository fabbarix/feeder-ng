package runner

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/planner"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
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

// slotAt is the start of the Meal Slot on key's date in the household zone, at the effective time: the date's own time
// when it has one (ADR 0014). ok is false when the key is not a Meal Slot that falls on its date.
func (r *Runner) slotAt(ctx context.Context, in info, key plan.Key) (time.Time, bool, error) {
	if _, ok := in.slotDef(key); !ok {
		return time.Time{}, false, nil
	}
	d, err := r.d.Source.SlotDate(ctx, key.MealSlotID, key.Date)
	if err != nil {
		return time.Time{}, false, err
	}
	at, err := plan.SlotInstant(key.Date, d.Time, in.zone)
	return at, err == nil, nil
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
	// add reads one slot occurrence once, whatever its Courses: keys carry the Course, the occurrence does not.
	add := func(key plan.Key, def MealSlotDef) error {
		occ := plan.Key{Date: key.Date, MealSlotID: key.MealSlotID}
		if seen[occ] {
			return nil
		}
		seen[occ] = true
		att, err := src.Attendance(ctx, def.ID, occ.Date)
		if err != nil {
			return err
		}
		courses, err := src.SlotCourses(ctx, def.ID, occ.Date)
		if err != nil {
			return err
		}
		d, err := src.SlotDate(ctx, def.ID, occ.Date)
		if err != nil {
			return err
		}
		slots = append(slots, plan.SlotInfo{Key: occ, Name: def.Name, Time: d.Time, UsualTime: d.UsualTime,
			Guests: d.Guests, NotServed: d.NotServed, Attendance: att, Courses: courses})
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
			clear = append(clear, plan.CellKeys(s)...)
		}
	case o.after != nil:
		target, ok, err := r.slotAt(ctx, in, *o.after)
		if err != nil {
			return plan.Snapshot{}, err
		}
		if !ok {
			return plan.Snapshot{}, ErrUnknownSlot
		}
		after := *o.after
		for _, s := range slots {
			at, err := plan.SlotInstant(s.Key.Date, s.Time, in.zone)
			if err != nil {
				continue
			}
			for _, k := range plan.CellKeys(s) {
				later := at.After(target) || (at.Equal(target) && s.Key.MealSlotID > o.after.MealSlotID)
				// Within the same occurrence the Courses the walk visits after the target are later too.
				sameSlot := at.Equal(target) && s.Key.MealSlotID == o.after.MealSlotID
				if later || (sameSlot && walkRank(s, k.CourseID) > walkRank(s, after.CourseID)) {
					clear = append(clear, k)
				}
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

// walkRank is the Course's place in the planner's walk inside its slot occurrence: the main Course first, then the
// required Courses, then the optional ones, each group in the slot's order (-1 when the Course is not one of the
// slot's Courses, and for a slot without Courses).
func walkRank(s plan.SlotInfo, courseID int64) int {
	for i, c := range s.Courses {
		if c.CourseID == courseID {
			group := 1
			switch {
			case c.Main:
				group = 0
			case c.Optional:
				group = 2
			}
			return group*len(s.Courses) + i
		}
	}
	return -1
}

// invalidOnRead lists the unpinned Planned Meals the planner would keep although they are no longer valid, so that
// they are treated as empty: a cell nobody eats (no Member and no Guest), or a meal that breaks the Slot Rules of its
// cell (the planner keeps valid unpinned meals without re-checking them). Batches that no longer cover the portions are
// not listed: the planner keeps the meal and raises its Batches (ADR 0014 point 6). A Leftover-served meal is checked
// against its source by the planner. It works per planning cell. Keys already in clear are not repeated.
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
		for _, k := range plan.CellKeys(s) {
			m, ok := planned[k]
			if !ok || already[k] {
				continue
			}
			// Nobody eats the cell (no Member and no Guest).
			if cellPortions(s, k.CourseID) <= 0 {
				out = append(out, k)
				continue
			}
			if m.From != nil {
				continue
			}
			// Batches that no longer cover the cell's portions are not a reason to drop the meal: the planner keeps it and
			// raises its Batches (ADR 0014 point 6).
			rc, ok := recipeOf(recipes, m.RecipeID)
			if !ok {
				out = append(out, k)
				continue
			}
			if cellRules := plan.CellRules(rules, s, k.CourseID); len(cellRules) > 0 && !matchesAnyRule(rc, cellRules) {
				out = append(out, k)
			}
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
		at, _, err := r.slotAt(ctx, in, m.Key)
		if err != nil {
			return err
		}
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

// TreeSource is the optional part of Sources that gives the need tree of each plannable Recipe, by Recipe id
// (docs/dev/design/base-recipes.md section 8). A Recipe without an entry keeps the planner's Needs.
type TreeSource interface {
	NeedTrees(ctx context.Context) (map[int64][]baserecipe.Need, error)
}

// needsBook resolves what a Cooked deducts (BR-G): each Recipe's need tree is run through baserecipe.Resolve against the
// Stock on hand, so a Base recipe Ingredient is taken first and only the made part's Ingredients are deducted. The Stock on
// hand is read once per book, inside the caller's transaction when its context carries one, and shrinks as the Courses
// of one write take from it.
type needsBook struct {
	r     *Runner
	trees map[int64][]baserecipe.Need
	have  map[int64]float64 // nil until the Stock is read
}

// needsBookFor reads the need trees of the Sources (none when they are not a TreeSource).
func (r *Runner) needsBookFor(ctx context.Context) (*needsBook, error) {
	b := &needsBook{r: r}
	if ts, ok := r.d.Source.(TreeSource); ok {
		trees, err := ts.NeedTrees(ctx)
		if err != nil {
			return nil, err
		}
		b.trees = trees
	}
	return b, nil
}

// load reads the Stock on hand per Ingredient, once.
func (b *needsBook) load(ctx context.Context) error {
	if b.have != nil {
		return nil
	}
	lots, _, err := b.r.d.Stock.Lots(ctx)
	if err != nil {
		return err
	}
	b.have = make(map[int64]float64, len(lots))
	for _, l := range lots {
		b.have[int64(l.IngredientID)] += l.Quantity
	}
	return nil
}

// requiredOnly is the need tree without its Optional nodes, at any depth: an Optional line is never deducted, so it must not
// take Stock from the jar either (a later Course of the slot gets it). A Base recipe whose lines are all Optional is left out
// too: it has nothing to make that is deducted.
func requiredOnly(tree []baserecipe.Need) []baserecipe.Need {
	var out []baserecipe.Need
	for _, n := range tree {
		if n.Optional {
			continue
		}
		if len(n.Made) > 0 {
			made := requiredOnly(n.Made)
			if len(made) == 0 {
				continue
			}
			n.Made = made
		}
		out = append(out, n)
	}
	return out
}

// needsOf is what Stock is asked to deduct for batches of the Recipe. Without a need tree it is needsFor. With one, the tree
// is resolved Stock first (baserecipe.Resolve) and its Optional lines are left out. picks are the Used from picks of this
// meal: on a Base recipe Ingredient they are the Stock the meal may take, instead of the Stock on hand; picks on other
// Ingredients change nothing here.
func (b *needsBook) needsOf(ctx context.Context, rc planner.Recipe, batches float64, picks []UsedFrom) ([]Need, error) {
	tree, ok := b.trees[int64(rc.ID)]
	if !ok {
		return needsFor(rc, batches), nil
	}
	tree = requiredOnly(tree)
	if err := b.load(ctx); err != nil {
		return nil, err
	}
	picked := map[int64]float64{}
	for _, u := range picks {
		for _, p := range u.Picks {
			picked[u.IngredientID] += p.Quantity
		}
	}
	have := func(id int64) float64 {
		h := b.have[id]
		if q, ok := picked[id]; ok {
			h = math.Min(h, q)
		}
		return h
	}
	take := func(id int64, q float64) { b.have[id] -= q }
	var out []Need
	for _, n := range baserecipe.Resolve(tree, batches, have, take) {
		if n.Optional {
			continue
		}
		out = append(out, Need{IngredientID: n.IngredientID, Quantity: n.Quantity})
	}
	return out, nil
}

// cellPortions is what a cell of the slot needs: the Portion Factors of its Course Attendance plus one per Guest of the
// slot on that date (ADR 0014). A Course the slot does not serve needs nothing.
func cellPortions(si plan.SlotInfo, course int64) float64 {
	if len(si.Courses) > 0 && !hasCourse(si, course) {
		return 0
	}
	return attendancePortions(courseAttendance(si, course)) + float64(si.Guests)
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
