package household

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

// B9-04 removals (SAFE-02, ADR 0021): what Remove Member and Remove Meal Slot report and keep. The reads and the
// writes are in store.

// RestoreWindowMinutes is how long after a removal Undo brings everything back: a Member's snapshot, and a Meal
// Slot's To confirm rows.
const RestoreWindowMinutes = 10

// SlotImpact is what removing one Meal Slot does (read-only, GET /api/meal-slots/{id}/impact).
type SlotImpact struct {
	PlannedMeals []RemovedMeal // unresolved (state planned) whose slot time is still ahead, Pinned included: they go
	SlotRules    []RemovedRule // the slot's Slot Rules: they stop applying (they are kept for Undo)
	ToConfirm    []RemovedMeal // unresolved whose slot time has passed (today's included): they go, and Undo within RestoreWindowMinutes brings them back
	CookedKept   int           // Cooked and Not cooked meals that stay in the history
}

// MemberImpact is what removing one Member does (read-only, GET /api/members/{id}/impact).
type MemberImpact struct {
	Preferences int    // Favourites, Dislikes and Exclusions (Recipes and Ingredients)
	MealSlots   int    // active Meal Slots the Member usually attends
	SignInEmail string // the Member's address when it is not on the Allowlist, so their sign-in ends; "" otherwise
}

// RemovedSlot is one row of the Removed Meal Slots read: the removed Meal Slots with the same name removed together
// (at most a minute apart), with the Cooked and Not cooked meals they kept. RemovedAt is the newest of those removals.
type RemovedSlot struct {
	IDs       []int64
	Name      string
	Weekdays  []int // ascending
	Time      string
	RemovedAt string
	Cooked    int
	NotCooked int
}

// WeekdayName is the English name of an ISO weekday (1 Monday to 7 Sunday).
func WeekdayName(weekday int) string { return time.Weekday(weekday % 7).String() }

// SlotNameTakenMessage is what a refused Put back says (409 meal_slot_name_taken): "There is already a Dinner on Monday."
func SlotNameTakenMessage(name string, weekday int) string {
	return (&SlotNameTakenError{Name: name, Weekdays: []int{weekday}}).Message()
}

// ErrSlotRemoved: a batch Remove names a Meal Slot that is already removed (409 meal_slot_removed). The single
// DELETE answers 404 for it, as before.
var ErrSlotRemoved = errors.New("household: the Meal Slot is already removed")

// SlotIDError is a batch call refused because of one of its Meal Slots (B9-42): the whole call changes nothing, and
// the answer names the slot. Err is ErrNotFound or ErrSlotRemoved.
type SlotIDError struct {
	ID  int64
	Err error
}

func (e *SlotIDError) Error() string { return fmt.Sprintf("meal slot %d: %v", e.ID, e.Err) }
func (e *SlotIDError) Unwrap() error { return e.Err }

// SlotNameTakenError is a batch Put back refused because an active Meal Slot has the name on some of its weekdays
// (409 meal_slot_name_taken). Weekdays (ascending) and IDs (in the same order) are the slots that cannot come back.
type SlotNameTakenError struct {
	Name     string
	Weekdays []int
	IDs      []int64
}

func (e *SlotNameTakenError) Error() string { return "household: " + e.Message() }
func (e *SlotNameTakenError) Unwrap() error { return ErrSlotNameTaken }

// Message is the sentence the refusal shows: "There is already a Dinner on Monday and Wednesday."
func (e *SlotNameTakenError) Message() string {
	days := append([]int(nil), e.Weekdays...)
	sort.Ints(days)
	names := make([]string, len(days))
	for i, d := range days {
		names[i] = WeekdayName(d)
	}
	list := strings.Join(names, ", ")
	if n := len(names); n > 1 {
		list = strings.Join(names[:n-1], ", ") + " and " + names[n-1]
	}
	return "There is already a " + e.Name + " on " + list + "."
}

// ValidateSlotIDs checks the ids of a batch Remove or Put back: at least one, each positive, none twice.
func ValidateSlotIDs(ids []int64) error {
	if len(ids) == 0 {
		return &ValidationError{Field: "ids", Message: "Name at least one Meal Slot."}
	}
	seen := make(map[int64]bool, len(ids))
	for _, id := range ids {
		if id <= 0 {
			return &ValidationError{Field: "ids", Message: "A Meal Slot id is a positive number."}
		}
		if seen[id] {
			return &ValidationError{Field: "ids", Message: "Name each Meal Slot once."}
		}
		seen[id] = true
	}
	return nil
}
