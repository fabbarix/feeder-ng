// Package imagefetch downloads Recipe File images for Import Review with an
// SSRF guard: https only, no private, loopback or link-local addresses (checked
// on the addresses the name resolves to, at connect time, on every redirect),
// 10 MB, content-type checked, 15 s overall timeout.
package imagefetch

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
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

// cgnat is the carrier-grade NAT range 100.64.0.0/10.
var cgnat = netip.MustParsePrefix("100.64.0.0/10")

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
func Blocked(a netip.Addr) bool {
	a = a.Unmap()
	return !a.IsValid() || a.IsUnspecified() || a.IsLoopback() || a.IsPrivate() ||
		a.IsLinkLocalUnicast() || a.IsMulticast() || cgnat.Contains(a)
}

// Fetcher implements recipefile.Fetcher.
type Fetcher struct {
	opts Options
}

// New returns a Fetcher.
func New(o Options) *Fetcher {
	if o.MaxBytes <= 0 {
		o.MaxBytes = MaxBytes
	}
	if o.Timeout <= 0 {
		o.Timeout = Timeout
	}
	if o.LookupIP == nil {
		o.LookupIP = defaultLookup
	}
	if o.Allow == nil {
		o.Allow = func(ap netip.AddrPort) bool { return !Blocked(ap.Addr()) }
	}
	if o.TLSConfig == nil {
		o.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	return &Fetcher{opts: o}
}

func defaultLookup(ctx context.Context, host string) ([]netip.Addr, error) {
	return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
}

var allowedTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}

// Fetch downloads rawURL. The URL must be https (ErrNotHTTPS, also for a
// redirect to http). The host is resolved by the Fetcher itself, EVERY resolved
// address must be allowed (ErrBlocked otherwise), and the connection is made to
// a validated address, so a DNS answer cannot change between check and use.
// Redirects (at most MaxRedirects) are followed with the same checks. A status
// other than 200 is ErrStatus. The Content-Type must be image/jpeg, image/png
// or image/webp (ErrContentType); a body over MaxBytes, declared or streamed,
// is ErrTooLarge. No proxy is used, no cookies, no credentials in URLs.
func (f *Fetcher) Fetch(ctx context.Context, rawURL string) ([]byte, string, error) {
	if err := checkURL(rawURL); err != nil {
		return nil, "", err
	}
	ctx, cancel := context.WithTimeout(ctx, f.opts.Timeout)
	defer cancel()

	client := &http.Client{
		Transport: &http.Transport{
			Proxy:               nil,
			DialContext:         f.dial,
			TLSClientConfig:     f.opts.TLSConfig,
			DisableKeepAlives:   true,
			TLSHandshakeTimeout: f.opts.Timeout,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > MaxRedirects {
				return ErrTooManyRedirects
			}
			return checkURL(req.URL.String())
		},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Accept", "image/jpeg, image/png, image/webp")
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("%w: %s", ErrStatus, resp.Status)
	}
	ct, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if !allowedTypes[ct] {
		return nil, "", fmt.Errorf("%w: %q", ErrContentType, resp.Header.Get("Content-Type"))
	}
	if resp.ContentLength > f.opts.MaxBytes {
		return nil, "", ErrTooLarge
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, f.opts.MaxBytes+1))
	if err != nil {
		return nil, "", err
	}
	if int64(len(data)) > f.opts.MaxBytes {
		return nil, "", ErrTooLarge
	}
	return data, ct, nil
}

// checkURL allows only an https URL without credentials.
func checkURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return ErrNotHTTPS
	}
	if u.User != nil {
		return errors.New("credentials in image URLs are refused")
	}
	return nil
}

// dial resolves the host, requires every address to be allowed and connects to
// the first validated address. The name is never looked up a second time.
func (f *Fetcher) dial(ctx context.Context, _, addr string) (net.Conn, error) {
	host, portText, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	port, err := strconv.ParseUint(portText, 10, 16)
	if err != nil {
		return nil, err
	}
	ips, err := f.opts.LookupIP(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("%s has no addresses", host)
	}
	for _, ip := range ips {
		ip = ip.Unmap()
		if !f.opts.Allow(netip.AddrPortFrom(ip, uint16(port))) {
			return nil, fmt.Errorf("%w: %s resolves to %s", ErrBlocked, host, ip)
		}
	}
	d := net.Dialer{}
	return d.DialContext(ctx, "tcp", netip.AddrPortFrom(ips[0].Unmap(), uint16(port)).String())
}
