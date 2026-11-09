// Package authtest provides a fake sign-in provider so tests never contact Google.
package authtest

import (
	"context"
	"fmt"
	"net/url"
	"sync"

	"github.com/fabbarix/feeder-ng/internal/auth"
)

// ExchangeCall records one Exchange.
type ExchangeCall struct{ Code, Verifier, RedirectURL string }

// Fake implements auth.Provider. Register what each code resolves to with
// Accept; Exchange fails for unknown codes and when the PKCE verifier does not
// match the challenge of the most recent AuthURL.
type Fake struct {
	mu        sync.Mutex
	identity  map[string]auth.Identity
	challenge string
	calls     []ExchangeCall
}

// New returns an empty Fake.
func New() *Fake { return &Fake{identity: map[string]auth.Identity{}} }

// Accept makes code resolve to id.
func (f *Fake) Accept(code string, id auth.Identity) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.identity[code] = id
}

// AuthURL returns a fake consent URL carrying state, code_challenge and redirect_uri.
func (f *Fake) AuthURL(state, codeChallenge, redirectURL string) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.challenge = codeChallenge
	q := url.Values{"state": {state}, "code_challenge": {codeChallenge}, "code_challenge_method": {"S256"}, "redirect_uri": {redirectURL}}
	return "https://accounts.fake.test/authorize?" + q.Encode()
}

// Exchange resolves a registered code, checking PKCE.
func (f *Fake) Exchange(_ context.Context, code, verifier, redirectURL string) (auth.Identity, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, ExchangeCall{code, verifier, redirectURL})
	if auth.PKCEChallenge(verifier) != f.challenge {
		return auth.Identity{}, fmt.Errorf("authtest: PKCE verifier does not match the challenge")
	}
	id, ok := f.identity[code]
	if !ok {
		return auth.Identity{}, fmt.Errorf("authtest: unknown code %q", code)
	}
	return id, nil
}

// Exchanges returns the calls made so far.
func (f *Fake) Exchanges() []ExchangeCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]ExchangeCall(nil), f.calls...)
}
