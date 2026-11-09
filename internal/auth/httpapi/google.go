package httpapi

import (
	"crypto/rand"
	"net/http"
	"strings"
	"sync"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// The sign-in provider. override is the test seam set by SetProvider; prod is
// the Google provider built from configuration at mount time (nil when no
// client id is configured).
var (
	providerMu sync.RWMutex
	override   auth.Provider
)

// SetProvider replaces the sign-in provider (a test seam; the provider is read
// at request time) and returns a function that restores the previous one.
// Without an override the provider is built from FEEDER_GOOGLE_CLIENT_ID and
// FEEDER_GOOGLE_CLIENT_SECRET; with no client id, sign-in answers 503
// google_not_configured.
func SetProvider(p auth.Provider) (restore func()) {
	providerMu.Lock()
	prev := override
	override = p
	providerMu.Unlock()
	return func() {
		providerMu.Lock()
		override = prev
		providerMu.Unlock()
	}
}

// signInRoutes registers the Google sign-in routes.
func signInRoutes(r *app.Router, d app.Deps) {
	var prod auth.Provider
	if d.Config.GoogleClientID != "" {
		prod = auth.NewGoogleProvider(d.Config.GoogleClientID, d.Config.GoogleClientSecret)
	}
	current := func() auth.Provider {
		providerMu.RLock()
		defer providerMu.RUnlock()
		if override != nil {
			return override
		}
		return prod
	}
	secure := d.Config.SecureCookies()
	redirect := strings.TrimRight(d.Config.BaseURL, "/") + "/auth/google/callback"

	r.Public("GET /auth/google/login", func(w http.ResponseWriter, req *http.Request) {
		p := current()
		if p == nil {
			httpx.WriteError(w, http.StatusServiceUnavailable, "google_not_configured", "Sign in with Google is not set up on this Feeder")
			return
		}
		flow, err := auth.NewFlow(rand.Reader)
		if err != nil {
			httpx.WriteAPIError(w, err)
			return
		}
		http.SetCookie(w, flow.Cookie(secure, d.Clock.Now()))
		http.Redirect(w, req, p.AuthURL(flow.State, flow.Challenge(), redirect), http.StatusFound)
	})

	r.Public("GET /auth/google/callback", func(w http.ResponseWriter, req *http.Request) {
		http.SetCookie(w, auth.ClearFlowCookie(secure))
		flow, err := auth.ParseFlowCookie(cookieOf(req, auth.FlowCookieName))
		q := req.URL.Query()
		if err != nil || !flow.Matches(q.Get("state")) {
			http.Redirect(w, req, "/sign-in?error=failed", http.StatusFound)
			return
		}
		if q.Get("error") == "access_denied" {
			http.Redirect(w, req, "/sign-in?error=denied", http.StatusFound)
			return
		}
		p := current()
		code := q.Get("code")
		if p == nil || code == "" {
			http.Redirect(w, req, "/sign-in?error=failed", http.StatusFound)
			return
		}
		id, err := p.Exchange(req.Context(), code, flow.Verifier, redirect)
		if err != nil {
			d.Logger.Warn("google sign-in exchange failed", "err", err)
			http.Redirect(w, req, "/sign-in?error=failed", http.StatusFound)
			return
		}
		if !id.EmailVerified {
			http.Redirect(w, req, "/not-invited", http.StatusFound)
			return
		}
		u, err := d.Auth.UserByEmail(req.Context(), id.Email)
		if err != nil {
			// Not on the allowlist (or an unusable address): nothing is created.
			http.Redirect(w, req, "/not-invited", http.StatusFound)
			return
		}
		// The first sign-in replaces the default name (the e-mail's local part)
		// with Google's name; a name the Admin chose is never overwritten.
		if u.DisplayName == localPart(u.Email) && strings.TrimSpace(id.Name) != "" {
			if err := d.Auth.SetDisplayName(req.Context(), u.ID, strings.TrimSpace(id.Name)); err != nil {
				httpx.WriteAPIError(w, err)
				return
			}
		}
		token, exp, err := d.Auth.CreateSession(req.Context(), u.ID)
		if err != nil {
			http.Redirect(w, req, "/sign-in?error=failed", http.StatusFound)
			return
		}
		http.SetCookie(w, d.Auth.SessionCookie(token, exp))
		http.Redirect(w, req, "/", http.StatusFound)
	})
}

func cookieOf(r *http.Request, name string) *http.Cookie {
	c, err := r.Cookie(name)
	if err != nil {
		return nil
	}
	return c
}

// localPart is the part of an e-mail address before the @.
func localPart(email string) string { return strings.SplitN(email, "@", 2)[0] }
