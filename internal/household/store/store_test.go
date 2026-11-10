package store_test

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

type fx struct {
	st   *store.Store
	auth *auth.Service
	ctx  context.Context
}

func newFx(t *testing.T) *fx {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(testkit.StartTime)
	return &fx{st: store.New(d, clk), auth: auth.NewService(d, clk, false), ctx: context.Background()}
}

func fp(v float64) *float64 { return &v }

func (f *fx) member(t *testing.T, name string, factor float64) household.Member {
	t.Helper()
	m, err := f.st.CreateMember(f.ctx, household.MemberInput{Name: name, Colour: "#3366cc", PortionFactor: factor})
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestSettingsStartWithDefaultsAndRoundTrip(t *testing.T) {
	f := newFx(t)
	got, err := f.st.Settings(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if want := household.DefaultSettings("UTC"); got != want {
		t.Fatalf("initial = %+v, want %+v", got, want)
	}
	s := household.DefaultSettings("Europe/Rome")
	s.TimeZoneConfigured = true
	s.PlanningHorizonDays, s.DefaultCooldownDays, s.DefaultLeftoverUseByDays = 14, 10, 2
	s.QuietHours = household.QuietHours{Start: "23:00", End: "06:30"}
	s.PlannerStyle, s.Currency = 0.25, "EUR"
	s.Location = &household.Location{City: "Turin"}
	if err := f.st.SaveSettings(f.ctx, s); err != nil {
		t.Fatal(err)
	}
	got, _ = f.st.Settings(f.ctx)
	if got.Location == nil || got.Location.City != "Turin" || got.Location.Latitude != nil {
		t.Fatalf("location = %+v", got.Location)
	}
	got.Location, s.Location = nil, nil
	if got != s {
		t.Fatalf("round trip = %+v, want %+v", got, s)
	}
}

func TestSettingsLocationCoordinatesAndClearing(t *testing.T) {
	f := newFx(t)
	s := household.DefaultSettings("UTC")
	s.Location = &household.Location{Latitude: fp(45.07), Longitude: fp(7.69)}
	f.st.SaveSettings(f.ctx, s)
	got, _ := f.st.Settings(f.ctx)
	if got.Location == nil || got.Location.City != "" || *got.Location.Latitude != 45.07 || *got.Location.Longitude != 7.69 {
		t.Fatalf("coordinates = %+v", got.Location)
	}
	s.Location = nil
	f.st.SaveSettings(f.ctx, s)
	if got, _ = f.st.Settings(f.ctx); got.Location != nil {
		t.Fatalf("cleared location = %+v", got.Location)
	}
}

func TestMemberCRUD(t *testing.T) {
	f := newFx(t)
	anna := f.member(t, "Anna", 1)
	sam, err := f.st.CreateMember(f.ctx, household.MemberInput{Name: "Sam", Colour: "#e07a5f", Avatar: "🦊", PortionFactor: 0.5})
	if err != nil || sam.ID == anna.ID || sam.Avatar != "🦊" || sam.UserID != nil {
		t.Fatalf("create = %+v, %v", sam, err)
	}
	list, _ := f.st.Members(f.ctx)
	if len(list) != 2 || list[0].ID != anna.ID || list[1].ID != sam.ID {
		t.Fatalf("list = %+v", list)
	}
	up, err := f.st.UpdateMember(f.ctx, sam.ID, household.MemberInput{Name: "Samuel", Colour: "#000000", PortionFactor: 0.75})
	if err != nil || up.Name != "Samuel" || up.PortionFactor != 0.75 || up.Avatar != "" {
		t.Fatalf("update = %+v, %v", up, err)
	}
	if _, err := f.st.UpdateMember(f.ctx, 999, household.MemberInput{Name: "x", Colour: "#000000", PortionFactor: 1}); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("update unknown: %v", err)
	}
	if err := f.st.DeleteMember(f.ctx, sam.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.st.Member(f.ctx, sam.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("after delete: %v", err)
	}
	if err := f.st.DeleteMember(f.ctx, sam.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("second delete: %v", err)
	}
}

func TestMemberUserLink(t *testing.T) {
	f := newFx(t)
	u, _ := f.auth.AddUser(f.ctx, "anna@example.test", "Anna", false)
	anna, marco := f.member(t, "Anna", 1), f.member(t, "Marco", 1)
	got, err := f.st.LinkUser(f.ctx, anna.ID, &u.ID)
	if err != nil || got.UserID == nil || *got.UserID != u.ID {
		t.Fatalf("link = %+v, %v", got, err)
	}
	if _, err := f.st.LinkUser(f.ctx, marco.ID, &u.ID); !errors.Is(err, household.ErrUserLinked) {
		t.Fatalf("second link: %v", err)
	}
	if _, err := f.st.LinkUser(f.ctx, anna.ID, &u.ID); err != nil {
		t.Errorf("re-linking the same pair must be allowed: %v", err)
	}
	missing := int64(9999)
	if _, err := f.st.LinkUser(f.ctx, anna.ID, &missing); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("unknown user: %v", err)
	}
	if _, err := f.st.LinkUser(f.ctx, 9999, &u.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("unknown member: %v", err)
	}
	got, err = f.st.LinkUser(f.ctx, anna.ID, nil)
	if err != nil || got.UserID != nil {
		t.Fatalf("unlink = %+v, %v", got, err)
	}
	if _, err := f.st.LinkUser(f.ctx, marco.ID, &u.ID); err != nil {
		t.Errorf("after unlinking the User is free: %v", err)
	}
}

func TestRemovingAUserKeepsTheMemberButDropsTheLink(t *testing.T) {
	f := newFx(t)
	u, _ := f.auth.AddUser(f.ctx, "anna@example.test", "Anna", false)
	anna := f.member(t, "Anna", 1)
	f.st.LinkUser(f.ctx, anna.ID, &u.ID)
	if err := f.auth.DeleteUser(f.ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	got, err := f.st.Member(f.ctx, anna.ID)
	if err != nil || got.UserID != nil {
		t.Fatalf("member after user removal = %+v, %v", got, err)
	}
}

func TestSlotsAreOrderedAndCarryTheirAttendance(t *testing.T) {
	f := newFx(t)
	anna, sam := f.member(t, "Anna", 1), f.member(t, "Sam", 0.5)
	att := []household.Attendee{{MemberID: anna.ID}, {MemberID: sam.ID, PortionFactorOverride: fp(1)}}
	tueDinner, err := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 2, Name: "Dinner", Time: "19:30", Attendance: att})
	if err != nil {
		t.Fatal(err)
	}
	monDinner, _ := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00"})
	monLunch, _ := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 1, Name: "Lunch", Time: "12:30"})
	list, err := f.st.Slots(f.ctx)
	if err != nil || len(list) != 3 || list[0].ID != monLunch.ID || list[1].ID != monDinner.ID || list[2].ID != tueDinner.ID {
		t.Fatalf("order = %+v, %v", list, err)
	}
	got := list[2].Attendance
	if len(got) != 2 || got[0].MemberID != anna.ID || got[0].PortionFactorOverride != nil || got[1].PortionFactorOverride == nil || *got[1].PortionFactorOverride != 1 {
		t.Fatalf("attendance = %+v", got)
	}
}

func TestSlotNamesAreUniquePerWeekdayOnly(t *testing.T) {
	f := newFx(t)
	if _, err := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 1, Name: "Dinner", Time: "19:00"}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 1, Name: "dinner", Time: "20:00"}); !errors.Is(err, household.ErrDuplicateSlot) {
		t.Errorf("same weekday, other case: %v", err)
	}
	if _, err := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 2, Name: "Dinner", Time: "20:00"}); err != nil {
		t.Errorf("same name on another weekday must be allowed: %v", err)
	}
	if _, err := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 3, Name: "Dinner", Time: "20:00", Attendance: []household.Attendee{{MemberID: 777}}}); !errors.Is(err, household.ErrUnknownMember) {
		t.Errorf("unknown member: %v", err)
	}
}

func TestUpdateSlotReplacesAttendanceAndKeepsDateOverrides(t *testing.T) {
	f := newFx(t)
	anna, sam := f.member(t, "Anna", 1), f.member(t, "Sam", 0.5)
	slot, _ := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 4, Name: "Dinner", Time: "19:00", Attendance: []household.Attendee{{MemberID: anna.ID}, {MemberID: sam.ID}}})
	f.st.SetDateAttendance(f.ctx, slot.ID, "2026-11-12", []household.Attendee{{MemberID: anna.ID}})
	up, err := f.st.UpdateSlot(f.ctx, slot.ID, household.MealSlotInput{Weekday: 4, Name: "Supper", Time: "20:15", Attendance: []household.Attendee{{MemberID: sam.ID}}})
	if err != nil || up.Name != "Supper" || up.Time != "20:15" || len(up.Attendance) != 1 || up.Attendance[0].MemberID != sam.ID {
		t.Fatalf("update = %+v, %v", up, err)
	}
	att, isOverride, _ := f.st.DateAttendance(f.ctx, slot.ID, "2026-11-12")
	if !isOverride || len(att) != 1 || att[0].MemberID != anna.ID {
		t.Fatalf("override lost: %+v %v", att, isOverride)
	}
	if _, err := f.st.UpdateSlot(f.ctx, 999, household.MealSlotInput{Weekday: 1, Name: "x", Time: "10:00"}); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("unknown slot: %v", err)
	}
}

func TestDateAttendanceOverride(t *testing.T) {
	f := newFx(t)
	anna, sam := f.member(t, "Anna", 1), f.member(t, "Sam", 0.5)
	slot, _ := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 4, Name: "Dinner", Time: "19:00", Attendance: []household.Attendee{{MemberID: anna.ID}, {MemberID: sam.ID}}})

	att, isOverride, err := f.st.DateAttendance(f.ctx, slot.ID, "2026-11-12")
	if err != nil || isOverride || len(att) != 2 {
		t.Fatalf("no override: %+v %v %v", att, isOverride, err)
	}
	if err := f.st.SetDateAttendance(f.ctx, slot.ID, "2026-11-12", []household.Attendee{{MemberID: anna.ID, PortionFactorOverride: fp(1.5)}}); err != nil {
		t.Fatal(err)
	}
	att, isOverride, _ = f.st.DateAttendance(f.ctx, slot.ID, "2026-11-12")
	if !isOverride || len(att) != 1 || att[0].PortionFactorOverride == nil || *att[0].PortionFactorOverride != 1.5 {
		t.Fatalf("override = %+v %v", att, isOverride)
	}
	other, isOverride, _ := f.st.DateAttendance(f.ctx, slot.ID, "2026-11-19")
	if isOverride || len(other) != 2 {
		t.Fatalf("the next Thursday must be untouched: %+v %v", other, isOverride)
	}
	// Setting again replaces; an empty override means nobody attends.
	f.st.SetDateAttendance(f.ctx, slot.ID, "2026-11-12", nil)
	att, isOverride, _ = f.st.DateAttendance(f.ctx, slot.ID, "2026-11-12")
	if !isOverride || len(att) != 0 {
		t.Fatalf("empty override = %+v %v", att, isOverride)
	}
	if err := f.st.ClearDateAttendance(f.ctx, slot.ID, "2026-11-12"); err != nil {
		t.Fatal(err)
	}
	if err := f.st.ClearDateAttendance(f.ctx, slot.ID, "2026-11-12"); err != nil {
		t.Errorf("clearing twice must be fine: %v", err)
	}
	att, isOverride, _ = f.st.DateAttendance(f.ctx, slot.ID, "2026-11-12")
	if isOverride || len(att) != 2 {
		t.Fatalf("after clear = %+v %v", att, isOverride)
	}
	if _, _, err := f.st.DateAttendance(f.ctx, 999, "2026-11-12"); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("unknown slot: %v", err)
	}
	if err := f.st.SetDateAttendance(f.ctx, slot.ID, "2026-11-12", []household.Attendee{{MemberID: 555}}); !errors.Is(err, household.ErrUnknownMember) {
		t.Errorf("unknown member: %v", err)
	}
}

func TestDeletingAMemberRemovesThemFromEveryAttendance(t *testing.T) {
	f := newFx(t)
	anna, sam := f.member(t, "Anna", 1), f.member(t, "Sam", 0.5)
	slot, _ := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 4, Name: "Dinner", Time: "19:00", Attendance: []household.Attendee{{MemberID: anna.ID}, {MemberID: sam.ID}}})
	f.st.SetDateAttendance(f.ctx, slot.ID, "2026-11-12", []household.Attendee{{MemberID: sam.ID}})
	if err := f.st.DeleteMember(f.ctx, sam.ID); err != nil {
		t.Fatal(err)
	}
	got, _ := f.st.Slot(f.ctx, slot.ID)
	if len(got.Attendance) != 1 || got.Attendance[0].MemberID != anna.ID {
		t.Errorf("usual attendance = %+v", got.Attendance)
	}
	att, isOverride, _ := f.st.DateAttendance(f.ctx, slot.ID, "2026-11-12")
	if !isOverride || len(att) != 0 {
		t.Errorf("date override = %+v %v", att, isOverride)
	}
}

func TestDeletingASlotRemovesItsOverrides(t *testing.T) {
	f := newFx(t)
	anna := f.member(t, "Anna", 1)
	slot, _ := f.st.CreateSlot(f.ctx, household.MealSlotInput{Weekday: 4, Name: "Dinner", Time: "19:00", Attendance: []household.Attendee{{MemberID: anna.ID}}})
	f.st.SetDateAttendance(f.ctx, slot.ID, "2026-11-12", nil)
	if err := f.st.DeleteSlot(f.ctx, slot.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.st.Slot(f.ctx, slot.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("slot after delete: %v", err)
	}
	if err := f.st.DeleteSlot(f.ctx, slot.ID); !errors.Is(err, household.ErrNotFound) {
		t.Errorf("second delete: %v", err)
	}
}

func TestPreferencesDefaultThenRoundTrip(t *testing.T) {
	f := newFx(t)
	u, _ := f.auth.AddUser(f.ctx, "anna@example.test", "Anna", false)
	got, err := f.st.Preferences(f.ctx, u.ID)
	if err != nil || got.Scheme != "system" || got.Accent != "#3f7d58" || got.Units != "metric" {
		t.Fatalf("defaults = %+v, %v", got, err)
	}
	want := household.Preferences{Scheme: "dark", Accent: "#3366cc", Units: "imperial"}
	if err := f.st.SavePreferences(f.ctx, u.ID, want); err != nil {
		t.Fatal(err)
	}
	got, _ = f.st.Preferences(f.ctx, u.ID)
	if got.Scheme != "dark" || got.Accent != "#3366cc" || got.Units != "imperial" {
		t.Fatalf("round trip = %+v", got)
	}
	other, _ := f.auth.AddUser(f.ctx, "marco@example.test", "Marco", false)
	if got, _ = f.st.Preferences(f.ctx, other.ID); got.Scheme != "system" {
		t.Errorf("preferences are per User: %+v", got)
	}
}

// R11c: the Household's creation time is stamped with the clock on first read and then stays.
func TestCreatedIsStampedOnFirstReadAndStays(t *testing.T) {
	f := newFx(t)
	first, err := f.st.Created(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !first.Equal(testkit.StartTime) {
		t.Fatalf("Created = %v, want the clock's %v", first, testkit.StartTime)
	}
	again, err := f.st.Created(f.ctx)
	if err != nil || !again.Equal(first) {
		t.Fatalf("second read = %v %v, want %v", again, err, first)
	}
}
