package auth

import (
	"context"
	"errors"
)

var (
	// ErrLastAdmin is returned when removing or demoting the only Admin.
	ErrLastAdmin = errors.New("auth: cannot remove or demote the last Admin")
	// ErrInvalidEmail is returned for text that is not a plausible e-mail address.
	ErrInvalidEmail = errors.New("auth: invalid email address")
)

// NormalizeEmail trims and lower-cases an address and checks it has the shape
// local@domain.tld with no spaces. ErrInvalidEmail otherwise.
func NormalizeEmail(email string) (string, error) { panic("auth: not implemented") }

// ListUsers returns every User on the allowlist, ordered by id.
func (s *Service) ListUsers(ctx context.Context) ([]User, error) { panic("auth: not implemented") }

// SetAdmin grants or revokes Admin. ErrNotFound if absent; ErrLastAdmin when
// revoking the only Admin. Sessions stay open; the role is read on every request.
func (s *Service) SetAdmin(ctx context.Context, id int64, admin bool) (User, error) {
	panic("auth: not implemented")
}

// RemoveUser removes a User from the allowlist and ends their sessions at once
// (via DeleteUser). ErrNotFound if absent; ErrLastAdmin for the only Admin.
func (s *Service) RemoveUser(ctx context.Context, id int64) error { panic("auth: not implemented") }

// SetDisplayName changes a User's display name. ErrNotFound if absent.
func (s *Service) SetDisplayName(ctx context.Context, id int64, name string) error {
	panic("auth: not implemented")
}
