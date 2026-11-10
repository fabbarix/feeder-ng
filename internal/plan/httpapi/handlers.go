package httpapi

import (
	"context"
	"net/http"
	"strconv"

	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// key reads {date}/{slotId} from the path.
func key(r *http.Request) (plan.Key, bool) {
	id, err := strconv.ParseInt(r.PathValue("slotId"), 10, 64)
	if err != nil {
		return plan.Key{}, false
	}
	return plan.Key{Date: r.PathValue("date"), MealSlotID: id}, true
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

func (a *api) view(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	v, err := a.run.View(ctx, r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
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

// slotList answers the lists of slots (to-confirm, couldn't plan).
func (a *api) slotList(w http.ResponseWriter, r *http.Request, list func(context.Context) ([]runner.SlotView, error)) {
	views, err := list(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(r.Context(), viewMeals(views)...)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"slots": slots(views, t)})
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
	sum, err := a.run.Regenerate(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]int{"placed": sum.Placed, "kept": sum.Kept, "unfilled": sum.Unfilled})
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
	m, err := a.run.SetMeal(r.Context(), k, body.RecipeID, body.Batches)
	a.mealReply(w, r, m, err)
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
	t, err := a.names.load(r.Context())
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
			MealSlotName: p.MealSlotName, RecipeName: p.RecipeName})
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
		RecipeID   int64  `json:"recipeId"`
		Tag        string `json:"tag"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	rule := plan.SlotRule{MealSlotID: body.MealSlotID, RecipeID: body.RecipeID}
	if body.Tag != "" {
		rule.Tag = recipe.TagKey(body.Tag)
	}
	var added plan.SlotRule
	err := a.run.ChangeRules(r.Context(), func(st *store.Store) (err error) {
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
