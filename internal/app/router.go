package app

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/auth"
)

// Router registers routes on the application mux. Patterns use the Go 1.22
// "METHOD /path/{id}" syntax. User and Admin routes require a session.
type Router struct {
	mux  *http.ServeMux
	auth *auth.Service
}

// Public registers a route that anyone may call.
func (r *Router) Public(pattern string, h http.HandlerFunc) { r.mux.HandleFunc(pattern, h) }

// User registers a route that requires a signed-in User.
func (r *Router) User(pattern string, h http.HandlerFunc) {
	r.mux.Handle(pattern, r.auth.RequireUser(h))
}

// Admin registers a route that requires an Admin.
func (r *Router) Admin(pattern string, h http.HandlerFunc) {
	r.mux.Handle(pattern, r.auth.RequireAdmin(h))
}
