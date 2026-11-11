package httpapi

import (
	"context"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// Courses on Meal Slots and Date Attendance (spec §16). The shapes are here; the rules are in the household
// package and its store.

// slotCourseOut is one Course of a Meal Slot, in the slot's order.
type slotCourseOut struct {
	ID              int64   `json:"id"`
	Name            string  `json:"name"`
	Main            bool    `json:"main"`
	Optional        bool    `json:"optional"`
	OptOutMemberIDs []int64 `json:"optOutMemberIds"`
}

// slotCourseIn is one listed Course of a create, update or batch edit. An absent or null optOutMemberIds
// keeps the stored opt-outs; a list, empty included, replaces them.
type slotCourseIn struct {
	ID              int64   `json:"id"`
	Optional        bool    `json:"optional"`
	OptOutMemberIDs []int64 `json:"optOutMemberIds"`
}

// coursesIn keeps nil (field absent or null) apart from an empty list (refused by the domain).
func coursesIn(in []slotCourseIn) []household.SlotCourseInput {
	if in == nil {
		return nil
	}
	out := make([]household.SlotCourseInput, 0, len(in))
	for _, c := range in {
		out = append(out, household.SlotCourseInput{CourseID: c.ID, Optional: c.Optional, OptOutMemberIDs: c.OptOutMemberIDs})
	}
	return out
}

// slotCoursesOut lists a slot's Courses; opt-outs are [] never null.
func slotCoursesOut(cs []household.SlotCourse) []slotCourseOut {
	out := make([]slotCourseOut, 0, len(cs))
	for _, c := range cs {
		out = append(out, slotCourseOut{ID: c.CourseID, Name: c.Name, Main: c.Main, Optional: c.Optional,
			OptOutMemberIDs: nonNilIDs(c.OptOutMemberIDs)})
	}
	return out
}

// courseDayOut is one Course of a Meal Slot on one date: who eats it and the portions it needs.
type courseDayOut struct {
	CourseID        int64          `json:"courseId"`
	Name            string         `json:"name"`
	OptOutMemberIDs []int64        `json:"optOutMemberIds"`
	IsOverride      bool           `json:"isOverride"`
	Attendance      []attendeeBody `json:"attendance"`
	PortionsNeeded  float64        `json:"portionsNeeded"`
}

// dateCourses lists the slot's Courses on date, in the slot's order, with their names.
func (a *api) dateCourses(r *http.Request, slotID int64, date string) ([]courseDayOut, error) {
	days, err := a.st.CoursesOn(r.Context(), slotID, date)
	if err != nil {
		return nil, err
	}
	names, err := a.courseNames(r.Context())
	if err != nil {
		return nil, err
	}
	members, err := a.st.Members(r.Context())
	if err != nil {
		return nil, err
	}
	out := make([]courseDayOut, 0, len(days))
	for _, d := range days {
		portions, err := household.PortionsNeeded(members, d.Attendance)
		if err != nil {
			return nil, err
		}
		out = append(out, courseDayOut{CourseID: d.CourseID, Name: names[d.CourseID], OptOutMemberIDs: nonNilIDs(d.OptOutMemberIDs),
			IsOverride: d.IsOverride, Attendance: attendeesOut(d.Attendance), PortionsNeeded: portions})
	}
	return out, nil
}

// courseNames maps every Course id, archived ones included, to its name.
func (a *api) courseNames(ctx context.Context) (map[int64]string, error) {
	list, err := a.courses.List(ctx, true)
	if err != nil {
		return nil, err
	}
	out := make(map[int64]string, len(list))
	for _, l := range list {
		out[l.ID] = l.Name
	}
	return out, nil
}

// nonNilIDs keeps an empty opt-out list an empty list in JSON.
func nonNilIDs(ids []int64) []int64 {
	if ids == nil {
		return []int64{}
	}
	return ids
}
