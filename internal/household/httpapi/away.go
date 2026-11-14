package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/away"
	awaystore "github.com/fabbarix/feeder-ng/internal/away/store"
	"github.com/fabbarix/feeder-ng/internal/household"
)

// B9-24 (PC-08, ADR 0025): Who's eating and the slot-date read know who is away. An Away takes a Member out of the
// Meal Slot unless the date's Who's eating marks them "Eats here anyway" (despiteAway), which is kept only for a Member
// an Away covers there.

// dateAwayOut is one Member an Away covers at the Meal Slot on the date, for the away rows of Who's eating.
type dateAwayOut struct {
	MemberID          int64   `json:"memberId"`
	MemberName        string  `json:"memberName"`
	AwayID            int64   `json:"awayId"`
	From              string  `json:"from"`
	FromMealSlotID    *int64  `json:"fromMealSlotId"`
	Through           *string `json:"through"`
	ThroughMealSlotID *int64  `json:"throughMealSlotId"`
}

// awayHere is what the Aways do at one Meal Slot on one date: the Away covering each Member it covers there.
type awayHere struct {
	byMember map[int64]away.Away
	list     []dateAwayOut // soonest Away first
}

// covers says whether an Away covers the Member here.
func (h awayHere) covers(memberID int64) bool {
	_, ok := h.byMember[memberID]
	return ok
}

// eaters is att less the Members an Away takes out (not those who eat here anyway).
func (h awayHere) eaters(att []household.Attendee) []household.Attendee {
	out := make([]household.Attendee, 0, len(att))
	for _, a := range att {
		if a.DespiteAway || !h.covers(a.MemberID) {
			out = append(out, a)
		}
	}
	return out
}

// keepDespite drops "Eats here anyway" from the Members no Away covers here.
func (h awayHere) keepDespite(att []household.Attendee) []household.Attendee {
	for i := range att {
		if att[i].DespiteAway && !h.covers(att[i].MemberID) {
			att[i].DespiteAway = false
		}
	}
	return att
}

// awayHere reads the Aways that cover the Meal Slot on the date, at its effective time.
func (a *api) awayHere(r *http.Request, slot household.MealSlot, date string) (awayHere, error) {
	ctx := r.Context()
	h := awayHere{byMember: map[int64]away.Away{}, list: []dateAwayOut{}}
	loc, err := awaystore.Zone(ctx, a.d.DB)
	if err != nil {
		return h, err
	}
	stored, err := awaystore.All(ctx, a.d.DB, loc)
	if err != nil {
		return h, err
	}
	var all []away.Away // only an Away whose dates reach this one can cover it
	for _, x := range stored {
		if away.Touches(x, date, date) {
			all = append(all, x)
		}
	}
	if len(all) == 0 {
		return h, nil
	}
	hs, err := a.st.Slots(ctx)
	if err != nil {
		return h, err
	}
	slots := awaystore.SlotsOf(hs)
	row, err := a.st.SlotDate(ctx, slot.ID, date)
	if err != nil {
		return h, err
	}
	names, err := awaystore.MemberNames(ctx, a.d.DB)
	if err != nil {
		return h, err
	}
	occ := away.Slot{ID: slot.ID, Weekday: slot.Weekday, Time: household.EffectiveTime(slot.Time, row)}
	for _, x := range all {
		if _, seen := h.byMember[x.MemberID]; seen || !away.Covers(x, date, occ, slots) {
			continue
		}
		h.byMember[x.MemberID] = x
		w := awaystore.WireOf(x, names[x.MemberID], false)
		h.list = append(h.list, dateAwayOut{MemberID: x.MemberID, MemberName: w.MemberName, AwayID: x.ID, From: w.From,
			FromMealSlotID: w.FromMealSlotID, Through: w.Through, ThroughMealSlotID: w.ThroughMealSlotID})
	}
	return h, nil
}

// awayMemberIDs lists the Members an Away covers here ([] when none).
func (h awayHere) awayMemberIDs() []int64 {
	out := make([]int64, 0, len(h.list))
	for _, x := range h.list {
		out = append(out, x.MemberID)
	}
	return out
}
