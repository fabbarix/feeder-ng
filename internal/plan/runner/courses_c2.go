package runner

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// Team C2 (docs/dev/design/crs-c2.md §4): the Courses of a slot in the runner. Every key is the real id of its
// Course, the main Course included (crs-c3 §3: the store shim is gone).

// Errors of the Course routes; the HTTP layer maps them (design note §3.2).
var (
	ErrCourseNotInSlot   = errors.New("planning: the Meal Slot does not serve that Course")
	ErrRecipeNotInCourse = errors.New("planning: the Recipe is not marked with that Course")
	ErrRecipeInSlot      = errors.New("planning: the Recipe is already in another Course of that slot and date")
)

// CourseError names the entry of a request that failed (courses[Index]).
type CourseError struct {
	Index int
	Err   error
}

func (e *CourseError) Error() string { return fmt.Sprintf("courses[%d]: %v", e.Index, e.Err) }
func (e *CourseError) Unwrap() error { return e.Err }

// CoveredBy names the main Course's Whole meal that covers a Course (spec §16 `coveredBy`).
type CoveredBy struct {
	CourseID int64
	RecipeID int64
}

// CourseView is one Course row of a slot occurrence.
type CourseView struct {
	CourseID        int64
	Main            bool
	Optional        bool
	OptOutMemberIDs []int64 // effective on that date, never nil
	Attendance      []plan.Attendee
	Portions        float64
	Meal            *plan.Meal
	Unfilled        *plan.Unfilled
	CoveredBy       *CoveredBy
	Unserved        string // "", "optional", "no_course_attendance" or "not_served" (the whole slot is Not served on that date)
	History         bool   // a Course the slot no longer serves, shown for its Cooked or Not cooked meal
	// Warning (B5-BO): the Pinned or Bought Planned Meal now breaks a hard rule (plan.HardRuleWarning), else nil.
	Warning *plan.Warning
}

// MainCourseID is the real id of the main Course.
func (r *Runner) MainCourseID(ctx context.Context) (int64, error) {
	var id int64
	err := r.d.DB.QueryRowContext(ctx, `SELECT id FROM courses WHERE is_main = 1`).Scan(&id)
	return id, err
}

// occurrence reads one slot occurrence: its Attendance and its Courses in the slot's order.
func (r *Runner) occurrence(ctx context.Context, def MealSlotDef, date string) (plan.SlotInfo, error) {
	att, err := r.d.Source.Attendance(ctx, def.ID, date)
	if err != nil {
		return plan.SlotInfo{}, err
	}
	courses, err := r.d.Source.SlotCourses(ctx, def.ID, date)
	if err != nil {
		return plan.SlotInfo{}, err
	}
	d, err := r.d.Source.SlotDate(ctx, def.ID, date)
	if err != nil {
		return plan.SlotInfo{}, err
	}
	return plan.SlotInfo{Key: plan.Key{Date: date, MealSlotID: def.ID}, Name: def.Name, Time: d.Time, UsualTime: d.UsualTime,
		Guests: d.Guests, NotServed: d.NotServed, Attendance: att, Courses: courses}, nil
}

// hasCourse reports whether the slot serves the Course (real id).
func hasCourse(si plan.SlotInfo, course int64) bool {
	for _, c := range si.Courses {
		if c.CourseID == course {
			return true
		}
	}
	return false
}

// courseAttendance is the Attendance of a cell (real Course id): its Course's, or the slot's own without Courses.
func courseAttendance(si plan.SlotInfo, course int64) []plan.Attendee {
	if len(si.Courses) == 0 {
		return si.Attendance
	}
	for _, c := range si.Courses {
		if c.CourseID == course {
			return c.Attendance
		}
	}
	return nil
}

// mainOf is the main Course of a slot occurrence (its first Course when none is flagged; 0 without Courses).
func mainOf(si plan.SlotInfo) int64 {
	for _, c := range si.Courses {
		if c.Main {
			return c.CourseID
		}
	}
	if len(si.Courses) > 0 {
		return si.Courses[0].CourseID
	}
	return 0
}

// optOutsOf lists the slot's attendees who are not in the Course's Attendance, in the slot's order.
func optOutsOf(slot, course []plan.Attendee) []int64 {
	in := map[int64]bool{}
	for _, a := range course {
		in[a.MemberID] = true
	}
	out := []int64{}
	for _, a := range slot {
		if !in[a.MemberID] {
			out = append(out, a.MemberID)
		}
	}
	return out
}

// slotOrder sorts the Planned Meals of one occurrence into the slot's Course order.
func slotOrder(si plan.SlotInfo, meals []plan.Meal) []plan.Meal {
	pos := map[int64]int{}
	for i, c := range si.Courses {
		pos[c.CourseID] = i
	}
	out := append([]plan.Meal(nil), meals...)
	sort.SliceStable(out, func(i, j int) bool {
		return pos[out[i].Key.CourseID] < pos[out[j].Key.CourseID]
	})
	return out
}

// courseViews builds the Course rows of one occurrence in the slot's order, then its history rows. unfilled is keyed
// by the cell's key; whole reports the Whole meals.
func courseViews(si plan.SlotInfo, meals []plan.Meal, unfilled map[plan.Key]plan.Unfilled, whole func(int64) bool) []CourseView {
	mealOf := map[int64]plan.Meal{}
	started := false // a Course Cooked or Not cooked: the slot is no longer Not served (U2)
	for _, m := range meals {
		mealOf[m.Key.CourseID] = m
		started = started || m.State == plan.StateCooked || m.State == plan.StateSkipped
	}
	notServed := si.NotServed && !started
	out := make([]CourseView, 0, len(si.Courses))
	var mainMeal *plan.Meal
	mainCourse := mainOf(si)
	for _, c := range si.Courses {
		cv := CourseView{CourseID: c.CourseID, Main: c.Main, Optional: c.Optional, Attendance: c.Attendance,
			Portions: cellPortions(si, c.CourseID), OptOutMemberIDs: optOutsOf(si.Attendance, c.Attendance)}
		key := plan.Key{Date: si.Key.Date, MealSlotID: si.Key.MealSlotID, CourseID: c.CourseID}
		if m, ok := mealOf[c.CourseID]; ok {
			cv.Meal = &m
		}
		if u, ok := unfilled[key]; ok {
			cv.Unfilled = &u
		}
		if c.Main && cv.Meal != nil {
			mainMeal = cv.Meal
		}
		out = append(out, cv)
	}
	// The planner's pre-walk order (crs-b §2): nobody eating the Course, then a Whole meal covering it, then optional.
	for i := range out {
		cv := &out[i]
		if cv.Meal != nil || cv.Unfilled != nil {
			continue
		}
		switch {
		case notServed:
			cv.Unserved = "not_served"
		case len(cv.Attendance) == 0 && len(si.Attendance) > 0:
			cv.Unserved = "no_course_attendance"
		case !cv.Main && mainMeal != nil && whole(mainMeal.RecipeID):
			cv.CoveredBy = &CoveredBy{CourseID: mainCourse, RecipeID: mainMeal.RecipeID}
		case cv.Optional:
			cv.Unserved = "optional"
		}
	}
	for _, m := range meals {
		if hasCourse(si, m.Key.CourseID) || m.State == plan.StatePlanned {
			continue
		}
		mm := m
		out = append(out, CourseView{CourseID: m.Key.CourseID, Meal: &mm, OptOutMemberIDs: []int64{}, History: true})
	}
	return out
}

// occurrenceView is the SlotView of one occurrence with its Course rows.
func occurrenceView(in info, si plan.SlotInfo, cells []CourseView) SlotView {
	sv := slotOf(in, si)
	sv.Courses = cells
	return sv
}

// wholeFunc tells which Recipes are Whole meals (read once per call).
func (r *Runner) wholeFunc(ctx context.Context) (func(int64) bool, error) {
	recipes, err := r.d.Source.Recipes(ctx)
	if err != nil {
		return nil, err
	}
	whole := map[int64]bool{}
	for _, rc := range recipes {
		whole[int64(rc.ID)] = rc.WholeMeal
	}
	return func(id int64) bool { return whole[id] }, nil
}

// slotDay returns the slot occurrence and its store-form Planned Meals on the date, in the slot's order, for the
// whole-slot actions. ErrUnknownSlot when the Meal Slot does not fall on the date, ErrNotFound when it has none.
func (r *Runner) slotDay(ctx context.Context, st *store.Store, in info, date string, mealSlotID int64) (plan.SlotInfo, []plan.Meal, error) {
	def, ok := in.slotDef(plan.Key{Date: date, MealSlotID: mealSlotID})
	if !ok {
		return plan.SlotInfo{}, nil, ErrUnknownSlot
	}
	si, err := r.occurrence(ctx, def, date)
	if err != nil {
		return plan.SlotInfo{}, nil, err
	}
	all, err := st.Meals(ctx, date, date)
	if err != nil {
		return plan.SlotInfo{}, nil, err
	}
	var day []plan.Meal
	for _, m := range all {
		if m.Key.MealSlotID == mealSlotID {
			day = append(day, m)
		}
	}
	if len(day) == 0 {
		return plan.SlotInfo{}, nil, ErrNotFound
	}
	return si, slotOrder(si, day), nil
}

// NotCookedAll marks every unresolved Course of the slot Not cooked, in one transaction (crs-c2 §3.3). It returns the
// meals it changed, in the slot's Course order. ErrUnknownSlot (not a Meal Slot of that weekday), ErrNotFound (the
// slot has no Planned Meal that day), plan.ErrFutureMeal before the day, ErrAlreadyResolved when none is left.
func (r *Runner) NotCookedAll(ctx context.Context, date string, mealSlotID int64) ([]plan.Meal, error) {
	var keys []plan.Key
	_, err := r.write(ctx, plan.ReasonNotCooked, runOpts{}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		_, day, err := r.slotDay(ctx, st, in, date, mealSlotID)
		if err != nil {
			return nil, err
		}
		if !plan.MayResolve(date, in.today) {
			return nil, plan.ErrFutureMeal
		}
		keys = nil
		for _, m := range day {
			if m.State != plan.StatePlanned {
				continue
			}
			if err := st.MarkResolved(ctx, m.Key, plan.StateSkipped); err != nil {
				return nil, mapStoreErr(err)
			}
			if err := r.unpinMisfits(ctx, st, m.Key, 0, in); err != nil {
				return nil, err
			}
			keys = append(keys, m.Key)
		}
		if len(keys) == 0 {
			return nil, ErrAlreadyResolved
		}
		return func() {
			for _, k := range keys {
				r.resolved(ctx, k)
			}
		}, nil
	})
	if err != nil {
		return nil, err
	}
	out := make([]plan.Meal, 0, len(keys))
	for _, k := range keys {
		m, err := r.meal(ctx, k)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

// CourseLeftover is one entry of CookedAll: the Leftover portions chosen for a Course (nil: the proposal).
type CourseLeftover struct {
	CourseID         int64
	LeftoverPortions *float64
}

// AllCookedResult is the answer of CookedAll.
type AllCookedResult struct {
	Meals      []plan.Meal     // the Courses that were cooked, in the slot's Course order
	Leftovers  []plan.Leftover // the Leftovers recorded (one per Course that kept some)
	Warnings   []Warning       // Stock shortfalls of the whole slot
	PlannedFor []PlannedForMeal
}

// CookedAll marks every unresolved Course of the slot Cooked, all or nothing, in one transaction, with one Stock
// deduction and one `plan` event (crs-c2 §3.3). Courses not listed use their proposed Leftover. A *CourseError wraps
// ErrCourseNotInSlot (a listed Course the slot does not serve), ErrNotFound (a listed Course with no Planned Meal),
// ErrAlreadyResolved (a listed Course that is resolved) or plan.ErrInvalidLeftover (a bad portion count).
// ErrAlreadyResolved when nothing is left, ErrNotFound and plan.ErrFutureMeal as NotCookedAll.
func (r *Runner) CookedAll(ctx context.Context, date string, mealSlotID int64, courses []CourseLeftover) (AllCookedResult, error) {
	var res AllCookedResult
	var keys []plan.Key
	var made []plan.Leftover
	var deduction *Deduction
	afterReplan := func(ctx context.Context, st *store.Store) error {
		in, err := r.info(ctx)
		if err != nil {
			return err
		}
		recipes, err := r.d.Source.Recipes(ctx)
		if err != nil {
			return err
		}
		res.Meals = res.Meals[:0]
		for _, k := range keys {
			m, err := st.Meal(ctx, k)
			if err != nil {
				return mapStoreErr(err)
			}
			res.Meals = append(res.Meals, m)
		}
		later, err := st.Meals(ctx, date, "")
		if err != nil {
			return err
		}
		res.PlannedFor = nil
		for _, l := range made {
			res.PlannedFor = append(res.PlannedFor, plannedForMeals(in, recipes, later, l.From)...)
		}
		return nil
	}
	_, err := r.write(ctx, plan.ReasonLeftoversChanged, runOpts{afterPlan: afterReplan}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		si, day, err := r.slotDay(ctx, st, in, date, mealSlotID)
		if err != nil {
			return nil, err
		}
		if !plan.MayResolve(date, in.today) {
			return nil, plan.ErrFutureMeal
		}
		recipes, err := r.d.Source.Recipes(ctx)
		if err != nil {
			return nil, err
		}
		// Check the listed Courses first, so a bad one writes nothing.
		listed := map[int64]CourseLeftover{}
		index := map[int64]int{}
		for i, c := range courses {
			id := c.CourseID
			if id == 0 {
				id = mainOf(si)
			}
			if len(si.Courses) > 0 && !hasCourse(si, id) {
				return nil, &CourseError{Index: i, Err: ErrCourseNotInSlot}
			}
			m, ok := findMeal(si, day, id)
			if !ok {
				return nil, &CourseError{Index: i, Err: ErrNotFound}
			}
			if m.State != plan.StatePlanned {
				return nil, &CourseError{Index: i, Err: ErrAlreadyResolved}
			}
			listed[id], index[id] = c, i
		}
		var needs []Need
		for _, m := range day {
			if m.State != plan.StatePlanned {
				continue
			}
			real := m.Key.CourseID
			lo := listed[real].LeftoverPortions
			i, ok := index[real]
			if !ok {
				i = -1
			}
			need, n, err := r.cookInAll(ctx, tx, st, in, si, m, recipes, lo, i)
			if err != nil {
				return nil, err
			}
			needs = append(needs, need...)
			keys = append(keys, m.Key)
			if n != nil {
				made = append(made, *n)
			}
		}
		if len(keys) == 0 {
			return nil, ErrAlreadyResolved
		}
		if len(needs) > 0 {
			d, err := r.d.Stock.DeductCookedTx(ctx, tx, combineNeeds(needs))
			if err != nil {
				return nil, err
			}
			res.Warnings = d.Warnings
			deduction = &d
		}
		return func() {
			if deduction != nil {
				r.d.Stock.PublishDeduction(*deduction)
			}
			for _, k := range keys {
				r.resolved(ctx, k)
			}
		}, nil
	})
	if err != nil {
		return AllCookedResult{}, err
	}
	res.Leftovers = made
	return res, nil
}

// cookInAll marks one unresolved Planned Meal of CookAll Cooked, as Cooked does (Leftover-served meals consume their
// source; fresh ones return the Stock they need and record their Leftover). index is the request's entry (-1: none).
func (r *Runner) cookInAll(ctx context.Context, tx *sql.Tx, st *store.Store, in info, si plan.SlotInfo, m plan.Meal,
	recipes []planner.Recipe, listedPortions *float64, index int) ([]Need, *plan.Leftover, error) {
	need := cellPortions(si, m.Key.CourseID)
	if !m.Fresh() {
		src, err := r.leftoverSource(ctx, st, m)
		if err != nil {
			return nil, nil, err
		}
		if err := st.MarkResolved(ctx, m.Key, plan.StateCooked); err != nil {
			return nil, nil, mapStoreErr(err)
		}
		if src != nil {
			left := max(src.Portions-need, 0)
			if err := st.SetLeftoverPortions(ctx, src.ID, left); err != nil {
				return nil, nil, err
			}
			if err := r.unpinMisfits(ctx, st, src.From, left, in); err != nil {
				return nil, nil, err
			}
		}
		return nil, nil, nil
	}
	rc, ok := recipeOf(recipes, m.RecipeID)
	if !ok {
		return nil, nil, ErrUnknownRecipe
	}
	portions := plan.ProposedLeftover(m.Batches, rc.Yield, need)
	if listedPortions != nil {
		portions = *listedPortions
	}
	if err := plan.CheckLeftoverPortions(portions, m.Batches*rc.Yield); err != nil {
		if index < 0 {
			return nil, nil, err
		}
		return nil, nil, &CourseError{Index: index, Err: err}
	}
	if err := st.MarkResolved(ctx, m.Key, plan.StateCooked); err != nil {
		return nil, nil, mapStoreErr(err)
	}
	var made *plan.Leftover
	if portions > eps {
		l, err := st.AddLeftover(ctx, plan.Leftover{RecipeID: m.RecipeID, From: m.Key, Portions: portions,
			CookedOn: m.Key.Date, UseBy: plan.LeftoverUseBy(m.Key.Date, rc.UseByDays, in.settings.DefaultUseByDays)})
		if err != nil {
			return nil, nil, err
		}
		if err := st.LinkLeftover(ctx, m.Key, l.ID); err != nil {
			return nil, nil, err
		}
		made = &l
	}
	if err := r.unpinMisfits(ctx, st, m.Key, portions, in); err != nil {
		return nil, nil, err
	}
	return needsFor(rc, m.Batches), made, nil
}

// combineNeeds sums the Needs of several Courses per Ingredient, in the order they first appear.
func combineNeeds(needs []Need) []Need {
	var out []Need
	at := map[int64]int{}
	for _, n := range needs {
		if i, ok := at[n.IngredientID]; ok {
			out[i].Quantity += n.Quantity
			continue
		}
		at[n.IngredientID] = len(out)
		out = append(out, n)
	}
	return out
}

// findMeal is the Planned Meal of a real Course id in a day of the occurrence.
func findMeal(si plan.SlotInfo, day []plan.Meal, course int64) (plan.Meal, bool) {
	for _, m := range day {
		if m.Key.CourseID == course {
			return m, true
		}
	}
	return plan.Meal{}, false
}

// CheckRule fills in and checks the Course of a Slot Rule (crs-c2 §3.4): no Course means the slot's main Course, a
// Course the slot does not serve is ErrCourseNotInSlot, and a Recipe rule's Recipe must be marked with that Course
// (ErrRecipeNotInCourse). A rule for a Meal Slot that does not exist is returned as it is (the store refuses it).
func (r *Runner) CheckRule(ctx context.Context, rule plan.SlotRule) (plan.SlotRule, error) {
	in, err := r.info(ctx)
	if err != nil {
		return plan.SlotRule{}, err
	}
	def, ok := findDef(in.defs, rule.MealSlotID)
	if !ok || len(def.Courses) == 0 {
		return rule, nil
	}
	if rule.CourseID == 0 {
		rule.CourseID = def.MainCourse
	}
	if !containsID(def.Courses, rule.CourseID) {
		return plan.SlotRule{}, ErrCourseNotInSlot
	}
	if rule.RecipeID == 0 {
		return rule, nil
	}
	recipes, err := r.d.Source.Recipes(ctx)
	if err != nil {
		return plan.SlotRule{}, err
	}
	if rc, ok := recipeOf(recipes, rule.RecipeID); ok && !containsID(rc.CourseIDs, rule.CourseID) {
		return plan.SlotRule{}, ErrRecipeNotInCourse
	}
	return rule, nil
}
