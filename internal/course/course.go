// Package course holds the pure rules of Courses (ADR 0008, functional spec §3.1): the
// name key, name and order validation, the main-flag move, what Delete or Archive changes
// and where the replacement Course goes. It has no SQL or HTTP; internal/course/store
// persists it and internal/course/httpapi (team C) serves it.
package course

import (
	"errors"
	"strings"
	"unicode/utf8"
)

// Limits (spec §3.1).
const (
	MaxCourses   = 20 // Courses in the list; archived ones do not count
	MaxNameRunes = 40
)

// Errors. Each maps to one API code (spec §16).
var (
	ErrNotFound    = errors.New("course: not found")                       // 404
	ErrNameInvalid = errors.New("course: a name needs 1 to 40 characters") // 422 validation_failed, field name
	ErrNameTaken   = errors.New("course: name already used")               // 409 course_name_taken
	ErrTooMany     = errors.New("course: at most 20 Courses")              // 422 too_many_courses
	ErrOrder       = errors.New("course: order must list every Course once")
	ErrMain        = errors.New("course: the main Course cannot be removed")                   // 409 course_main
	ErrLast        = errors.New("course: the last Course cannot be removed")                   // 409 course_last
	ErrPlanned     = errors.New("course: a Planned Meal or Leftover uses it; archive it")      // 409 course_planned
	ErrArchived    = errors.New("course: the Course is archived")                              // main on an archived Course: 422
	ErrReplacement = errors.New("course: replacement missing, archived, or the Course itself") // 422, field replacement
)

// Course is one Course of the Household.
type Course struct {
	ID       int64
	Name     string
	Position int // household order, 0-based among all Courses (archived ones keep theirs)
	Main     bool
	Archived bool
}

// Listing is a Course with the counts GET /api/courses shows.
type Listing struct {
	Course
	RecipeCount   int  // Recipes marked with it, archived Recipes included
	MealSlotCount int  // Meal Slots that serve it
	Planned       bool // any Planned Meal or Leftover refers to it, any state
}

// ImpactMeal is an unresolved Planned Meal (state planned, date from today on) in the Course.
type ImpactMeal struct {
	Date         string
	MealSlotID   int64
	MealSlotName string
	RecipeID     int64
	RecipeName   string
	Pinned       bool
}

// ImpactRule is a Slot Rule on the Course.
type ImpactRule struct {
	ID         int64
	MealSlotID int64
	RecipeID   int64 // 0 for a rule by Tag
	Tag        string
}

// Impact is what a Delete or Archive of a Course changes (GET /api/courses/{id}/impact).
type Impact struct {
	Planned           bool
	Recipes           int // Recipes marked with the Course
	RecipesOnlyThis   int // of those, Recipes with no other Course
	MealSlots         int
	MealSlotsOnlyThis int
	PlannedMeals      []ImpactMeal // unresolved, from today on, Pinned ones included, by date then slot
	SlotRules         []ImpactRule
}

// NameKey is the one key for Course names: trimmed, inner whitespace collapsed, lower-cased
// (the same rule as recipe.TagKey; accents count, no folding).
func NameKey(name string) string { return strings.ToLower(collapse(name)) }

func collapse(s string) string { return strings.Join(strings.Fields(s), " ") }

// CleanName trims and collapses a name and checks 1 to 40 characters (ErrNameInvalid).
func CleanName(name string) (string, error) {
	clean := collapse(name)
	if n := utf8.RuneCountInString(clean); n < 1 || n > MaxNameRunes {
		return "", ErrNameInvalid
	}
	return clean, nil
}

// CheckOrder reports ErrOrder unless ids is a permutation of listed (every Course once, no
// unknown or repeated id).
func CheckOrder(listed, ids []int64) error {
	if len(ids) != len(listed) {
		return ErrOrder
	}
	known := make(map[int64]bool, len(listed))
	for _, id := range listed {
		known[id] = true
	}
	seen := make(map[int64]bool, len(ids))
	for _, id := range ids {
		if !known[id] || seen[id] {
			return ErrOrder
		}
		seen[id] = true
	}
	return nil
}

// MoveMain returns list with the main flag moved to id in one step: exactly one Course is main
// afterwards, nothing else changes. ErrNotFound for an unknown id, ErrArchived for an archived one.
// The input slice is not modified.
func MoveMain(list []Course, id int64) ([]Course, error) {
	found := false
	for _, c := range list {
		if c.ID != id {
			continue
		}
		if c.Archived {
			return nil, ErrArchived
		}
		found = true
	}
	if !found {
		return nil, ErrNotFound
	}
	out := make([]Course, len(list))
	for i, c := range list {
		c.Main = c.ID == id
		out[i] = c
	}
	return out, nil
}

// CanRemove checks c may be deleted or archived given the active (not archived) Courses:
// ErrMain for the main Course (checked first), ErrLast when it is the only active one.
func CanRemove(c Course, active []Course) error {
	if c.Main {
		return ErrMain
	}
	if len(active) <= 1 {
		return ErrLast
	}
	return nil
}

// Removal is how a Course goes.
type Removal string

// Removal kinds: a Course that was never planned is deleted for good; one that was is archived.
const (
	RemoveDelete  Removal = "delete"
	RemoveArchive Removal = "archive"
)

// RemovalFor says which of the two a Course gets: Archive when planned (any Planned Meal or
// Leftover refers to it), else Delete.
func RemovalFor(planned bool) Removal {
	if planned {
		return RemoveArchive
	}
	return RemoveDelete
}

// CheckReplacement validates the replacement Course of a removal: replacementID 0 is "none given";
// it is an error (ErrReplacement) when needed and none is given, when given and not among the
// active Courses, or when it is the removed Course itself.
func CheckReplacement(removedID, replacementID int64, activeIDs []int64, needed bool) error {
	if replacementID == 0 {
		if needed {
			return ErrReplacement
		}
		return nil
	}
	if replacementID == removedID {
		return ErrReplacement
	}
	for _, id := range activeIDs {
		if id == replacementID {
			return nil
		}
	}
	return ErrReplacement
}

// Reassign says what the Course lists of Recipes (or Meal Slots) become when removed goes. owners
// maps an owner id to its Course ids in order. Only owners that change are returned: one that has
// other Courses just loses removed (order kept); one left with none gets [replacement]; one that
// already has replacement and removed just loses removed; owners without removed are absent.
func Reassign(owners map[int64][]int64, removed, replacement int64) map[int64][]int64 {
	out := map[int64][]int64{}
	for owner, ids := range owners {
		hasRemoved := false
		kept := make([]int64, 0, len(ids))
		for _, id := range ids {
			if id == removed {
				hasRemoved = true
				continue
			}
			kept = append(kept, id)
		}
		if !hasRemoved {
			continue
		}
		if len(kept) == 0 && replacement != 0 {
			kept = append(kept, replacement)
		}
		out[owner] = kept
	}
	return out
}
