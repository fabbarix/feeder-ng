package httpapi

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/away"
	awaystore "github.com/fabbarix/feeder-ng/internal/away/store"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
)

// B9-24 (PC-08, ADR 0025): GET /api/plan says who is away. Each slot carries "away" (the Members an Away takes out of
// it), "everyoneAway", and "despiteAway" on an attendee who eats there anyway; the plan carries "away", the Aways that
// touch the dates it shows, so the day tile can say "Ben away all day" and open that Away.

// fillAwayOut copies what an Away does at the occurrence onto its JSON slot.
func fillAwayOut(out *slotOut, s runner.SlotView) {
	out.Away = append([]int64{}, s.Away...)
	out.EveryoneAway = s.EveryoneAway
	despite := map[int64]bool{}
	for _, id := range s.DespiteAway {
		despite[id] = true
	}
	for i := range out.Attendance {
		out.Attendance[i].DespiteAway = despite[out.Attendance[i].MemberID]
	}
}

// planAways lists the Aways that touch the dates of the slots, as the Away API shows them ([] when none).
func (n *names) planAways(ctx context.Context, slots []runner.SlotView) ([]awaystore.Wire, error) {
	out := []awaystore.Wire{}
	if len(slots) == 0 || n.aways == nil {
		return out, nil
	}
	from, to := slots[0].Key.Date, slots[len(slots)-1].Key.Date
	all, err := n.aways.Wires(ctx)
	if err != nil {
		return nil, err
	}
	for _, w := range all {
		if away.Touches(w.Away(), from, to) {
			out = append(out, w)
		}
	}
	return out, nil
}
