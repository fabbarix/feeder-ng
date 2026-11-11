// Package cook: the cooking timeline of a Meal Slot (spec §11, ADR 0008
// point 9). Pure: no HTTP, SQL or clock.
package cook

import "github.com/fabbarix/feeder-ng/internal/recipe/schedule"

// ItemKind says what a timeline Item is.
type ItemKind string

// The three kinds of timeline Item.
const (
	ItemStep   ItemKind = "step"   // a non-Advance Step of a fresh Course
	ItemReheat ItemKind = "reheat" // a Leftover Course's Reheat (passive)
	ItemServe  ItemKind = "serve"  // a fresh Course without Steps (active, zero length)
)

// Course is one Course of the slot, in the slot's Course order.
type Course struct {
	ID            int64
	Reheat        bool            // a Leftover Course: one Reheat item, Steps ignored
	ReheatSeconds int             // Reheat only: its length, > 0
	Steps         []schedule.Step // fresh Course: the Recipe's Steps
}

// Item is one entry of the timeline. Times are whole seconds from the start of
// the timeline, half-open [StartSeconds, EndSeconds).
type Item struct {
	CourseID     int64
	Kind         ItemKind
	StepIndex    int           // Recipe Step index; -1 for Reheat and Serve
	StepKind     schedule.Kind // Active or Passive (Reheat is Passive, Serve Active)
	StartSeconds int
	EndSeconds   int
}

// Result is the cooking timeline: Items ordered by start, ties by the slot's
// Course order, then Recipe Step order. Every item ends at or before
// TotalSeconds; the slot time is TotalSeconds.
type Result struct {
	Items        []Item
	TotalSeconds int
}

// Timeline builds the cooking timeline. See spec §11, "How the timeline is built".
func Timeline(courses []Course) (Result, error) {
	return Result{}, nil
}
