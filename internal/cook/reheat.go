package cook

import "math"

// The Reheat length of a Leftover-served Course. This mirrors web/src/features/cook/lib/reheat.ts
// (defaultReheatSeconds), which Cook Mode's Reheat timer uses, so the timeline places the same
// length the Reheat screen starts. Design: docs/dev/design/r12-reheat.md.
const (
	reheatBaseSeconds       = 120
	reheatPerPortionSeconds = 60
	reheatDefaultCapSeconds = 600
	reheatMinSeconds        = 30
	reheatMaxSeconds        = 30 * 60
)

// DefaultReheatSeconds is the default Reheat time for a Planned Meal of portions Leftover portions:
// the Recipe's own reheatMinutes when set (1 to 30, flat, not scaled by portions), else the formula
// 120 s plus 60 s per extra portion, capped at 600 s. reheatMinutes 0 means none.
func DefaultReheatSeconds(portions float64, reheatMinutes int) int {
	if reheatMinutes > 0 {
		return min(reheatMaxSeconds, max(reheatMinSeconds, reheatMinutes*60))
	}
	if math.IsNaN(portions) || math.IsInf(portions, 0) || portions < 1 {
		return reheatBaseSeconds
	}
	extra := int(math.Ceil(portions)) - 1
	return min(reheatDefaultCapSeconds, reheatBaseSeconds+extra*reheatPerPortionSeconds)
}
