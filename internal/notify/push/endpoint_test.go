package push_test

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/notify/push"
)

func TestValidateEndpoint(t *testing.T) {
	good := []string{
		"https://fcm.googleapis.com/fcm/send/abc",
		"https://updates.push.services.mozilla.com/wpush/v2/xyz",
		"https://web.push.apple.com/QGx",
		"https://push.example.com:8443/p",
	}
	bad := map[string]string{
		"http://fcm.googleapis.com/fcm/send/abc": "not https",
		"":                                       "empty",
		"not a url":                              "garbage",
		"https://user:pw@push.example.com/p":     "userinfo",
		"https://localhost/p":                    "localhost",
		"https://LOCALHOST:9000/p":               "localhost, any case",
		"https://127.0.0.1/p":                    "loopback v4",
		"https://[::1]/p":                        "loopback v6",
		"https://10.0.0.5/p":                     "private 10/8",
		"https://192.168.1.20/p":                 "private 192.168/16",
		"https://172.16.0.1/p":                   "private 172.16/12",
		"https://169.254.169.254/latest":         "link-local metadata",
		"https://0.0.0.0/p":                      "unspecified",
		"https://[fd00::1]/p":                    "unique-local v6",
		"ftp://push.example.com/p":               "ftp",
		"//push.example.com/p":                   "no scheme",
	}
	for _, e := range good {
		if err := push.ValidateEndpoint(e); err != nil {
			t.Errorf("ValidateEndpoint(%q) = %v, want ok", e, err)
		}
	}
	for e, why := range bad {
		if err := push.ValidateEndpoint(e); err == nil {
			t.Errorf("ValidateEndpoint(%q) accepted (%s)", e, why)
		}
	}
}

// keyPair returns a valid browser-side p256dh and auth.
func keyPair(t *testing.T) (p256dh, auth string) {
	t.Helper()
	k, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	a := make([]byte, 16)
	if _, err := rand.Read(a); err != nil {
		t.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(k.PublicKey().Bytes()), base64.RawURLEncoding.EncodeToString(a)
}

func TestValidateKeys(t *testing.T) {
	p, a := keyPair(t)
	if err := push.ValidateKeys(p, a); err != nil {
		t.Errorf("valid keys rejected: %v", err)
	}
	short := base64.RawURLEncoding.EncodeToString(make([]byte, 20))
	for name, c := range map[string][2]string{
		"empty p256dh":           {"", a},
		"empty auth":             {p, ""},
		"p256dh too short":       {short, a},
		"auth too short":         {p, base64.RawURLEncoding.EncodeToString(make([]byte, 8))},
		"not base64":             {"!!!", a},
		"point not on the curve": {base64.RawURLEncoding.EncodeToString(append([]byte{4}, make([]byte, 64)...)), a},
	} {
		if err := push.ValidateKeys(c[0], c[1]); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}
