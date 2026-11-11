package config_test

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/config"
)

// A fixed 32-byte key, so the tests can look for its text in output.
var rawKey = bytes.Repeat([]byte{0x5a}, 32)

func stdKey() string { return base64.StdEncoding.EncodeToString(rawKey) }

func withKey(v string) func(string) string {
	return env(map[string]string{"FEEDER_ADMIN_EMAIL": "a@example.test", "FEEDER_SECRET_KEY": v})
}

func TestSecretKeyUnsetLeavesTheFeatureUnavailableButStartsFine(t *testing.T) {
	c, err := config.Load(env(map[string]string{"FEEDER_ADMIN_EMAIL": "a@example.test"}))
	if err != nil {
		t.Fatalf("unset FEEDER_SECRET_KEY must not stop start-up: %v", err)
	}
	if c.HasSecretKey() {
		t.Error("HasSecretKey = true with the variable unset")
	}
	if c, err = config.Load(withKey("   ")); err != nil || c.HasSecretKey() {
		t.Errorf("a blank value counts as unset: err=%v has=%v", err, c.HasSecretKey())
	}
}

func TestSecretKeyAcceptsStdAndURLAlphabetWithOrWithoutPadding(t *testing.T) {
	url := bytes.Repeat([]byte{0xfb, 0xff}, 16) // encodes with + and / in std, - and _ in URL
	for name, v := range map[string]string{
		"std":         stdKey(),
		"std nopad":   strings.TrimRight(stdKey(), "="),
		"url":         base64.URLEncoding.EncodeToString(url),
		"url nopad":   base64.RawURLEncoding.EncodeToString(url),
		"padded+spce": " " + stdKey() + " ",
	} {
		c, err := config.Load(withKey(v))
		if err != nil || !c.HasSecretKey() {
			t.Errorf("%s: err=%v has=%v", name, err, c.HasSecretKey())
		}
	}
}

func TestMalformedSecretKeyStopsStartUpWithoutEchoingIt(t *testing.T) {
	for name, v := range map[string]string{
		"not base64":  "this is not base64!!",
		"too short":   base64.StdEncoding.EncodeToString(rawKey[:31]),
		"too long":    base64.StdEncoding.EncodeToString(append(append([]byte{}, rawKey...), 1)),
		"hex of 32 B": strings.Repeat("ab", 32),
	} {
		_, err := config.Load(withKey(v))
		if !errors.Is(err, config.ErrSecretKeyMalformed) {
			t.Errorf("%s: err = %v, want ErrSecretKeyMalformed", name, err)
			continue
		}
		if strings.Contains(err.Error(), v) || !strings.Contains(err.Error(), "FEEDER_SECRET_KEY") {
			t.Errorf("%s: error text must name the variable and never the value: %q", name, err)
		}
	}
}

func TestSecretKeyAndGoogleSecretNeverShowInLogsOrFormatting(t *testing.T) {
	c, err := config.Load(env(map[string]string{
		"FEEDER_ADMIN_EMAIL": "a@example.test", "FEEDER_SECRET_KEY": stdKey(), "FEEDER_GOOGLE_CLIENT_SECRET": "google-secret-value",
	}))
	if err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	slog.New(slog.NewTextHandler(&buf, nil)).Info("start", "config", c)
	slog.New(slog.NewJSONHandler(&buf, nil)).Info("start", "config", c)
	out := buf.String() + fmt.Sprintf("%v|%+v|%#v|%s", c, c, c, c.SecretKey)
	for _, secret := range []string{stdKey(), "google-secret-value", string(rawKey), fmt.Sprintf("%x", rawKey)} {
		if strings.Contains(out, secret) {
			t.Errorf("output leaks a secret (%q...): %s", secret[:6], out)
		}
	}
	if !strings.Contains(out, "[redacted]") {
		t.Errorf("redaction marker missing: %s", out)
	}
}

func TestSecretKeyIsTheOnlyNewVariableAndAKeyFileIsNeverCreated(t *testing.T) {
	dir := t.TempDir()
	if _, err := config.Load(env(map[string]string{"FEEDER_ADMIN_EMAIL": "a@example.test", "FEEDER_DATA_DIR": dir, "FEEDER_SECRET_KEY": stdKey()})); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Errorf("Load must not create files (no /data/secret.key): %v", entries)
	}
}
