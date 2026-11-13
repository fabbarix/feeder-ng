package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	cookservice "github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// key reads {date}/{slotId} and {courseId}. A {courseId} that is not a positive number (0 included: it names no
// Course) is not a key (crs-c3 §1).
func key(r *http.Request) (plan.Key, bool) {
	id, err := strconv.ParseInt(r.PathValue("slotId"), 10, 64)
	if err != nil {
		return plan.Key{}, false
	}
	c, err := strconv.ParseInt(r.PathValue("courseId"), 10, 64)
	if err != nil || c <= 0 {
		return plan.Key{}, false
	}
	return plan.Key{Date: r.PathValue("date"), MealSlotID: id, CourseID: c}, true
}

// slotKey reads {date}/{slotId} of a whole-slot route (the literal all segment, no Course).
func slotKey(r *http.Request) (plan.Key, bool) {
	id, err := strconv.ParseInt(r.PathValue("slotId"), 10, 64)
	if err != nil {
		return plan.Key{}, false
	}
	return plan.Key{Date: r.PathValue("date"), MealSlotID: id}, true
}

// notFound answers a removed route (crs-c3 §1) with the usual not_found body.
func notFound(w http.ResponseWriter, _ *http.Request) {
	writeErr(w, store.ErrNotFound)
}

func unknownSlot(w http.ResponseWriter) {
	writeErr(w, runner.ErrUnknownSlot)
}

// slots converts slot views with the names table.
func slots(views []runner.SlotView, t table) []slotOut {
	out := make([]slotOut, 0, len(views))
	for _, v := range views {
		out = append(out, slotFor(v, t))
	}
	return out
}

// fillCookMinutes sets each view's CookMinutes from the cooking timeline of its slot (crs-c2 §3.1): the total of the
// fresh Courses still to cook, nil when none is left.
func (a *api) fillCookMinutes(ctx context.Context, views []runner.SlotView) error {
	for i := range views {
		v := &views[i]
		tl, err := a.cook.SlotTimeline(ctx, v.Key.Date, v.Key.MealSlotID)
		if errors.Is(err, cookservice.ErrNotFound) || errors.Is(err, cookservice.ErrNotCookable) {
			v.CookMinutes = nil
			continue
		}
		if err != nil {
			return err
		}
		v.CookMinutes = nil
		if tl.Fresh > 0 {
			minutes := tl.TotalMinutes
			v.CookMinutes = &minutes
		}
	}
	return nil
}

func (a *api) view(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	v, err := a.run.View(ctx, r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := a.fillCookMinutes(ctx, v.Slots); err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(ctx, viewMeals(v.Slots)...)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"today": v.Today, "horizonDays": v.HorizonDays, "updating": a.run.Updating(), "slots": slots(v.Slots, t),
	})
}

// slotList answers the lists of slots, one entry per Course (to-confirm, couldn't plan).
func (a *api) slotList(w http.ResponseWriter, r *http.Request, list func(context.Context) ([]runner.ListEntry, error)) {
	views, err := list(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context(), listMeals(views)...)
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]listEntryOut, 0, len(views))
	for _, v := range views {
		out = append(out, listEntryFor(v, t))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"slots": out})
}

func (a *api) toConfirm(w http.ResponseWriter, r *http.Request) {
	a.slotList(w, r, a.run.ToConfirm)
}

func (a *api) couldntPlan(w http.ResponseWriter, r *http.Request) {
	a.slotList(w, r, a.run.CouldntPlan)
}

func (a *api) leftovers(w http.ResponseWriter, r *http.Request) {
	ls, err := a.run.Leftovers(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]leftoverOut, 0, len(ls))
	for _, l := range ls {
		out = append(out, leftoverFor(l, t))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"leftovers": out})
}

func (a *api) regenerate(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("dryRun") == "1" {
		a.regenerateDryRun(w, r)
		return
	}
	sum, err := a.run.Regenerate(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]int{"placed": sum.Placed, "kept": sum.Kept, "unfilled": sum.Unfilled})
}

// regenerateDryRunOut is POST /api/plan/regenerate?dryRun=1: how many Planned Meals Regenerate would replace, and the
// Bought ones among them (ADR 0013 point 7). Nothing is written.
type regenerateDryRunOut struct {
	Replaces int              `json:"replaces"`
	Bought   []regenBoughtOut `json:"bought"`
}

type regenBoughtOut struct {
	Date         string   `json:"date"`
	MealSlotName string   `json:"mealSlotName"`
	CourseName   string   `json:"courseName"`
	RecipeName   string   `json:"recipeName"`
	Ingredients  []string `json:"ingredients"`
}

func (a *api) regenerateDryRun(w http.ResponseWriter, r *http.Request) {
	prev, err := a.run.RegeneratePreview(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	out := regenerateDryRunOut{Replaces: prev.Replaces, Bought: make([]regenBoughtOut, 0, len(prev.Bought))}
	for _, m := range prev.Bought {
		out.Bought = append(out.Bought, regenBoughtOut{
			Date: m.Key.Date, MealSlotName: t.slots[m.Key.MealSlotID], CourseName: t.courses[m.Key.CourseID],
			RecipeName: t.recipes[m.RecipeID], Ingredients: boughtNames(m.Bought, t),
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// mealReply answers a meal action with the meal as it is now.
func (a *api) mealReply(w http.ResponseWriter, r *http.Request, m plan.Meal, err error) {
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context(), &m)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, mealFor(m, t))
}

func (a *api) setMeal(w http.ResponseWriter, r *http.Request) {
	k, ok := key(r)
	if !ok {
		unknownSlot(w)
		return
	}
	var body struct {
		RecipeID int64    `json:"recipeId"`
		Batches  *float64 `json:"batches"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if body.RecipeID <= 0 {
		writeErr(w, runner.ErrUnknownRecipe)
		return
	}
	res, err := a.run.SetCourseMeal(r.Context(), k, body.RecipeID, body.Batches)
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context(), &res.Meal)
	if err != nil {
		writeErr(w, err)
		return
	}
	covered := make([]int64, 0, len(res.Covered))
	for _, c := range res.Covered {
		covered = append(covered, c)
	}
	httpx.WriteJSON(w, http.StatusOK, putOut{mealOut: mealFor(res.Meal, t), Covered: covered})
}

func (a *api) confirm(w http.ResponseWriter, r *http.Request) {
	k, ok := key(r)
	if !ok {
		unknownSlot(w)
		return
	}
	m, err := a.run.Confirm(r.Context(), k)
	a.mealReply(w, r, m, err)
}

func (a *api) unpin(w http.ResponseWriter, r *http.Request) {
	k, ok := key(r)
	if !ok {
		unknownSlot(w)
		return
	}
	m, err := a.run.Unpin(r.Context(), k)
	a.mealReply(w, r, m, err)
}

func (a *api) alternatives(w http.ResponseWriter, r *http.Request) {
	k, ok := key(r)
	if !ok {
		unknownSlot(w)
		return
	}
	alts, err := a.run.Alternatives(r.Context(), k)
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]alternativeOut, 0, len(alts))
	for _, alt := range alts {
		out = append(out, alternativeFor(alt, t))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"alternatives": out})
}

func (a *api) cookPreview(w http.ResponseWriter, r *http.Request) {
	k, ok := key(r)
	if !ok {
		unknownSlot(w)
		return
	}
	p, err := a.run.CookPreview(r.Context(), k)
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context(), &p.Meal)
	if err != nil {
		writeErr(w, err)
		return
	}
	needs := make([]needOut, 0, len(p.Needs))
	for _, n := range p.Needs {
		needs = append(needs, needOut{IngredientID: n.IngredientID, Ingredient: t.ingredients[n.IngredientID], Quantity: n.Quantity})
	}
	httpx.WriteJSON(w, http.StatusOK, cookPreviewOut{
		Meal: *mealFor(p.Meal, t), Fresh: p.Fresh, Batches: p.Meal.Batches, Yield: p.Yield,
		PortionsNeeded: p.PortionsNeeded, ProposedLeftover: p.Proposed, MaxLeftover: p.Max,
		LeftoverUseBy: p.UseBy, Needs: needs,
	})
}

func (a *api) cooked(w http.ResponseWriter, r *http.Request) {
	k, ok := key(r)
	if !ok {
		unknownSlot(w)
		return
	}
	var body struct {
		LeftoverPortions *float64 `json:"leftoverPortions"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	res, err := a.run.Cooked(r.Context(), k, body.LeftoverPortions)
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context(), &res.Meal)
	if err != nil {
		writeErr(w, err)
		return
	}
	warnings := make([]warningOut, 0, len(res.Warnings))
	for _, wn := range res.Warnings {
		warnings = append(warnings, warningOut{IngredientID: wn.IngredientID, Name: wn.Name, BaseUnit: wn.BaseUnit,
			Have: wn.Have, Need: wn.Need, Shortfall: wn.Shortfall, Message: wn.Message})
	}
	var leftover any
	if res.Leftover != nil {
		leftover = leftoverFor(*res.Leftover, t)
	}
	plannedFor := make([]plannedForOut, 0, len(res.PlannedFor))
	for _, p := range res.PlannedFor {
		plannedFor = append(plannedFor, plannedForOut{Date: p.Date, MealSlotID: p.MealSlotID,
			MealSlotName: p.MealSlotName, RecipeName: p.RecipeName, CourseID: p.CourseID})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"meal": mealFor(res.Meal, t), "leftover": leftover,
		"warnings": warnings, "plannedFor": plannedFor})
}

func (a *api) notCooked(w http.ResponseWriter, r *http.Request) {
	k, ok := key(r)
	if !ok {
		unknownSlot(w)
		return
	}
	m, err := a.run.NotCooked(r.Context(), k)
	a.mealReply(w, r, m, err)
}

// allCooked marks every unresolved Course of the slot Cooked in one step (POST .../all/cooked, crs-c2 §3.3). The body
// is optional: {"courses": [{"courseId", "leftoverPortions"?}]}.
func (a *api) allCooked(w http.ResponseWriter, r *http.Request) {
	k, ok := slotKey(r)
	if !ok {
		unknownSlot(w)
		return
	}
	var body struct {
		Courses []struct {
			CourseID         int64    `json:"courseId"`
			LeftoverPortions *float64 `json:"leftoverPortions"`
		} `json:"courses"`
	}
	if r.ContentLength != 0 {
		if err := httpx.DecodeJSON(r, &body); err != nil {
			httpx.WriteAPIError(w, err)
			return
		}
	}
	list := make([]runner.CourseLeftover, 0, len(body.Courses))
	for _, c := range body.Courses {
		list = append(list, runner.CourseLeftover{CourseID: c.CourseID, LeftoverPortions: c.LeftoverPortions})
	}
	res, err := a.run.CookedAll(r.Context(), k.Date, k.MealSlotID, list)
	if err != nil {
		var ce *runner.CourseError
		if errors.As(err, &ce) {
			writeCourseErr(w, ce)
			return
		}
		writeErr(w, err)
		return
	}
	metas := make([]*plan.Meal, 0, len(res.Meals))
	for i := range res.Meals {
		metas = append(metas, &res.Meals[i])
	}
	t, err := a.names.load(r.Context(), metas...)
	if err != nil {
		writeErr(w, err)
		return
	}
	meals := make([]*mealOut, 0, len(res.Meals))
	for _, m := range res.Meals {
		meals = append(meals, mealFor(m, t))
	}
	leftovers := make([]leftoverOut, 0, len(res.Leftovers))
	for _, l := range res.Leftovers {
		leftovers = append(leftovers, leftoverFor(l, t))
	}
	warnings := make([]warningOut, 0, len(res.Warnings))
	for _, wn := range res.Warnings {
		warnings = append(warnings, warningOut{IngredientID: wn.IngredientID, Name: wn.Name, BaseUnit: wn.BaseUnit,
			Have: wn.Have, Need: wn.Need, Shortfall: wn.Shortfall, Message: wn.Message})
	}
	plannedFor := make([]plannedForOut, 0, len(res.PlannedFor))
	for _, p := range res.PlannedFor {
		plannedFor = append(plannedFor, plannedForOut{Date: p.Date, MealSlotID: p.MealSlotID,
			MealSlotName: p.MealSlotName, RecipeName: p.RecipeName, CourseID: p.CourseID})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"meals": meals, "leftovers": leftovers,
		"warnings": warnings, "plannedFor": plannedFor})
}

// notCookedAll marks every unresolved Course of the slot Not cooked (POST .../all/not-cooked, crs-c2 §3.3).
func (a *api) notCookedAll(w http.ResponseWriter, r *http.Request) {
	k, ok := slotKey(r)
	if !ok {
		unknownSlot(w)
		return
	}
	changed, err := a.run.NotCookedAll(r.Context(), k.Date, k.MealSlotID)
	if err != nil {
		writeErr(w, err)
		return
	}
	metas := make([]*plan.Meal, 0, len(changed))
	for i := range changed {
		metas = append(metas, &changed[i])
	}
	t, err := a.names.load(r.Context(), metas...)
	if err != nil {
		writeErr(w, err)
		return
	}
	meals := make([]*mealOut, 0, len(changed))
	for _, m := range changed {
		meals = append(meals, mealFor(m, t))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"meals": meals})
}

// writeCourseErr answers a request whose entry courses[i] failed: the field names the entry.
func writeCourseErr(w http.ResponseWriter, ce *runner.CourseError) {
	switch {
	case errors.Is(ce.Err, runner.ErrCourseNotInSlot):
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
			"code": "course_not_in_slot", "message": messageFor("course_not_in_slot"), "field": fmt.Sprintf("courses[%d].courseId", ce.Index)}})
	case errors.Is(ce.Err, plan.ErrInvalidLeftover):
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
			"code": "validation_failed", "message": messageFor("validation_failed"), "field": fmt.Sprintf("courses[%d].leftoverPortions", ce.Index)}})
	default:
		writeErr(w, ce.Err)
	}
}

// Slot Rules and Variety Rules. Changing a rule replans at once: unpinned meals that break it are replanned.

func (a *api) slotRules(w http.ResponseWriter, r *http.Request) {
	rules, err := a.st.SlotRules(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, rulesFor(rules, t))
}

func (a *api) addSlotRule(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MealSlotID int64  `json:"mealSlotId"`
		CourseID   int64  `json:"courseId"`
		RecipeID   int64  `json:"recipeId"`
		Tag        string `json:"tag"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	rule := plan.SlotRule{MealSlotID: body.MealSlotID, CourseID: body.CourseID, RecipeID: body.RecipeID}
	if body.Tag != "" {
		rule.Tag = recipe.TagKey(body.Tag)
	}
	if err := a.requireTag(r.Context(), rule.Tag); err != nil {
		writeErr(w, err)
		return
	}
	rule, err := a.run.CheckRule(r.Context(), rule)
	if err != nil {
		writeErr(w, err)
		return
	}
	var added plan.SlotRule
	err = a.run.ChangeRules(r.Context(), func(st *store.Store) (err error) {
		added, err = st.AddSlotRule(r.Context(), rule)
		return err
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, ruleFor(added, t))
}

func (a *api) deleteSlotRule(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, store.ErrNotFound)
		return
	}
	err = a.run.ChangeRules(r.Context(), func(st *store.Store) error {
		return st.DeleteSlotRule(r.Context(), id)
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) varietyRules(w http.ResponseWriter, r *http.Request) {
	rules, err := a.st.VarietyRules(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]varietyOut, 0, len(rules))
	for _, v := range rules {
		out = append(out, varietyOut{Tag: v.Tag, MaxPerWeek: v.MaxPerWeek, NotConsecutiveDays: v.NotConsecutiveDays})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *api) setVarietyRule(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MaxPerWeek         int  `json:"maxPerWeek"`
		NotConsecutiveDays bool `json:"notConsecutiveDays"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	v := plan.VarietyRule{Tag: recipe.TagKey(r.PathValue("tag")), MaxPerWeek: body.MaxPerWeek, NotConsecutiveDays: body.NotConsecutiveDays}
	if err := a.requireTag(r.Context(), v.Tag); err != nil {
		writeErr(w, err)
		return
	}
	err := a.run.ChangeRules(r.Context(), func(st *store.Store) error {
		return st.SetVarietyRule(r.Context(), v)
	})
	if err != nil {
		writeFieldErr(w, err, "maxPerWeek")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, varietyOut{Tag: v.Tag, MaxPerWeek: v.MaxPerWeek, NotConsecutiveDays: v.NotConsecutiveDays})
}

func (a *api) deleteVarietyRule(w http.ResponseWriter, r *http.Request) {
	tag := recipe.TagKey(r.PathValue("tag"))
	err := a.run.ChangeRules(r.Context(), func(st *store.Store) error {
		return st.DeleteVarietyRule(r.Context(), tag)
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
