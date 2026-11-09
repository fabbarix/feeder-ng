// Package imagefetch downloads Recipe File images for Import Review with an
// SSRF guard: https only, no private, loopback or link-local addresses (checked
// on the addresses the name resolves to, at connect time, on every redirect),
// 10 MB, content-type checked, 15 s overall timeout.
package imagefetch

import (
	"context"
	"crypto/tls"
	"errors"
	"net/netip"
	"time"
)

// Defaults.
const (
	MaxBytes     = 10 << 20
	Timeout      = 15 * time.Second
	MaxRedirects = 3
)

// Errors (matched with errors.Is).
var (
	ErrNotHTTPS         = errors.New("only https URLs are fetched")
	ErrBlocked          = errors.New("address is private, loopback or link-local")
	ErrTooLarge         = errors.New("image is larger than 10 MB")
	ErrContentType      = errors.New("response is not a JPEG, PNG or WebP image")
	ErrStatus           = errors.New("unexpected HTTP status")
	ErrTooManyRedirects = errors.New("too many redirects")
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

// Blocked reports whether an address must never be fetched: unspecified (0.0.0.0,
// ::), loopback, private (10/8, 172.16/12, 192.168/16, fc00::/7), link-local
// (169.254/16 including the cloud metadata address, fe80::/10), carrier-grade
// NAT 100.64/10, multicast, and IPv4-mapped IPv6 forms of any of these.
func Blocked(a netip.Addr) bool { panic("not implemented") }

// Fetcher implements recipefile.Fetcher.
type Fetcher struct{}

// New returns a Fetcher.
func New(o Options) *Fetcher { panic("not implemented") }

// Fetch downloads rawURL. The URL must be https (ErrNotHTTPS, also for a
// redirect to http). The host is resolved by the Fetcher itself, EVERY resolved
// address must be allowed (ErrBlocked otherwise), and the connection is made to
// a validated address, so a DNS answer cannot change between check and use.
// Redirects (at most MaxRedirects) are followed with the same checks. A status
// other than 200 is ErrStatus. The Content-Type must be image/jpeg, image/png
// or image/webp (ErrContentType); a body over MaxBytes, declared or streamed,
// is ErrTooLarge. No proxy is used, no cookies, no credentials in URLs.
func (f *Fetcher) Fetch(ctx context.Context, rawURL string) ([]byte, string, error) {
	panic("not implemented") // Developer
}
