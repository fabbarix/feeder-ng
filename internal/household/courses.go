package household

import "fmt"

// Course Attendance and a Meal Slot's Courses (ADR 0008 points 7 and 8, spec §3.1).

// Validation reasons (ValidationError.Reason), field "courses" unless noted (spec §16).
const (
	ReasonCoursesEmpty       = "courses_empty"
	ReasonCourseUnknown      = "course_unknown" // unknown or archived Course id (checked by the store)
	ReasonCoursesAllOptional = "courses_all_optional"
	ReasonMemberUnknown      = "member_unknown" // field courses[i].optOutMemberIds (checked by the store)
)

// SlotCourse is one Course of a Meal Slot as read: in the slot's order, with its usual opt-outs.
type SlotCourse struct {
	CourseID        int64
	Name            string // output only
	Main            bool   // output only: the Course carries the main flag
	Optional        bool
	OptOutMemberIDs []int64 // usual opt-outs, ascending; kept even for a Member who no longer attends
}

// SlotCourseInput is one listed Course of a create, update or batch edit.
type SlotCourseInput struct {
	CourseID int64
	Optional bool // an absent optional is false
	// OptOutMemberIDs: nil keeps the Course's stored opt-outs (none for a Course new to the slot); a
	// non-nil list, empty included, replaces them.
	OptOutMemberIDs []int64
}

// ValidateSlotCourses checks a Courses list: nil is fine (absent); a non-nil empty list is
// ReasonCoursesEmpty; a list in which every Course is optional is ReasonCoursesAllOptional
// (the main Course may be optional when another is required). Both are *ValidationError on field "courses".
func ValidateSlotCourses(courses []SlotCourseInput) error {
	if courses == nil {
		return nil
	}
	if len(courses) == 0 {
		return &ValidationError{Field: "courses", Message: "a Meal Slot needs at least one Course", Reason: ReasonCoursesEmpty}
	}
	for _, c := range courses {
		if !c.Optional {
			return nil
		}
	}
	return &ValidationError{Field: "courses", Message: "at least one Course must be required", Reason: ReasonCoursesAllOptional}
}

// NormalizeSlotCourses drops repeated Courses (the first wins) and repeated Members in each OptOutMemberIDs,
// keeping order; nil stays nil and a nil OptOutMemberIDs stays nil. It returns a copy.
func NormalizeSlotCourses(courses []SlotCourseInput) []SlotCourseInput {
	if courses == nil {
		return nil
	}
	seenCourse := map[int64]bool{}
	out := make([]SlotCourseInput, 0, len(courses))
	for _, c := range courses {
		if seenCourse[c.CourseID] {
			continue
		}
		seenCourse[c.CourseID] = true
		if c.OptOutMemberIDs != nil {
			seenMember := map[int64]bool{}
			members := make([]int64, 0, len(c.OptOutMemberIDs))
			for _, m := range c.OptOutMemberIDs {
				if !seenMember[m] {
					seenMember[m] = true
					members = append(members, m)
				}
			}
			c.OptOutMemberIDs = members
		}
		out = append(out, c)
	}
	return out
}

// CourseDay is one Course of a Meal Slot on one date, as planning reads it.
type CourseDay struct {
	CourseID        int64
	Main            bool
	Optional        bool
	OptOutMemberIDs []int64    // effective on that date: the date's own when IsOverride, else the usual ones
	IsOverride      bool       // the date has its own opt-outs for this Course
	Attendance      []Attendee // CourseAttendance of the slot's Attendance on that date
}

// RemovedMeal is an unresolved Planned Meal (state planned, from today on, Pinned included) that goes
// because its Course was taken off its Meal Slot.
type RemovedMeal struct {
	Date       string
	MealSlotID int64
	CourseID   int64
	RecipeID   int64
	Pinned     bool
	Bought     []string // the Ingredients bought for the meal (ADR 0013), nil when none
}

// RemovedRule is a Slot Rule that goes with its Course.
type RemovedRule struct {
	ID         int64
	MealSlotID int64
	CourseID   int64
	RecipeID   int64 // 0 for a rule by Tag
	Tag        string
}

// Removals is what taking Courses off Meal Slots removes.
type Removals struct {
	PlannedMeals []RemovedMeal
	SlotRules    []RemovedRule
}

// CourseAttendance is the effective Attendance of one Course of a Meal Slot on a date: slot is the
// slot's Attendance on that date (usual, or the date's override), usual the Course's usual opt-out
// Members, date the Course's opt-outs for that date. date == nil means the date has no override row
// for the Course (the usual opt-outs apply); a non-nil date, empty included, replaces the usual ones
// ("everyone attending eats it"). An opt-out of a Member not in slot changes nothing. Order and
// Portion Factor overrides are kept; the inputs are not modified. It is the only place opt-outs are subtracted.
func CourseAttendance(slot []Attendee, usual []int64, date *[]int64) []Attendee {
	excluded := usual
	if date != nil {
		excluded = *date
	}
	out := make([]Attendee, 0, len(slot))
	for _, a := range slot {
		if containsID(excluded, a.MemberID) {
			continue
		}
		out = append(out, a)
	}
	return out
}

func containsID(ids []int64, id int64) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// DateCourse is one Course's opt-outs on a date as a PUT sends them: nil drops the date's own ones (back to
// the usual opt-outs); a non-nil list, empty included, replaces them (empty = everyone eats it).
type DateCourse struct {
	CourseID        int64
	OptOutMemberIDs []int64
}

// ReasonCourseNotInSlot is the reason for a date's Course the Meal Slot does not serve (field courses[i].courseId).
const ReasonCourseNotInSlot = "course_not_in_slot"

// ValidateDateCourses checks every Course of a date's PUT before anything is written: each must be one the
// Meal Slot serves (served is its CoursesOn), and each opt-out must be an existing Member (members). The first
// failure is a *ValidationError naming courses[i].
func ValidateDateCourses(served []CourseDay, members []Member, in []DateCourse) error {
	for i, c := range in {
		if !servesCourse(served, c.CourseID) {
			return &ValidationError{Field: fmt.Sprintf("courses[%d].courseId", i), Reason: ReasonCourseNotInSlot,
				Message: "the Meal Slot does not serve that Course"}
		}
		for _, m := range c.OptOutMemberIDs {
			if !hasMember(members, m) {
				return &ValidationError{Field: fmt.Sprintf("courses[%d].optOutMemberIds", i), Reason: ReasonMemberUnknown,
					Message: "that Member does not exist"}
			}
		}
	}
	return nil
}

func servesCourse(served []CourseDay, id int64) bool {
	for _, d := range served {
		if d.CourseID == id {
			return true
		}
	}
	return false
}

func hasMember(members []Member, id int64) bool {
	for _, m := range members {
		if m.ID == id {
			return true
		}
	}
	return false
}
