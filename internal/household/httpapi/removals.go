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

// removedSlotJSON is one row of the Removed Meal Slots read: removed Meal Slots of one name and one removal, with
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
