package runner

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/away"
	awaystore "github.com/fabbarix/feeder-ng/internal/away/store"
	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/plan"
)

// B9-24 (PC-08, ADR 0025): who eats at a Meal Slot on a date, step by step: the usual Attendance, the date's override,
// then an Away takes the Member out unless the date marks them "Eats here anyway" (despiteAway); Course opt-outs and
// Guests follow. The Aways are read inside the write's transaction when there is one, so an Away write and its replan
// see the same Aways.

// querier is the write's transaction when the context carries one, else the database.
func (s *DBSources) querier(ctx context.Context) awaystore.Querier {
	if tx := txFrom(ctx); tx != nil {
		return tx
	}
	return s.db
}

// slotAway is what the Aways do at one Meal Slot occurrence.
type slotAway struct {
	aways   []away.Away
	slots   []away.Slot
	slot    away.Slot // its time is the occurrence's effective time
	date    string
	despite map[int64]bool
}

// out says whether an Away takes the Member out of the occurrence.
func (w *slotAway) out(memberID int64) bool {
	return w != nil && !w.despite[memberID] && away.AwayAt(w.aways, memberID, w.date, w.slot, w.slots)
}

// covered says whether an Away covers the Member at the occurrence, "Eats here anyway" or not.
func (w *slotAway) covered(memberID int64) bool {
	return w != nil && away.AwayAt(w.aways, memberID, w.date, w.slot, w.slots)
}

// awayAt reads what the Aways do at the Meal Slot on the date; nil when there is no Away at all.
func (s *DBSources) awayAt(ctx context.Context, mealSlotID int64, date string) (*slotAway, error) {
	if s.db == nil {
		return nil, nil
	}
	q := s.querier(ctx)
	loc, err := awaystore.Zone(ctx, q)
	if err != nil {
		return nil, err
	}
	aways, err := awaystore.All(ctx, q, loc)
	if err != nil || len(aways) == 0 {
		return nil, err
	}
	hs, err := s.hh.Slots(ctx)
	if err != nil {
		return nil, err
	}
	slots := awaystore.SlotsOf(hs)
	w := &slotAway{aways: aways, slots: slots, date: date, despite: map[int64]bool{}}
	for _, sl := range slots {
		if sl.ID == mealSlotID {
			w.slot = sl
		}
	}
	if w.slot.ID == 0 {
		return nil, nil // a removed Meal Slot is not planned
	}
	row, err := s.hh.SlotDate(ctx, mealSlotID, date)
	if err != nil {
		return nil, err
	}
	w.slot.Time = household.EffectiveTime(w.slot.Time, row)
	att, hasOverride, err := s.hh.DateAttendance(ctx, mealSlotID, date)
	if err != nil {
		return nil, err
	}
	if hasOverride {
		for _, a := range att {
			if a.DespiteAway {
				w.despite[a.MemberID] = true
			}
		}
	}
	return w, nil
}

// withoutAway is the Attendance less the Members an Away takes out (never nil when att is not).
func (s *DBSources) withoutAway(ctx context.Context, mealSlotID int64, date string, att []plan.Attendee) ([]plan.Attendee, error) {
	w, err := s.awayAt(ctx, mealSlotID, date)
	if err != nil || w == nil {
		return att, err
	}
	return filterAway(w, att), nil
}

// coursesWithoutAway takes the Members an Away takes out of every Course's Attendance.
func (s *DBSources) coursesWithoutAway(ctx context.Context, mealSlotID int64, date string, cs []plan.SlotCourse) ([]plan.SlotCourse, error) {
	w, err := s.awayAt(ctx, mealSlotID, date)
	if err != nil || w == nil {
		return cs, err
	}
	for i := range cs {
		cs[i].Attendance = filterAway(w, cs[i].Attendance)
	}
	return cs, nil
}

func filterAway(w *slotAway, att []plan.Attendee) []plan.Attendee {
	if att == nil {
		return nil
	}
	out := make([]plan.Attendee, 0, len(att))
	for _, a := range att {
		if !w.out(a.MemberID) {
			out = append(out, a)
		}
	}
	return out
}

// SlotAway is what an Away does at one Meal Slot occurrence, for the plan view: the Members of its Attendance an Away
// takes out, and those who eat there although they are away ("Eats here anyway"). Neither is nil.
type SlotAway struct {
	Away        []int64
	DespiteAway []int64
}

// awaySource is a Sources that knows about Away (DBSources); the plan view asks it when it is one.
type awaySource interface {
	AwayAt(ctx context.Context, mealSlotID int64, date string) (SlotAway, error)
}

// AwayAt implements awaySource: of the Members the usual Attendance or the date's override seats at the occurrence, who
// an Away takes out and who eats there anyway.
func (s *DBSources) AwayAt(ctx context.Context, mealSlotID int64, date string) (SlotAway, error) {
	out := SlotAway{Away: []int64{}, DespiteAway: []int64{}}
	w, err := s.awayAt(ctx, mealSlotID, date)
	if err != nil || w == nil {
		return out, err
	}
	slots, err := s.hh.Slots(ctx)
	if err != nil {
		return out, err
	}
	var usual []household.Attendee
	for _, m := range slots {
		if m.ID == mealSlotID {
			usual = m.Attendance
		}
	}
	override, hasOverride, err := s.hh.DateAttendance(ctx, mealSlotID, date)
	if err != nil {
		return out, err
	}
	for _, a := range household.ResolveAttendance(usual, override, hasOverride) {
		switch {
		case w.out(a.MemberID):
			out.Away = append(out.Away, a.MemberID)
		case a.DespiteAway && w.covered(a.MemberID):
			out.DespiteAway = append(out.DespiteAway, a.MemberID)
		}
	}
	return out, nil
}

// slotAwayOf asks the Sources what an Away does at the occurrence (nothing when it knows no Away).
func (r *Runner) slotAwayOf(ctx context.Context, key plan.Key) (SlotAway, error) {
	if src, ok := r.d.Source.(awaySource); ok {
		return src.AwayAt(ctx, key.MealSlotID, key.Date)
	}
	return SlotAway{Away: []int64{}, DespiteAway: []int64{}}, nil
}

// fillAway sets what an Away does at the occurrence on its view (View).
func (r *Runner) fillAway(ctx context.Context, si plan.SlotInfo, sv *SlotView) error {
	sa, err := r.slotAwayOf(ctx, si.Key)
	if err != nil {
		return err
	}
	sv.Away, sv.DespiteAway = sa.Away, sa.DespiteAway
	sv.EveryoneAway = len(sa.Away) > 0 && len(si.Attendance) == 0 && si.Guests == 0 && !si.NotServed
	return nil
}
