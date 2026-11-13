package planner

import (
	"encoding/binary"
	"hash/fnv"
	"math"
	"sort"
)

// Plan fills the empty slots of the horizon (§7.2). Existing Pinned, Cooked and
// skipped meals are never touched. Unpinned Planned meals are kept when still
// valid (Recipe not archived, nobody attending has an Exclusion on it, enough
// Batches for the attendance, and a Leftover source that still covers it) and
// otherwise replanned.
func Plan(in Input) (Result, error) { return run(in, false) }

// Regenerate redoes every unpinned, uncooked Planned Meal: Planned meals are
// treated as empty slots. Use a new Seed for a different plan.
func Regenerate(in Input) (Result, error) { return run(in, true) }

// Swap returns the top 3 alternatives for the slot under the same scoring,
// excluding the slot's current Recipe. Slot Rules are ignored (the User is
// overriding them); all other filters apply; Leftovers are not offered. The
// slot's current meal is dropped from the walk; other existing meals stay as
// they are. Input is not modified. Errors: ErrUnknownSlot, ErrSlotNotSwappable.
func Swap(in Input, key SlotKey) ([]Placement, error) {
	st, err := newState(in, false, &key)
	if err != nil {
		return nil, err
	}
	i := st.swapIdx
	s := st.slots[i]
	if s.Existing != nil && (s.Existing.State == MealCooked || s.Existing.State == MealSkipped) {
		return nil, ErrSlotNotSwappable
	}
	// Walk the earlier slots so the target sees their Stock use, cool-down and Leftovers.
	st.walk(i)

	portions := s.Portions()
	if portions <= eps {
		return nil, nil
	}
	opts := evalOpts{ignoreRules: true, swap: true}
	if s.Existing != nil {
		opts.exclude, opts.hasExclude = s.Existing.RecipeID, true
	}
	strict, soft, _, _ := st.evaluate(i, portions, opts)
	sortCandidates(strict)
	if len(strict) > 3 {
		strict = strict[:3]
	}
	// Relaxed alternatives fill the list up to 3, in the relaxed order (ADR 0009).
	picks := append([]breakdown(nil), strict...)
	sort.SliceStable(soft, func(a, b int) bool { return st.relaxedBefore(i, soft[a], soft[b]) })
	for _, c := range soft {
		if len(picks) >= 3 {
			break
		}
		picks = append(picks, c.b)
	}
	out := make([]Placement, 0, len(picks))
	for _, b := range picks {
		c := st.clone()
		out = append(out, c.placeFresh(i, b, portions, nil))
	}
	return out, nil
}

// WeightsFor maps a Planner Style position to weights: 0 = "Use what we
// have", 0.5 = Variety (the spec's default weights), 1 = "Favourites",
// piecewise linear in between. Out-of-range positions clamp; NaN means 0.5.
func WeightsFor(style float64) Weights {
	if math.IsNaN(style) {
		style = 0.5
	}
	style = math.Max(0, math.Min(1, style))
	if style <= 0.5 {
		return lerpWeights(styleUseWhatWeHave, styleVariety, style/0.5)
	}
	return lerpWeights(styleVariety, styleFavourites, (style-0.5)/0.5)
}

// The three Planner Style anchors (§3 of the design note, t3-planner-core).
var (
	styleUseWhatWeHave = Weights{Favourite: 2, Dislike: -2, PerishableUse: 6, IngredientOverlap: 3, StockCoverage: 2, LeftoverFits: 1, LeftoverWasted: -1, Recency: -0.25, Jitter: 0.5}
	styleVariety       = Weights{Favourite: 2, Dislike: -2, PerishableUse: 3, IngredientOverlap: 1.5, StockCoverage: 0.75, LeftoverFits: 1, LeftoverWasted: -1, Recency: -1, Jitter: 0.75}
	styleFavourites    = Weights{Favourite: 5, Dislike: -3, PerishableUse: 2, IngredientOverlap: 1, StockCoverage: 0.5, LeftoverFits: 1, LeftoverWasted: -1, Recency: -0.25, Jitter: 0.5}
)

func lerpWeights(a, b Weights, t float64) Weights {
	l := func(x, y float64) float64 { return x + (y-x)*t }
	return Weights{
		Favourite:         l(a.Favourite, b.Favourite),
		Dislike:           l(a.Dislike, b.Dislike),
		PerishableUse:     l(a.PerishableUse, b.PerishableUse),
		IngredientOverlap: l(a.IngredientOverlap, b.IngredientOverlap),
		StockCoverage:     l(a.StockCoverage, b.StockCoverage),
		LeftoverFits:      l(a.LeftoverFits, b.LeftoverFits),
		LeftoverWasted:    l(a.LeftoverWasted, b.LeftoverWasted),
		Recency:           l(a.Recency, b.Recency),
		Jitter:            l(a.Jitter, b.Jitter),
	}
}

// JitterFor is the seeded jitter in [-amplitude, +amplitude] for one candidate
// in one slot. It is a pure function of its arguments (no math/rand state).
func JitterFor(seed int64, key SlotKey, recipe RecipeID, amplitude float64) float64 {
	if amplitude == 0 {
		return 0
	}
	h := fnv.New64a()
	var buf [8]byte
	put := func(v uint64) {
		binary.LittleEndian.PutUint64(buf[:], v)
		h.Write(buf[:])
	}
	put(uint64(seed))
	h.Write([]byte(key.Date))
	h.Write([]byte{0})
	put(uint64(key.MealSlotID))
	if key.CourseID != 0 { // Course 0 keeps its old values (a single-Course Household plans as before)
		put(uint64(key.CourseID))
	}
	put(uint64(recipe))
	x := mix64(h.Sum64())
	u := float64(x>>11) / float64(uint64(1)<<53) // uniform in [0, 1)
	return amplitude * (2*u - 1)
}

// mix64 is the splitmix64 finaliser: it spreads FNV output over all 64 bits.
func mix64(x uint64) uint64 {
	x ^= x >> 30
	x *= 0xbf58476d1ce4e5b9
	x ^= x >> 27
	x *= 0x94d049bb133111eb
	x ^= x >> 31
	return x
}

// PortionsNeeded is the sum of the Portion Factors of the attendance.
func PortionsNeeded(att []Attendee) float64 {
	var sum float64
	for _, a := range att {
		sum += a.PortionFactor
	}
	return sum
}

// BatchesFor is ceil(portions / yield), tolerant of float error
// (0.9 / 0.3 is 3 batches, not 4). Yield must be > 0.
func BatchesFor(portions, yield float64) int {
	if portions <= eps || yield <= 0 {
		return 0
	}
	n := int(math.Ceil(portions/yield - 1e-9))
	if n < 1 {
		n = 1
	}
	return n
}

func run(in Input, regen bool) (Result, error) {
	st, err := newState(in, regen, nil)
	if err != nil {
		return Result{}, err
	}
	st.walk(len(st.slots))
	return st.result(), nil
}
