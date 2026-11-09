package auth

import (
	"errors"
	"io"
	"net/http"
	"time"
)

// FlowCookieName is the short-lived cookie that carries the OAuth state and PKCE verifier.
const FlowCookieName = "feeder_oauth"

// FlowTTL is how long a sign-in may take between the redirect and the callback.
const FlowTTL = 10 * time.Minute

// ErrBadFlow is returned for a missing or malformed flow cookie.
var ErrBadFlow = errors.New("auth: bad sign-in flow cookie")

// Flow is one in-progress sign-in: a random state and a PKCE code verifier.
type Flow struct{ State, Verifier string }

// NewFlow reads 32 random bytes for the state, then 32 for the verifier, each
// base64url (no padding, so 43 characters), from r.
func NewFlow(r io.Reader) (Flow, error) { panic("auth: not implemented") }

// Challenge is the S256 PKCE challenge of the verifier.
func (f Flow) Challenge() string { panic("auth: not implemented") }

// PKCEChallenge is base64url(sha256(verifier)) without padding (RFC 7636).
func PKCEChallenge(verifier string) string { panic("auth: not implemented") }

// Cookie is the flow cookie: value "<state>.<verifier>", Path /auth/google,
// HttpOnly, SameSite=Lax, Secure as given, expiring FlowTTL after now.
func (f Flow) Cookie(secure bool, now time.Time) *http.Cookie { panic("auth: not implemented") }

// ClearFlowCookie expires the flow cookie.
func ClearFlowCookie(secure bool) *http.Cookie { panic("auth: not implemented") }

// ParseFlowCookie reads a flow cookie back. ErrBadFlow if it is nil or malformed.
func ParseFlowCookie(c *http.Cookie) (Flow, error) { panic("auth: not implemented") }

// Matches compares state with the flow's state in constant time.
func (f Flow) Matches(state string) bool { panic("auth: not implemented") }
