package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

var (
	// ErrLastAdmin is returned when removing or demoting the only Admin.
	ErrLastAdmin = errors.New("auth: cannot remove or demote the last Admin")
	// ErrInvalidEmail is returned for text that is not a plausible e-mail address.
	ErrInvalidEmail = errors.New("auth: invalid email address")
)

// NormalizeEmail trims and lower-cases an address and checks it has the shape
// local@domain.tld with no spaces. ErrInvalidEmail otherwise.
func NormalizeEmail(email string) (string, error) {
	e := normalizeEmail(email)
	if e == "" || strings.ContainsAny(e, " \t\r\n") || strings.Count(e, "@") != 1 {
		return "", ErrInvalidEmail
	}
	local, domain, _ := strings.Cut(e, "@")
	if local == "" || !strings.Contains(domain, ".") || strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") {
		return "", ErrInvalidEmail
	}
	return e, nil
}

// ListUsers returns every User on the allowlist, ordered by id.
func (s *Service) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, email, display_name, is_admin, created_at FROM users ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// SetAdmin grants or revokes Admin. ErrNotFound if absent; ErrLastAdmin when
// revoking the only Admin. Sessions stay open; the role is read on every request.
func (s *Service) SetAdmin(ctx context.Context, id int64, admin bool) (User, error) {
	u, err := s.userByID(ctx, id)
	if err != nil {
		return User{}, err
	}
	if !admin && u.IsAdmin {
		if err := s.guardLastAdmin(ctx); err != nil {
			return User{}, err
		}
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET is_admin = ? WHERE id = ?`, admin, id); err != nil {
		return User{}, err
	}
	u.IsAdmin = admin
	return u, nil
}

// RemoveUser removes a User from the allowlist and ends their sessions at once
// (via DeleteUser). ErrNotFound if absent; ErrLastAdmin for the only Admin.
func (s *Service) RemoveUser(ctx context.Context, id int64) error {
	u, err := s.userByID(ctx, id)
	if err != nil {
		return err
	}
	if u.IsAdmin {
		if err := s.guardLastAdmin(ctx); err != nil {
			return err
		}
	}
	return s.DeleteUser(ctx, id)
}

// SetDisplayName changes a User's display name. ErrNotFound if absent.
func (s *Service) SetDisplayName(ctx context.Context, id int64, name string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE users SET display_name = ? WHERE id = ?`, name, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// guardLastAdmin returns ErrLastAdmin unless more than one Admin exists.
func (s *Service) guardLastAdmin(ctx context.Context) error {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE is_admin = 1`).Scan(&n); err != nil {
		return err
	}
	if n <= 1 {
		return ErrLastAdmin
	}
	return nil
}

func (s *Service) userByID(ctx context.Context, id int64) (User, error) {
	u, err := scanUser(s.db.QueryRowContext(ctx,
		`SELECT id, email, display_name, is_admin, created_at FROM users WHERE id = ?`, id))
	if errors.Is(err, ErrNotFound) {
		return User{}, ErrNotFound
	}
	return u, err
}

// rowScanner is satisfied by *sql.Row and *sql.Rows.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanUser(r rowScanner) (User, error) {
	var (
		u       User
		created string
	)
	if err := r.Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsAdmin, &created); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, err
	}
	t, err := time.Parse(timeFormat, created)
	if err != nil {
		return User{}, err
	}
	u.CreatedAt = t
	return u, nil
}
