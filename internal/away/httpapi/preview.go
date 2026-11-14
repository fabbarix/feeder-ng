package httpapi

import (
	"net/http"
	"sort"

	"github.com/fabbarix/feeder-ng/internal/away"
	"github.com/fabbarix/feeder-ng/internal/away/store"
	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
)

// The dry run (?dryRun=1) of a new or changed Away: the Meal Slots of the Planning Horizon it leaves the Member out of,
// each with its portions now and with the Away, by day (for a change, also the Meal Slots it gives back whose portions
// change, marked "back" and not counted in slotsWithout, so "9 Meal Slots without Ben" counts only those he misses); and from when, past the horizon, the planner plans without
// them. Nothing is written, nothing is published and no token is issued.

type previewSlotOut struct {
	MealSlotID     int64   `json:"mealSlotId"`
	MealSlotName   string  `json:"mealSlotName"`
	Time           string  `json:"time"`
	PortionsBefore float64 `json:"portionsBefore"`
	PortionsAfter  float64 `json:"portionsAfter"`
	Changes        bool    `json:"changes"`
	// Back is a Meal Slot the stored Away covered and the changed one gives back (a PATCH): not counted in slotsWithout.
	Back bool `json:"back"`
}

type previewDayOut struct {
	Date  string           `json:"date"`
	Slots []previewSlotOut `json:"slots"`
}

type previewOut struct {
	SlotsWithout  int             `json:"slotsWithout"`
	MealsChanged  int             `json:"mealsChanged"`
	Days          []previewDayOut `json:"days"`
	BeyondHorizon *string         `json:"beyondHorizon"`
}

// preview answers the dry run of x (before is the stored Away when x changes it).
func (a *api) preview(w http.ResponseWriter, r *http.Request, sc scene, x away.Away, before *away.Away) {
	meals, horizonEnd, err := a.previewMeals(r, sc, x, before)
	if err != nil {
		writeErr(w, err, "")
		return
	}
	s := away.Summarise(meals)
	out := previewOut{SlotsWithout: s.SlotsWithout, MealsChanged: s.MealsChanged, Days: []previewDayOut{}}
	for _, d := range s.Days {
		day := previewDayOut{Date: d.Date, Slots: []previewSlotOut{}}
		for _, m := range d.Meals {
			day.Slots = append(day.Slots, previewSlotOut{MealSlotID: m.MealSlotID, MealSlotName: m.MealSlotName, Time: m.Time,
				PortionsBefore: m.Before, PortionsAfter: m.After, Changes: m.Changed(), Back: m.Back})
		}
		out.Days = append(out.Days, day)
	}
	if b := away.BeyondHorizon(x, horizonEnd); b != "" {
		out.BeyondHorizon = &b
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// previewMeals reads, for every Meal Slot of the Planning Horizon that has not started and is served, who eats there,
// and keeps those x covers (and those the stored Away covered that x gives back): portions now, and with x.
func (a *api) previewMeals(r *http.Request, sc scene, x away.Away, before *away.Away) ([]away.Meal, string, error) {
	ctx := r.Context()
	all, err := store.All(ctx, a.d.DB, sc.loc)
	if err != nil {
		return nil, "", err
	}
	with := away.Replace(all, x)
	days, err := store.HorizonDays(ctx, a.d.DB)
	if err != nil {
		return nil, "", err
	}
	dates := plan.HorizonDates(sc.today, days)
	horizonEnd := sc.today
	if len(dates) > 0 {
		horizonEnd = dates[len(dates)-1]
	}
	slots, err := a.hh.Slots(ctx)
	if err != nil {
		return nil, "", err
	}
	sort.SliceStable(slots, func(i, j int) bool { return slots[i].Time < slots[j].Time })
	members, err := a.hh.Members(ctx)
	if err != nil {
		return nil, "", err
	}
	byID := make(map[int64]household.Member, len(members))
	for _, m := range members {
		byID[m.ID] = m
	}
	now := sc.now.Format("2006-01-02 15:04")
	var meals []away.Meal
	for _, date := range dates {
		for _, ms := range slots {
			if ms.Weekday != away.Weekday(date) {
				continue
			}
			row, err := a.hh.SlotDate(ctx, ms.ID, date)
			if err != nil {
				return nil, "", err
			}
			at := household.EffectiveTime(ms.Time, row)
			if date+" "+at <= now {
				continue // started: it never changes
			}
			att, hasOverride, err := a.hh.DateAttendance(ctx, ms.ID, date)
			if err != nil {
				return nil, "", err
			}
			if household.IsNotServed(row, att, hasOverride) {
				continue
			}
			occ := away.Slot{ID: ms.ID, Weekday: ms.Weekday, Time: at}
			covers := away.Covers(x, date, occ, sc.slots)
			covered := before != nil && away.Covers(*before, date, occ, sc.slots)
			if !covers && !covered {
				continue
			}
			var seats []away.Seat
			for _, at := range household.ResolveAttendance(ms.Attendance, att, hasOverride) {
				if m, ok := byID[at.MemberID]; ok {
					seats = append(seats, away.Seat{MemberID: at.MemberID, Factor: household.EffectiveFactor(m, at), DespiteAway: at.DespiteAway})
				}
			}
			m := away.Meal{Date: date, MealSlotID: ms.ID, MealSlotName: ms.Name, Time: at,
				Before: away.Portions(all, date, occ, sc.slots, seats, row.Guests),
				After:  away.Portions(with, date, occ, sc.slots, seats, row.Guests), Back: !covers}
			if covers || m.Changed() {
				meals = append(meals, m)
			}
		}
	}
	return meals, horizonEnd, nil
}
