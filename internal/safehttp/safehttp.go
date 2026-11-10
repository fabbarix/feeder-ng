// Package safehttp is the SSRF-guarded HTTP client shared by Recipe File image
// downloads (recipefile/imagefetch) and the Recipe Assistant's page fetch. It
// is extracted from imagefetch (design note docs/dev/design/ra-ab-core.md).
//
// STUB: signatures only; the Developer moves the implementation out of
// internal/recipefile/imagefetch.
package safehttp

import (
	"context"
	"crypto/tls"
	"errors"
	"net/http"
	"net/netip"
	"time"
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
)

// Options are the test hooks; the zero value is the production policy.
type Options struct {
	LookupIP  func(ctx context.Context, host string) ([]netip.Addr, error)
	Allow     func(netip.AddrPort) bool
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

// Client fetches with the SSRF guard.
type Client struct{ opts Options }

// New returns a Client.
func New(o Options) *Client { return &Client{opts: o} }

// Blocked reports whether an address must never be fetched.
func Blocked(a netip.Addr) bool { return false }

// Fetch downloads rawURL under policy p.
func (c *Client) Fetch(ctx context.Context, rawURL string, p Policy) (Response, error) {
	return Response{}, errors.New("not implemented")
}

// PagePolicy is the policy FetchPage uses.
func PagePolicy() Policy { return Policy{} }

// FetchPage downloads a web page: text/html, application/xhtml+xml or
// text/plain, at most PageMaxBytes, PageTimeout, converted to UTF-8.
func (c *Client) FetchPage(ctx context.Context, rawURL string) (Page, error) {
	return Page{}, errors.New("not implemented")
}
