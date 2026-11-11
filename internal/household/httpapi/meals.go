package httpapi

import (
	"net/http"
	"strconv"

	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// attendeeBody is one Member at a Meal Slot or on a date.
type attendeeBody struct {
	MemberID              int64    `json:"memberId"`
	PortionFactorOverride *float64 `json:"portionFactorOverride"`
}

func attendeesOut(att []household.Attendee) []attendeeBody {
	out := make([]attendeeBody, 0, len(att))
	for _, a := range att {
		out = append(out, attendeeBody{MemberID: a.MemberID, PortionFactorOverride: a.PortionFactorOverride})
	}
	return out
}

// attendeesIn keeps nil (field omitted or null) apart from an empty list (nobody).
func attendeesIn(in []attendeeBody) []household.Attendee {
	if in == nil {
		return nil
	}
	out := make([]household.Attendee, 0, len(in))
	for _, a := range in {
		out = append(out, household.Attendee{MemberID: a.MemberID, PortionFactorOverride: a.PortionFactorOverride})
	}
	return out
}

// slotBody is a Meal Slot as the API shows them.
type slotBody struct {
	ID             int64          `json:"id"`
	Weekday        int            `json:"weekday"`
	Name           string         `json:"name"`
	Time           string         `json:"time"`
	Attendance     []attendeeBody `json:"attendance"`
	PortionsNeeded float64        `json:"portionsNeeded"`
}

// slotIn is what an Admin sends to create or replace a Meal Slot.
type slotIn struct {
	Weekday    int            `json:"weekday"`
	Name       string         `json:"name"`
	Time       string         `json:"time"`
	Attendance []attendeeBody `json:"attendance"`
}

// input decodes and validates a slotIn.
func (in slotIn) input() (household.MealSlotInput, error) {
	m := household.MealSlotInput{Weekday: in.Weekday, Name: in.Name, Time: in.Time, Attendance: attendeesIn(in.Attendance)}.Normalized()
	return m, m.Validate()
}

// portionsOf sums the Portion Factors for att against the Household's Members.
func (a *api) portionsOf(r *http.Request, att []household.Attendee) (float64, error) {
	members, err := a.st.Members(r.Context())
	if err != nil {
		return 0, err
	}
	return household.PortionsNeeded(members, att)
}

func (a *api) slotOut(r *http.Request, s household.MealSlot) (slotBody, error) {
	portions, err := a.portionsOf(r, s.Attendance)
	if err != nil {
		return slotBody{}, err
	}
	return slotBody{ID: s.ID, Weekday: s.Weekday, Name: s.Name, Time: s.Time,
		Attendance: attendeesOut(s.Attendance), PortionsNeeded: portions}, nil
}

func (a *api) listSlots(w http.ResponseWriter, r *http.Request) {
	list, err := a.st.Slots(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]slotBody, 0, len(list))
	for _, s := range list {
		b, err := a.slotOut(r, s)
		if err != nil {
			writeErr(w, err)
			return
		}
		out = append(out, b)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *api) createSlot(w http.ResponseWriter, r *http.Request) {
	var in slotIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	v, err := in.input()
	if err != nil {
		writeErr(w, err)
		return
	}
	s, err := a.st.CreateSlot(r.Context(), v)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed("mealSlots")
	a.writeSlot(w, r, http.StatusCreated, s)
}

func (a *api) updateSlot(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, household.ErrNotFound)
		return
	}
	var in slotIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	v, err := in.input()
	if err != nil {
		writeErr(w, err)
		return
	}
	s, err := a.st.UpdateSlot(r.Context(), id, v)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed("mealSlots")
	a.writeSlot(w, r, http.StatusOK, s)
}

// batchIn is the body of PATCH /api/meal-slots/batch. Only the fields present change.
type batchIn struct {
	Match    string `json:"match"`
	Weekdays []int  `json:"weekdays"`
	Set      struct {
		Name       *string        `json:"name"`
		Time       *string        `json:"time"`
		Attendance []attendeeBody `json:"attendance"`
	} `json:"set"`
}

type skippedBody struct {
	Weekday int    `json:"weekday"`
	Reason  string `json:"reason"`
}

func (a *api) updateSlotsBatch(w http.ResponseWriter, r *http.Request) {
	var in batchIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	b := household.BatchInput{Match: in.Match, Weekdays: in.Weekdays,
		Change: household.SlotChange{Name: in.Set.Name, Time: in.Set.Time}}
	if in.Set.Attendance != nil { // [] = nobody, absent = untouched
		att := attendeesIn(in.Set.Attendance)
		b.Change.Attendance = &att
	}
	b = b.Normalized()
	if err := b.Validate(); err != nil {
		writeErr(w, err)
		return
	}
	res, err := a.st.UpdateSlotsBatch(r.Context(), b)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed("mealSlots")
	updated := make([]slotBody, 0, len(res.Updated))
	for _, s := range res.Updated {
		body, err := a.slotOut(r, s)
		if err != nil {
			writeErr(w, err)
			return
		}
		updated = append(updated, body)
	}
	skipped := make([]skippedBody, 0, len(res.Skipped))
	for _, d := range res.Skipped {
		skipped = append(skipped, skippedBody{Weekday: d, Reason: "no_slot"})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"match": b.Match, "updated": updated, "skipped": skipped})
}

func (a *api) writeSlot(w http.ResponseWriter, r *http.Request, status int, s household.MealSlot) {
	b, err := a.slotOut(r, s)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, status, b)
}

func (a *api) deleteSlot(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, household.ErrNotFound)
		return
	}
	if err := a.st.DeleteSlot(r.Context(), id); err != nil {
		writeErr(w, err)
		return
	}
	a.changed("mealSlots")
	w.WriteHeader(http.StatusNoContent)
}

// dateAttendanceBody is the Attendance on one date.
type dateAttendanceBody struct {
	SlotID         int64          `json:"slotId"`
	Date           string         `json:"date"`
	IsOverride     bool           `json:"isOverride"`
	Attendance     []attendeeBody `json:"attendance"`
	PortionsNeeded float64        `json:"portionsNeeded"`
}

// dateOnSlot reads ?date= and checks it falls on the slot's weekday.
func (a *api) dateOnSlot(r *http.Request) (household.MealSlot, string, error) {
	id, ok := pathID(r)
	if !ok {
		return household.MealSlot{}, "", household.ErrNotFound
	}
	slot, err := a.st.Slot(r.Context(), id)
	if err != nil {
		return household.MealSlot{}, "", err
	}
	date := r.URL.Query().Get("date")
	if err := household.ValidateAttendanceDate(slot.Weekday, date); err != nil {
		return household.MealSlot{}, "", err
	}
	return slot, date, nil
}

func (a *api) dateBody(r *http.Request, slot household.MealSlot, date string) (dateAttendanceBody, error) {
	att, isOverride, err := a.st.DateAttendance(r.Context(), slot.ID, date)
	if err != nil {
		return dateAttendanceBody{}, err
	}
	portions, err := a.portionsOf(r, att)
	if err != nil {
		return dateAttendanceBody{}, err
	}
	return dateAttendanceBody{SlotID: slot.ID, Date: date, IsOverride: isOverride,
		Attendance: attendeesOut(att), PortionsNeeded: portions}, nil
}

func (a *api) getAttendance(w http.ResponseWriter, r *http.Request) {
	slot, date, err := a.dateOnSlot(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	b, err := a.dateBody(r, slot, date)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, b)
}

func (a *api) putAttendance(w http.ResponseWriter, r *http.Request) {
	slot, date, err := a.dateOnSlot(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	var in struct {
		Attendance []attendeeBody `json:"attendance"`
	}
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	att := attendeesIn(in.Attendance)
	if err := household.ValidateAttendees(att); err != nil {
		writeErr(w, err)
		return
	}
	if err := a.st.SetDateAttendance(r.Context(), slot.ID, date, att); err != nil {
		writeErr(w, err)
		return
	}
	a.changed("attendance")
	b, err := a.dateBody(r, slot, date)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, b)
}

func (a *api) deleteAttendance(w http.ResponseWriter, r *http.Request) {
	slot, date, err := a.dateOnSlot(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := a.st.ClearDateAttendance(r.Context(), slot.ID, date); err != nil {
		writeErr(w, err)
		return
	}
	a.changed("attendance")
	w.WriteHeader(http.StatusNoContent)
}

// pathID reads the {id} path segment.
func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil
}
