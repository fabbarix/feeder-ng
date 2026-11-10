// Package safehttp is the SSRF-guarded HTTP client shared by Recipe File image
// downloads (recipefile/imagefetch) and the Recipe Assistant's page fetch. It
// is extracted from imagefetch (design note docs/dev/design/ra-ab-core.md).
package safehttp

import (
	"bytes"
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

	"golang.org/x/net/html/charset"
)

// Defaults.
const (
	MaxRedirects = 3

	PageMaxBytes  = 3 << 20
	PageTimeout   = 15 * time.Second
	PageUserAgent = "Feeder (+recipe import)"
)

// Errors (matched with errors.Is).
var (
	ErrNotHTTPS         = errors.New("only https URLs are fetched")
	ErrBlocked          = errors.New("address is private, loopback or link-local")
	ErrTooLarge         = errors.New("response is larger than the limit")
	ErrContentType      = errors.New("response content type is not allowed")
	ErrStatus           = errors.New("unexpected HTTP status")
	ErrTooManyRedirects = errors.New("too many redirects")
	ErrCredentials      = errors.New("credentials in URLs are refused")
	// ErrPolicy: the Policy is unusable (MaxBytes or Timeout not positive); no
	// request is made.
	ErrPolicy = errors.New("fetch policy needs a positive MaxBytes and Timeout")
)

// Options are the test hooks; the zero value is the production policy.
type Options struct {
	// LookupIP resolves a host name; default net.DefaultResolver.
	LookupIP func(ctx context.Context, host string) ([]netip.Addr, error)
	// Allow decides whether a resolved address and port may be dialled; default !Blocked(addr).
	Allow func(netip.AddrPort) bool
	// TLSConfig is used for the TLS handshake; default system roots.
	TLSConfig *tls.Config
}

// Policy is the per-call part: what may come back, how much, how long.
type Policy struct {
	AllowedTypes []string      // media types without parameters, lower case
	MaxBytes     int64         // > 0
	Timeout      time.Duration // > 0, covers dial, redirects and body
	Header       http.Header   // extra request headers (Accept, User-Agent, ...)
}

// Response is a completed fetch.
type Response struct {
	Body        []byte
	ContentType string // media type without parameters
	FinalURL    string // after redirects
}

// Page is a fetched web page, decoded to UTF-8.
type Page struct {
	Body        []byte
	ContentType string
	FinalURL    string
}

// blockedPrefixes are the ranges not covered by net/netip's predicates:
// carrier-grade NAT, "this network" (0.0.0.0/8), and the IPv6 forms that tunnel
// an IPv4 address or are deprecated (NAT64, 6to4, IPv4-compatible, site-local).
var blockedPrefixes = []netip.Prefix{
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("64:ff9b::/96"),
	netip.MustParsePrefix("2002::/16"),
	netip.MustParsePrefix("::/96"),
	netip.MustParsePrefix("fec0::/10"),
	netip.MustParsePrefix("64:ff9b:1::/48"), // local-use NAT64
	netip.MustParsePrefix("2001::/32"),      // Teredo
	netip.MustParsePrefix("198.18.0.0/15"),  // benchmarking
	netip.MustParsePrefix("240.0.0.0/4"),    // reserved (includes broadcast)
	netip.MustParsePrefix("192.0.0.0/24"),   // IETF protocol assignments
}

// Blocked reports whether an address must never be fetched: unspecified,
// loopback, private (including fc00::/7, so the AWS IPv6 metadata address),
// link-local (including 169.254.169.254), carrier-grade NAT, "this network",
// multicast, the tunnelling IPv6 ranges, and IPv4-mapped forms of any of these.
func Blocked(a netip.Addr) bool {
	a = a.Unmap()
	if !a.IsValid() || a.IsUnspecified() || a.IsLoopback() || a.IsPrivate() ||
		a.IsLinkLocalUnicast() || a.IsMulticast() {
		return true
	}
	for _, p := range blockedPrefixes {
		if p.Contains(a) {
			return true
		}
	}
	return false
}

// Client fetches with the SSRF guard.
type Client struct{ opts Options }

// New returns a Client.
func New(o Options) *Client {
	if o.LookupIP == nil {
		o.LookupIP = func(ctx context.Context, host string) ([]netip.Addr, error) {
			return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
		}
	}
	if o.Allow == nil {
		o.Allow = func(ap netip.AddrPort) bool { return !Blocked(ap.Addr()) }
	}
	if o.TLSConfig == nil {
		o.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}
	return &Client{opts: o}
}

// checkURL allows only an https URL without credentials.
func checkURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return ErrNotHTTPS
	}
	if u.User != nil {
		return ErrCredentials
	}
	return nil
}

type fetched struct {
	Response
	rawType string // the Content-Type header as sent
}

// Fetch downloads rawURL under policy p. The URL must be https; the host is
// resolved once by the Client, every resolved address must be allowed, and the
// connection is made to a validated address. Redirects (at most MaxRedirects)
// are re-validated. No proxy, no cookies, no credentials.
func (c *Client) Fetch(ctx context.Context, rawURL string, p Policy) (Response, error) {
	f, err := c.fetch(ctx, rawURL, p)
	return f.Response, err
}

func (c *Client) fetch(ctx context.Context, rawURL string, p Policy) (fetched, error) {
	if p.MaxBytes <= 0 || p.Timeout <= 0 {
		return fetched{}, ErrPolicy
	}
	if err := checkURL(rawURL); err != nil {
		return fetched{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, p.Timeout)
	defer cancel()

	client := &http.Client{
		Transport: &http.Transport{
			Proxy:               nil,
			DialContext:         c.dial,
			TLSClientConfig:     c.opts.TLSConfig,
			DisableKeepAlives:   true,
			TLSHandshakeTimeout: p.Timeout,
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
		return fetched{}, err
	}
	for k, vs := range p.Header {
		for _, v := range vs {
			req.Header.Add(k, v)
		}
	}
	resp, err := client.Do(req)
	if err != nil {
		return fetched{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fetched{}, fmt.Errorf("%w: %s", ErrStatus, resp.Status)
	}
	raw := resp.Header.Get("Content-Type")
	ct, _, _ := mime.ParseMediaType(raw)
	allowed := false
	for _, a := range p.AllowedTypes {
		if a == ct {
			allowed = true
		}
	}
	if !allowed {
		return fetched{}, fmt.Errorf("%w: %q", ErrContentType, raw)
	}
	if resp.ContentLength > p.MaxBytes {
		return fetched{}, ErrTooLarge
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, p.MaxBytes+1))
	// A deadline that fires mid-body can surface as a clean EOF, so truncated
	// bytes must not pass as a complete response.
	if ctxErr := ctx.Err(); ctxErr != nil {
		return fetched{}, ctxErr
	}
	if err != nil {
		return fetched{}, err
	}
	if int64(len(data)) > p.MaxBytes {
		return fetched{}, ErrTooLarge
	}
	if resp.ContentLength >= 0 && int64(len(data)) < resp.ContentLength {
		return fetched{}, fmt.Errorf("body is %d bytes, declared %d: %w", len(data), resp.ContentLength, io.ErrUnexpectedEOF)
	}
	return fetched{
		Response: Response{Body: data, ContentType: ct, FinalURL: resp.Request.URL.String()},
		rawType:  raw,
	}, nil
}

// dial resolves the host once, requires every address to be allowed and
// connects to the first validated address.
func (c *Client) dial(ctx context.Context, _, addr string) (net.Conn, error) {
	host, portText, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	port, err := strconv.ParseUint(portText, 10, 16)
	if err != nil {
		return nil, err
	}
	ips, err := c.opts.LookupIP(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("%s has no addresses", host)
	}
	for _, ip := range ips {
		ip = ip.Unmap()
		if !c.opts.Allow(netip.AddrPortFrom(ip, uint16(port))) {
			return nil, fmt.Errorf("%w: %s resolves to %s", ErrBlocked, host, ip)
		}
	}
	d := net.Dialer{}
	return d.DialContext(ctx, "tcp", netip.AddrPortFrom(ips[0].Unmap(), uint16(port)).String())
}

// PagePolicy is the policy FetchPage uses.
func PagePolicy() Policy {
	return Policy{
		AllowedTypes: []string{"text/html", "application/xhtml+xml", "text/plain"},
		MaxBytes:     PageMaxBytes,
		Timeout:      PageTimeout,
		Header: http.Header{
			"User-Agent":      {PageUserAgent},
			"Accept":          {"text/html, application/xhtml+xml, text/plain;q=0.8"},
			"Accept-Language": {"en"},
		},
	}
}

// FetchPage downloads a web page: text/html, application/xhtml+xml or
// text/plain, at most PageMaxBytes, PageTimeout, converted to UTF-8 (header
// charset, then <meta charset>).
func (c *Client) FetchPage(ctx context.Context, rawURL string) (Page, error) {
	f, err := c.fetch(ctx, rawURL, PagePolicy())
	if err != nil {
		return Page{}, err
	}
	if len(f.Body) == 0 {
		return Page{ContentType: f.ContentType, FinalURL: f.FinalURL}, nil
	}
	r, err := charset.NewReader(bytes.NewReader(f.Body), f.rawType)
	if err != nil {
		return Page{}, err
	}
	body, err := io.ReadAll(r)
	if err != nil {
		return Page{}, err
	}
	return Page{Body: body, ContentType: f.ContentType, FinalURL: f.FinalURL}, nil
}
