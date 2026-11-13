package runner

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// SlotView is one Meal Slot occurrence in the plan. Its meals and "couldn't plan" reasons are per Course (Courses).
type SlotView struct {
	Key        plan.Key
	Name       string
	Time       string // HH:MM, the effective time (the date's own time when it has one)
	UsualTime  string // HH:MM, the Meal Slot's usual time
	At         time.Time
	NotServed  bool    // the Meal Slot is Not served on this date (ADR 0014)
	Guests     int     // 0 to 20
	Portions   float64 // portions the Attendance needs, Guests included
	Attendance []plan.Attendee
	// Rules are the Slot Rules of this Meal Slot.
	Rules []plan.SlotRule
	// Courses are the slot's Courses in the slot's order, then history rows (team C2; empty until the Developer
	// fills them in). CookMinutes is the slot's timeline total in minutes, nil when nothing is fresh and still to cook.
	Courses     []CourseView
	CookMinutes *int
}

// ListEntry is one entry of a flat list (to-confirm, couldn't plan): the slot occurrence for one Course, with that
// Course's own Planned Meal or reason.
type ListEntry struct {
	SlotView
	Meal     *plan.Meal
	Unfilled *plan.Unfilled
}

// PlanView is the plan between two dates.
type PlanView struct {
	Today       string
	HorizonDays int
	Slots       []SlotView // chronological
}

// View returns every Meal Slot occurrence from..to (inclusive; "" from = today, "" to = last day of the Planning
// Horizon) with its Course rows (crs-c2 §3.1), its main Course's meal and "couldn't plan" reason (the aliases) and the
// Slot Rules of the slot. Unresolved earlier days are not added.
func (r *Runner) View(ctx context.Context, from, to string) (PlanView, error) {
	in, err := r.info(ctx)
	if err != nil {
		return PlanView{}, err
	}
	horizon := plan.HorizonDates(in.today, in.settings.HorizonDays)
	if from == "" {
		from = in.today
	}
	if to == "" {
		to = in.today
		if len(horizon) > 0 {
			to = horizon[len(horizon)-1]
		}
	}
	meals, err := r.d.Store.Meals(ctx, from, to)
	if err != nil {
		return PlanView{}, err
	}
	unfilled, err := r.d.Store.Unfilled(ctx, from, to)
	if err != nil {
		return PlanView{}, err
	}
	rules, err := r.d.Store.SlotRules(ctx)
	if err != nil {
		return PlanView{}, err
	}
	var infos []plan.SlotInfo
	for date := from; date <= to && len(date) == 10; date = nextDay(date) {
		for _, def := range in.defs {
			if def.Weekday != weekdayOf(date) {
				continue
			}
			si, err := r.occurrence(ctx, def, date)
			if err != nil {
				return PlanView{}, err
			}
			infos = append(infos, si)
		}
	}
	uByKey := map[plan.Key]plan.Unfilled{}
	for _, u := range unfilled {
		uByKey[u.Key] = u
	}
	whole, err := r.wholeFunc(ctx)
	if err != nil {
		return PlanView{}, err
	}
	view := PlanView{Today: in.today, HorizonDays: in.settings.HorizonDays}
	for _, si := range infos {
		var day []plan.Meal
		for _, m := range meals {
			if m.Key.Date == si.Key.Date && m.Key.MealSlotID == si.Key.MealSlotID {
				day = append(day, m)
			}
		}
		var cells []CourseView
		if len(si.Courses) > 0 {
			cells = courseViews(si, day, uByKey, whole)
		}
		if err := r.warnCells(ctx, cells); err != nil {
			return PlanView{}, err
		}
		sv := occurrenceView(in, si, cells)
		for _, rule := range rules {
			if rule.MealSlotID == si.Key.MealSlotID {
				sv.Rules = append(sv.Rules, rule)
			}
		}
		view.Slots = append(view.Slots, sv)
	}
	return view, nil
}

// slotOf is the slot view of one occurrence with its Course rows (no meals): the base of the lists.
func slotOf(in info, si plan.SlotInfo) SlotView {
	at, _ := plan.SlotInstant(si.Key.Date, si.Time, in.zone)
	return SlotView{Key: si.Key, Name: si.Name, Time: si.Time, UsualTime: si.UsualTime, At: at, NotServed: si.NotServed,
		Guests: si.Guests, Portions: attendancePortions(si.Attendance) + float64(si.Guests), Attendance: si.Attendance}
}

// nextDay is the date after a YYYY-MM-DD date ("" when malformed, which ends a walk).
func nextDay(date string) string {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return ""
	}
	return d.AddDate(0, 0, 1).Format("2006-01-02")
}

// ToConfirm returns one entry per Course whose Planned Meal is still in State planned and at least
// plan.ConfirmAfter past its slot time, in date, slot time, then the slot's Course order.
func (r *Runner) ToConfirm(ctx context.Context) ([]ListEntry, error) {
	in, err := r.info(ctx)
	if err != nil {
		return nil, err
	}
	meals, err := r.d.Store.UnresolvedBefore(ctx, "9999-12-31")
	if err != nil {
		return nil, err
	}
	var timed []plan.Timed
	for _, m := range meals {
		at, ok, err := r.slotAt(ctx, in, m.Key)
		if err != nil {
			return nil, err
		}
		if ok {
			timed = append(timed, plan.Timed{Meal: m, At: at})
		}
	}
	type entry struct {
		sv  ListEntry
		pos int
	}
	var list []entry
	for _, t := range plan.ToConfirm(timed, in.now) {
		def, _ := in.slotDef(t.Meal.Key)
		si, err := r.occurrence(ctx, def, t.Meal.Key.Date)
		if err != nil {
			return nil, err
		}
		m := t.Meal
		sv := slotOf(in, si)
		sv.Key = m.Key
		list = append(list, entry{sv: ListEntry{SlotView: sv, Meal: &m}, pos: coursePosition(si, m.Key.CourseID)})
	}
	sort.SliceStable(list, func(i, j int) bool {
		a, b := list[i], list[j]
		if !a.sv.At.Equal(b.sv.At) {
			return a.sv.At.Before(b.sv.At)
		}
		if a.sv.Key.MealSlotID != b.sv.Key.MealSlotID {
			return a.sv.Key.MealSlotID < b.sv.Key.MealSlotID
		}
		return a.pos < b.pos
	})
	out := make([]ListEntry, 0, len(list))
	for _, e := range list {
		out = append(out, e.sv)
	}
	return out, nil
}

// coursePosition is the place of a real Course id in the slot's Course order (its count when it is not served).
func coursePosition(si plan.SlotInfo, course int64) int {
	for i, c := range si.Courses {
		if c.CourseID == course {
			return i
		}
	}
	return len(si.Courses)
}

// CouldntPlan returns one entry per Course in the horizon (not yet past) that stayed empty with its reason, in the
// plan's order.
func (r *Runner) CouldntPlan(ctx context.Context) ([]ListEntry, error) {
	in, err := r.info(ctx)
	if err != nil {
		return nil, err
	}
	view, err := r.View(ctx, in.today, "")
	if err != nil {
		return nil, err
	}
	var out []ListEntry
	for _, s := range view.Slots {
		if s.At.Before(in.now) {
			continue
		}
		for _, c := range s.Courses {
			if c.History || c.Unfilled == nil {
				continue
			}
			e := s
			e.Courses = nil
			e.Key.CourseID = c.CourseID
			out = append(out, ListEntry{SlotView: e, Unfilled: c.Unfilled})
		}
	}
	return out, nil
}

// Leftovers returns the available Leftovers, soonest Use-by first.
func (r *Runner) Leftovers(ctx context.Context) ([]plan.Leftover, error) {
	return r.d.Store.Leftovers(ctx)
}

// keyAttendance is the attendance the planning cell at key serves on its date: the Course Attendance of that Course
// (Course 0 is the main Course of a slot with Courses), or the slot's own Attendance when the slot has no Courses.
// ErrCourseNotInSlot when the slot serves no such Course.
func (r *Runner) keyAttendance(ctx context.Context, def MealSlotDef, key plan.Key) ([]plan.Attendee, error) {
	courses, err := r.d.Source.SlotCourses(ctx, def.ID, key.Date)
	if err != nil {
		return nil, err
	}
	if len(courses) == 0 {
		return r.d.Source.Attendance(ctx, def.ID, key.Date)
	}
	for _, c := range courses {
		if c.CourseID == key.CourseID {
			return c.Attendance, nil
		}
	}
	return nil, ErrCourseNotInSlot
}

// guestsOn is the number of Guests of the Meal Slot on the date (ADR 0014): they eat every Course, so they add portions.
func (r *Runner) guestsOn(ctx context.Context, def MealSlotDef, date string) (int, error) {
	d, err := r.d.Source.SlotDate(ctx, def.ID, date)
	return d.Guests, err
}

// meal re-reads the Planned Meal at key after a write.
func (r *Runner) meal(ctx context.Context, key plan.Key) (plan.Meal, error) {
	m, err := r.d.Store.Meal(ctx, key)
	return m, mapStoreErr(err)
}

// SetResult is the answer of SetCourseMeal: the Course's meal and the Courses a Whole meal in the main Course removed.
type SetResult struct {
	Meal    plan.Meal
	Covered []int64 // real Course ids, in the slot's order
}

// SetMeal is SetCourseMeal without the covered list.
func (r *Runner) SetMeal(ctx context.Context, key plan.Key, recipeID int64, batches *float64) (plan.Meal, error) {
	res, err := r.SetCourseMeal(ctx, key, recipeID, batches)
	return res.Meal, err
}

// SetCourseMeal sets (or swaps to) a Recipe at the slot's Course and Pins it, then replans the unpinned slots after it
// (spec §7.3, §16). batches nil means ceil(portions / Yield) for the Course's Attendance (1 when nobody attends); an
// explicit value may be fractional. A Pinned or unpinned dependant of the meal that was there before is unpinned.
// Course fit (ErrCourseNotInSlot, ErrRecipeNotInCourse) and one Recipe per slot and date (ErrRecipeInSlot) are checked
// for a slot that has Courses. A Whole meal set in the main Course removes the other Courses' unpinned, unresolved
// meals and reports them as Covered. Errors: ErrUnknownSlot (not a Meal Slot of that weekday), ErrInPast (before
// today), ErrAlreadyResolved (Cooked or skipped there), ErrUnknownRecipe, ErrArchivedRecipe, ErrInvalidBatches.
func (r *Runner) SetCourseMeal(ctx context.Context, key plan.Key, recipeID int64, batches *float64) (SetResult, error) {
	return r.setCell(ctx, key, recipeID, batches, 0)
}

// setCell sets the Course's meal at key to a Recipe (SetCourseMeal), or, when leftoverID is not 0, to the Recipe of that
// Leftover served from it (UseLeftover: no batches, the Leftover's Use-by and portions checked).
func (r *Runner) setCell(ctx context.Context, key plan.Key, recipeID int64, batches *float64, leftoverID int64) (SetResult, error) {
	var covered []int64
	_, err := r.write(ctx, plan.ReasonPinned, runOpts{after: &key}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		if _, ok := in.slotDef(key); !ok {
			return nil, ErrUnknownSlot
		}
		at, _, err := r.slotAt(ctx, in, key)
		if err != nil {
			return nil, err
		}
		if at.Before(in.now) {
			return nil, ErrInPast
		}
		// A Meal Slot that is Not served on the date takes no Recipe (ADR 0014; PM, round 2).
		sd, err := r.d.Source.SlotDate(ctx, key.MealSlotID, key.Date)
		if err != nil {
			return nil, err
		}
		if sd.NotServed {
			return nil, ErrNotServed
		}
		var pick *plan.Leftover
		if leftoverID != 0 {
			l, err := availableLeftover(ctx, st, leftoverID)
			if err != nil {
				return nil, err
			}
			pick, recipeID = &l, int64(l.RecipeID)
		}
		recipes, err := r.d.Source.Recipes(ctx)
		if err != nil {
			return nil, err
		}
		rc, ok := recipeOf(recipes, recipeID)
		if !ok {
			return nil, ErrUnknownRecipe
		}
		// An archived Recipe refuses a meal it would be cooked for, not a Leftover of it: the food exists (ADR 0012).
		if rc.Archived && pick == nil {
			return nil, ErrArchivedRecipe
		}
		if batches != nil && *batches <= 0 {
			return nil, ErrInvalidBatches
		}
		def, _ := in.slotDef(key)
		si, err := r.occurrence(ctx, def, key.Date)
		if err != nil {
			return nil, err
		}
		cell := key.CourseID
		main := mainOf(si)
		if len(si.Courses) > 0 {
			if !hasCourse(si, cell) {
				return nil, ErrCourseNotInSlot
			}
			if !containsID(rc.CourseIDs, cell) {
				return nil, ErrRecipeNotInCourse
			}
		}
		portions := cellPortions(si, cell)
		b := 1.0
		if batches != nil {
			b = *batches
		} else if n := planner.BatchesFor(portions, rc.Yield); n > 1 {
			b = float64(n)
		}
		var from *plan.Source
		if pick != nil {
			b = 0
			from = &plan.Source{LeftoverID: pick.ID, From: pick.From}
			if pick.UseBy < key.Date {
				return nil, ErrLeftoverPastUseBy
			}
			// What the other Planned Meals served from it already claim (this cell's own claim does not count).
			deps, err := st.DependantsOfLeftover(ctx, pick.ID)
			if err != nil {
				return nil, err
			}
			var others []plan.Meal
			for _, d := range deps {
				if d.Key != key {
					others = append(others, d)
				}
			}
			if pick.Portions-claimsOf(others) < portions-eps {
				return nil, ErrLeftoverTooSmall
			}
		}

		day, err := st.Meals(ctx, key.Date, key.Date)
		if err != nil {
			return nil, err
		}
		whole := rc.WholeMeal && len(si.Courses) > 0 && cell == main
		// covers: a Whole meal in the main Course replaces the other Courses' unpinned, unresolved meals.
		covers := func(m plan.Meal) bool {
			return whole && m.Key.MealSlotID == key.MealSlotID && m.Key.CourseID != cell &&
				m.State == plan.StatePlanned && !m.Pinned
		}
		// A Recipe may not stand in two Courses of one slot and date, unless the other one is walked after this Course
		// and unpinned: the replan after this write clears and refills it (the planner's walk, crs-b §2).
		for _, m := range day {
			if m.Key.MealSlotID != key.MealSlotID || m.Key.CourseID == cell || covers(m) || m.RecipeID != recipeID {
				continue
			}
			walkedBefore := walkRank(si, m.Key.CourseID) < walkRank(si, cell)
			if m.State != plan.StatePlanned || m.Pinned || walkedBefore {
				return nil, ErrRecipeInSlot
			}
		}

		old, err := st.Meal(ctx, key)
		switch {
		case errors.Is(err, store.ErrNotFound):
		case err != nil:
			return nil, err
		case old.State != plan.StatePlanned:
			return nil, ErrAlreadyResolved
		case old.Fresh():
			// The meal being replaced was the source of its Leftover dependants: they no longer have it.
			if err := r.unpinMisfits(ctx, st, old.Key, 0, in); err != nil {
				return nil, err
			}
		}
		if _, err := st.SaveMeal(ctx, plan.Meal{Key: key, RecipeID: recipeID, Batches: b, Portions: portions,
			State: plan.StatePlanned, Pinned: true, From: from}); err != nil {
			return nil, mapStoreErr(err)
		}
		for _, m := range day {
			if !covers(m) {
				continue
			}
			covered = append(covered, m.Key.CourseID)
			if m.Fresh() {
				if err := r.unpinMisfits(ctx, st, m.Key, 0, in); err != nil {
					return nil, err
				}
			}
			if err := st.DeleteMeal(ctx, m.Key); err != nil {
				return nil, mapStoreErr(err)
			}
		}
		return nil, nil
	})
	if err != nil {
		return SetResult{}, err
	}
	m, err := r.meal(ctx, key)
	return SetResult{Meal: m, Covered: covered}, err
}

// containsID reports whether ids holds id.
func containsID(ids []int64, id int64) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// resolved tells Deps.OnResolved (if any) that the meal at key was resolved; it runs after the commit.
func (r *Runner) resolved(ctx context.Context, key plan.Key) {
	if r.d.OnResolved != nil {
		r.d.OnResolved(ctx, key)
	}
}

// Confirm Pins the Planned Meal as it is and replans the unpinned slots after it. ErrNotFound, ErrAlreadyResolved.
func (r *Runner) Confirm(ctx context.Context, key plan.Key) (plan.Meal, error) {
	_, err := r.write(ctx, plan.ReasonPinned, runOpts{after: &key}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		m, err := st.Meal(ctx, key)
		if err != nil {
			return nil, mapStoreErr(err)
		}
		if m.State != plan.StatePlanned {
			return nil, ErrAlreadyResolved
		}
		return nil, mapStoreErr(st.SetPinned(ctx, key, true))
	})
	if err != nil {
		return plan.Meal{}, err
	}
	return r.meal(ctx, key)
}

// Unpin clears the Pinned flag and runs Plan(ReasonUnpinned) (the meal stays as it is while it is valid; Regenerate may
// now replace it). ErrNotFound, ErrAlreadyResolved.
func (r *Runner) Unpin(ctx context.Context, key plan.Key) (plan.Meal, error) {
	_, err := r.write(ctx, plan.ReasonUnpinned, runOpts{}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		m, err := st.Meal(ctx, key)
		if err != nil {
			return nil, mapStoreErr(err)
		}
		if m.State != plan.StatePlanned {
			return nil, ErrAlreadyResolved
		}
		return nil, mapStoreErr(st.SetPinned(ctx, key, false))
	})
	if err != nil {
		return plan.Meal{}, err
	}
	return r.meal(ctx, key)
}

// Alternative is one Swap candidate.
type Alternative struct {
	RecipeID            int64
	Batches             int
	NewLeftoverPortions float64
	NewLeftoverUseBy    string
	Score               float64
	Why                 []plan.Why
	// Relaxed marks an alternative that is inside its Cool-down or breaks a Variety Rule (offered after the
	// strict ones, its relaxed chip last; ADR 0009).
	Relaxed bool
	// WholeMeal marks a Whole meal; Covers lists the real ids of the other Courses it would cover (offered for the main
	// Course only, crs-c2 §3.2).
	WholeMeal bool
	Covers    []int64
}

// Alternatives returns the top 3 alternatives for the slot's Course under the same scoring (excluding the current
// Recipe), each with its why chips. Nothing is written. An empty slot ("couldn't plan") is fine. ErrUnknownSlot (not a
// Meal Slot of that weekday), ErrCourseNotInSlot (the slot does not serve that Course), ErrNotSwappable (Cooked or
// skipped).
func (r *Runner) Alternatives(ctx context.Context, key plan.Key) ([]Alternative, error) {
	in, err := r.info(ctx)
	if err != nil {
		return nil, err
	}
	def, ok := in.slotDef(key)
	if !ok {
		return nil, ErrUnknownSlot
	}
	si, err := r.occurrence(ctx, def, key.Date)
	if err != nil {
		return nil, err
	}
	cell := key.CourseID
	if len(si.Courses) > 0 && !hasCourse(si, cell) {
		return nil, ErrCourseNotInSlot
	}
	snap, err := r.snapshot(ctx, r.d.Store, runOpts{})
	if err != nil {
		return nil, err
	}
	pin, err := plan.BuildInput(snap)
	if err != nil {
		return nil, err
	}
	placements, err := planner.Swap(pin, planner.SlotKey{Date: planner.Date(key.Date), MealSlotID: key.MealSlotID, CourseID: key.CourseID})
	switch {
	case errors.Is(err, planner.ErrSlotNotSwappable):
		return nil, ErrNotSwappable
	case errors.Is(err, planner.ErrUnknownSlot):
		return nil, ErrUnknownSlot
	case err != nil:
		return nil, err
	}
	recipes, err := r.d.Source.Recipes(ctx)
	if err != nil {
		return nil, err
	}
	var covers []int64
	if len(si.Courses) > 0 && cell == mainOf(si) {
		if covers, err = r.coverable(ctx, si); err != nil {
			return nil, err
		}
	}
	out := make([]Alternative, 0, len(placements))
	for _, p := range placements {
		a := Alternative{RecipeID: int64(p.RecipeID), Batches: p.Batches, Score: p.Score, Why: plan.WhyAll(p.Why), Relaxed: p.Relaxed}
		if p.NewLeftover != nil {
			a.NewLeftoverPortions = p.NewLeftover.Portions
			a.NewLeftoverUseBy = string(p.NewLeftover.UseBy)
		}
		if rc, ok := recipeOf(recipes, a.RecipeID); ok && rc.WholeMeal && covers != nil {
			a.WholeMeal = true
			a.Covers = covers
		} else if ok && rc.WholeMeal {
			a.WholeMeal, a.Covers = true, []int64{}
		}
		out = append(out, a)
	}
	return out, nil
}

// coverable lists the other Courses of the slot that a Whole meal in the main Course would cover: those with no meal,
// or an unpinned, unresolved one (the same rule SetCourseMeal applies).
func (r *Runner) coverable(ctx context.Context, si plan.SlotInfo) ([]int64, error) {
	day, err := r.d.Store.Meals(ctx, si.Key.Date, si.Key.Date)
	if err != nil {
		return nil, err
	}
	main := mainOf(si)
	out := []int64{}
	for _, c := range si.Courses {
		if c.CourseID == main {
			continue
		}
		covered := true
		for _, m := range day {
			if m.Key.MealSlotID == si.Key.MealSlotID && m.Key.CourseID == c.CourseID &&
				(m.State != plan.StatePlanned || m.Pinned) {
				covered = false
			}
		}
		if covered {
			out = append(out, c.CourseID)
		}
	}
	return out, nil
}

// CookPreview is what the Mark as Cooked sheet shows.
type CookPreview struct {
	Meal           plan.Meal
	Fresh          bool // false: served from a Leftover (nothing to deduct, no new Leftover)
	Yield          float64
	PortionsNeeded float64 // the slot's Attendance now
	Proposed       float64 // plan.ProposedLeftover(Batches, Yield, PortionsNeeded); 0 when Fresh is false
	Max            float64 // Batches x Yield: the most the stepper may reach
	UseBy          string  // the Use-by the Leftover would get
	Needs          []Need  // what Stock would be asked to deduct
}

// CookPreview computes the sheet. ErrNotFound, ErrAlreadyResolved.
func (r *Runner) CookPreview(ctx context.Context, key plan.Key) (CookPreview, error) {
	in, err := r.info(ctx)
	if err != nil {
		return CookPreview{}, err
	}
	m, err := r.d.Store.Meal(ctx, key)
	if err != nil {
		return CookPreview{}, mapStoreErr(err)
	}
	if m.State != plan.StatePlanned {
		return CookPreview{}, ErrAlreadyResolved
	}
	p := CookPreview{Meal: m}
	def, ok := in.slotDef(key)
	if !ok {
		return CookPreview{}, ErrUnknownSlot
	}
	att, err := r.keyAttendance(ctx, def, key)
	if err != nil {
		return CookPreview{}, err
	}
	guests, err := r.guestsOn(ctx, def, key.Date)
	if err != nil {
		return CookPreview{}, err
	}
	p.PortionsNeeded = attendancePortions(att) + float64(guests)
	if !m.Fresh() {
		return p, nil
	}
	recipes, err := r.d.Source.Recipes(ctx)
	if err != nil {
		return CookPreview{}, err
	}
	rc, ok := recipeOf(recipes, m.RecipeID)
	if !ok {
		return CookPreview{}, ErrUnknownRecipe
	}
	p.Fresh, p.Yield = true, rc.Yield
	p.Proposed = plan.ProposedLeftover(m.Batches, rc.Yield, p.PortionsNeeded)
	p.Max = m.Batches * rc.Yield
	p.UseBy = plan.LeftoverUseBy(key.Date, rc.UseByDays, in.settings.DefaultUseByDays)
	p.Needs = needsFor(rc, m.Batches)
	return p, nil
}

// CookedResult is the outcome of Mark as Cooked.
type CookedResult struct {
	Meal     plan.Meal
	Leftover *plan.Leftover // the actual Leftover recorded; nil when none
	Warnings []Warning      // Stock shortfalls; never an error
	// PlannedFor lists the later Planned Meals served from the recorded Leftover after the replan, in date then slot
	// order; empty when the Leftover is kept or there is none.
	PlannedFor []PlannedForMeal
}

// PlannedForMeal is one later Planned Meal served from a Leftover, with the names a caller shows.
type PlannedForMeal struct {
	Date         string
	MealSlotID   int64
	CourseID     int64 // the store's form: 0 is the main Course
	MealSlotName string
	RecipeID     int64
	RecipeName   string
}

// plannedForMeals lists the meals served from the Leftover made at src (plan.LeftoverPlannedFor), with their names.
func plannedForMeals(in info, recipes []planner.Recipe, meals []plan.Meal, src plan.Key) []PlannedForMeal {
	byKey := make(map[plan.Key]plan.Meal, len(meals))
	for _, m := range meals {
		byKey[m.Key] = m
	}
	var out []PlannedForMeal
	for _, k := range plan.LeftoverPlannedFor(src, meals) {
		m := byKey[k]
		def, _ := in.slotDef(k)
		rc, _ := recipeOf(recipes, m.RecipeID)
		out = append(out, PlannedForMeal{Date: k.Date, MealSlotID: k.MealSlotID, CourseID: k.CourseID, MealSlotName: def.Name,
			RecipeID: m.RecipeID, RecipeName: rc.Name})
	}
	return out
}

// Cooked marks the Planned Meal Cooked (spec §8), in ONE transaction:
//  1. fresh meal: deduct Stock for Batches x the non-optional lines (StockPort.DeductCookedTx); a meal served from a
//     Leftover deducts nothing and consumes its portions from that Leftover instead (floor 0);
//  2. State cooked (still Pinned);
//  3. fresh meal with leftoverPortions > 0 (nil = the proposal): record the actual Leftover (Use-by = the meal's date +
//     the Recipe's or default Use-by days) and point the dependants at it;
//  4. unpin the Pinned dependants that no longer fit (plan.DependantsToUnpin) and replan (Plan, ReasonLeftoversChanged):
//     a smaller Leftover replans the affected meals, a larger one leaves the extra pending.
//
// After the commit it calls StockPort.PublishDeduction and publishes "plan". Short Stock is returned in Warnings.
// Any error rolls everything back: Stock is untouched, the meal stays planned, nothing is published.
// Errors: ErrNotFound, ErrAlreadyResolved, plan.ErrInvalidLeftover.
func (r *Runner) Cooked(ctx context.Context, key plan.Key, leftoverPortions *float64) (CookedResult, error) {
	var warnings []Warning
	var leftover *plan.Leftover
	var publish func()
	var cooked plan.Meal
	var plannedFor []PlannedForMeal
	// After the replan, inside the transaction: a Leftover that shrank may have lost its dependants, so the result is
	// read here, where a failure rolls the Cooked back instead of turning a success into an error.
	afterReplan := func(ctx context.Context, st *store.Store) error {
		in, err := r.info(ctx)
		if err != nil {
			return err
		}
		recipes, err := r.d.Source.Recipes(ctx)
		if err != nil {
			return err
		}
		cooked, err = st.Meal(ctx, key)
		if err != nil {
			return mapStoreErr(err)
		}
		later, err := st.Meals(ctx, key.Date, "")
		if err != nil {
			return err
		}
		plannedFor = plannedForMeals(in, recipes, later, key)
		return nil
	}
	_, err := r.write(ctx, plan.ReasonLeftoversChanged, runOpts{afterPlan: afterReplan}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		m, err := st.Meal(ctx, key)
		if err != nil {
			return nil, mapStoreErr(err)
		}
		if m.State != plan.StatePlanned {
			return nil, ErrAlreadyResolved
		}
		if !plan.MayResolve(key.Date, in.today) {
			return nil, plan.ErrFutureMeal
		}
		def, ok := in.slotDef(key)
		if !ok {
			return nil, ErrUnknownSlot
		}
		att, err := r.keyAttendance(ctx, def, key)
		if err != nil {
			return nil, err
		}
		guests, err := r.guestsOn(ctx, def, key.Date)
		if err != nil {
			return nil, err
		}
		need := attendancePortions(att) + float64(guests)
		recipes, err := r.d.Source.Recipes(ctx)
		if err != nil {
			return nil, err
		}

		if !m.Fresh() {
			// Served from a Leftover: consume the portions it needed from that Leftover (floor 0).
			src, err := r.leftoverSource(ctx, st, m)
			if err != nil {
				return nil, err
			}
			if err := st.MarkResolved(ctx, key, plan.StateCooked); err != nil {
				return nil, mapStoreErr(err)
			}
			if src != nil {
				left := src.Portions - need
				if left < 0 {
					left = 0
				}
				if err := st.SetLeftoverPortions(ctx, src.ID, left); err != nil {
					return nil, err
				}
				// By id: a frozen part and the part that stayed may share a source meal (docs/dev/design/b5-lo.md §2.9).
				if _, err := r.unpinLeftoverMisfits(ctx, st, src.ID, left, in); err != nil {
					return nil, err
				}
			}
			return nil, nil
		}

		rc, ok := recipeOf(recipes, m.RecipeID)
		if !ok {
			return nil, ErrUnknownRecipe
		}
		portions := plan.ProposedLeftover(m.Batches, rc.Yield, need)
		if leftoverPortions != nil {
			portions = *leftoverPortions
		}
		if err := plan.CheckLeftoverPortions(portions, m.Batches*rc.Yield); err != nil {
			return nil, err
		}
		d, err := r.d.Stock.DeductCookedTx(ctx, tx, needsFor(rc, m.Batches))
		if err != nil {
			return nil, err
		}
		warnings = d.Warnings
		publish = func() { r.d.Stock.PublishDeduction(d) }

		if err := st.MarkResolved(ctx, key, plan.StateCooked); err != nil {
			return nil, mapStoreErr(err)
		}
		if portions > eps {
			l, err := st.AddLeftover(ctx, plan.Leftover{RecipeID: m.RecipeID, From: key, Portions: portions,
				CookedOn: key.Date, UseBy: plan.LeftoverUseBy(key.Date, rc.UseByDays, in.settings.DefaultUseByDays)})
			if err != nil {
				return nil, err
			}
			if err := st.LinkLeftover(ctx, key, l.ID); err != nil {
				return nil, err
			}
			leftover = &l
		}
		if err := r.unpinMisfits(ctx, st, key, portions, in); err != nil {
			return nil, err
		}
		return nil, nil
	})
	if err != nil {
		return CookedResult{}, err
	}
	if publish != nil {
		publish()
	}
	r.resolved(ctx, key)
	return CookedResult{Meal: cooked, Leftover: leftover, Warnings: warnings, PlannedFor: plannedFor}, nil
}

// eps absorbs float noise in portion arithmetic.
const eps = 1e-9

// leftoverSource is the available Leftover a meal is served from: by id once recorded, otherwise the one the fresh
// meal at its source produced. nil when there is none.
func (r *Runner) leftoverSource(ctx context.Context, st *store.Store, m plan.Meal) (*plan.Leftover, error) {
	if m.From == nil {
		return nil, nil
	}
	if m.From.LeftoverID != 0 {
		l, err := st.Leftover(ctx, m.From.LeftoverID)
		if errors.Is(err, store.ErrNotFound) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		return &l, nil
	}
	l, ok, err := st.LeftoverFrom(ctx, m.From.From)
	if err != nil || !ok {
		return nil, err
	}
	return &l, nil
}

// NotCooked marks the meal skipped ("we had takeaway"): no Stock change, no Leftover; Pinned dependants are unpinned and
// the dependants replanned. ErrNotFound, ErrAlreadyResolved.
func (r *Runner) NotCooked(ctx context.Context, key plan.Key) (plan.Meal, error) {
	_, err := r.write(ctx, plan.ReasonNotCooked, runOpts{}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		m, err := st.Meal(ctx, key)
		if err != nil {
			return nil, mapStoreErr(err)
		}
		if m.State != plan.StatePlanned {
			return nil, ErrAlreadyResolved
		}
		if !plan.MayResolve(key.Date, in.today) {
			return nil, plan.ErrFutureMeal
		}
		if err := st.MarkResolved(ctx, key, plan.StateSkipped); err != nil {
			return nil, mapStoreErr(err)
		}
		return nil, r.unpinMisfits(ctx, st, key, 0, in)
	})
	if err != nil {
		return plan.Meal{}, err
	}
	r.resolved(ctx, key)
	return r.meal(ctx, key)
}
