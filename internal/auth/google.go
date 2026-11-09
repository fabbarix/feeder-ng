package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

// Google's production endpoints.
const (
	googleAuthURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL    = "https://oauth2.googleapis.com/token"
	googleUserinfoURL = "https://openidconnect.googleapis.com/v1/userinfo"
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
	p := &GoogleProvider{
		clientID:     clientID,
		clientSecret: clientSecret,
		authURL:      googleAuthURL,
		tokenURL:     googleTokenURL,
		userinfoURL:  googleUserinfoURL,
		client:       &http.Client{Timeout: 15 * time.Second},
	}
	for _, o := range opts {
		o(p)
	}
	return p
}

// config builds the oauth2 configuration for one sign-in.
func (p *GoogleProvider) config(redirectURL string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     p.clientID,
		ClientSecret: p.clientSecret,
		RedirectURL:  redirectURL,
		Scopes:       []string{"openid", "email", "profile"},
		Endpoint:     oauth2.Endpoint{AuthURL: p.authURL, TokenURL: p.tokenURL},
	}
}

// AuthURL builds the Google consent URL: client_id, redirect_uri, response_type=code,
// scope "openid email profile", state, code_challenge, code_challenge_method=S256,
// prompt=select_account.
func (p *GoogleProvider) AuthURL(state, codeChallenge, redirectURL string) string {
	return p.config(redirectURL).AuthCodeURL(state,
		oauth2.SetAuthURLParam("code_challenge", codeChallenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	)
}

// Exchange posts the code with the verifier to the token endpoint, then fetches
// userinfo with the access token. Any non-2xx or malformed answer is an error.
func (p *GoogleProvider) Exchange(ctx context.Context, code, codeVerifier, redirectURL string) (Identity, error) {
	ctx = context.WithValue(ctx, oauth2.HTTPClient, p.client)
	tok, err := p.config(redirectURL).Exchange(ctx, code, oauth2.VerifierOption(codeVerifier))
	if err != nil {
		return Identity{}, fmt.Errorf("auth: google token exchange: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.userinfoURL, nil)
	if err != nil {
		return Identity{}, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	resp, err := p.client.Do(req)
	if err != nil {
		return Identity{}, fmt.Errorf("auth: google userinfo: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return Identity{}, fmt.Errorf("auth: google userinfo status %d", resp.StatusCode)
	}
	var info struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&info); err != nil {
		return Identity{}, fmt.Errorf("auth: google userinfo: %w", err)
	}
	if strings.TrimSpace(info.Email) == "" {
		return Identity{}, errors.New("auth: google userinfo has no email")
	}
	return Identity{Email: info.Email, EmailVerified: info.EmailVerified, Name: info.Name, Picture: info.Picture}, nil
}
