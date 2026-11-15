package httpapi

import (
	"errors"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// Remove and Put back for Meal Slots and Members, with the read-only impact of each and the Removed Meal Slots read
// (B9-04; SAFE-02, SET-15, ADR 0021). Handlers parse, call the store and respond; every change is announced on the
// household topic, which replans.

// slotImpactJSON is what removing a Meal Slot does: the Planned Meals from today and the To confirm rows that go, the
// Slot Rules that stop applying, and how many Cooked and Not cooked meals stay. Lists are [] and never null.
type slotImpactJSON struct {
	PlannedMeals []removedMealJSON `json:"plannedMeals"`
	SlotRules    []removedRuleJSON `json:"slotRules"`
	ToConfirm    []removedMealJSON `json:"toConfirm"`
	CookedKept   int               `json:"cookedKept"`
}

func (a *api) slotImpact(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, household.ErrNotFound)
		return
	}
	im, err := a.st.SlotImpact(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	goes, err := a.removesOut(r, household.Removals{PlannedMeals: im.PlannedMeals, SlotRules: im.SlotRules})
	if err != nil {
		writeErr(w, err)
		return
	}
	toConfirm, err := a.removesOut(r, household.Removals{PlannedMeals: im.ToConfirm})
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, slotImpactJSON{PlannedMeals: goes.PlannedMeals, SlotRules: goes.SlotRules,
		ToConfirm: toConfirm.PlannedMeals, CookedKept: im.CookedKept})
}

// restoreSlot puts a removed Meal Slot back (Undo, or Put back from the Removed Meal Slots tile).
func (a *api) restoreSlot(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, household.ErrNotFound)
		return
	}
	s, err := a.st.RestoreSlot(r.Context(), id)
	if errors.Is(err, household.ErrSlotNameTaken) {
		msg := "There is already an active Meal Slot with that name on that weekday."
		if cur, e := a.st.Slot(r.Context(), id); e == nil {
			msg = household.SlotNameTakenMessage(cur.Name, cur.Weekday)
		}
		httpx.WriteError(w, http.StatusConflict, "meal_slot_name_taken", msg)
		return
	}
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed("mealSlots")
	a.writeSlot(w, r, http.StatusOK, s)
}

// removedSlotJSON is one row of the Removed Meal Slots read: removed Meal Slots of one name removed together, with
// the Cooked and Not cooked meals they kept (the wording is the client's).
type removedSlotJSON struct {
	IDs            []int64 `json:"ids"`
	Name           string  `json:"name"`
	Weekdays       []int   `json:"weekdays"`
	Time           string  `json:"time"`
	RemovedAt      string  `json:"removedAt"`
	CookedCount    int     `json:"cookedCount"`
	NotCookedCount int     `json:"notCookedCount"`
}

// listRemovedSlots answers GET /api/meal-slots?removed=with-history.
func (a *api) listRemovedSlots(w http.ResponseWriter, r *http.Request) {
	list, err := a.st.RemovedSlots(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]removedSlotJSON, 0, len(list))
	for _, s := range list {
		out = append(out, removedSlotJSON{IDs: s.IDs, Name: s.Name, Weekdays: s.Weekdays, Time: s.Time, RemovedAt: s.RemovedAt,
			CookedCount: s.Cooked, NotCookedCount: s.NotCooked})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// memberImpactJSON is what removing a Member does. signIn is the address whose sign-in ends ("not on the Allowlist");
// null when the Member has no address or it is on the Allowlist (that User keeps signing in).
type memberImpactJSON struct {
	Preferences int         `json:"preferences"`
	MealSlots   int         `json:"mealSlots"`
	SignIn      *signInJSON `json:"signIn"`
}

type signInJSON struct {
	Email string `json:"email"`
}

func (a *api) memberImpact(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, household.ErrNotFound)
		return
	}
	im, err := a.st.MemberImpact(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	out := memberImpactJSON{Preferences: im.Preferences, MealSlots: im.MealSlots}
	if im.SignInEmail != "" {
		out.SignIn = &signInJSON{Email: im.SignInEmail}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// restoreMember is Undo of Remove Member: the Member comes back with the same id within ten minutes.
func (a *api) restoreMember(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, household.ErrNotFound)
		return
	}
	m, err := a.st.RestoreMember(r.Context(), id)
	if err != nil {
		memberErr(w, err)
		return
	}
	a.changed("members")
	httpx.WriteJSON(w, http.StatusOK, memberOut(m))
}

// slotIDsIn is the body of the batch Remove and Put back: {"ids":[…]}.
type slotIDsIn struct {
	IDs []int64 `json:"ids"`
}

// removeSlots removes several Meal Slots at once, all or nothing (B9-42): 204, one household event, which replans once.
func (a *api) removeSlots(w http.ResponseWriter, r *http.Request) {
	var in slotIDsIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if err := a.st.RemoveSlots(r.Context(), in.IDs); err != nil {
		writeBatchErr(w, err)
		return
	}
	a.changed("mealSlots")
	w.WriteHeader(http.StatusNoContent)
}

// restoreSlots puts several removed Meal Slots back at once, all or nothing (B9-42: one Undo for several days, one Put
// back for a Removed Meal Slots row): 200 {"slots":[…]} in the order asked, one household event.
func (a *api) restoreSlots(w http.ResponseWriter, r *http.Request) {
	var in slotIDsIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	slots, err := a.st.RestoreSlots(r.Context(), in.IDs)
	if err != nil {
		writeBatchErr(w, err)
		return
	}
	a.changed("mealSlots")
	out := make([]any, 0, len(slots))
	for _, s := range slots {
		b, err := a.slotOut(r, s)
		if err != nil {
			writeErr(w, err)
			return
		}
		out = append(out, b)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"slots": out})
}

// writeBatchErr answers a refused batch call, naming what refused it: the slot (`id`) for 404 not_found and 409
// meal_slot_removed, the days (`weekdays`, `ids`) for 409 meal_slot_name_taken. Anything else as writeErr.
func writeBatchErr(w http.ResponseWriter, err error) {
	var se *household.SlotIDError
	var nt *household.SlotNameTakenError
	switch {
	case errors.As(err, &nt):
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": map[string]any{
			"code": "meal_slot_name_taken", "message": nt.Message(), "ids": nt.IDs, "weekdays": nt.Weekdays}})
	case errors.As(err, &se) && errors.Is(err, household.ErrSlotRemoved):
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": map[string]any{
			"code": "meal_slot_removed", "message": "That Meal Slot is already removed.", "id": se.ID}})
	case errors.As(err, &se) && errors.Is(err, household.ErrNotFound):
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"error": map[string]any{
			"code": "not_found", "message": "Not found", "id": se.ID}})
	default:
		writeErr(w, err)
	}
}
