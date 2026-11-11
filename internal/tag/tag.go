// Package tag holds the pure rules of Tags (ADR 0010, functional spec §4.1 and §17): the name
// key, name validation, the colour palette and the next colour, and the Merge outcome for Slot
// Rules and Variety Rules. It has no SQL or HTTP; internal/tag/store persists it and
// internal/tag/httpapi (TG-API) serves it. It must not import internal/recipe.
package tag

import (
	"errors"
	"strings"
	"unicode/utf8"
)

// MaxNameRunes is the longest Tag name.
const MaxNameRunes = 40

// Palette is the closed set of Tag colour ids, in palette order (ADR 0010 point 7).
var Palette = []string{"tomato", "apricot", "mustard", "olive", "sage", "teal", "sky", "blue", "plum", "rose"}

// Errors. Each maps to one API code (tg-plan §3.1).
var (
	ErrNotFound      = errors.New("tag: not found")                        // 404
	ErrNameInvalid   = errors.New("tag: a name needs 1 to 40 characters")  // 422 tag_invalid, field name
	ErrColourUnknown = errors.New("tag: colour is not in the palette")     // 422 colour_unknown, field colour
	ErrMergeSelf     = errors.New("tag: cannot merge a Tag into itself")   // 422, field into
	ErrMergeTarget   = errors.New("tag: the Tag to merge into is unknown") // 422, field into
)

// NameTakenError is returned when a name's key is already another Tag's (409 tag_name_taken).
// Tag is that other Tag, so the page can offer "Merge fish into Seafood?".
type NameTakenError struct{ Tag Tag }

func (e *NameTakenError) Error() string { return "tag: name already used by " + e.Tag.Name }

// Tag is one Tag of the Household.
type Tag struct {
	ID     int64
	Key    string // NameKey(Name)
	Name   string // first spelling kept, until renamed
	Colour string // a Palette id
}

// Listing is a Tag with the counts GET /api/tags shows.
type Listing struct {
	Tag
	Recipes     int  // Recipes carrying it, archived ones included
	SlotRules   int  // Slot Rules that name its key
	VarietyRule bool // a Variety Rule names its key
}

// ImpactSlotRule is a Slot Rule that names the Tag, with where it applies.
type ImpactSlotRule struct {
	ID           int64
	MealSlotID   int64
	MealSlotName string
	Weekday      int // the Meal Slot's weekday
	CourseID     int64
	CourseName   string
}

// ImpactVariety is the Variety Rule that names the Tag.
type ImpactVariety struct {
	MaxPerWeek         int
	NotConsecutiveDays bool
}

// Impact is what a Rename onto a rule key, a Merge or a Delete of the Tag touches
// (GET /api/tags/{id}/impact).
type Impact struct {
	Tag
	Recipes     int
	SlotRules   []ImpactSlotRule // by Meal Slot weekday, time, id, then Course position
	VarietyRule *ImpactVariety   // nil when none
}

// NameKey is the one key for Tag names: trimmed, inner whitespace collapsed, lower-cased
// (accents count, no folding). recipe.TagKey calls it.
func NameKey(name string) string { return strings.ToLower(collapse(name)) }

func collapse(s string) string { return strings.Join(strings.Fields(s), " ") }

// CleanName trims and collapses a name and checks 1 to 40 characters (ErrNameInvalid).
// Case is kept.
func CleanName(name string) (string, error) {
	clean := collapse(name)
	if n := utf8.RuneCountInString(clean); n < 1 || n > MaxNameRunes {
		return "", ErrNameInvalid
	}
	return clean, nil
}

// ValidColour reports whether id is in the Palette.
func ValidColour(id string) bool {
	for _, p := range Palette {
		if p == id {
			return true
		}
	}
	return false
}

// NextColour returns the Palette colour carried by the fewest Tags (counts maps colour id to
// Tags); ties go to the earliest in palette order. Ids outside the Palette are ignored.
func NextColour(counts map[string]int) string {
	return "" // stub (TG-A developer)
}

// Slot is the place of a Slot Rule by Tag: its Meal Slot and Course.
type Slot struct{ MealSlotID, CourseID int64 }

// RuleSet is the rules that name one Tag key: the Slot Rules (one Slot each) and whether a
// Variety Rule exists.
type RuleSet struct {
	Slots   []Slot
	Variety bool
}

// MergeOutcome says what happens to the source's rules when they meet the target's
// (ADR 0010 points 4 and 5).
type MergeOutcome struct {
	MoveSlots   []Slot // source Slot Rules that now name the target, input order
	DropSlots   []Slot // source Slot Rules dropped: the target has one on the same Meal Slot and Course
	MoveVariety bool   // the source's Variety Rule now names the target (the target has none)
	DropVariety bool   // the source's Variety Rule is dropped (the target's wins)
}

// Merge computes the outcome of moving src's rules onto into's key. Pure: a duplicate Slot
// Rule goes, the target's Variety Rule wins. A source Slot repeated in src is moved once.
func Merge(src, into RuleSet) MergeOutcome {
	return MergeOutcome{} // stub (TG-A developer)
}
