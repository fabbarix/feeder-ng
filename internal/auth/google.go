package auth

import (
	"context"
	"net/http"
)

// GoogleProvider signs people in with Google OAuth 2.0 (authorisation code +
// PKCE, scopes openid email profile) and reads the Identity from the OpenID
// userinfo endpoint.
type GoogleProvider struct {
	clientID, clientSecret         string
	authURL, tokenURL, userinfoURL string
	client                         *http.Client
}

// GoogleOption customises a GoogleProvider (tests point it at a fake Google).
type GoogleOption func(*GoogleProvider)

// WithGoogleEndpoints overrides Google's authorisation, token and userinfo URLs.
func WithGoogleEndpoints(authURL, tokenURL, userinfoURL string) GoogleOption {
	return func(p *GoogleProvider) { p.authURL, p.tokenURL, p.userinfoURL = authURL, tokenURL, userinfoURL }
}

// WithHTTPClient sets the HTTP client used for the token and userinfo calls.
func WithHTTPClient(c *http.Client) GoogleOption { return func(p *GoogleProvider) { p.client = c } }

// NewGoogleProvider returns a provider using Google's real endpoints unless overridden.
func NewGoogleProvider(clientID, clientSecret string, opts ...GoogleOption) *GoogleProvider {
	panic("auth: not implemented")
}

// AuthURL builds the Google consent URL: client_id, redirect_uri, response_type=code,
// scope "openid email profile", state, code_challenge, code_challenge_method=S256,
// prompt=select_account.
func (p *GoogleProvider) AuthURL(state, codeChallenge, redirectURL string) string {
	panic("auth: not implemented")
}

// Exchange posts the code with the verifier to the token endpoint, then fetches
// userinfo with the access token. Any non-2xx or malformed answer is an error.
func (p *GoogleProvider) Exchange(ctx context.Context, code, codeVerifier, redirectURL string) (Identity, error) {
	panic("auth: not implemented")
}
