package auth

import (
	"context"
	"errors"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/httpx"
)

type (
	userKey    struct{}
	sessionKey struct{}
)

// ContextWithUser returns ctx carrying u.
func ContextWithUser(ctx context.Context, u User) context.Context {
	return context.WithValue(ctx, userKey{}, u)
}

// UserFrom returns the User carried by ctx, if any.
func UserFrom(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userKey{}).(User)
	return u, ok
}

// SessionKeyFrom returns the SessionKey of the session that authenticated the
// request in ctx, or "" when there is none.
func SessionKeyFrom(ctx context.Context) string {
	k, _ := ctx.Value(sessionKey{}).(string)
	return k
}

// RequireUser rejects requests without a valid session with 401, and otherwise
// passes the User on in the request context. A slid session cookie is re-sent.
func (s *Service) RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := ""
		if c, err := r.Cookie(CookieName); err == nil {
			token = c.Value
		}
		res, err := s.resolve(r.Context(), token)
		if errors.Is(err, ErrNoSession) {
			httpx.WriteError(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue")
			return
		}
		if err != nil {
			httpx.WriteAPIError(w, err)
			return
		}
		if res.slid {
			http.SetCookie(w, s.SessionCookie(token, res.expiresAt))
		}
		ctx := context.WithValue(r.Context(), sessionKey{}, SessionKey(res.sessionID))
		next.ServeHTTP(w, r.WithContext(ContextWithUser(ctx, res.user)))
	})
}

// RequireAdmin is RequireUser plus an Admin check: 403 for a non-Admin.
func (s *Service) RequireAdmin(next http.Handler) http.Handler {
	return s.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if u, _ := UserFrom(r.Context()); !u.IsAdmin {
			httpx.WriteError(w, http.StatusForbidden, "forbidden", "Only Admins can do that")
			return
		}
		next.ServeHTTP(w, r)
	}))
}
