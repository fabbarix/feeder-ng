package recipeassistant_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"testing"

	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

func TestLimitConstants(t *testing.T) {
	if ra.MaxRecipes != 5 || ra.MaxTextChars != 50000 || ra.MaxPageBytes != 3<<20 || ra.MaxPageTextChars != 60000 || ra.MaxJSONLDChars != 30000 {
		t.Fatal("limits changed")
	}
	if ra.DefaultBaseURL != "https://api.anthropic.com" || ra.DefaultModel != "claude-haiku-5-5" {
		t.Fatal("defaults changed")
	}
	d := ra.DefaultSettings()
	if d.Enabled || d.HasKey || d.BaseURL != ra.DefaultBaseURL || d.Model != ra.DefaultModel {
		t.Fatalf("DefaultSettings = %+v", d)
	}
}

func TestValidateBaseURL(t *testing.T) {
	ok := map[string]string{
		"https://api.anthropic.com":         "https://api.anthropic.com",
		"https://api.anthropic.com/":        "https://api.anthropic.com",
		"HTTPS://API.Anthropic.COM":         "https://api.anthropic.com",
		"https://gw.example.com/anthropic":  "https://gw.example.com/anthropic",
		"https://gw.example.com/anthropic/": "https://gw.example.com/anthropic",
		"https://gw.example.com:8443/a/b":   "https://gw.example.com:8443/a/b",
		"https://gw.example.com/v1beta":     "https://gw.example.com/v1beta",
		"https://gw.example.com/v10":        "https://gw.example.com/v10",
		"https://gw.example.com/v1/proxy":   "https://gw.example.com/v1/proxy",
		"http://localhost":                  "http://localhost",
		"http://localhost:8080":             "http://localhost:8080",
		"http://127.0.0.1:9999/":            "http://127.0.0.1:9999",
		"http://[::1]:9999":                 "http://[::1]:9999",
		"http://fake.localhost:1234":        "http://fake.localhost:1234",
		"https://localhost:8443":            "https://localhost:8443",
	}
	for in, want := range ok {
		got, err := ra.ValidateBaseURL(in)
		if err != nil || got != want {
			t.Errorf("%q: got %q, %v; want %q", in, got, err, want)
		}
	}
	bad := map[string]string{
		"http://api.anthropic.com":    ra.CodeBaseURLInvalid,
		"http://10.0.0.5:8080":        ra.CodeBaseURLInvalid,
		"http://localhost.evil.com":   ra.CodeBaseURLInvalid,
		"http://127.0.0.1.evil.com":   ra.CodeBaseURLInvalid,
		"http://evil.com/localhost":   ra.CodeBaseURLInvalid,
		"ftp://example.com":           ra.CodeBaseURLInvalid,
		"file:///etc/passwd":          ra.CodeBaseURLInvalid,
		"":                            ra.CodeBaseURLInvalid,
		"   ":                         ra.CodeBaseURLInvalid,
		"api.anthropic.com":           ra.CodeBaseURLInvalid,
		"//api.anthropic.com":         ra.CodeBaseURLInvalid,
		"https://":                    ra.CodeBaseURLInvalid,
		"https:///path":               ra.CodeBaseURLInvalid,
		"https://user@example.com":    ra.CodeBaseURLInvalid,
		"https://user:pw@example.com": ra.CodeBaseURLInvalid,
		"https://example.com?a=1":     ra.CodeBaseURLInvalid,
		"https://example.com?":        ra.CodeBaseURLInvalid,
		"https://example.com#frag":    ra.CodeBaseURLInvalid,
		"https://example.com/#":       ra.CodeBaseURLInvalid,
		"https://exa mple.com":        ra.CodeBaseURLInvalid,
		"https://example.com/v1":      ra.CodeBaseURLHasVersion,
		"https://example.com/v1/":     ra.CodeBaseURLHasVersion,
		"https://example.com/gw/v1":   ra.CodeBaseURLHasVersion,
		"https://example.com/gw/v1/":  ra.CodeBaseURLHasVersion,
		"http://localhost:8080/v1":    ra.CodeBaseURLHasVersion,
		"https://example.com/" + strings.Repeat("a", 2048): ra.CodeBaseURLInvalid,
	}
	for in, code := range bad {
		got, err := ra.ValidateBaseURL(in)
		if ra.CodeOf(err) != code || got != "" {
			t.Errorf("%q: got %q, code %q; want code %q", in, got, ra.CodeOf(err), code)
		}
	}
	// Exactly 2048 characters is fine.
	pad := 2048 - len("https://example.com/")
	if _, err := ra.ValidateBaseURL("https://example.com/" + strings.Repeat("a", pad)); err != nil {
		t.Errorf("2048 characters: %v", err)
	}
}

func TestOriginOfAndOriginChanged(t *testing.T) {
	if got := ra.OriginOf("https://API.Anthropic.com:443/gw"); got != "https://api.anthropic.com" {
		t.Errorf("OriginOf = %q", got)
	}
	if got := ra.OriginOf("http://localhost:8080/x"); got != "http://localhost:8080" {
		t.Errorf("OriginOf = %q", got)
	}
	if ra.OriginOf("not a url") != "" {
		t.Error("an unparsable URL has no origin")
	}
	same := [][2]string{
		{"https://api.anthropic.com", "https://api.anthropic.com/"},
		{"https://api.anthropic.com", "https://api.anthropic.com:443"},
		{"https://api.anthropic.com", "HTTPS://API.ANTHROPIC.COM"},
		{"https://gw.example.com/a", "https://gw.example.com/b/c"},
	}
	for _, p := range same {
		if ra.OriginChanged(p[0], p[1]) {
			t.Errorf("%q -> %q is not an origin change", p[0], p[1])
		}
	}
	diff := [][2]string{
		{"https://api.anthropic.com", "https://gw.example.com"},
		{"https://api.anthropic.com", "https://api.anthropic.com:8443"},
		{"https://localhost", "http://localhost"},
		{"https://api.anthropic.com", "https://api.anthropic.com.evil.com"},
		{"https://api.anthropic.com", "https://sub.api.anthropic.com"},
	}
	for _, p := range diff {
		if !ra.OriginChanged(p[0], p[1]) {
			t.Errorf("%q -> %q is an origin change", p[0], p[1])
		}
	}
}

func TestValidateModelID(t *testing.T) {
	for _, ok := range []string{"claude-haiku-5-5", "claude-sonnet-5-5", "claude-3-7-sonnet-20250219", "a", "org/model:v1.2@latest", "My_Model.1", strings.Repeat("a", 128)} {
		if err := ra.ValidateModelID(ok); err != nil {
			t.Errorf("%q: %v", ok, err)
		}
	}
	for _, bad := range []string{"", " ", "claude haiku", "claude\n", "claude-haiku-5-5\n", "model;drop table", "mödel", "a\tb", "<script>", "model?x=1", "model#1", strings.Repeat("a", 129)} {
		if code := ra.CodeOf(ra.ValidateModelID(bad)); code != ra.CodeModelInvalid {
			t.Errorf("%q: code %q, want model_invalid", bad, code)
		}
	}
}

func TestLast4(t *testing.T) {
	if got := ra.Last4("sk-ant-api03-abcdWXYZ"); got != "WXYZ" {
		t.Errorf("Last4 = %q", got)
	}
	if ra.Last4("short") != "" || ra.Last4("1234567") != "" || ra.Last4("") != "" {
		t.Error("a key under 8 characters shows nothing")
	}
	if ra.Last4("12345678") != "5678" {
		t.Error("8 characters is enough")
	}
}

func TestSecretIsNeverPrinted(t *testing.T) {
	const key = "sk-ant-api03-SECRETVALUE"
	s := ra.Secret(key)
	for _, verb := range []string{"%v", "%+v", "%#v", "%s", "%q", "%x"} {
		if out := fmt.Sprintf(verb, s); strings.Contains(out, "SECRETVALUE") || strings.Contains(out, fmt.Sprintf("%x", key)) {
			t.Errorf("%s leaks: %q", verb, out)
		}
	}
	type form struct {
		APIKey ra.Secret `json:"apiKey"`
		Model  string    `json:"model"`
	}
	out, err := json.Marshal(form{APIKey: s, Model: "m"})
	if err != nil || strings.Contains(string(out), "SECRETVALUE") {
		t.Errorf("json leaks: %s %v", out, err)
	}
	var buf bytes.Buffer
	slog.New(slog.NewJSONHandler(&buf, nil)).Info("put", "key", s, "form", form{APIKey: s})
	if strings.Contains(buf.String(), "SECRETVALUE") {
		t.Errorf("slog leaks: %s", buf.String())
	}
	if !strings.Contains(fmt.Sprint(s), "[redacted]") || !strings.Contains(buf.String(), "[redacted]") {
		t.Error("expected [redacted]")
	}
	// Decoding still works: the request body must be readable.
	var in form
	if err := json.Unmarshal([]byte(`{"apiKey":"`+key+`"}`), &in); err != nil || in.APIKey.Reveal() != key {
		t.Fatalf("decode: %v %q", err, in.APIKey.Reveal())
	}
}

// ---- ApplyUpdate ------------------------------------------------------------

func saved() ra.Settings {
	return ra.Settings{Enabled: true, BaseURL: ra.DefaultBaseURL, Model: ra.DefaultModel, HasKey: true, KeyLast4: "1234"}
}

func upd(mod func(*ra.Update)) ra.Update {
	u := ra.Update{Enabled: true, BaseURL: ra.DefaultBaseURL, Model: ra.DefaultModel}
	if mod != nil {
		mod(&u)
	}
	return u
}

func actions(a ra.Applied) []string {
	out := []string{}
	for _, c := range a.Changes {
		out = append(out, c.Action)
	}
	return out
}

func TestApplyUpdateEmptyKeyKeepsTheSavedKey(t *testing.T) {
	for _, key := range []ra.Secret{"", "   ", "\n"} {
		a, err := ra.ApplyUpdate(saved(), upd(func(u *ra.Update) { u.APIKey = key }), true)
		if err != nil {
			t.Fatal(err)
		}
		if a.NewKey != "" || !a.Settings.HasKey || a.Settings.KeyLast4 != "1234" || len(a.Changes) != 0 {
			t.Fatalf("%q: %+v", key, a)
		}
	}
}

func TestApplyUpdateNonEmptyKeyReplacesIt(t *testing.T) {
	a, err := ra.ApplyUpdate(saved(), upd(func(u *ra.Update) { u.APIKey = "  sk-ant-api03-NEWKEYwxyz\n" }), true)
	if err != nil {
		t.Fatal(err)
	}
	if a.NewKey.Reveal() != "sk-ant-api03-NEWKEYwxyz" || a.Settings.KeyLast4 != "wxyz" || !a.Settings.HasKey {
		t.Fatalf("%+v", a)
	}
	if len(a.Changes) != 1 || a.Changes[0] != (ra.Change{Action: ra.ActionKeyReplaced, Detail: "wxyz"}) {
		t.Fatalf("changes = %+v", a.Changes)
	}
}

func TestApplyUpdateFirstKeyIsSavedNotReplaced(t *testing.T) {
	cur := ra.DefaultSettings()
	a, err := ra.ApplyUpdate(cur, upd(func(u *ra.Update) { u.Enabled = true; u.APIKey = "sk-ant-api03-firstKEY9" }), true)
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(actions(a)) != "[turned_on key_saved]" || !a.Settings.Enabled || a.Settings.KeyLast4 != "KEY9" {
		t.Fatalf("%+v", a)
	}
}

func TestApplyUpdateRejectsABadKey(t *testing.T) {
	for _, k := range []ra.Secret{"sk-ant with space-1234567", "sk-ant-\nline-1234567", "sk-ant-\x00-1234567", ra.Secret(strings.Repeat("k", 513))} {
		_, err := ra.ApplyUpdate(saved(), upd(func(u *ra.Update) { u.APIKey = k }), true)
		if ra.CodeOf(err) != ra.CodeAPIKeyInvalid {
			t.Errorf("%q: code %q", k, ra.CodeOf(err))
		}
	}
	if _, err := ra.ApplyUpdate(saved(), upd(func(u *ra.Update) { u.APIKey = ra.Secret(strings.Repeat("k", 512)) }), true); err != nil {
		t.Errorf("512 characters: %v", err)
	}
}

func TestApplyUpdateOriginChangeNeedsANewKeyAndChangesNothingOtherwise(t *testing.T) {
	cur := saved()
	_, err := ra.ApplyUpdate(cur, upd(func(u *ra.Update) { u.BaseURL = "https://gw.example.com" }), true)
	if ra.CodeOf(err) != ra.CodeKeyRequiredNewBaseURL {
		t.Fatalf("code %q, want key_required_for_new_base_url", ra.CodeOf(err))
	}
	// Still refused when other fields change too: nothing is saved.
	_, err = ra.ApplyUpdate(cur, upd(func(u *ra.Update) { u.BaseURL = "http://localhost:8080"; u.Model = "other"; u.Enabled = false }), true)
	if ra.CodeOf(err) != ra.CodeKeyRequiredNewBaseURL {
		t.Fatalf("code %q", ra.CodeOf(err))
	}
	a, err := ra.ApplyUpdate(cur, upd(func(u *ra.Update) { u.BaseURL = "https://gw.example.com/"; u.APIKey = "sk-gw-0000-ABCD" }), true)
	if err != nil {
		t.Fatal(err)
	}
	if a.Settings.BaseURL != "https://gw.example.com" || a.NewKey.Reveal() != "sk-gw-0000-ABCD" || a.Settings.KeyLast4 != "ABCD" {
		t.Fatalf("%+v", a)
	}
	if fmt.Sprint(actions(a)) != "[base_url_changed key_replaced]" {
		t.Fatalf("actions = %v", actions(a))
	}
	if a.Changes[0].Detail != "https://api.anthropic.com -> https://gw.example.com" {
		t.Fatalf("detail = %q", a.Changes[0].Detail)
	}
}

func TestApplyUpdatePathOnlyChangeKeepsTheKey(t *testing.T) {
	cur := saved()
	cur.BaseURL = "https://gw.example.com/a"
	a, err := ra.ApplyUpdate(cur, upd(func(u *ra.Update) { u.BaseURL = "https://gw.example.com/b" }), true)
	if err != nil || !a.Settings.HasKey || a.NewKey != "" || fmt.Sprint(actions(a)) != "[base_url_changed]" {
		t.Fatalf("%+v %v", a, err)
	}
}

func TestApplyUpdateOriginChangeWithoutASavedKeyIsFine(t *testing.T) {
	cur := ra.DefaultSettings()
	a, err := ra.ApplyUpdate(cur, upd(func(u *ra.Update) { u.Enabled = false; u.BaseURL = "https://gw.example.com" }), true)
	if err != nil || a.Settings.BaseURL != "https://gw.example.com" || a.Settings.Enabled {
		t.Fatalf("%+v %v", a, err)
	}
}

func TestApplyUpdateEnablingNeedsAKey(t *testing.T) {
	_, err := ra.ApplyUpdate(ra.DefaultSettings(), upd(nil), true)
	if ra.CodeOf(err) != ra.CodeAPIKeyRequired {
		t.Fatalf("code %q, want api_key_required", ra.CodeOf(err))
	}
}

func TestApplyUpdateWithoutAServerSecretKey(t *testing.T) {
	_, err := ra.ApplyUpdate(ra.DefaultSettings(), upd(func(u *ra.Update) { u.APIKey = "sk-ant-api03-abcdefgh" }), false)
	if ra.CodeOf(err) != ra.CodeSecretKeyMissing {
		t.Fatalf("a key: code %q", ra.CodeOf(err))
	}
	_, err = ra.ApplyUpdate(ra.DefaultSettings(), upd(nil), false)
	if ra.CodeOf(err) != ra.CodeSecretKeyMissing {
		t.Fatalf("enabling: code %q (secret_key_missing wins over api_key_required)", ra.CodeOf(err))
	}
	// Turning off and editing non-secret fields still works.
	a, err := ra.ApplyUpdate(ra.DefaultSettings(), upd(func(u *ra.Update) { u.Enabled = false; u.Model = "claude-sonnet-5-5" }), false)
	if err != nil || a.Settings.Model != "claude-sonnet-5-5" {
		t.Fatalf("%+v %v", a, err)
	}
}

func TestApplyUpdateValidatesFieldsFirst(t *testing.T) {
	cases := map[string]struct {
		mod  func(*ra.Update)
		code string
	}{
		"base url":    {func(u *ra.Update) { u.BaseURL = "http://example.com" }, ra.CodeBaseURLInvalid},
		"version":     {func(u *ra.Update) { u.BaseURL = "https://example.com/v1" }, ra.CodeBaseURLHasVersion},
		"model":       {func(u *ra.Update) { u.Model = "bad model" }, ra.CodeModelInvalid},
		"empty model": {func(u *ra.Update) { u.Model = "" }, ra.CodeModelInvalid},
	}
	for name, tc := range cases {
		if _, err := ra.ApplyUpdate(saved(), upd(tc.mod), false); ra.CodeOf(err) != tc.code {
			t.Errorf("%s: code %q, want %q (validation runs before the secret-key check)", name, ra.CodeOf(err), tc.code)
		}
	}
}

func TestApplyUpdateWritesOneChangePerChangedField(t *testing.T) {
	a, err := ra.ApplyUpdate(saved(), upd(func(u *ra.Update) { u.Enabled = false; u.Model = "claude-sonnet-5-5" }), true)
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(actions(a)) != "[turned_off model_changed]" {
		t.Fatalf("actions = %v", actions(a))
	}
	if a.Changes[1].Detail != "claude-haiku-5-5 -> claude-sonnet-5-5" {
		t.Fatalf("detail = %q", a.Changes[1].Detail)
	}
	// The key stays saved when the assistant is turned off.
	if !a.Settings.HasKey || a.Settings.Enabled {
		t.Fatalf("%+v", a.Settings)
	}
	none, err := ra.ApplyUpdate(saved(), upd(func(u *ra.Update) { u.BaseURL = "https://api.anthropic.com/" }), true)
	if err != nil || len(none.Changes) != 0 {
		t.Fatalf("a no-op (trailing slash only) writes no history: %+v %v", none.Changes, err)
	}
}

func TestApplyKeyRemoval(t *testing.T) {
	a := ra.ApplyKeyRemoval(saved())
	if a.Settings.HasKey || a.Settings.KeyLast4 != "" || a.Settings.Enabled {
		t.Fatalf("%+v", a.Settings)
	}
	if fmt.Sprint(actions(a)) != "[turned_off key_removed]" || a.Changes[1].Detail != "1234" {
		t.Fatalf("changes = %+v", a.Changes)
	}
	off := saved()
	off.Enabled = false
	if got := actions(ra.ApplyKeyRemoval(off)); fmt.Sprint(got) != "[key_removed]" {
		t.Fatalf("already off: %v", got)
	}
	if got := ra.ApplyKeyRemoval(ra.DefaultSettings()); len(got.Changes) != 0 {
		t.Fatalf("nothing to remove: %+v", got)
	}
}
