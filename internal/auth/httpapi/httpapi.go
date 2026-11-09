// Package httpapi exposes the auth module's routes: the current User, sign-out,
// and the development-only sign-in. It registers itself with the app registry.
package httpapi

import (
	"errors"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "auth", Mount: mount}) }

type meBody struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	IsAdmin     bool   `json:"isAdmin"`
}

func me(u auth.User) meBody {
	return meBody{ID: u.ID, Email: u.Email, DisplayName: u.DisplayName, IsAdmin: u.IsAdmin}
}

func mount(r *app.Router, d app.Deps) {
	r.User("GET /api/me", func(w http.ResponseWriter, req *http.Request) {
		u, _ := auth.UserFrom(req.Context())
		httpx.WriteJSON(w, http.StatusOK, me(u))
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
