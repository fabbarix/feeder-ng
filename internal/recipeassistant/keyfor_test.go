package recipeassistant_test

import (
	"testing"

	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// KeyFor is the one rule for every route that takes a baseUrl (design §1.7):
// the saved key is bound to the saved origin.

const savedBase = "https://api.example.com/gateway"

func savedSettings() ra.Settings {
	return ra.Settings{Enabled: true, BaseURL: savedBase, Model: ra.DefaultModel, HasKey: true, KeyLast4: "4321"}
}

const savedSecret = ra.Secret("sk-saved-key-4321")

func TestKeyForUsesTheSavedKeyWhenTheOriginIsUnchanged(t *testing.T) {
	for name, base := range map[string]string{
		"no baseUrl":                   "",
		"same url":                     savedBase,
		"path-only change":             "https://api.example.com/other/prefix",
		"no path":                      "https://api.example.com",
		"trailing slash":               "https://api.example.com/gateway/",
		"host in upper case":           "https://API.Example.com/gateway",
		"default port written out":     "https://api.example.com:443/gateway",
		"default port, no path":        "https://api.example.com:443",
		"default port, saved w/o port": "https://api.example.com:443/x",
	} {
		t.Run(name, func(t *testing.T) {
			got, err := ra.KeyFor(savedSettings(), savedSecret, base, "")
			if err != nil || got.Reveal() != savedSecret.Reveal() {
				t.Fatalf("got %q, %v; want the saved key", got.Reveal(), err)
			}
		})
	}
}

func TestKeyForDefaultPortInTheSavedBaseURLCountsAsUnchanged(t *testing.T) {
	s := savedSettings()
	s.BaseURL = "https://h:443"
	for _, base := range []string{"https://h", "https://h:443", "https://h/", ""} {
		got, err := ra.KeyFor(s, savedSecret, base, "")
		if err != nil || got.Reveal() != savedSecret.Reveal() {
			t.Errorf("%q: got %q, %v; want the saved key (https://h:443 is https://h)", base, got.Reveal(), err)
		}
	}
	s.BaseURL = "https://h"
	if got, err := ra.KeyFor(s, savedSecret, "https://h:443", ""); err != nil || got.Reveal() != savedSecret.Reveal() {
		t.Errorf("https://h saved, https://h:443 asked: got %q, %v", got.Reveal(), err)
	}
}

func TestKeyForPrefersATypedKeyOnTheSameOrigin(t *testing.T) {
	for _, base := range []string{"", savedBase, "https://api.example.com/elsewhere"} {
		got, err := ra.KeyFor(savedSettings(), savedSecret, base, "sk-typed-key-9999")
		if err != nil || got.Reveal() != "sk-typed-key-9999" {
			t.Errorf("%q: got %q, %v; want the typed key", base, got.Reveal(), err)
		}
	}
}

func TestKeyForNeverReturnsTheSavedKeyForAnotherOrigin(t *testing.T) {
	for name, base := range map[string]string{
		"host changed":           "https://evil.example.net/gateway",
		"subdomain":              "https://x.api.example.com/gateway",
		"port changed":           "https://api.example.com:8443/gateway",
		"scheme changed (local)": "http://localhost:8080",
		"scheme changed, same host (http is only valid for localhost)": "http://127.0.0.1:9",
		"lookalike host": "https://api.example.com.evil.example/gateway",
	} {
		t.Run(name, func(t *testing.T) {
			got, err := ra.KeyFor(savedSettings(), savedSecret, base, "")
			if ra.CodeOf(err) != ra.CodeKeyRequiredNewBaseURL {
				t.Fatalf("got %v, want key_required_for_new_base_url", err)
			}
			if got.Reveal() != "" {
				t.Fatalf("the saved key must not be returned, got %q", got.Reveal())
			}
		})
	}
}

func TestKeyForSchemeChangeOnTheSameHost(t *testing.T) {
	s := savedSettings()
	s.BaseURL = "http://localhost:8080"
	got, err := ra.KeyFor(s, savedSecret, "https://localhost:8080", "")
	if ra.CodeOf(err) != ra.CodeKeyRequiredNewBaseURL || got.Reveal() != "" {
		t.Fatalf("http -> https on the same host:port is another origin: got %q, %v", got.Reveal(), err)
	}
}

func TestKeyForAnotherOriginWithATypedKeyUsesTheTypedKey(t *testing.T) {
	got, err := ra.KeyFor(savedSettings(), savedSecret, "https://gateway.example.org", "sk-new-origin-key")
	if err != nil || got.Reveal() != "sk-new-origin-key" {
		t.Fatalf("got %q, %v", got.Reveal(), err)
	}
}

func TestKeyForNoKeyAnywhereIsAPIKeyRequired(t *testing.T) {
	none := ra.Settings{BaseURL: savedBase, Model: ra.DefaultModel}
	for _, base := range []string{"", savedBase, "https://elsewhere.example.org"} {
		got, err := ra.KeyFor(none, "", base, "")
		if ra.CodeOf(err) != ra.CodeAPIKeyRequired || got.Reveal() != "" {
			t.Errorf("%q: got %q, %v; want api_key_required", base, got.Reveal(), err)
		}
	}
	// A typed key fills the gap.
	got, err := ra.KeyFor(none, "", "", "sk-first-key-0001")
	if err != nil || got.Reveal() != "sk-first-key-0001" {
		t.Errorf("typed key with none saved: %q, %v", got.Reveal(), err)
	}
}

func TestKeyForTreatsABlankTypedKeyAsNotTypedAndRejectsAMalformedOne(t *testing.T) {
	if got, err := ra.KeyFor(savedSettings(), savedSecret, "", "   \t"); err != nil || got.Reveal() != savedSecret.Reveal() {
		t.Errorf("blank typed key keeps the saved one: %q, %v", got.Reveal(), err)
	}
	if _, err := ra.KeyFor(savedSettings(), savedSecret, "https://elsewhere.example.org", "  "); ra.CodeOf(err) != ra.CodeKeyRequiredNewBaseURL {
		t.Errorf("blank typed key on another origin: %v", err)
	}
	if got, err := ra.KeyFor(savedSettings(), savedSecret, "", "  sk-padded  "); err != nil || got.Reveal() != "sk-padded" {
		t.Errorf("typed key is trimmed: %q, %v", got.Reveal(), err)
	}
	if got, err := ra.KeyFor(savedSettings(), savedSecret, "", "sk with space"); ra.CodeOf(err) != ra.CodeAPIKeyInvalid || got.Reveal() != "" {
		t.Errorf("malformed typed key: %q, %v", got.Reveal(), err)
	}
}

func TestKeyForValidatesTheBaseURLFirst(t *testing.T) {
	for base, code := range map[string]string{
		"ftp://x.example.org":              ra.CodeBaseURLInvalid,
		"http://api.example.com":           ra.CodeBaseURLInvalid,
		"https://user:pw@api.example.com/": ra.CodeBaseURLInvalid,
		"https://api.example.com/v1":       ra.CodeBaseURLHasVersion,
		"not a url":                        ra.CodeBaseURLInvalid,
	} {
		got, err := ra.KeyFor(savedSettings(), savedSecret, base, "sk-typed-key-9999")
		if ra.CodeOf(err) != code || got.Reveal() != "" {
			t.Errorf("%q: got %q, %v; want %s", base, got.Reveal(), err, code)
		}
	}
}

// KeyFor agrees with ApplyUpdate on which updates need a new key.
func TestKeyForAgreesWithApplyUpdateOnTheOriginRule(t *testing.T) {
	cur := savedSettings()
	for _, base := range []string{savedBase, "https://api.example.com/else", "https://api.example.com:443/gateway", "https://other.example.org", "https://api.example.com:8443"} {
		_, upErr := ra.ApplyUpdate(cur, ra.Update{Enabled: true, BaseURL: base, Model: cur.Model}, true)
		_, keyErr := ra.KeyFor(cur, savedSecret, base, "")
		if ra.CodeOf(upErr) != ra.CodeOf(keyErr) {
			t.Errorf("%q: ApplyUpdate says %q, KeyFor says %q", base, ra.CodeOf(upErr), ra.CodeOf(keyErr))
		}
	}
}
