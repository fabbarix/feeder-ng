package auth

import "context"

// Identity is who a sign-in provider says the person is.
type Identity struct {
	Email         string
	EmailVerified bool
	Name          string
	Picture       string
}

// Provider is the sign-in provider (Google in production, a fake in tests).
// Handlers depend only on this interface, so tests never contact Google.
type Provider interface {
	// AuthURL is where to send the browser. codeChallenge is the S256 PKCE challenge.
	AuthURL(state, codeChallenge, redirectURL string) string
	// Exchange trades the authorisation code (and PKCE verifier) for the person's Identity.
	Exchange(ctx context.Context, code, codeVerifier, redirectURL string) (Identity, error)
}
