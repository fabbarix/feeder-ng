package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// A Meal Slot on one date (ADR 0014; spec §18; docs/dev/design/b5-sd.md):
//
//	GET   /api/meal-slots/{id}/dates/{date}            -> { date, notServed, time, usualTime, guests }
//	PATCH /api/meal-slots/{id}/dates/{date}[?dryRun=1] -> the same, or { removes: { plannedMeals: [...] } } for a dry run
//
// Every User.

// slotDateBody is a Meal Slot on one date as the API shows it. Time is null when the date has the usual time.
type slotDateBody struct {
	Date      string  `json:"date"`
	NotServed bool    `json:"notServed"`
	Time      *string `json:"time"`
	UsualTime string  `json:"usualTime"`
	Guests    int     `json:"guests"`
}

// slotDateIn is a PATCH. A field that is not sent is not touched; time null means the usual time.
type slotDateIn struct {
	NotServed *bool           `json:"notServed"`
	Time      json.RawMessage `json:"time"`
}

// removedMealOut is one unresolved Planned Meal a Not served date removes (dry run).
type removedMealOut struct {
	CourseID   int64    `json:"courseId"`
	CourseName string   `json:"courseName"`
	RecipeName string   `json:"recipeName"`
	Pinned     bool     `json:"pinned"`
	Bought     []string `json:"bought"`
}

// slotDateRemovesOut is the dry run's answer: what the change would remove, nothing written.
type slotDateRemovesOut struct {
	Removes struct {
		PlannedMeals []removedMealOut `json:"plannedMeals"`
	} `json:"removes"`
}

// slotOnDate reads the {id} and {date} path segments and checks the date falls on the slot's weekday.
func (a *api) slotOnDate(r *http.Request) (household.MealSlot, string, error) {
	id, ok := pathID(r)
	if !ok {
		return household.MealSlot{}, "", household.ErrNotFound
	}
	slot, err := a.st.Slot(r.Context(), id)
	if err != nil {
		return household.MealSlot{}, "", err
	}
	date := r.PathValue("date")
	if err := household.ValidateAttendanceDate(slot.Weekday, date); err != nil {
		return household.MealSlot{}, "", err
	}
	return slot, date, nil
}

// slotDateOut reads the Meal Slot on the date as the API shows it. Not served includes an emptied date (U1).
func (a *api) slotDateOut(r *http.Request, slot household.MealSlot, date string) (slotDateBody, error) {
	ctx := r.Context()
	row, err := a.st.SlotDate(ctx, slot.ID, date)
	if err != nil {
		return slotDateBody{}, err
	}
	att, isOverride, err := a.st.DateAttendance(ctx, slot.ID, date)
	if err != nil {
		return slotDateBody{}, err
	}
	b := slotDateBody{Date: date, NotServed: household.IsNotServed(row, att, isOverride), UsualTime: slot.Time, Guests: row.Guests}
	if row.Time != "" {
		t := row.Time
		b.Time = &t
	}
	return b, nil
}

func (a *api) getSlotDate(w http.ResponseWriter, r *http.Request) {
	slot, date, err := a.slotOnDate(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	b, err := a.slotDateOut(r, slot, date)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, b)
}

func (a *api) patchSlotDate(w http.ResponseWriter, r *http.Request) {
	slot, date, err := a.slotOnDate(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	var in slotDateIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	timeField, err := patchedTime(in.Time)
	if err != nil {
		writeErr(w, err)
		return
	}
	ctx := r.Context()
	today, err := clock.HouseholdToday(ctx, a.d.DB, a.d.Clock)
	if err != nil {
		writeErr(w, err)
		return
	}
	dryRun := r.URL.Query().Get("dryRun") == "1"
	notServed := in.NotServed != nil && *in.NotServed
	row, err := a.st.PatchSlotDate(ctx, slot.ID, date, household.SlotDatePatch{
		NotServed: in.NotServed, Time: timeField, Today: today, DryRun: dryRun,
	})
	if err != nil {
		writeErr(w, err)
		return
	}
	if dryRun {
		a.writeSlotDateRemoves(w, r, slot, date, row, notServed)
		return
	}
	a.changed("slotDates")
	b, err := a.slotDateOut(r, slot, date)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, b)
}

// patchedTime reads the time field of a PATCH: absent (nil, not touched), null or "" (the usual time), or the text
// of an HH:MM time, which the store checks. A field that is not a string is time_invalid.
func patchedTime(raw json.RawMessage) (*string, error) {
	if raw == nil {
		return nil, nil
	}
	if string(raw) == "null" {
		usual := ""
		return &usual, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, &household.ValidationError{Field: "time", Message: "must be a 24-hour HH:MM time", Reason: "time_invalid"}
	}
	return &s, nil
}

// writeSlotDateRemoves answers a dry run: the unresolved Planned Meals a Not served date would remove, in the slot's
// Course order, and nothing written. Serving again, or a change of time only, removes nothing; neither does a slot
// whose instant is already over (its meals wait in To confirm).
func (a *api) writeSlotDateRemoves(w http.ResponseWriter, r *http.Request, slot household.MealSlot, date string,
	row household.SlotDate, notServed bool) {
	var out slotDateRemovesOut
	out.Removes.PlannedMeals = []removedMealOut{}
	if notServed {
		meals, err := a.st.UnresolvedMealsOn(r.Context(), slot.ID, date, household.EffectiveTime(slot.Time, row), a.d.Clock.Now())
		if err != nil {
			writeErr(w, err)
			return
		}
		for _, m := range meals {
			out.Removes.PlannedMeals = append(out.Removes.PlannedMeals, removedMealOut{CourseID: m.CourseID,
				CourseName: m.CourseName, RecipeName: m.RecipeName, Pinned: m.Pinned, Bought: nonNilNames(m.Bought)})
		}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// portionsWithGuests sums the Portion Factors of att against the Household's Members, plus one per Guest.
func (a *api) portionsWithGuests(r *http.Request, att []household.Attendee, guests int) (float64, error) {
	members, err := a.st.Members(r.Context())
	if err != nil {
		return 0, err
	}
	return household.PortionsWithGuests(members, att, guests)
}
