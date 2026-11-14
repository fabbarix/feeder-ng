// Package httpapi exposes the auth module's routes: the current User, sign-out,
// and the development-only sign-in. It registers itself with the app registry.
package httpapi

import (
	"errors"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "auth", Mount: mount}) }

type meBody struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	IsAdmin     bool   `json:"isAdmin"`
	// HouseholdTimeZone is the Household's IANA zone name ("UTC" until an Admin sets one), so the shell can show
	// household dates before any other request returns (RES-08). Only GET /api/me carries it.
	HouseholdTimeZone string `json:"householdTimeZone,omitempty"`
}

func me(u auth.User) meBody {
	return meBody{ID: u.ID, Email: u.Email, DisplayName: u.DisplayName, IsAdmin: u.IsAdmin}
}

func mount(r *app.Router, d app.Deps) {
	signInRoutes(r, d)
	mountAllowlist(r, d)

	settings := householdstore.New(d.DB, d.Clock)
	r.User("GET /api/me", func(w http.ResponseWriter, req *http.Request) {
		u, _ := auth.UserFrom(req.Context())
		s, err := settings.Settings(req.Context())
		if err != nil {
			httpx.WriteAPIError(w, err)
			return
		}
		body := me(u)
		body.HouseholdTimeZone = s.TimeZone
		httpx.WriteJSON(w, http.StatusOK, body)
	})

	r.Public("POST /api/logout", func(w http.ResponseWriter, req *http.Request) {
		if c, err := req.Cookie(auth.CookieName); err == nil {
			if err := d.Auth.EndSession(req.Context(), c.Value); err != nil {
				httpx.WriteAPIError(w, err)
				return
			}
		}
		http.SetCookie(w, d.Auth.ClearCookie())
		w.WriteHeader(http.StatusNoContent)
	})

	if d.Config.DevLogin {
		r.Public("POST /api/dev/login", func(w http.ResponseWriter, req *http.Request) {
			var in struct {
				Email string `json:"email"`
			}
			if err := httpx.DecodeJSON(req, &in); err != nil {
				httpx.WriteAPIError(w, err)
				return
			}
			u, err := d.Auth.UserByEmail(req.Context(), in.Email)
			if errors.Is(err, auth.ErrNotFound) {
				httpx.WriteError(w, http.StatusForbidden, "not_allowed", "That email is not on the allowlist")
				return
			}
			if err != nil {
				httpx.WriteAPIError(w, err)
				return
			}
			token, exp, err := d.Auth.CreateSession(req.Context(), u.ID)
			if err != nil {
				httpx.WriteAPIError(w, err)
				return
			}
			http.SetCookie(w, d.Auth.SessionCookie(token, exp))
			httpx.WriteJSON(w, http.StatusOK, me(u))
		})
	}
}
