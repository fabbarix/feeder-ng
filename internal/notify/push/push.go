// Package push is the impure edge of Web Push: the VAPID key pair kept under
// the data directory, validation of browser-supplied endpoints, and the
// webpush-go sender.
package push

import (
	"context"
	"errors"
	"net/http"

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
// subscription. Not implemented yet.
func LoadOrCreateVAPID(dir string) (VAPID, error) {
	return VAPID{}, errors.New("push.LoadOrCreateVAPID: not implemented")
}

// ValidateEndpoint accepts a push endpoint only when it is an https URL without
// userinfo whose host is not localhost or a loopback, private, link-local or
// unspecified IP literal. Not implemented yet.
func ValidateEndpoint(endpoint string) error {
	return errors.New("push.ValidateEndpoint: not implemented")
}

// ValidateKeys checks the browser's p256dh (65-byte uncompressed P-256 point)
// and auth (16-byte secret), both base64url. Not implemented yet.
func ValidateKeys(p256dh, auth string) error {
	return errors.New("push.ValidateKeys: not implemented")
}

// Sender delivers payloads with webpush-go, signed with the VAPID key.
type Sender struct {
	VAPID   VAPID
	Subject string       // VAPID "sub", e.g. mailto:admin@example.com
	Client  *http.Client // nil = http.DefaultClient with a 10 s timeout
	TTL     int          // seconds the push service may hold a message; 0 = 3600
}

// Send encrypts and posts the payload. It returns notify.ErrGone on HTTP 404 or
// 410 and a plain error on any other non-2xx status. Not implemented yet.
func (s *Sender) Send(ctx context.Context, to notify.Target, p notify.Payload) error {
	return errors.New("push.Sender.Send: not implemented")
}

var _ notify.Sender = (*Sender)(nil)
