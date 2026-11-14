// Package away is the domain of an Away (beta.9, B9-24, PC-08, ADR 0025): a run of dates on which a Member eats at no
// Meal Slot. Domain only: no HTTP and no SQL.
//
// Times are household wall clocks: a time.Time is read by its own date and HH:MM (pass it in the household zone), and a
// Meal Slot occurrence is its date and "HH:MM". Within a day the Meal Slots are ordered by time, then by id.
package away

import (
	"errors"
	"fmt"
	"sort"
	"time"
)

// Slot is a Meal Slot as an Away sees it: its id, ISO weekday (1 Monday to 7 Sunday) and usual time "HH:MM".
type Slot struct {
	ID      int64
	Weekday int
	Time    string
}

// Away belongs to one Member. From is the first day and Through the last day ("" = no last day yet), "YYYY-MM-DD"
// household dates. FromSlot is the first Meal Slot missed on the first day and ThroughSlot the last one missed on the
// last day; 0 means the whole day.
//
// Since is the household wall clock of the write that set the first day: a Meal Slot occurrence that started before it
// is not covered (an Away applies from now on; started and resolved Meal Slots never change). Zero covers every Meal Slot
// of the range.
type Away struct {
	ID          int64
	MemberID    int64
	From        string
	FromSlot    int64
	Through     string
	ThroughSlot int64
	Since       time.Time
}

// Error is a refused Away. Field is the JSON field ("from", "fromMealSlotId", "through", "throughMealSlotId"), Reason
// the machine reason. Conflict is the other Away of an "overlap".
type Error struct {
	Field    string
	Reason   string
	Conflict *Away
}

func (e *Error) Error() string { return e.Reason }

// ErrNotStarted is End on an Away whose first missed Meal Slot has not started (it is deleted, not ended).
var ErrNotStarted = errors.New("away: not started")

// ErrOver is End on an Away whose last missed Meal Slot is over already.
var ErrOver = errors.New("away: over")

const (
	dateLayout = "2006-01-02"
	wallLayout = "2006-01-02 15:04"
	wholeStart = -2      // the position of a whole first day: before every Meal Slot
	wholeEnd   = 1 << 30 // the position of a whole last day: after every Meal Slot
	openEnd    = "9999-12-31"
)

// parseDate reads a strict "YYYY-MM-DD".
func parseDate(s string) (time.Time, bool) {
	t, err := time.Parse(dateLayout, s)
	return t, err == nil && t.Format(dateLayout) == s
}

// weekday is the ISO weekday of a date (1 Monday to 7 Sunday); 0 for a malformed date.
func weekday(date string) int {
	t, ok := parseDate(date)
	if !ok {
		return 0
	}
	wd := int(t.Weekday())
	if wd == 0 {
		wd = 7
	}
	return wd
}

// Weekday is the ISO weekday of a "YYYY-MM-DD" date (1 Monday to 7 Sunday); 0 when malformed.
func Weekday(date string) int { return weekday(date) }

// addDays is the date n days after date ("" when malformed).
func addDays(date string, n int) string {
	t, ok := parseDate(date)
	if !ok {
		return ""
	}
	return t.AddDate(0, 0, n).Format(dateLayout)
}

// wall is the household wall clock of t, "YYYY-MM-DD HH:MM".
func wall(t time.Time) string { return t.Format(wallLayout) }

// DaySlots are the Meal Slots that fall on the date, by time then id.
func DaySlots(date string, slots []Slot) []Slot {
	wd := weekday(date)
	var out []Slot
	for _, s := range slots {
		if s.Weekday == wd {
			out = append(out, s)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Time != out[j].Time {
			return out[i].Time < out[j].Time
		}
		return out[i].ID < out[j].ID
	})
	return out
}

// point is a place in the run of Meal Slots: a date and a position within its day.
type point struct {
	date string
	pos  int
}

func (p point) before(q point) bool {
	if p.date != q.date {
		return p.date < q.date
	}
	return p.pos < q.pos
}

// slotPos is the position of the Meal Slot within the date's Meal Slots, by id; false when it is not on that day.
func slotPos(date string, id int64, slots []Slot) (int, bool) {
	for i, s := range DaySlots(date, slots) {
		if s.ID == id {
			return 2 * i, true
		}
	}
	return 0, false
}

// occPos is the position of an occurrence: the slot's own when it is on the day, else between the slots by time.
func occPos(date string, slot Slot, slots []Slot) int {
	if p, ok := slotPos(date, slot.ID, slots); ok {
		return p
	}
	n := 0
	for _, s := range DaySlots(date, slots) {
		if s.Time < slot.Time || (s.Time == slot.Time && s.ID < slot.ID) {
			n++
		}
	}
	return 2*n - 1
}

// start is the first point the Away covers (a first Meal Slot not on the day counts as the whole day).
func start(a Away, slots []Slot) point {
	if a.FromSlot != 0 {
		if p, ok := slotPos(a.From, a.FromSlot, slots); ok {
			return point{a.From, p}
		}
	}
	return point{a.From, wholeStart}
}

// end is the last point the Away covers.
func end(a Away, slots []Slot) point {
	if a.Through == "" {
		return point{openEnd, wholeEnd}
	}
	if a.ThroughSlot != 0 {
		if p, ok := slotPos(a.Through, a.ThroughSlot, slots); ok {
			return point{a.Through, p}
		}
	}
	return point{a.Through, wholeEnd}
}

// Covers says whether the Away covers the Meal Slot on the date (the Member eats nowhere it covers). slot.Time is the
// occurrence's time, compared with Since.
func Covers(a Away, date string, slot Slot, slots []Slot) bool {
	if weekday(date) == 0 {
		return false
	}
	if !a.Since.IsZero() && startedBefore(date, slot.Time, a.Since) {
		return false
	}
	p := point{date, occPos(date, slot, slots)}
	return !p.before(start(a, slots)) && !end(a, slots).before(p)
}

// startedBefore says whether the Meal Slot occurrence at date and hhmm started before since, compared as instants in
// since's zone (the household zone), as the planner decides a Meal Slot has started: one that starts in the minute of
// the write but before it has started, and on the night the clocks go back the two 01:30s are told apart.
func startedBefore(date, hhmm string, since time.Time) bool {
	at, err := time.ParseInLocation(wallLayout, date+" "+hhmm, since.Location())
	if err != nil {
		return date+" "+hhmm < wall(since)
	}
	return at.Before(since)
}

// overlaps says whether two Aways share a Meal Slot.
func overlaps(a, b Away, slots []Slot) bool {
	return !end(a, slots).before(start(b, slots)) && !end(b, slots).before(start(a, slots))
}

// Validate checks an Away to be stored. before is the stored Away when editing (nil when new), others are the
// Member's other Aways, slots every Meal Slot, today the household date. The error is an *Error.
func Validate(a Away, today string, before *Away, others []Away, slots []Slot) error {
	if _, ok := parseDate(a.From); !ok {
		return &Error{Field: "from", Reason: "date_invalid"}
	}
	if a.Through != "" {
		if _, ok := parseDate(a.Through); !ok {
			return &Error{Field: "through", Reason: "date_invalid"}
		}
	}
	running := before != nil && before.From < today
	switch {
	case running && a.From != before.From:
		return &Error{Field: "from", Reason: "away_started"}
	case running && a.FromSlot != before.FromSlot:
		return &Error{Field: "fromMealSlotId", Reason: "away_started"}
	case !running && a.From < today:
		return &Error{Field: "from", Reason: "first_day_past"}
	}
	if a.FromSlot != 0 {
		if _, ok := slotPos(a.From, a.FromSlot, slots); !ok {
			return &Error{Field: "fromMealSlotId", Reason: "slot_not_on_day"}
		}
	}
	if a.ThroughSlot != 0 {
		if a.Through == "" {
			return &Error{Field: "throughMealSlotId", Reason: "slot_not_on_day"}
		}
		if _, ok := slotPos(a.Through, a.ThroughSlot, slots); !ok {
			return &Error{Field: "throughMealSlotId", Reason: "slot_not_on_day"}
		}
	}
	if a.Through != "" && end(a, slots).before(start(a, slots)) {
		return &Error{Field: "through", Reason: "last_before_first"}
	}
	self := a.ID
	if before != nil {
		self = before.ID
	}
	for i := range others {
		o := others[i]
		if self != 0 && o.ID == self {
			continue
		}
		if overlaps(a, o, slots) {
			return &Error{Field: "from", Reason: "overlap", Conflict: &o}
		}
	}
	return nil
}

// CheckStart refuses an edit that changes a Meal Slot that has started at now: one that moves the first day or the first
// Meal Slot missed of an Away that has started, and one that moves the last day so that a Meal Slot that has started is
// covered when it was not, or no longer covered when it was (a running Away brought to an end before now; to bring the
// Member back now, End it).
func CheckStart(a, before Away, now time.Time, slots []Slot) error {
	if Started(before, now, slots) {
		switch {
		case a.From != before.From:
			return &Error{Field: "from", Reason: "away_started"}
		case a.FromSlot != before.FromSlot:
			return &Error{Field: "fromMealSlotId", Reason: "away_started"}
		}
	}
	if a.Through == before.Through && a.ThroughSlot == before.ThroughSlot {
		return nil
	}
	// Only the Meal Slots between the two last days can be covered by one and not the other.
	first := a.Through
	if first == "" || (before.Through != "" && before.Through < first) {
		first = before.Through
	}
	today, nowWall := now.Format(dateLayout), wall(now)
	for d := first; d != "" && d <= today; d = addDays(d, 1) {
		for _, s := range DaySlots(d, slots) {
			if d+" "+s.Time > nowWall {
				break
			}
			if Covers(a, d, s, slots) != Covers(before, d, s, slots) {
				field := "through"
				if a.Through == before.Through {
					field = "throughMealSlotId"
				}
				return &Error{Field: field, Reason: "slot_started"}
			}
		}
	}
	return nil
}

// firstMissed is the first Meal Slot occurrence the Away covers, "YYYY-MM-DD HH:MM"; false when it covers none in its
// first two weeks (no Meal Slot falls in it).
func firstMissed(a Away, slots []Slot) (string, bool) {
	from := a.From
	if !a.Since.IsZero() && a.Since.Format(dateLayout) > from {
		from = a.Since.Format(dateLayout)
	}
	for d, i := from, 0; i < 15 && d != ""; d, i = addDays(d, 1), i+1 {
		if a.Through != "" && d > a.Through {
			break
		}
		for _, s := range DaySlots(d, slots) {
			if Covers(a, d, s, slots) {
				return d + " " + s.Time, true
			}
		}
	}
	return "", false
}

// Started says whether the first Meal Slot the Away covers has started at now (household zone).
func Started(a Away, now time.Time, slots []Slot) bool {
	first, ok := firstMissed(a, slots)
	if !ok {
		return now.Format(dateLayout) > a.From
	}
	return first <= wall(now)
}

// lastMissed is the wall clock of the last Meal Slot the Away covers ("" with no last day).
func lastMissed(a Away, slots []Slot) string {
	if a.Through == "" {
		return ""
	}
	if a.ThroughSlot != 0 {
		for _, s := range DaySlots(a.Through, slots) {
			if s.ID == a.ThroughSlot {
				return a.Through + " " + s.Time
			}
		}
	}
	day := DaySlots(a.Through, slots)
	if len(day) == 0 {
		return a.Through + " 24:00"
	}
	return a.Through + " " + day[len(day)-1].Time
}

// Over says whether the last Meal Slot the Away covers has started at now: nothing of it is still to come. An Away
// with no last day is never over.
func Over(a Away, now time.Time, slots []Slot) bool {
	last := lastMissed(a, slots)
	return last != "" && last <= wall(now)
}

// Apply returns the Members who still eat: memberIDs less those a covering Away removes, unless despite[member].
func Apply(aways []Away, date string, slot Slot, slots []Slot, memberIDs []int64, despite map[int64]bool) []int64 {
	out := make([]int64, 0, len(memberIDs))
	for _, id := range memberIDs {
		if despite[id] || !AwayAt(aways, id, date, slot, slots) {
			out = append(out, id)
		}
	}
	return out
}

// AwayAt says whether an Away of the Member covers the Meal Slot on the date.
func AwayAt(aways []Away, memberID int64, date string, slot Slot, slots []Slot) bool {
	return CoveringFor(aways, memberID, date, slot, slots) != nil
}

// CoveringFor is the Away of the Member that covers the Meal Slot on the date; nil when none does.
func CoveringFor(aways []Away, memberID int64, date string, slot Slot, slots []Slot) *Away {
	for i := range aways {
		if aways[i].MemberID == memberID && Covers(aways[i], date, slot, slots) {
			return &aways[i]
		}
	}
	return nil
}

// End returns the Away ended at now (household zone): the Member is back from the next Meal Slot.
func End(a Away, now time.Time, slots []Slot) (Away, error) {
	if !Started(a, now, slots) {
		return Away{}, ErrNotStarted
	}
	if Over(a, now, slots) {
		return Away{}, ErrOver
	}
	today, hhmm := now.Format(dateLayout), now.Format("15:04")
	var last int64
	for _, s := range DaySlots(today, slots) {
		if s.Time <= hhmm {
			last = s.ID
		}
	}
	out := a
	if last != 0 {
		out.Through, out.ThroughSlot = today, last
	} else {
		out.Through, out.ThroughSlot = addDays(today, -1), 0
	}
	return out, nil
}

// Touches says whether the Away covers any date from..to (inclusive).
func Touches(a Away, from, to string) bool {
	return a.From <= to && (a.Through == "" || a.Through >= from)
}

// BeyondHorizon is the first date after the Planning Horizon (horizonEnd is its last day) the Away covers, from when the
// planner plans without the Member; "" when the Away ends inside the horizon.
func BeyondHorizon(a Away, horizonEnd string) string {
	if a.Through != "" && a.Through <= horizonEnd {
		return ""
	}
	if a.From > horizonEnd {
		return a.From
	}
	return addDays(horizonEnd, 1)
}

// Meal is one Meal Slot occurrence an Away covers, with its portions without and with the Away.
type Meal struct {
	Date         string
	MealSlotID   int64
	MealSlotName string
	Time         string
	Before       float64
	After        float64
	// Back is a Meal Slot the stored Away covered and the changed one gives back: the Member eats there again. It is
	// listed when its portions change, and not counted among the Meal Slots without the Member.
	Back bool
}

// Changed says whether the Away changes the portions of the Meal Slot.
func (m Meal) Changed() bool {
	d := m.Before - m.After
	return d > 1e-9 || d < -1e-9
}

// DayRow is one day of a Summary.
type DayRow struct {
	Date  string
	Meals []Meal
}

// Summary is what an Away changes, by day.
type Summary struct {
	SlotsWithout int
	MealsChanged int
	Days         []DayRow
}

// Summarise groups the covered Meal Slots by day (dates ascending, each day's slots by time).
func Summarise(meals []Meal) Summary {
	sorted := append([]Meal(nil), meals...)
	sort.SliceStable(sorted, func(i, j int) bool {
		a, b := sorted[i], sorted[j]
		if a.Date != b.Date {
			return a.Date < b.Date
		}
		if a.Time != b.Time {
			return a.Time < b.Time
		}
		return a.MealSlotID < b.MealSlotID
	})
	s := Summary{Days: []DayRow{}}
	for _, m := range sorted {
		if !m.Back {
			s.SlotsWithout++
		}
		if m.Changed() {
			s.MealsChanged++
		}
		if n := len(s.Days); n == 0 || s.Days[n-1].Date != m.Date {
			s.Days = append(s.Days, DayRow{Date: m.Date})
		}
		last := &s.Days[len(s.Days)-1]
		last.Meals = append(last.Meals, m)
	}
	return s
}

// Seat is one Member at a Meal Slot on a date: their effective Portion Factor and whether they eat there despite an
// Away ("Eats here anyway").
type Seat struct {
	MemberID    int64
	Factor      float64
	DespiteAway bool
}

// Eaters is who eats at the Meal Slot on the date: the seats less the Members a covering Away takes out, unless they eat
// here anyway. away lists the Members it took out, in the seats' order. Neither is nil.
func Eaters(aways []Away, date string, slot Slot, slots []Slot, seats []Seat) (eat []Seat, away []int64) {
	eat, away = make([]Seat, 0, len(seats)), []int64{}
	for _, s := range seats {
		if !s.DespiteAway && AwayAt(aways, s.MemberID, date, slot, slots) {
			away = append(away, s.MemberID)
			continue
		}
		eat = append(eat, s)
	}
	return eat, away
}

// Portions is what the seats eat at the Meal Slot on the date with the Aways, Guests included (one standard portion each).
func Portions(aways []Away, date string, slot Slot, slots []Slot, seats []Seat, guests int) float64 {
	eat, _ := Eaters(aways, date, slot, slots, seats)
	total := float64(guests)
	for _, s := range eat {
		total += s.Factor
	}
	return total
}

// Replace is the Aways with a put in place of the one with its id (added when new: a.ID 0 or unknown).
func Replace(aways []Away, a Away) []Away {
	out := make([]Away, 0, len(aways)+1)
	done := false
	for _, x := range aways {
		if a.ID != 0 && x.ID == a.ID {
			out = append(out, a)
			done = true
			continue
		}
		out = append(out, x)
	}
	if !done {
		out = append(out, a)
	}
	return out
}

// RangeLabel says the dates of an Away for a message: "Tue 10 – Wed 11 Nov", "Mon 30 Nov – Tue 1 Dec", "Tue 10 Nov"
// for one day, "from Tue 10 Nov" with no last day.
func RangeLabel(a Away) string {
	from, ok := parseDate(a.From)
	if !ok {
		return a.From
	}
	if a.Through == "" {
		return "from " + from.Format("Mon 2 Jan")
	}
	through, ok := parseDate(a.Through)
	if !ok || a.Through == a.From {
		return from.Format("Mon 2 Jan")
	}
	switch {
	case from.Year() != through.Year():
		return from.Format("Mon 2 Jan 2006") + " – " + through.Format("Mon 2 Jan 2006")
	case from.Month() != through.Month():
		return from.Format("Mon 2 Jan") + " – " + through.Format("Mon 2 Jan")
	}
	return from.Format("Mon 2") + " – " + through.Format("Mon 2 Jan")
}

// Message is the sentence for a refused Away, with the Member's name.
func Message(e *Error, memberName string) string {
	switch e.Reason {
	case "overlap":
		if e.Conflict != nil {
			return fmt.Sprintf("%s is already away %s. Change that Away instead.", memberName, RangeLabel(*e.Conflict))
		}
		return memberName + " is already away then. Change that Away instead."
	case "first_day_past":
		return "The first day cannot be in the past."
	case "last_before_first":
		return "The last day cannot be before the first."
	case "slot_started":
		return fmt.Sprintf("A Meal Slot that has started cannot change. To bring %s back now, end the Away.", memberName)
	case "date_invalid":
		return "Choose a date."
	case "slot_not_on_day":
		return "Choose a Meal Slot of that day."
	case "away_started":
		return "This Away has started, so its first day cannot change."
	}
	return "Check the Away."
}
