package household

// Course Attendance and a Meal Slot's Courses (ADR 0008 points 7 and 8, spec §3.1).
//
// Stubs of team A's design step (docs/dev/design/crs-a.md): the functions return zero values until
// the developer step fills them in.

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
func ValidateSlotCourses(courses []SlotCourseInput) error { return nil }

// NormalizeSlotCourses drops repeated Courses (the first wins) and repeated Members in each OptOutMemberIDs,
// keeping order; nil stays nil and a nil OptOutMemberIDs stays nil. It returns a copy.
func NormalizeSlotCourses(courses []SlotCourseInput) []SlotCourseInput { return nil }

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
func CourseAttendance(slot []Attendee, usual []int64, date *[]int64) []Attendee { return nil }
