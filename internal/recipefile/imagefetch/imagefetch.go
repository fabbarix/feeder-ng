// Package imagefetch downloads Recipe File images for Import Review with an
// SSRF guard: https only, no private, loopback or link-local addresses (checked
// on the addresses the name resolves to, at connect time, on every redirect),
// 10 MB, content-type checked, 15 s overall timeout.
package imagefetch

import (
	"context"
	"crypto/tls"
	"net/http"
	"net/netip"
	"time"

	"github.com/fabbarix/feeder-ng/internal/safehttp"
)

// Defaults.
const (
	MaxBytes     = 10 << 20
	Timeout      = 15 * time.Second
	MaxRedirects = 3
)

// Errors (matched with errors.Is); the values are the shared safehttp ones.
var (
	ErrNotHTTPS         = safehttp.ErrNotHTTPS
	ErrBlocked          = safehttp.ErrBlocked
	ErrTooLarge         = safehttp.ErrTooLarge
	ErrContentType      = safehttp.ErrContentType
	ErrStatus           = safehttp.ErrStatus
	ErrTooManyRedirects = safehttp.ErrTooManyRedirects
	ErrCredentials      = safehttp.ErrCredentials
)

// Options tune a Fetcher. The zero value is the production policy.
type Options struct {
	MaxBytes int64         // default MaxBytes
	Timeout  time.Duration // default Timeout, covers dial, redirects and body
	// LookupIP resolves a host name; default net.DefaultResolver. A hook for tests.
	LookupIP func(ctx context.Context, host string) ([]netip.Addr, error)
	// Allow decides whether a resolved address and port may be dialled; default
	// !Blocked(addr). Tests use it to reach httptest servers on loopback.
	Allow func(netip.AddrPort) bool
	// TLSConfig is used for the TLS handshake; default system roots. Tests trust the httptest CA.
	TLSConfig *tls.Config
}

// Blocked reports whether an address must never be fetched (see safehttp.Blocked).
func Blocked(a netip.Addr) bool { return safehttp.Blocked(a) }

// Fetcher implements recipefile.Fetcher.
type Fetcher struct {
	opts   Options
	client *safehttp.Client
}

// New returns a Fetcher.
func New(o Options) *Fetcher {
	if o.MaxBytes <= 0 {
		o.MaxBytes = MaxBytes
	}
	if o.Timeout <= 0 {
		o.Timeout = Timeout
	}
	return &Fetcher{opts: o, client: safehttp.New(safehttp.Options{LookupIP: o.LookupIP, Allow: o.Allow, TLSConfig: o.TLSConfig})}
}

var imageTypes = []string{"image/jpeg", "image/png", "image/webp"}

// Fetch downloads rawURL: https only, SSRF-guarded, an image of at most
// MaxBytes within Timeout. See safehttp.Client.Fetch for the guard.
func (f *Fetcher) Fetch(ctx context.Context, rawURL string) ([]byte, string, error) {
	r, err := f.client.Fetch(ctx, rawURL, safehttp.Policy{
		AllowedTypes: imageTypes,
		MaxBytes:     f.opts.MaxBytes,
		Timeout:      f.opts.Timeout,
		Header:       http.Header{"Accept": {"image/jpeg, image/png, image/webp"}},
	})
	if err != nil {
		return nil, "", err
	}
	return r.Body, r.ContentType, nil
}
