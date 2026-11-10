// Package httpapi is the access module: the pending-request routes of docs/dev/design/a1-access-requests.md, the
// waiting-page status, the daily purge job and the live `access` events. Handlers only parse, call access.Service and
// respond.
package httpapi

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/fabbarix/feeder-ng/internal/access"
	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "access", Mount: mount}) }

const (
	// CookieName is the waiting-page cookie set by the Google callback.
	CookieName = "feeder_access"
	// CookiePath scopes the cookie to the status route, so no other request carries it.
	CookiePath = "/api/access-request"

	topic        = "access"
	historyLimit = 50
)

// Cookie is the waiting-page cookie for token, valid until expires.
func Cookie(token string, expires time.Time, secure bool) *http.Cookie {
	return &http.Cookie{Name: CookieName, Value: token, Path: CookiePath, Expires: expires, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode}
}

type api struct{ d app.Deps }

func mount(r *app.Router, d app.Deps) {
	a := &api{d: d}
	d.Access.OnRequested(func(access.Request) { a.changed() })
	d.Scheduler.Daily("access.purge", "03:45", func(ctx context.Context, _ string) error {
		n, err := d.Access.Purge(ctx)
		if n > 0 {
			a.changed()
		}
		return err
	})
	r.Public("GET /api/access-request/status", a.status)
	r.User("GET /api/access-requests", a.list)
	r.User("GET /api/access-requests/history", a.history)
	r.User("POST /api/access-requests/{id}/approve", a.approve)
	r.User("POST /api/access-requests/{id}/deny", a.deny)
}

func (a *api) changed() { a.d.Events.Publish(topic, map[string]string{"changed": "requests"}) }

func fail(w http.ResponseWriter, err error) {
	if errors.Is(err, access.ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "That request was already answered or has expired")
		return
	}
	httpx.WriteAPIError(w, err)
}

func (a *api) status(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	token := ""
	if c, err := r.Cookie(CookieName); err == nil {
		token = c.Value
	}
	st, err := a.d.Access.Status(r.Context(), token)
	if err != nil {
		fail(w, err)
		return
	}
	if st.State != "pending" {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "none"})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "pending", "email": st.Email, "name": st.Name, "requestedAt": rfc(st.RequestedAt)})
}

func rfc(t time.Time) string { return t.UTC().Format(time.RFC3339) }

type requestJSON struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	Name        string `json:"name"`
	Picture     string `json:"picture"`
	RequestedAt string `json:"requestedAt"`
	ExpiresAt   string `json:"expiresAt"`
}

func (a *api) list(w http.ResponseWriter, r *http.Request) {
	reqs, err := a.d.Access.List(r.Context())
	if err != nil {
		fail(w, err)
		return
	}
	out := make([]requestJSON, 0, len(reqs))
	for _, q := range reqs {
		out = append(out, requestJSON{ID: q.ID, Email: q.Email, Name: q.Name, Picture: q.Picture, RequestedAt: rfc(q.RequestedAt), ExpiresAt: rfc(q.ExpiresAt)})
	}
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"requests": out, "count": len(out)})
}

func (a *api) history(w http.ResponseWriter, r *http.Request) {
	evs, err := a.d.Access.History(r.Context(), historyLimit)
	if err != nil {
		fail(w, err)
		return
	}
	type eventJSON struct {
		Kind       string `json:"kind"`
		Email      string `json:"email"`
		Name       string `json:"name"`
		At         string `json:"at"`
		ActorEmail string `json:"actorEmail"`
	}
	out := make([]eventJSON, 0, len(evs))
	for _, e := range evs {
		out = append(out, eventJSON{Kind: string(e.Kind), Email: e.Email, Name: e.Name, At: rfc(e.At), ActorEmail: e.ActorEmail})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"events": out})
}

func requestID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil && id > 0
}

func (a *api) approve(w http.ResponseWriter, r *http.Request) {
	id, ok := requestID(r)
	if !ok {
		fail(w, access.ErrNotFound)
		return
	}
	actor, _ := auth.UserFrom(r.Context())
	u, err := a.d.Access.Approve(r.Context(), id, actor)
	if err != nil {
		fail(w, err)
		return
	}
	a.changed()
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"id": u.ID, "email": u.Email, "displayName": u.DisplayName, "isAdmin": u.IsAdmin})
}

func (a *api) deny(w http.ResponseWriter, r *http.Request) {
	id, ok := requestID(r)
	if !ok {
		fail(w, access.ErrNotFound)
		return
	}
	actor, _ := auth.UserFrom(r.Context())
	if err := a.d.Access.Deny(r.Context(), id, actor); err != nil {
		fail(w, err)
		return
	}
	a.changed()
	w.WriteHeader(http.StatusNoContent)
}
