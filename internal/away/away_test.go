package away_test

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/away"
)

// B9-24 (PC-08): the domain of an Away. Dates: Mon 2026-11-09 is today; Tue 17, Wed 18, Thu 19, Fri 20 follow it
// (2026-11-16 is the next Monday). Each weekday has Breakfast 08:00, Lunch 12:30 and Dinner 19:00.

const today = "2026-11-09"

// Meal Slot ids: weekday*10 + 1 Breakfast, +2 Lunch, +3 Dinner. Dinner of Tuesday is created BEFORE its Breakfast in
// the list and Breakfast has the higher id on Thursday, to show the order is the time, not the id.
func slots() []away.Slot {
	var out []away.Slot
	for wd := 1; wd <= 7; wd++ {
		b, l, d := int64(wd*10+1), int64(wd*10+2), int64(wd*10+3)
		if wd == 4 {
			b, d = int64(wd*10+3), int64(wd*10+1)
		}
		out = append(out, away.Slot{ID: d, Weekday: wd, Time: "19:00"}, away.Slot{ID: l, Weekday: wd, Time: "12:30"}, away.Slot{ID: b, Weekday: wd, Time: "08:00"})
	}
	return out
}

func slotOn(t *testing.T, wd int, hhmm string) away.Slot {
	t.Helper()
	for _, s := range slots() {
		if s.Weekday == wd && s.Time == hhmm {
			return s
		}
	}
	t.Fatalf("no slot on weekday %d at %s", wd, hhmm)
	return away.Slot{}
}

const (
	tue, wed, thu, fri = "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"
)

func TestCoversTheWholeDaysOfARange(t *testing.T) {
	a := away.Away{From: tue, Through: thu}
	for _, c := range []struct {
		date string
		wd   int
		at   string
		want bool
	}{
		{"2026-11-16", 1, "19:00", false}, // the day before
		{tue, 2, "08:00", true}, {tue, 2, "19:00", true},
		{wed, 3, "12:30", true},
		{thu, 4, "08:00", true}, {thu, 4, "19:00", true},
		{fri, 5, "08:00", false}, // the day after
	} {
		if got := away.Covers(a, c.date, slotOn(t, c.wd, c.at), slots()); got != c.want {
			t.Errorf("Covers(%s %s) = %v, want %v", c.date, c.at, got, c.want)
		}
	}
}

func TestCoversStartsAtTheFirstMealSlotMissedAndEndsAtTheLastOne(t *testing.T) {
	a := away.Away{From: tue, FromSlot: slotOn(t, 2, "12:30").ID, Through: thu, ThroughSlot: slotOn(t, 4, "12:30").ID}
	for _, c := range []struct {
		date string
		wd   int
		at   string
		want bool
	}{
		{tue, 2, "08:00", false}, {tue, 2, "12:30", true}, {tue, 2, "19:00", true},
		{wed, 3, "08:00", true}, {wed, 3, "19:00", true},
		{thu, 4, "08:00", true}, {thu, 4, "12:30", true}, {thu, 4, "19:00", false},
	} {
		if got := away.Covers(a, c.date, slotOn(t, c.wd, c.at), slots()); got != c.want {
			t.Errorf("Covers(%s %s) = %v, want %v", c.date, c.at, got, c.want)
		}
	}
}

func TestCoversOrdersTheMealSlotsOfADayByTimeNotById(t *testing.T) {
	// Thursday: Dinner has the lowest id and Breakfast the highest. From Thursday Lunch means Lunch and Dinner.
	a := away.Away{From: thu, FromSlot: slotOn(t, 4, "12:30").ID}
	if away.Covers(a, thu, slotOn(t, 4, "08:00"), slots()) {
		t.Error("Thursday Breakfast (highest id, earliest time) is covered; the order is the time of day")
	}
	if !away.Covers(a, thu, slotOn(t, 4, "19:00"), slots()) {
		t.Error("Thursday Dinner is not covered")
	}
}

func TestCoversASingleMealSlotAway(t *testing.T) {
	lunch := slotOn(t, 2, "12:30").ID
	a := away.Away{From: tue, FromSlot: lunch, Through: tue, ThroughSlot: lunch}
	for _, at := range []string{"08:00", "12:30", "19:00"} {
		want := at == "12:30"
		if got := away.Covers(a, tue, slotOn(t, 2, at), slots()); got != want {
			t.Errorf("single-Meal-Slot Away covers Tue %s = %v, want %v", at, got, want)
		}
	}
}

func TestAnAwayWithNoLastDayCoversEverythingFromItsFirstMealSlot(t *testing.T) {
	a := away.Away{From: wed}
	if away.Covers(a, tue, slotOn(t, 2, "19:00"), slots()) {
		t.Error("covers the day before the first day")
	}
	for _, d := range []struct {
		date string
		wd   int
	}{{wed, 3}, {"2026-12-30", 3}, {"2027-03-02", 2}} {
		if !away.Covers(a, d.date, slotOn(t, d.wd, "19:00"), slots()) {
			t.Errorf("an Away with no last day does not cover %s", d.date)
		}
	}
}

func validate(t *testing.T, a away.Away, before *away.Away, others ...away.Away) *away.Error {
	t.Helper()
	err := away.Validate(a, today, before, others, slots())
	if err == nil {
		return nil
	}
	var e *away.Error
	if !errors.As(err, &e) {
		t.Fatalf("Validate returned %T %v, want *away.Error", err, err)
	}
	return e
}

func wantErr(t *testing.T, e *away.Error, field, reason string) {
	t.Helper()
	if e == nil {
		t.Fatalf("Validate accepted it, want %s on %q", reason, field)
	}
	if e.Field != field || e.Reason != reason {
		t.Errorf("error = field %q reason %q, want field %q reason %q", e.Field, e.Reason, field, reason)
	}
}

func TestValidateAcceptsTodayAndLaterAndNoLastDay(t *testing.T) {
	for _, a := range []away.Away{
		{From: today, Through: today}, // a single day, today: allowed even though the Breakfast is over
		{From: tue, Through: thu},
		{From: tue},                                 // no last day yet
		{From: "2027-06-01", Through: "2027-06-20"}, // far past the Planning Horizon
		{From: tue, Through: tue},
	} {
		if e := validate(t, a, nil); e != nil {
			t.Errorf("Validate(%+v) = %+v, want nil", a, e)
		}
	}
}

func TestValidateRefusesAFirstDayInThePast(t *testing.T) {
	wantErr(t, validate(t, away.Away{From: "2026-11-08", Through: tue}, nil), "from", "first_day_past")
}

func TestValidateRefusesALastDayBeforeTheFirst(t *testing.T) {
	wantErr(t, validate(t, away.Away{From: wed, Through: tue}, nil), "through", "last_before_first")
}

func TestValidateRefusesASingleDayThatEndsBeforeItStartsWithinTheDay(t *testing.T) {
	// Same day, from Dinner through Lunch: the last Meal Slot is before the first.
	a := away.Away{From: tue, FromSlot: slotOn(t, 2, "19:00").ID, Through: tue, ThroughSlot: slotOn(t, 2, "12:30").ID}
	wantErr(t, validate(t, a, nil), "through", "last_before_first")
}

func TestValidateRefusesAMalformedDate(t *testing.T) {
	wantErr(t, validate(t, away.Away{From: "17/11/2026"}, nil), "from", "date_invalid")
	wantErr(t, validate(t, away.Away{From: tue, Through: "soon"}, nil), "through", "date_invalid")
}

func TestValidateRefusesAMealSlotThatIsNotOnThatDay(t *testing.T) {
	// Tuesday's first day, naming a Wednesday Meal Slot.
	wantErr(t, validate(t, away.Away{From: tue, FromSlot: slotOn(t, 3, "12:30").ID}, nil), "fromMealSlotId", "slot_not_on_day")
	wantErr(t, validate(t, away.Away{From: tue, Through: wed, ThroughSlot: slotOn(t, 2, "12:30").ID}, nil), "throughMealSlotId", "slot_not_on_day")
	wantErr(t, validate(t, away.Away{From: tue, FromSlot: 9999}, nil), "fromMealSlotId", "slot_not_on_day")
}

func TestValidateRefusesAThroughMealSlotWithNoLastDay(t *testing.T) {
	wantErr(t, validate(t, away.Away{From: tue, ThroughSlot: slotOn(t, 2, "12:30").ID}, nil), "throughMealSlotId", "slot_not_on_day")
}

func TestValidateRefusesAnOverlapAndNamesTheOtherAway(t *testing.T) {
	other := away.Away{ID: 5, MemberID: 1, From: fri, Through: "2026-11-22"}
	e := validate(t, away.Away{From: wed, Through: fri}, nil, other)
	wantErr(t, e, "from", "overlap")
	if e.Conflict == nil || e.Conflict.ID != 5 {
		t.Errorf("Conflict = %+v, want the Away 5, so the message can say \"Ben is already away Fri 20 – Sun 22 Nov\"", e.Conflict)
	}
	// An Away with no last day overlaps everything after its first day.
	wantErr(t, validate(t, away.Away{From: "2026-12-24", Through: "2026-12-26"}, nil, away.Away{ID: 6, From: wed}), "from", "overlap")
}

func TestValidateOverlapIsDecidedByMealSlotsNotByDates(t *testing.T) {
	// One Away ends at Tuesday Lunch, the next starts at Tuesday Dinner: they share a date, not a Meal Slot.
	first := away.Away{ID: 1, From: today, Through: tue, ThroughSlot: slotOn(t, 2, "12:30").ID}
	next := away.Away{From: tue, FromSlot: slotOn(t, 2, "19:00").ID, Through: wed}
	if e := validate(t, next, nil, first); e != nil {
		t.Errorf("adjacent Aways refused: %+v", e)
	}
	// One Meal Slot of overlap is an overlap.
	next.FromSlot = slotOn(t, 2, "12:30").ID
	wantErr(t, validate(t, next, nil, first), "from", "overlap")
}

func TestValidateEditingAnAwayDoesNotOverlapItself(t *testing.T) {
	stored := away.Away{ID: 3, From: tue, Through: thu}
	edited := stored
	edited.Through = fri
	if e := validate(t, edited, &stored, stored); e != nil {
		t.Errorf("an Away overlaps itself on edit: %+v", e)
	}
}

func TestValidateARunningAwayCannotMoveItsFirstDay(t *testing.T) {
	// Running: it started on Sunday 2026-11-08, so its first day is in the past and may not change; the rest may.
	stored := away.Away{ID: 3, From: "2026-11-08", Through: tue}
	extended := stored
	extended.Through = thu
	if e := validate(t, extended, &stored); e != nil {
		t.Errorf("extending a running Away refused: %+v", e)
	}
	moved := stored
	moved.From = "2026-11-10"
	wantErr(t, validate(t, moved, &stored), "from", "away_started")
	moved = stored
	moved.FromSlot = slotOn(t, 7, "12:30").ID
	wantErr(t, validate(t, moved, &stored), "fromMealSlotId", "away_started")
}

func TestValidateAnAwayThatHasNotStartedMayMoveItsFirstDayToTodayOrLater(t *testing.T) {
	stored := away.Away{ID: 3, From: thu, Through: fri}
	moved := stored
	moved.From = tue
	if e := validate(t, moved, &stored); e != nil {
		t.Errorf("moving the first day of an Away that has not started refused: %+v", e)
	}
	moved.From = "2026-11-08"
	wantErr(t, validate(t, moved, &stored), "from", "first_day_past")
}

func at(date, hhmm string) time.Time {
	ts, err := time.Parse("2006-01-02 15:04", date+" "+hhmm)
	if err != nil {
		panic(err)
	}
	return ts
}

func TestStartedIsTheFirstMealSlotMissedHavingStarted(t *testing.T) {
	a := away.Away{From: tue, FromSlot: slotOn(t, 2, "12:30").ID, Through: thu}
	for _, c := range []struct {
		now  time.Time
		want bool
	}{
		{at(today, "12:00"), false},
		{at(tue, "08:00"), false}, // Breakfast time, but the first Meal Slot missed is Lunch
		{at(tue, "12:29"), false},
		{at(tue, "12:30"), true},
		{at(wed, "09:00"), true},
	} {
		if got := away.Started(a, c.now, slots()); got != c.want {
			t.Errorf("Started at %s = %v, want %v", c.now.Format("2006-01-02 15:04"), got, c.want)
		}
	}
	whole := away.Away{From: tue}
	if away.Started(whole, at(tue, "07:59"), slots()) || !away.Started(whole, at(tue, "08:00"), slots()) {
		t.Error("a whole-day Away starts at the day's first Meal Slot")
	}
}

func TestApplyTakesAwayTheMembersWhoseAwayCoversTheMealSlot(t *testing.T) {
	aways := []away.Away{{ID: 1, MemberID: 20, From: tue, Through: thu}}
	got := away.Apply(aways, wed, slotOn(t, 3, "19:00"), slots(), []int64{10, 20, 30}, nil)
	if want := []int64{10, 30}; !reflect.DeepEqual(got, want) {
		t.Errorf("Apply = %v, want %v (order kept)", got, want)
	}
	got = away.Apply(aways, fri, slotOn(t, 5, "19:00"), slots(), []int64{10, 20, 30}, nil)
	if want := []int64{10, 20, 30}; !reflect.DeepEqual(got, want) {
		t.Errorf("Apply after the Away = %v, want everyone %v", got, want)
	}
}

func TestApplyEatsHereAnywayKeepsTheMemberForThatMealSlotOnly(t *testing.T) {
	aways := []away.Away{{ID: 1, MemberID: 20, From: tue, Through: thu}}
	got := away.Apply(aways, wed, slotOn(t, 3, "19:00"), slots(), []int64{10, 20}, map[int64]bool{20: true})
	if want := []int64{10, 20}; !reflect.DeepEqual(got, want) {
		t.Errorf("Apply with despite = %v, want %v", got, want)
	}
	// despite is for one slot on one date: the caller passes it for that date only, so the lunch is still without 20.
	got = away.Apply(aways, wed, slotOn(t, 3, "12:30"), slots(), []int64{10, 20}, nil)
	if want := []int64{10}; !reflect.DeepEqual(got, want) {
		t.Errorf("Apply = %v, want %v", got, want)
	}
}

func TestApplyLeavesNobodyWhenEveryoneIsAwayAndNeverReturnsNilForEmpty(t *testing.T) {
	aways := []away.Away{{MemberID: 10, From: tue}, {MemberID: 20, From: tue}}
	got := away.Apply(aways, tue, slotOn(t, 2, "19:00"), slots(), []int64{10, 20}, nil)
	if got == nil || len(got) != 0 {
		t.Errorf("Apply = %#v, want an empty, non-nil list: nobody attends", got)
	}
}

func TestEndBringsTheMemberBackFromTheNextMealSlot(t *testing.T) {
	a := away.Away{ID: 1, From: tue, Through: fri}
	lunch := slotOn(t, 3, "12:30").ID
	got, err := away.End(a, at(wed, "13:00"), slots())
	if err != nil {
		t.Fatal(err)
	}
	if got.Through != wed || got.ThroughSlot != lunch || got.From != tue || got.ID != 1 {
		t.Errorf("End at Wed 13:00 = %+v, want Through Wed, last Meal Slot missed Lunch (started 12:30); first day untouched", got)
	}
	// An open Away is ended the same way.
	got, err = away.End(away.Away{ID: 2, From: tue}, at(wed, "20:00"), slots())
	if err != nil || got.Through != wed || got.ThroughSlot != slotOn(t, 3, "19:00").ID {
		t.Errorf("End of an open Away at Wed 20:00 = %+v, %v, want Through Wed Dinner", got, err)
	}
}

func TestEndBeforeTodaysFirstMealSlotEndsYesterdayEvening(t *testing.T) {
	got, err := away.End(away.Away{ID: 1, From: tue, Through: fri}, at(wed, "07:00"), slots())
	if err != nil {
		t.Fatal(err)
	}
	if got.Through != tue || got.ThroughSlot != 0 {
		t.Errorf("End at Wed 07:00 = %+v, want Through Tue, the whole day (nothing of Wed has started)", got)
	}
}

func TestEndRefusesAnAwayThatHasNotStartedAndOneThatIsOver(t *testing.T) {
	if _, err := away.End(away.Away{From: thu, Through: fri}, at(wed, "13:00"), slots()); !errors.Is(err, away.ErrNotStarted) {
		t.Errorf("End of an Away that has not started = %v, want ErrNotStarted (delete it instead)", err)
	}
	if _, err := away.End(away.Away{From: tue, Through: wed}, at(fri, "13:00"), slots()); !errors.Is(err, away.ErrOver) {
		t.Errorf("End of an Away that is over = %v, want ErrOver", err)
	}
	// Ending at the Meal Slot the Away already ends at is "over" too.
	end := away.Away{From: tue, Through: wed, ThroughSlot: slotOn(t, 3, "12:30").ID}
	if _, err := away.End(end, at(wed, "19:30"), slots()); !errors.Is(err, away.ErrOver) {
		t.Errorf("End of an Away whose last Meal Slot is over = %v, want ErrOver", err)
	}
}

func TestSummariseGroupsTheCoveredMealSlotsByDayAndCountsWhatChanges(t *testing.T) {
	meals := []away.Meal{
		{Date: wed, MealSlotID: 33, MealSlotName: "Dinner", Time: "19:00", Before: 2.75, After: 1.75},
		{Date: tue, MealSlotID: 23, MealSlotName: "Dinner", Time: "19:00", Before: 2.75, After: 1.75},
		{Date: tue, MealSlotID: 21, MealSlotName: "Breakfast", Time: "08:00", Before: 2.75, After: 1.75},
		{Date: wed, MealSlotID: 31, MealSlotName: "Breakfast", Time: "08:00", Before: 1.75, After: 1.75}, // Ben did not eat it anyway
	}
	s := away.Summarise(meals)
	if s.SlotsWithout != 4 || s.MealsChanged != 3 {
		t.Errorf("SlotsWithout = %d, MealsChanged = %d, want 4 and 3", s.SlotsWithout, s.MealsChanged)
	}
	if len(s.Days) != 2 || s.Days[0].Date != tue || s.Days[1].Date != wed {
		t.Fatalf("Days = %+v, want Tue then Wed", s.Days)
	}
	if names := []string{s.Days[0].Meals[0].MealSlotName, s.Days[0].Meals[1].MealSlotName}; !reflect.DeepEqual(names, []string{"Breakfast", "Dinner"}) {
		t.Errorf("Tue slots = %v, want by time of day", names)
	}
	if !s.Days[0].Meals[0].Changed() || s.Days[1].Meals[0].Changed() {
		t.Error("Changed: Tue Breakfast 2.75 → 1.75 changes; Wed Breakfast 1.75 → 1.75 does not")
	}
}

func TestSummariseOfNothingIsEmptyNotNil(t *testing.T) {
	s := away.Summarise(nil)
	if s.SlotsWithout != 0 || s.MealsChanged != 0 || s.Days == nil || len(s.Days) != 0 {
		t.Errorf("Summarise(nil) = %+v, want zero counts and Days []", s)
	}
}
