package httpapi

import (
	"context"
	"errors"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// memberErr is writeErr plus the Member email clash.
func memberErr(w http.ResponseWriter, err error) {
	if errors.Is(err, household.ErrEmailTaken) {
		httpx.WriteError(w, http.StatusConflict, "email_taken", "That email already belongs to a Member, a User or the allowlist")
		return
	}
	writeErr(w, err)
}

// checkEmail refuses an address that is a User's (the allowlist is the users table). The one overlap allowed is the
// address of the User this Member is itself linked to (linked). Another Member's address is refused by the store.
func (a *api) checkEmail(ctx context.Context, email string, linked *int64) error {
	if email == "" {
		return nil
	}
	u, err := a.d.Auth.UserByEmail(ctx, email)
	if errors.Is(err, auth.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if linked != nil && *linked == u.ID {
		return nil
	}
	return household.ErrEmailTaken
}
