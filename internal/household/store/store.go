// Package store is the SQLite repository for the household package's types.
package store

import (
	"context"
	"database/sql"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/household"
)

// Store reads and writes the household tables (migration 0100_household.sql).
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store over an open, migrated database.
func New(d *sql.DB, clk clock.Clock) *Store { return &Store{db: d, clk: clk} }

func ni() { panic("store: not implemented") }

// Settings returns the single settings row (DefaultSettings("UTC") with
// TimeZoneConfigured=false until first saved).
func (s *Store) Settings(ctx context.Context) (household.Settings, error) {
	ni()
	return household.Settings{}, nil
}

// SaveSettings stores every field as given, including TimeZoneConfigured.
func (s *Store) SaveSettings(ctx context.Context, v household.Settings) error { ni(); return nil }

// Members lists Members ordered by id.
func (s *Store) Members(ctx context.Context) ([]household.Member, error) { ni(); return nil, nil }

// Member returns one Member. household.ErrNotFound if absent.
func (s *Store) Member(ctx context.Context, id int64) (household.Member, error) {
	ni()
	return household.Member{}, nil
}

func (s *Store) CreateMember(ctx context.Context, in household.MemberInput) (household.Member, error) {
	ni()
	return household.Member{}, nil
}

// UpdateMember changes name, colour, avatar and Portion Factor, keeping the User link.
func (s *Store) UpdateMember(ctx context.Context, id int64, in household.MemberInput) (household.Member, error) {
	ni()
	return household.Member{}, nil
}

// DeleteMember removes the Member and their place in every Attendance.
func (s *Store) DeleteMember(ctx context.Context, id int64) error { ni(); return nil }

// LinkUser links the Member to a User, or unlinks with nil. household.ErrUserLinked when
// that User is already linked to another Member; ErrNotFound for an unknown Member or User.
func (s *Store) LinkUser(ctx context.Context, memberID int64, userID *int64) (household.Member, error) {
	ni()
	return household.Member{}, nil
}

// Slots lists Meal Slots ordered by weekday, time, name, each with its usual Attendance.
func (s *Store) Slots(ctx context.Context) ([]household.MealSlot, error) { ni(); return nil, nil }

func (s *Store) Slot(ctx context.Context, id int64) (household.MealSlot, error) {
	ni()
	return household.MealSlot{}, nil
}

// CreateSlot: ErrDuplicateSlot (same weekday, name case-insensitively), ErrUnknownMember.
func (s *Store) CreateSlot(ctx context.Context, in household.MealSlotInput) (household.MealSlot, error) {
	ni()
	return household.MealSlot{}, nil
}

// UpdateSlot replaces weekday, name, time and the usual Attendance. Date overrides are kept.
func (s *Store) UpdateSlot(ctx context.Context, id int64, in household.MealSlotInput) (household.MealSlot, error) {
	ni()
	return household.MealSlot{}, nil
}

// DeleteSlot removes the Meal Slot with its Attendance and date overrides.
func (s *Store) DeleteSlot(ctx context.Context, id int64) error { ni(); return nil }

// DateAttendance returns the override for date when one exists (isOverride true,
// possibly empty), otherwise the usual Attendance. ErrNotFound for an unknown slot.
func (s *Store) DateAttendance(ctx context.Context, slotID int64, date string) (att []household.Attendee, isOverride bool, err error) {
	ni()
	return nil, false, nil
}

// SetDateAttendance stores the override for date, replacing any earlier one.
func (s *Store) SetDateAttendance(ctx context.Context, slotID int64, date string, att []household.Attendee) error {
	ni()
	return nil
}

// ClearDateAttendance removes the override for date (idempotent).
func (s *Store) ClearDateAttendance(ctx context.Context, slotID int64, date string) error {
	ni()
	return nil
}

// Preferences returns the User's preferences, or DefaultPreferences when none are saved.
func (s *Store) Preferences(ctx context.Context, userID int64) (household.Preferences, error) {
	ni()
	return household.Preferences{}, nil
}

func (s *Store) SavePreferences(ctx context.Context, userID int64, p household.Preferences) error {
	ni()
	return nil
}
