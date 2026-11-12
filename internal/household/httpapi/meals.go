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
	ID             int64           `json:"id"`
	Weekday        int             `json:"weekday"`
	Name           string          `json:"name"`
	Time           string          `json:"time"`
	Attendance     []attendeeBody  `json:"attendance"`
	PortionsNeeded float64         `json:"portionsNeeded"`
	Courses        []slotCourseOut `json:"courses"`
}

// slotIn is what an Admin sends to create or replace a Meal Slot.
type slotIn struct {
	Weekday    int            `json:"weekday"`
	Name       string         `json:"name"`
	Time       string         `json:"time"`
	Attendance []attendeeBody `json:"attendance"`
	Courses    []slotCourseIn `json:"courses"`
}

// input decodes and validates a slotIn.
func (in slotIn) input() (household.MealSlotInput, error) {
	m := household.MealSlotInput{Weekday: in.Weekday, Name: in.Name, Time: in.Time, Attendance: attendeesIn(in.Attendance),
		Courses: coursesIn(in.Courses)}.Normalized()
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
		Attendance: attendeesOut(s.Attendance), PortionsNeeded: portions, Courses: slotCoursesOut(s.Courses)}, nil
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

// batchIn is the body of PATCH /api/meal-slots/batch. Only the fields present change; dryRun answers what
// the same edit would do without saving it.
type batchIn struct {
	Match    string `json:"match"`
	Weekdays []int  `json:"weekdays"`
	DryRun   bool   `json:"dryRun"`
	Set      struct {
		Name       *string        `json:"name"`
		Time       *string        `json:"time"`
		Attendance []attendeeBody `json:"attendance"`
		Courses    []slotCourseIn `json:"courses"`
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
	b := household.BatchInput{Match: in.Match, Weekdays: in.Weekdays, DryRun: in.DryRun,
		Change: household.SlotChange{Name: in.Set.Name, Time: in.Set.Time}}
	if in.Set.Attendance != nil { // [] = nobody, absent = untouched
		att := attendeesIn(in.Set.Attendance)
		b.Change.Attendance = &att
	}
	if in.Set.Courses != nil { // [] is refused by validation; absent = untouched
		cs := coursesIn(in.Set.Courses)
		b.Change.Courses = &cs
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
	if !b.DryRun {
		a.changed("mealSlots")
	}
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
	removes, err := a.removesOut(r, res.Removes)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"match": b.Match, "updated": updated, "skipped": skipped, "removes": removes})
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

// dateAttendanceBody is the Attendance on one date, with each Course of the Meal Slot on that date.
type dateAttendanceBody struct {
	SlotID         int64          `json:"slotId"`
	Date           string         `json:"date"`
	IsOverride     bool           `json:"isOverride"`
	Attendance     []attendeeBody `json:"attendance"`
	PortionsNeeded float64        `json:"portionsNeeded"` // Guests included (ADR 0014)
	Guests         int            `json:"guests"`
	Courses        []courseDayOut `json:"courses"`
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
	row, err := a.st.SlotDate(r.Context(), slot.ID, date)
	if err != nil {
		return dateAttendanceBody{}, err
	}
	portions, err := a.portionsWithGuests(r, att, row.Guests)
	if err != nil {
		return dateAttendanceBody{}, err
	}
	courses, err := a.dateCourses(r, slot.ID, date)
	if err != nil {
		return dateAttendanceBody{}, err
	}
	return dateAttendanceBody{SlotID: slot.ID, Date: date, IsOverride: isOverride,
		Attendance: attendeesOut(att), PortionsNeeded: portions, Guests: row.Guests, Courses: courses}, nil
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

// dateIn is what a PUT of one date sends: attendance and/or courses. An absent or null field is left alone.
type dateIn struct {
	Attendance []attendeeBody `json:"attendance"`
	Courses    []dateCourseIn `json:"courses"`
	Guests     *int           `json:"guests"` // 0 to 20 (ADR 0014); absent = unchanged
}

// dateCourseIn is one Course's opt-outs for the date: a list (empty = everyone eats it) replaces the date's
// own; null or absent drops them, back to the usual opt-outs.
type dateCourseIn struct {
	CourseID        int64   `json:"courseId"`
	OptOutMemberIDs []int64 `json:"optOutMemberIds"`
}

func (a *api) putAttendance(w http.ResponseWriter, r *http.Request) {
	slot, date, err := a.dateOnSlot(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	var in dateIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	if in.Attendance == nil && in.Courses == nil && in.Guests == nil {
		writeErr(w, &household.ValidationError{Field: "attendance", Reason: "nothing_to_change",
			Message: "send attendance, courses, guests or several"})
		return
	}
	if in.Guests != nil {
		if err := household.ValidateGuests(*in.Guests); err != nil {
			writeErr(w, err)
			return
		}
	}
	var att []household.Attendee
	if in.Attendance != nil {
		att = attendeesIn(in.Attendance)
		if err := household.ValidateAttendees(att); err != nil {
			writeErr(w, err)
			return
		}
		if err := a.checkNotEmptiedWhileStarted(r, slot.ID, date, att, in.Guests); err != nil {
			writeErr(w, err)
			return
		}
	}
	// Check every Course before the first write, so a bad entry leaves the date as it was.
	var dayCourses []household.DateCourse
	for _, c := range in.Courses {
		dayCourses = append(dayCourses, household.DateCourse{CourseID: c.CourseID, OptOutMemberIDs: c.OptOutMemberIDs})
	}
	if in.Courses != nil {
		served, err := a.st.CoursesOn(r.Context(), slot.ID, date)
		if err != nil {
			writeErr(w, err)
			return
		}
		members, err := a.st.Members(r.Context())
		if err != nil {
			writeErr(w, err)
			return
		}
		if err := household.ValidateDateCourses(served, members, dayCourses); err != nil {
			writeErr(w, err)
			return
		}
	}
	if in.Attendance != nil || in.Guests != nil {
		who := household.WhoIsEating{Guests: in.Guests}
		if in.Attendance != nil {
			who.Members = &att
		}
		if err := a.st.SaveWhoIsEating(r.Context(), slot.ID, date, who); err != nil {
			writeErr(w, err)
			return
		}
	}
	for _, c := range dayCourses {
		var ids *[]int64
		if c.OptOutMemberIDs != nil {
			ids = &c.OptOutMemberIDs
		}
		if err := a.st.SetDateCourseOptOuts(r.Context(), slot.ID, date, c.CourseID, ids); err != nil {
			writeErr(w, err)
			return
		}
	}
	a.changed("attendance")
	if in.Guests != nil {
		a.changed("slotDates")
	}
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
	a.changed("slotDates") // Reset to usual Attendance drops the date's Guests
	w.WriteHeader(http.StatusNoContent)
}

// pathID reads the {id} path segment.
func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil
}
