package auth

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
)

// FlowCookieName is the short-lived cookie that carries the OAuth state and PKCE verifier.
const FlowCookieName = "feeder_oauth"

// FlowTTL is how long a sign-in may take between the redirect and the callback.
const FlowTTL = 10 * time.Minute

// flowCookiePath scopes the flow cookie to the Google routes.
const flowCookiePath = "/auth/google"

// ErrBadFlow is returned for a missing or malformed flow cookie.
var ErrBadFlow = errors.New("auth: bad sign-in flow cookie")

// Flow is one in-progress sign-in: a random state and a PKCE code verifier.
type Flow struct{ State, Verifier string }

// NewFlow reads 32 random bytes for the state, then 32 for the verifier, each
// base64url (no padding, so 43 characters), from r.
func NewFlow(r io.Reader) (Flow, error) {
	var state, verifier [32]byte
	if _, err := io.ReadFull(r, state[:]); err != nil {
		return Flow{}, err
	}
	if _, err := io.ReadFull(r, verifier[:]); err != nil {
		return Flow{}, err
	}
	return Flow{
		State:    base64.RawURLEncoding.EncodeToString(state[:]),
		Verifier: base64.RawURLEncoding.EncodeToString(verifier[:]),
	}, nil
}

// Challenge is the S256 PKCE challenge of the verifier.
func (f Flow) Challenge() string { return PKCEChallenge(f.Verifier) }

// PKCEChallenge is base64url(sha256(verifier)) without padding (RFC 7636).
func PKCEChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// Cookie is the flow cookie: value "<state>.<verifier>", Path /auth/google,
// HttpOnly, SameSite=Lax, Secure as given, expiring FlowTTL after now.
func (f Flow) Cookie(secure bool, now time.Time) *http.Cookie {
	return &http.Cookie{
		Name:     FlowCookieName,
		Value:    f.State + "." + f.Verifier,
		Path:     flowCookiePath,
		Expires:  now.Add(FlowTTL),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
	}
}

// ClearFlowCookie expires the flow cookie.
func ClearFlowCookie(secure bool) *http.Cookie {
	return &http.Cookie{
		Name:     FlowCookieName,
		Value:    "",
		Path:     flowCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
	}
}

// ParseFlowCookie reads a flow cookie back. ErrBadFlow if it is nil or malformed.
func ParseFlowCookie(c *http.Cookie) (Flow, error) {
	if c == nil {
		return Flow{}, ErrBadFlow
	}
	state, verifier, ok := strings.Cut(c.Value, ".")
	if !ok || state == "" || verifier == "" {
		return Flow{}, ErrBadFlow
	}
	return Flow{State: state, Verifier: verifier}, nil
}

// Matches compares state with the flow's state in constant time.
func (f Flow) Matches(state string) bool {
	return f.State != "" && subtle.ConstantTimeCompare([]byte(f.State), []byte(state)) == 1
}
