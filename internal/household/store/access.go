package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/access"
)

// AccessMembers adapts the Store to access.Members: the Household side of sign-in.
type AccessMembers struct{ st *Store }

// AccessMembers returns the adapter used by the Access Request service.
func (s *Store) AccessMembers() AccessMembers { return AccessMembers{st: s} }

// ByEmail returns the Member with that e-mail who has no User yet.
func (a AccessMembers) ByEmail(ctx context.Context, email string) (access.MemberRef, bool, error) {
	var ref access.MemberRef
	err := a.st.db.QueryRowContext(ctx,
		`SELECT id, name FROM members WHERE email = ? AND user_id IS NULL`, strings.ToLower(email)).Scan(&ref.ID, &ref.Name)
	if errors.Is(err, sql.ErrNoRows) {
		return access.MemberRef{}, false, nil
	}
	return ref, err == nil, err
}

// HasEmail reports whether any Member (linked or not) carries the address.
func (a AccessMembers) HasEmail(ctx context.Context, email string) (bool, error) {
	var one int
	err := a.st.db.QueryRowContext(ctx, `SELECT 1 FROM members WHERE email = ?`, strings.ToLower(email)).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// Unlinked lists the Members without a User, by id.
func (a AccessMembers) Unlinked(ctx context.Context) ([]access.MemberRef, error) {
	rows, err := a.st.db.QueryContext(ctx, `SELECT id, name FROM members WHERE user_id IS NULL ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []access.MemberRef{}
	for rows.Next() {
		var r access.MemberRef
		if err := rows.Scan(&r.ID, &r.Name); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// LinkUser links an unlinked Member to a User; access.ErrMemberUnavailable when the Member is gone or linked.
func (a AccessMembers) LinkUser(ctx context.Context, memberID, userID int64) error {
	res, err := a.st.db.ExecContext(ctx, `UPDATE members SET user_id = ? WHERE id = ? AND user_id IS NULL`, userID, memberID)
	if isUnique(err) {
		return access.ErrMemberUnavailable
	}
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err != nil {
		return err
	} else if n == 0 {
		return access.ErrMemberUnavailable
	}
	return nil
}
