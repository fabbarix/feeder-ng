package config_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/config"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadRequiresAdminEmail(t *testing.T) {
	for name, m := range map[string]map[string]string{
		"unset":      {},
		"empty":      {"FEEDER_ADMIN_EMAIL": ""},
		"whitespace": {"FEEDER_ADMIN_EMAIL": "   "},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := config.Load(env(m))
			if !errors.Is(err, config.ErrAdminEmailRequired) {
				t.Fatalf("err = %v, want ErrAdminEmailRequired", err)
			}
			if !strings.Contains(err.Error(), "FEEDER_ADMIN_EMAIL") {
				t.Fatalf("message %q must name FEEDER_ADMIN_EMAIL", err.Error())
			}
		})
	}
}

func TestLoadDefaults(t *testing.T) {
	c, err := config.Load(env(map[string]string{"FEEDER_ADMIN_EMAIL": "Boss@Example.test "}))
	if err != nil {
		t.Fatal(err)
	}
	if c.AdminEmail != "boss@example.test" {
		t.Errorf("AdminEmail = %q, want trimmed and lower-cased", c.AdminEmail)
	}
	if c.DataDir != "/data" {
		t.Errorf("DataDir = %q, want /data", c.DataDir)
	}
	if c.Addr != ":8080" {
		t.Errorf("Addr = %q, want :8080", c.Addr)
	}
	if c.DevLogin {
		t.Error("DevLogin must default to false")
	}
	if c.BaseURL != "" || c.GoogleClientID != "" || c.GoogleClientSecret != "" {
		t.Errorf("optional values must default to empty: %+v", c)
	}
}

// Decision A7: the client address for rate limits is the socket peer unless the operator says a reverse proxy sits in
// front (the Helm chart sets FEEDER_TRUST_PROXY=true when an ingress is enabled). Anything unrecognised means off.
func TestTrustProxyDefaultsToFalseAndIsSwitchedOnExplicitly(t *testing.T) {
	for val, want := range map[string]bool{
		"": false, "false": false, "0": false, "no": false, "off": false, "FALSE": false, "garbage": false,
		"true": true, "1": true, "yes": true, "on": true, "TRUE": true, " true ": true,
	} {
		c, err := config.Load(env(map[string]string{"FEEDER_ADMIN_EMAIL": "a@example.test", "FEEDER_TRUST_PROXY": val}))
		if err != nil || c.TrustProxy != want {
			t.Errorf("FEEDER_TRUST_PROXY=%q: TrustProxy = %v, %v; want %v", val, c.TrustProxy, err, want)
		}
	}
}

func TestLoadReadsAllVariables(t *testing.T) {
	c, err := config.Load(env(map[string]string{
		"FEEDER_ADMIN_EMAIL":          "a@example.test",
		"FEEDER_DATA_DIR":             "/srv/feeder",
		"FEEDER_ADDR":                 "127.0.0.1:9000",
		"FEEDER_BASE_URL":             "https://feeder.example.test",
		"FEEDER_GOOGLE_CLIENT_ID":     "id",
		"FEEDER_GOOGLE_CLIENT_SECRET": "secret",
		"FEEDER_DEV_LOGIN":            "1",
	}))
	if err != nil {
		t.Fatal(err)
	}
	want := config.Config{
		AdminEmail: "a@example.test", DataDir: "/srv/feeder", Addr: "127.0.0.1:9000",
		BaseURL: "https://feeder.example.test", GoogleClientID: "id", GoogleClientSecret: "secret",
		DevLogin: true, TrustProxy: false,
	}
	if c != want {
		t.Fatalf("got %+v, want %+v", c, want)
	}
	if got := c.DBPath(); got != "/srv/feeder/feeder.db" {
		t.Errorf("DBPath = %q", got)
	}
}

func TestDevLoginValues(t *testing.T) {
	for v, want := range map[string]bool{"1": true, "true": true, "0": false, "": false, "no": false} {
		c, err := config.Load(env(map[string]string{"FEEDER_ADMIN_EMAIL": "a@example.test", "FEEDER_DEV_LOGIN": v}))
		if err != nil {
			t.Fatal(err)
		}
		if c.DevLogin != want {
			t.Errorf("FEEDER_DEV_LOGIN=%q -> %v, want %v", v, c.DevLogin, want)
		}
	}
}

func TestSecureCookiesOnlyForHTTPSBaseURL(t *testing.T) {
	for url, want := range map[string]bool{
		"https://feeder.example.test": true,
		"http://localhost:8080":       false,
		"":                            false,
	} {
		if got := (config.Config{BaseURL: url}).SecureCookies(); got != want {
			t.Errorf("SecureCookies(%q) = %v, want %v", url, got, want)
		}
	}
}
