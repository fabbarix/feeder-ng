// Package cook: the cooking timeline of a Meal Slot (spec §11, ADR 0008
// point 9). Pure: no HTTP, SQL or clock.
package cook

import (
	"errors"
	"fmt"
	"sort"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

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

// ErrInvalidCourse is wrapped by the errors Timeline returns for a Course it
// cannot place (bad Steps, a Reheat without a length, a duplicate id).
var ErrInvalidCourse = errors.New("invalid course")

// block is one Course's items at their own offsets, rigid: ends at length.
type block struct {
	pos    int // index in the slot's Course order
	reheat bool
	length int
	items  []Item // StartSeconds/EndSeconds relative to the block start
}

// Timeline builds the cooking timeline of a slot from its Courses (in slot
// order), per spec §11: each fresh Course keeps its schedule.Compute schedule
// as one rigid block; blocks are placed Reheat first, then by longer length,
// then by slot order, each at the latest position ending at or before E where
// none of its Active items overlaps an already placed Active item. The result
// is shifted to start at 0. Pure and deterministic; the input is not modified.
func Timeline(courses []Course) (Result, error) {
	seen := map[int64]bool{}
	blocks := make([]block, 0, len(courses))
	for pos, c := range courses {
		if seen[c.ID] {
			return Result{}, fmt.Errorf("%w: duplicate course %d", ErrInvalidCourse, c.ID)
		}
		seen[c.ID] = true
		b := block{pos: pos}
		switch {
		case c.Reheat:
			if c.ReheatSeconds <= 0 {
				return Result{}, fmt.Errorf("%w: course %d: reheat needs a length", ErrInvalidCourse, c.ID)
			}
			b.reheat, b.length = true, c.ReheatSeconds
			b.items = []Item{{CourseID: c.ID, Kind: ItemReheat, StepIndex: -1, StepKind: schedule.Passive, EndSeconds: c.ReheatSeconds}}
		default:
			sc, err := schedule.Compute(c.Steps)
			if err != nil {
				return Result{}, fmt.Errorf("%w: course %d: %w", ErrInvalidCourse, c.ID, err)
			}
			if len(sc.Steps) == 0 {
				b.items = []Item{{CourseID: c.ID, Kind: ItemServe, StepIndex: -1, StepKind: schedule.Active}}
				break
			}
			b.length = sc.TotalMinutes * 60
			for _, t := range sc.Steps {
				b.items = append(b.items, Item{CourseID: c.ID, Kind: ItemStep, StepIndex: t.Index,
					StepKind: c.Steps[t.Index].Kind, StartSeconds: t.Start * 60, EndSeconds: t.End * 60})
			}
		}
		blocks = append(blocks, b)
	}
	sort.SliceStable(blocks, func(i, j int) bool {
		a, b := blocks[i], blocks[j]
		if a.reheat != b.reheat {
			return a.reheat
		}
		if a.length != b.length {
			return a.length > b.length
		}
		return a.pos < b.pos
	})

	// Work with E = 0 and times <= 0; shift at the end.
	var placed []Item
	var all []Item
	posOf := map[int64]int{}
	for _, b := range blocks {
		d := latestShift(b, placed)
		for _, it := range b.items {
			it.StartSeconds += d - b.length
			it.EndSeconds += d - b.length
			placed = append(placed, it)
		}
		posOf[b.items[0].CourseID] = b.pos
	}
	all = placed
	total := 0
	for _, it := range all {
		if -it.StartSeconds > total {
			total = -it.StartSeconds
		}
	}
	for i := range all {
		all[i].StartSeconds += total
		all[i].EndSeconds += total
	}
	sort.SliceStable(all, func(i, j int) bool {
		a, b := all[i], all[j]
		if a.StartSeconds != b.StartSeconds {
			return a.StartSeconds < b.StartSeconds
		}
		if pa, pb := posOf[a.CourseID], posOf[b.CourseID]; pa != pb {
			return pa < pb
		}
		return a.StepIndex < b.StepIndex
	})
	return Result{Items: all, TotalSeconds: total}, nil
}

// clashes reports whether two items are Active, non-empty and overlap
// (half-open intervals).
func clashes(a, b Item) bool {
	if a.StepKind != schedule.Active || b.StepKind != schedule.Active ||
		a.EndSeconds == a.StartSeconds || b.EndSeconds == b.StartSeconds {
		return false
	}
	return a.StartSeconds < b.EndSeconds && b.StartSeconds < a.EndSeconds
}

// latestShift returns the largest d <= 0 such that the block, ending at d,
// has no Active item overlapping a placed one. The block's items are relative
// to its start, so an item sits at [Start+d-length, End+d-length).
func latestShift(b block, placed []Item) int {
	cands := []int{0}
	for _, p := range placed {
		if p.StepKind != schedule.Active || p.EndSeconds == p.StartSeconds {
			continue
		}
		for _, it := range b.items {
			if it.StepKind != schedule.Active || it.EndSeconds == it.StartSeconds {
				continue
			}
			// it ends where p starts, or it starts where p ends.
			cands = append(cands, p.StartSeconds-it.EndSeconds+b.length, p.EndSeconds-it.StartSeconds+b.length)
		}
	}
	sort.Sort(sort.Reverse(sort.IntSlice(cands)))
	for _, d := range cands {
		if d > 0 {
			continue
		}
		ok := true
		for _, it := range b.items {
			it.StartSeconds += d - b.length
			it.EndSeconds += d - b.length
			for _, p := range placed {
				if clashes(it, p) {
					ok = false
					break
				}
			}
			if !ok {
				break
			}
		}
		if ok {
			return d
		}
	}
	return 0 // unreachable: the far-left candidate is always valid
}
