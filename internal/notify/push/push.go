// Package push is the impure edge of Web Push: the VAPID key pair kept under
// the data directory, validation of browser-supplied endpoints, and the
// webpush-go sender.
package push

import (
	"context"
	"crypto/ecdh"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"github.com/fabbarix/feeder-ng/internal/notify"
)

// VAPID is the server's application server key pair (base64url, as
// webpush-go produces them).
type VAPID struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

// VAPIDFile is the file name under the data directory.
const VAPIDFile = "vapid.json"

// LoadOrCreateVAPID returns the key pair stored in <dir>/vapid.json, creating
// it (mode 0600) on first use. An unreadable or corrupt file is an error: the
// keys are never silently replaced, because that would orphan every
// subscription.
func LoadOrCreateVAPID(dir string) (VAPID, error) {
	path := filepath.Join(dir, VAPIDFile)
	raw, err := os.ReadFile(path)
	switch {
	case err == nil:
		return parseVAPID(path, raw)
	case !os.IsNotExist(err):
		return VAPID{}, fmt.Errorf("push: read %s: %w", path, err)
	}
	priv, pub, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return VAPID{}, fmt.Errorf("push: generate VAPID keys: %w", err)
	}
	v := VAPID{PublicKey: pub, PrivateKey: priv}
	body, err := json.Marshal(v)
	if err != nil {
		return VAPID{}, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return VAPID{}, fmt.Errorf("push: create %s: %w", dir, err)
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		if os.IsExist(err) { // another start created it first: use theirs
			raw, rerr := os.ReadFile(path)
			if rerr != nil {
				return VAPID{}, fmt.Errorf("push: read %s: %w", path, rerr)
			}
			return parseVAPID(path, raw)
		}
		return VAPID{}, fmt.Errorf("push: create %s: %w", path, err)
	}
	if _, err := f.Write(body); err != nil {
		f.Close()
		os.Remove(path)
		return VAPID{}, fmt.Errorf("push: write %s: %w", path, err)
	}
	if err := f.Close(); err != nil {
		os.Remove(path)
		return VAPID{}, fmt.Errorf("push: write %s: %w", path, err)
	}
	return v, nil
}

func parseVAPID(path string, raw []byte) (VAPID, error) {
	var v VAPID
	if err := json.Unmarshal(raw, &v); err != nil {
		return VAPID{}, fmt.Errorf("push: %s is corrupt (move it aside to make new keys; every push subscription then has to register again): %w", path, err)
	}
	if v.PublicKey == "" || v.PrivateKey == "" {
		return VAPID{}, fmt.Errorf("push: %s is missing a key (move it aside to make new keys; every push subscription then has to register again)", path)
	}
	return v, nil
}

// ValidateEndpoint accepts a push endpoint only when it is an https URL without
// userinfo whose host is not localhost or a loopback, private, link-local or
// unspecified IP literal. The server POSTs to it, so it must not reach the
// Feeder's own network.
func ValidateEndpoint(endpoint string) error {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" {
		return errors.New("the push endpoint must be an https URL")
	}
	if u.User != nil {
		return errors.New("the push endpoint must not contain a user name or password")
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return errors.New("the push endpoint has no host")
	}
	if host == "localhost" || strings.HasSuffix(host, ".localhost") {
		return errors.New("the push endpoint must not be localhost")
	}
	if ip := net.ParseIP(host); ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
			return errors.New("the push endpoint must not be a private address")
		}
	}
	return nil
}

// ValidateKeys checks the browser's p256dh (65-byte uncompressed P-256 point on
// the curve) and auth (16-byte secret), both base64url.
func ValidateKeys(p256dh, auth string) error {
	p, err := decodeB64(p256dh)
	if err != nil {
		return errors.New("p256dh is not base64url")
	}
	if _, err := ecdh.P256().NewPublicKey(p); err != nil {
		return errors.New("p256dh is not a P-256 public key")
	}
	a, err := decodeB64(auth)
	if err != nil {
		return errors.New("auth is not base64url")
	}
	if len(a) != 16 {
		return errors.New("auth must be 16 bytes")
	}
	return nil
}

// decodeB64 reads base64url with or without padding, as browsers send it.
func decodeB64(s string) ([]byte, error) {
	if s == "" {
		return nil, errors.New("empty")
	}
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
}

// Sender delivers payloads with webpush-go, signed with the VAPID key.
type Sender struct {
	VAPID   VAPID
	Subject string       // VAPID "sub", e.g. mailto:admin@example.com
	Client  *http.Client // nil = a client with a 10 s timeout
	TTL     int          // seconds the push service may hold a message; 0 = 3600
}

// Send encrypts and posts the payload. It returns notify.ErrGone on HTTP 404 or
// 410 and a plain error on any other non-2xx status.
func (s *Sender) Send(ctx context.Context, to notify.Target, p notify.Payload) error {
	body, err := json.Marshal(p)
	if err != nil {
		return err
	}
	client := s.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	ttl := s.TTL
	if ttl == 0 {
		ttl = 3600
	}
	resp, err := webpush.SendNotificationWithContext(ctx, body,
		&webpush.Subscription{Endpoint: to.Endpoint, Keys: webpush.Keys{P256dh: to.P256dh, Auth: to.Auth}},
		&webpush.Options{
			HTTPClient:      client,
			Subscriber:      s.Subject,
			TTL:             ttl,
			VAPIDPublicKey:  s.VAPID.PublicKey,
			VAPIDPrivateKey: s.VAPID.PrivateKey,
		})
	if err != nil {
		return fmt.Errorf("push: send: %w", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		return notify.ErrGone
	case resp.StatusCode < 200 || resp.StatusCode > 299:
		return fmt.Errorf("push: the push service answered %s", resp.Status)
	}
	return nil
}

var _ notify.Sender = (*Sender)(nil)

// LookupFunc resolves a host name to IP address strings (net.Resolver.LookupHost).
type LookupFunc func(ctx context.Context, host string) ([]string, error)

// PublicOnlyControl is a net.Dialer.Control function that refuses any
// connection to a non-public address: loopback, private (RFC 1918 and fc00::/7),
// link-local (incl. 169.254.169.254), CGNAT 100.64.0.0/10, unspecified,
// multicast, and IPv4-mapped forms of those. It runs at connect time on the
// resolved address, so DNS rebinding cannot get past it.
// STUB: the Developer implements it.
func PublicOnlyControl(network, address string, _ syscall.RawConn) error { return nil }

// NewHTTPClient is the production Web Push HTTP client: 10 s timeout, a dialer
// whose Control is PublicOnlyControl, and CheckRedirect returning
// http.ErrUseLastResponse (a redirect is never followed). lookup resolves host
// names (nil = the system resolver); tests inject one to simulate DNS.
// STUB: the Developer implements it.
func NewHTTPClient(lookup LookupFunc) *http.Client { return &http.Client{} }

// NewSender returns a Sender that uses NewHTTPClient(nil).
// STUB: the Developer implements it.
func NewSender(v VAPID, subject string) *Sender { return &Sender{VAPID: v, Subject: subject} }
