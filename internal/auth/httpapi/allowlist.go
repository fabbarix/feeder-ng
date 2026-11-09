package httpapi

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// allowedBody is one allowlist entry as the Admin sees it.
type allowedBody struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	IsAdmin     bool   `json:"isAdmin"`
}

func allowed(u auth.User) allowedBody {
	return allowedBody{ID: u.ID, Email: u.Email, DisplayName: u.DisplayName, IsAdmin: u.IsAdmin}
}

// mountAllowlist registers the Admin-only allowlist routes.
func mountAllowlist(r *app.Router, d app.Deps) {
	r.Admin("GET /api/allowlist", func(w http.ResponseWriter, req *http.Request) {
		users, err := d.Auth.ListUsers(req.Context())
		if err != nil {
			httpx.WriteAPIError(w, err)
			return
		}
		out := make([]allowedBody, 0, len(users))
		for _, u := range users {
			out = append(out, allowed(u))
		}
		httpx.WriteJSON(w, http.StatusOK, out)
	})

	r.Admin("POST /api/allowlist", func(w http.ResponseWriter, req *http.Request) {
		var in struct {
			Email       string `json:"email"`
			DisplayName string `json:"displayName"`
			IsAdmin     bool   `json:"isAdmin"`
		}
		if err := httpx.DecodeJSON(req, &in); err != nil {
			httpx.WriteAPIError(w, err)
			return
		}
		email, err := auth.NormalizeEmail(in.Email)
		if err != nil {
			httpx.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", "email must be an address like name@example.com")
			return
		}
		name := strings.TrimSpace(in.DisplayName)
		if name == "" {
			name = localPart(email)
		}
		u, err := d.Auth.AddUser(req.Context(), email, name, in.IsAdmin)
		switch {
		case errors.Is(err, auth.ErrEmailTaken):
			httpx.WriteError(w, http.StatusConflict, "email_taken", "That email is already on the allowlist")
			return
		case err != nil:
			httpx.WriteAPIError(w, err)
			return
		}
		httpx.WriteJSON(w, http.StatusCreated, allowed(u))
	})

	r.Admin("PATCH /api/allowlist/{id}", func(w http.ResponseWriter, req *http.Request) {
		id, ok := pathID(req)
		if !ok {
			notFound(w)
			return
		}
		var in struct {
			IsAdmin *bool `json:"isAdmin"`
		}
		if err := httpx.DecodeJSON(req, &in); err != nil {
			httpx.WriteAPIError(w, err)
			return
		}
		if in.IsAdmin == nil {
			httpx.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", "isAdmin is required")
			return
		}
		u, err := d.Auth.SetAdmin(req.Context(), id, *in.IsAdmin)
		if !writeAllowlistError(w, err) {
			return
		}
		httpx.WriteJSON(w, http.StatusOK, allowed(u))
	})

	r.Admin("DELETE /api/allowlist/{id}", func(w http.ResponseWriter, req *http.Request) {
		id, ok := pathID(req)
		if !ok {
			notFound(w)
			return
		}
		err := d.Auth.RemoveUser(req.Context(), id)
		if !writeAllowlistError(w, err) {
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

// writeAllowlistError maps the allowlist errors to responses. It reports whether
// the request may carry on (err was nil).
func writeAllowlistError(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return true
	case errors.Is(err, auth.ErrNotFound):
		notFound(w)
	case errors.Is(err, auth.ErrLastAdmin):
		httpx.WriteError(w, http.StatusConflict, "last_admin", "The last Admin cannot be removed or made a User")
	default:
		httpx.WriteAPIError(w, err)
	}
	return false
}

func pathID(req *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(req.PathValue("id"), 10, 64)
	return id, err == nil
}

func notFound(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
}
