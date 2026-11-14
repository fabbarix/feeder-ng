package store

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// B9-04 removals (ADR 0021). STUB for the tests: the developer replaces every body. DeleteMember and DeleteSlot go
// away (RemoveMember and RemoveSlot replace them).

var errNotBuilt = errors.New("household/store: removals are not built yet (B9-04)")

// AllSlots lists every Meal Slot, removed ones included (Removed true), in the order of Slots.
func (s *Store) AllSlots(ctx context.Context) ([]household.MealSlot, error) { return nil, errNotBuilt }

// RemoveSlot soft-removes an active Meal Slot. household.ErrNotFound for an unknown or already removed one.
func (s *Store) RemoveSlot(ctx context.Context, id int64) error { return errNotBuilt }

// RestoreSlot brings a removed Meal Slot back. ErrNotFound when it is not removed; ErrSlotNameTaken when an active
// Meal Slot has its weekday and name.
func (s *Store) RestoreSlot(ctx context.Context, id int64) (household.MealSlot, error) {
	return household.MealSlot{}, errNotBuilt
}

// SlotImpact is what RemoveSlot would do. ErrNotFound for an unknown or removed Meal Slot.
func (s *Store) SlotImpact(ctx context.Context, id int64) (household.SlotImpact, error) {
	return household.SlotImpact{}, errNotBuilt
}

// RemovedSlots lists removed Meal Slots that kept Cooked or Not cooked meals, newest removal first.
func (s *Store) RemovedSlots(ctx context.Context) ([]household.RemovedSlot, error) {
	return nil, errNotBuilt
}

// RemoveMember snapshots the Member and removes them. ErrNotFound for an unknown one. The photo file stays.
func (s *Store) RemoveMember(ctx context.Context, id int64) error { return errNotBuilt }

// RestoreMember puts a removed Member back with the same id. ErrNotFound when there is no snapshot or it is older
// than RestoreWindowMinutes; ErrEmailTaken when the address was taken since.
func (s *Store) RestoreMember(ctx context.Context, id int64) (household.Member, error) {
	return household.Member{}, errNotBuilt
}

// MemberImpact is what RemoveMember would do. ErrNotFound for an unknown Member.
func (s *Store) MemberImpact(ctx context.Context, id int64) (household.MemberImpact, error) {
	return household.MemberImpact{}, errNotBuilt
}

// ExpireMemberRemovals drops the snapshots older than RestoreWindowMinutes and releases their photos (ReleasePhoto).
// It returns how many it dropped.
func (s *Store) ExpireMemberRemovals(ctx context.Context) (int, error) { return 0, errNotBuilt }
