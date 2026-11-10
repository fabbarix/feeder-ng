package httpapi_test

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

type obj = map[string]any

const (
	masterA = "W1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1s="     // 32 x 0x5b
	masterB = "XFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFw=" // 32 x 0x5c
	apiKey  = "sk-ant-api03-VERYSECRETVALUE-w9z1"
)

type world struct {
	env   *testkit.Env
	admin *testkit.Client
	user  *testkit.Client
	fake  *fakeanthropic.Server
}

func setup(t *testing.T, secret string, fake ...fakeanthropic.Option) *world {
	t.Helper()
	var opts []testkit.Option
	if secret != "" {
		mk, err := secretbox.ParseMasterKey(secret)
		if err != nil {
			t.Fatal(err)
		}
		opts = append(opts, testkit.WithConfig(func(c *config.Config) { c.SecretKey = mk }))
	}
	env := testkit.Start(t, opts...)
	f := fakeanthropic.New(fake...)
	t.Cleanup(f.Close)
	return &world{env: env, admin: env.LoginAdmin(t), user: env.LoginUser(t), fake: f}
}

func must(t *testing.T, r *testkit.Response, status int) *testkit.Response {
	t.Helper()
	if r.Status != status {
		t.Fatalf("status = %d, want %d; body: %s", r.Status, status, r.Body)
	}
	return r
}

// codes returns the top-level error code plus every errors[].code.
func codes(r *testkit.Response) []string {
	var b struct {
		Error struct {
			Code   string `json:"code"`
			Errors []struct {
				Field string `json:"field"`
				Code  string `json:"code"`
			} `json:"errors"`
		} `json:"error"`
	}
	_ = json.Unmarshal(r.Body, &b)
	out := []string{b.Error.Code}
	for _, e := range b.Error.Errors {
		out = append(out, e.Code)
	}
	return out
}

func has(r *testkit.Response, code string) bool {
	for _, c := range codes(r) {
		if c == code {
			return true
		}
	}
	return false
}

func fieldOf(r *testkit.Response, code string) string {
	var b struct {
		Error struct {
			Errors []struct{ Field, Code string } `json:"errors"`
		} `json:"error"`
	}
	_ = json.Unmarshal(r.Body, &b)
	for _, e := range b.Error.Errors {
		if e.Code == code {
			return e.Field
		}
	}
	return ""
}

func (w *world) save(t *testing.T, body obj, want int) *testkit.Response {
	t.Helper()
	return must(t, w.admin.Put("/api/recipe-assistant/settings", body), want)
}

// enable saves the fake as base URL with the default key and the assistant on.
func (w *world) enable(t *testing.T) {
	t.Helper()
	w.save(t, obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5", "apiKey": apiKey}, 200)
}

func get(t *testing.T, c *testkit.Client, path string) map[string]any {
	t.Helper()
	var m map[string]any
	must(t, c.Get(path), 200).MustJSON(t, &m)
	return m
}

// raw sends a request with arbitrary headers, signed in as c.
func raw(w *world, c *testkit.Client, method, path string, headers map[string]string, body string) (int, []byte) {
	req, _ := http.NewRequest(method, w.env.URL()+path, strings.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if ck := c.Cookie(auth.CookieName); ck != nil {
		req.AddCookie(ck)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b
}

// ---- access ----------------------------------------------------------------------------------------------------

var allRoutes = []struct{ method, path string }{
	{"GET", "/api/recipe-assistant/status"},
	{"GET", "/api/recipe-assistant/settings"},
	{"PUT", "/api/recipe-assistant/settings"},
	{"DELETE", "/api/recipe-assistant/settings/api-key"},
	{"POST", "/api/recipe-assistant/models"},
	{"POST", "/api/recipe-assistant/test"},
}

func TestEveryRouteNeedsASignedInUserAndSettingsRoutesNeedAnAdmin(t *testing.T) {
	w := setup(t, masterA)
	anon := w.env.Anonymous()
	for _, rt := range allRoutes {
		if r := anon.Do(rt.method, rt.path, obj{}); r.Status != 401 {
			t.Errorf("anonymous %s %s = %d, want 401", rt.method, rt.path, r.Status)
		}
		r := w.user.Do(rt.method, rt.path, obj{})
		if rt.path == "/api/recipe-assistant/status" {
			if r.Status != 200 {
				t.Errorf("User %s %s = %d, want 200", rt.method, rt.path, r.Status)
			}
			continue
		}
		if r.Status != 403 {
			t.Errorf("User %s %s = %d, want 403 (Admin only)", rt.method, rt.path, r.Status)
		}
	}
	if w.fake.Requests() != nil && len(w.fake.Requests()) != 0 {
		t.Error("a refused request must not reach Anthropic")
	}
}

func TestStateChangingRoutesAreCSRFGuarded(t *testing.T) {
	w := setup(t, masterA)
	for _, rt := range allRoutes[2:] {
		st, body := raw(w, w.admin, rt.method, rt.path, map[string]string{"Content-Type": "application/json", "Origin": "https://evil.example"}, `{}`)
		if st != 403 || !strings.Contains(string(body), "cross_origin") {
			t.Errorf("%s %s cross-origin = %d %s, want 403 cross_origin", rt.method, rt.path, st, body)
		}
		st, body = raw(w, w.admin, rt.method, rt.path, map[string]string{"Content-Type": "text/plain"}, `{}`)
		if st != 415 {
			t.Errorf("%s %s text/plain = %d %s, want 415", rt.method, rt.path, st, body)
		}
	}
	// A same-origin browser request passes the guard.
	st, body := raw(w, w.admin, "PUT", "/api/recipe-assistant/settings", map[string]string{"Content-Type": "application/json", "Origin": w.env.URL()},
		fmt.Sprintf(`{"enabled":false,"baseUrl":%q,"model":"claude-haiku-5-5"}`, w.fake.URL))
	if st != 200 {
		t.Errorf("same-origin PUT = %d %s", st, body)
	}
	if got := get(t, w.admin, "/api/recipe-assistant/settings")["baseUrl"]; got != w.fake.URL {
		t.Errorf("baseUrl = %v", got)
	}
}

// ---- settings --------------------------------------------------------------------------------------------------

func TestSettingsDefaultsAndTheKeyIsNeverReturned(t *testing.T) {
	w := setup(t, masterA)
	s := get(t, w.admin, "/api/recipe-assistant/settings")
	if s["secretKeyConfigured"] != true || s["enabled"] != false || s["baseUrl"] != "https://api.anthropic.com" || s["defaultBaseUrl"] != "https://api.anthropic.com" ||
		s["model"] != "claude-haiku-5-5" || s["hasApiKey"] != false || s["apiKeyLast4"] != "" && s["apiKeyLast4"] != nil {
		t.Fatalf("defaults = %v", s)
	}
	w.enable(t)
	var all strings.Builder
	for _, p := range []string{"/api/recipe-assistant/settings", "/api/recipe-assistant/status"} {
		all.Write(must(t, w.admin.Get(p), 200).Body)
	}
	all.Write(must(t, w.user.Get("/api/recipe-assistant/status"), 200).Body)
	put := w.save(t, obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5"}, 200)
	all.Write(put.Body)
	all.Write(must(t, w.admin.Post("/api/recipe-assistant/models", obj{}), 200).Body)
	all.Write(must(t, w.admin.Post("/api/recipe-assistant/test", obj{}), 200).Body)
	for _, secret := range []string{apiKey, "VERYSECRETVALUE", "sk-ant"} {
		if strings.Contains(all.String(), secret) {
			t.Fatalf("a response contains the API key (%q)", secret)
		}
	}
	s = get(t, w.admin, "/api/recipe-assistant/settings")
	if s["hasApiKey"] != true || s["apiKeyLast4"] != "w9z1" || s["apiKeyReadable"] != true || s["enabled"] != true {
		t.Errorf("settings = %v", s)
	}
	if _, present := s["apiKey"]; present {
		t.Error("there is no apiKey field in any response")
	}
}

func TestWithoutASecretKeyTheAssistantCannotBeTurnedOn(t *testing.T) {
	w := setup(t, "")
	s := get(t, w.admin, "/api/recipe-assistant/settings")
	if s["secretKeyConfigured"] != false {
		t.Errorf("secretKeyConfigured = %v", s["secretKeyConfigured"])
	}
	for name, body := range map[string]obj{
		"enable":      {"enabled": true, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5", "apiKey": apiKey},
		"enable only": {"enabled": true, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5"},
		"key only":    {"enabled": false, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5", "apiKey": apiKey},
	} {
		r := must(t, w.admin.Put("/api/recipe-assistant/settings", body), 422)
		if !has(r, "secret_key_missing") {
			t.Errorf("%s: codes %v, want secret_key_missing", name, codes(r))
		}
	}
	// The model and base URL can still be edited while it is off and no key is given.
	w.save(t, obj{"enabled": false, "baseUrl": w.fake.URL, "model": "claude-sonnet-5-5"}, 200)
	st := get(t, w.user, "/api/recipe-assistant/status")
	if st["available"] != false || st["reason"] != "no_secret_key" {
		t.Errorf("status = %v", st)
	}
	if len(w.fake.Requests()) != 0 {
		t.Error("nothing may be sent to Anthropic")
	}
}

func TestAnEmptyOrAbsentKeyKeepsTheSavedKeyAndAReplacementReplacesIt(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	for name, key := range map[string]any{"absent": nil, "null": "NULL", "empty": "", "blanks": "   "} {
		body := obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-sonnet-5-5"}
		switch key {
		case nil:
		case "NULL":
			body["apiKey"] = nil
		default:
			body["apiKey"] = key
		}
		w.save(t, body, 200)
		s := get(t, w.admin, "/api/recipe-assistant/settings")
		if s["hasApiKey"] != true || s["apiKeyLast4"] != "w9z1" || s["model"] != "claude-sonnet-5-5" {
			t.Errorf("%s: %v", name, s)
		}
	}
	for _, k := range w.fake.Keys() {
		if k != apiKey {
			t.Errorf("only the saved key may be used while it is kept, saw %q", k)
		}
	}
	w.save(t, obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-sonnet-5-5", "apiKey": "sk-replacement-0000-abcd"}, 200)
	if s := get(t, w.admin, "/api/recipe-assistant/settings"); s["apiKeyLast4"] != "abcd" {
		t.Errorf("replaced key last4 = %v", s["apiKeyLast4"])
	}
}

func TestRemoveKeyClearsItAndTurnsTheAssistantOff(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	var s map[string]any
	must(t, w.admin.Delete("/api/recipe-assistant/settings/api-key"), 200).MustJSON(t, &s)
	if s["enabled"] != false || s["hasApiKey"] != false {
		t.Errorf("after removal: %v", s)
	}
	if st := get(t, w.user, "/api/recipe-assistant/status"); st["available"] != false || st["reason"] != "off" {
		t.Errorf("status = %v", st)
	}
	must(t, w.admin.Delete("/api/recipe-assistant/settings/api-key"), 200) // idempotent
	r := w.save(t, obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5"}, 422)
	if !has(r, "api_key_required") {
		t.Errorf("enabling without a key: %v", codes(r))
	}
}

func TestSettingsValidation(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	base := func() obj { return obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5"} }
	cases := []struct {
		name, code, field string
		mod               func(obj)
	}{
		{"version in url", "base_url_has_version", "baseUrl", func(b obj) { b["baseUrl"] = w.fake.URL + "/v1" }},
		{"plain http to a public host", "base_url_invalid", "baseUrl", func(b obj) { b["baseUrl"] = "http://api.example.com" }},
		{"not a url", "base_url_invalid", "baseUrl", func(b obj) { b["baseUrl"] = "api" }},
		{"model empty", "model_invalid", "model", func(b obj) { b["model"] = "" }},
		{"model with a space", "model_invalid", "model", func(b obj) { b["model"] = "claude haiku" }},
		{"key with a space", "api_key_invalid", "apiKey", func(b obj) { b["apiKey"] = "sk-with space" }},
	}
	for _, tc := range cases {
		b := base()
		tc.mod(b)
		r := must(t, w.admin.Put("/api/recipe-assistant/settings", b), 422)
		if !has(r, tc.code) || fieldOf(r, tc.code) != tc.field {
			t.Errorf("%s: codes %v field %q, want %s on %s; body %s", tc.name, codes(r), fieldOf(r, tc.code), tc.code, tc.field, r.Body)
		}
		if !has(r, "invalid_settings") {
			t.Errorf("%s: top-level code must be invalid_settings: %v", tc.name, codes(r))
		}
	}
	if s := get(t, w.admin, "/api/recipe-assistant/settings"); s["baseUrl"] != w.fake.URL || s["model"] != "claude-haiku-5-5" {
		t.Errorf("a refused save must change nothing: %v", s)
	}
}

func TestSavingChecksTheModelWhenEnabled(t *testing.T) {
	// 404 model -> model_unavailable
	w := setup(t, masterA)
	r := must(t, w.admin.Put("/api/recipe-assistant/settings", obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-gone-9", "apiKey": apiKey}), 422)
	if !has(r, "model_unavailable") || fieldOf(r, "model_unavailable") != "model" {
		t.Errorf("unknown model: %v", codes(r))
	}
	if s := get(t, w.admin, "/api/recipe-assistant/settings"); s["enabled"] != false || s["hasApiKey"] != false {
		t.Errorf("nothing may be saved on a refusal: %v", s)
	}
	// model without structured outputs
	r = must(t, w.admin.Put("/api/recipe-assistant/settings", obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-opus-4-6", "apiKey": apiKey}), 422)
	if !has(r, "model_cannot_read_recipes") {
		t.Errorf("no structured outputs: %v", codes(r))
	}
	// a refused key
	w2 := setup(t, masterA, fakeanthropic.WithKeys("sk-someone-else"))
	r = must(t, w2.admin.Put("/api/recipe-assistant/settings", obj{"enabled": true, "baseUrl": w2.fake.URL, "model": "claude-haiku-5-5", "apiKey": apiKey}), 422)
	if !has(r, "api_key_refused") || fieldOf(r, "api_key_refused") != "apiKey" {
		t.Errorf("refused key: %v", codes(r))
	}
	// no image input -> saved with a warning
	w3 := setup(t, masterA)
	r = must(t, w3.admin.Put("/api/recipe-assistant/settings", obj{"enabled": true, "baseUrl": w3.fake.URL, "model": "claude-text-only", "apiKey": apiKey}), 200)
	if !warns(r, "no_photos") {
		t.Errorf("want warning no_photos: %s", r.Body)
	}
	if st := get(t, w3.user, "/api/recipe-assistant/status"); st["available"] != true || st["photos"] != false {
		t.Errorf("status = %v", st)
	}
	// a gateway without /v1/models -> saved with not_verified
	w4 := setup(t, masterA)
	w4.fake.NoModelsEndpoint(true)
	r = must(t, w4.admin.Put("/api/recipe-assistant/settings", obj{"enabled": true, "baseUrl": w4.fake.URL, "model": "claude-haiku-5-5", "apiKey": apiKey}), 200)
	if !warns(r, "not_verified") {
		t.Errorf("want warning not_verified: %s", r.Body)
	}
	// turned off: no verification request at all
	w5 := setup(t, masterA)
	w5.save(t, obj{"enabled": false, "baseUrl": w5.fake.URL, "model": "whatever-model", "apiKey": apiKey}, 200)
	if len(w5.fake.Requests()) != 0 {
		t.Errorf("a save with the assistant off must not call Anthropic: %d requests", len(w5.fake.Requests()))
	}
}

func warns(r *testkit.Response, code string) bool {
	var b struct{ Warnings []struct{ Code string } }
	_ = json.Unmarshal(r.Body, &b)
	for _, w := range b.Warnings {
		if w.Code == code {
			return true
		}
	}
	return false
}

// ---- the saved key is bound to its origin ----------------------------------------------------------------------

func TestTheSavedKeyNeverLeavesForAnotherOriginOnAnyRoute(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	other := fakeanthropic.New()
	defer other.Close()
	sameHostOtherPort := other.URL
	localhostForm := strings.Replace(w.fake.URL, "127.0.0.1", "localhost", 1)
	httpsForm := strings.Replace(w.fake.URL, "http://", "https://", 1)
	for _, target := range []string{sameHostOtherPort, localhostForm, httpsForm} {
		for _, rt := range []struct{ method, path string }{
			{"PUT", "/api/recipe-assistant/settings"}, {"POST", "/api/recipe-assistant/models"}, {"POST", "/api/recipe-assistant/test"},
		} {
			r := w.admin.Do(rt.method, rt.path, obj{"enabled": true, "baseUrl": target, "model": "claude-haiku-5-5"})
			if r.Status != 422 || !has(r, "key_required_for_new_base_url") {
				t.Errorf("%s %s -> %s without a key = %d %s, want 422 key_required_for_new_base_url", rt.method, rt.path, target, r.Status, r.Body)
			}
		}
	}
	if n := len(other.Requests()); n != 0 {
		t.Fatalf("the other origin received %d requests", n)
	}
	if s := get(t, w.admin, "/api/recipe-assistant/settings"); s["baseUrl"] != w.fake.URL || s["hasApiKey"] != true || s["apiKeyLast4"] != "w9z1" {
		t.Errorf("a refused save must change nothing: %v", s)
	}
	// With a typed key it works, uses only the typed key, and the old key is gone.
	w.save(t, obj{"enabled": true, "baseUrl": other.URL, "model": "claude-haiku-5-5", "apiKey": "sk-new-key-zzzz"}, 200)
	if keys := other.Keys(); len(keys) != 1 || keys[0] != "sk-new-key-zzzz" {
		t.Errorf("other origin saw keys %v, want only the typed one", keys)
	}
	if s := get(t, w.admin, "/api/recipe-assistant/settings"); s["apiKeyLast4"] != "zzzz" || s["baseUrl"] != other.URL {
		t.Errorf("settings after the move: %v", s)
	}
	for _, rt := range []string{"/api/recipe-assistant/models", "/api/recipe-assistant/test"} {
		must(t, w.admin.Post(rt, obj{"baseUrl": w.fake.URL, "apiKey": "sk-try-0000-1111"}), 200)
	}
	for _, k := range other.Keys() {
		if k == apiKey {
			t.Error("the old saved key reached the new origin")
		}
	}
}

func TestAPathOnlyChangeKeepsTheKey(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	r := w.save(t, obj{"enabled": true, "baseUrl": w.fake.URL + "/gateway", "model": "claude-haiku-5-5"}, 200)
	_ = r
	s := get(t, w.admin, "/api/recipe-assistant/settings")
	if s["baseUrl"] != w.fake.URL+"/gateway" || s["hasApiKey"] != true || s["apiKeyLast4"] != "w9z1" {
		t.Errorf("settings = %v", s)
	}
}

// ---- change history --------------------------------------------------------------------------------------------

func TestChangeHistoryIsRecordedPerFieldAndOnlyAdminsSeeIt(t *testing.T) {
	w := setup(t, masterA)
	sub, cancel := w.env.App.Deps.Events.Subscribe("recipeAssistant")
	defer cancel()
	w.enable(t) // turned_on, base_url_changed, key_saved
	w.save(t, obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-sonnet-5-5"}, 200)
	w.save(t, obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-sonnet-5-5", "apiKey": "sk-second-0000-5678"}, 200)
	w.save(t, obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-sonnet-5-5"}, 200) // no change: no rows
	must(t, w.admin.Delete("/api/recipe-assistant/settings/api-key"), 200)
	var s struct {
		Changes []struct {
			At, ActorName, Action, Detail string
		}
	}
	must(t, w.admin.Get("/api/recipe-assistant/settings"), 200).MustJSON(t, &s)
	var actions []string
	for _, c := range s.Changes {
		actions = append(actions, c.Action)
		if c.ActorName == "" || c.At == "" {
			t.Errorf("row without actor or time: %+v", c)
		}
		for _, banned := range []string{apiKey, "VERYSECRET", "second-0000"} {
			if strings.Contains(c.Detail, banned) {
				t.Errorf("history detail leaks the key: %q", c.Detail)
			}
		}
	}
	got := strings.Join(actions, ",")
	want := "turned_off,key_removed,key_replaced,model_changed,key_saved,base_url_changed,turned_on"
	if got != want && got != "key_removed,turned_off,key_replaced,model_changed,key_saved,base_url_changed,turned_on" {
		t.Errorf("history (newest first) = %s, want %s", got, want)
	}
	for _, c := range s.Changes {
		if c.Action == "key_removed" && c.Detail != "5678" || c.Action == "key_saved" && c.Detail != "w9z1" {
			t.Errorf("key rows carry the last four only: %+v", c)
		}
	}
	// The status a User gets has no history, and the Admin-only settings route refuses Users.
	if st := get(t, w.user, "/api/recipe-assistant/status"); st["changes"] != nil {
		t.Error("status must not carry change history")
	}
	must(t, w.user.Get("/api/recipe-assistant/settings"), 403)
	select {
	case ev := <-sub:
		if ev.Topic != "recipeAssistant" || strings.Contains(string(ev.Data), "sk-") || !strings.Contains(string(ev.Data), `"settings"`) {
			t.Errorf("event = %s %s, want {\"changed\":\"settings\"} and no secrets", ev.Topic, ev.Data)
		}
	case <-time.After(2 * time.Second):
		t.Error("no recipeAssistant SSE event after a change")
	}
}

// ---- restart and a different secret key ------------------------------------------------------------------------

func TestADifferentSecretKeyAfterRestartMakesTheSavedKeyUnreadableUntilItIsEnteredAgain(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	mk, _ := secretbox.ParseMasterKey(masterB)
	w.env.Config.SecretKey = mk
	w.env.Restart(t)
	w.admin, w.user = w.env.LoginAdmin(t), w.env.LoginUser(t)
	s := get(t, w.admin, "/api/recipe-assistant/settings")
	if s["hasApiKey"] != true || s["apiKeyReadable"] != false {
		t.Errorf("settings = %v", s)
	}
	if st := get(t, w.user, "/api/recipe-assistant/status"); st["available"] != false || st["reason"] != "key_unreadable" {
		t.Errorf("status = %v", st)
	}
	r := must(t, w.admin.Post("/api/recipe-assistant/models", obj{}), 422)
	if len(codes(r)) == 0 || (!has(r, "api_key_required") && !has(r, "key_unreadable")) {
		t.Errorf("an unreadable saved key is not used: %s", r.Body)
	}
	w.save(t, obj{"enabled": true, "baseUrl": w.fake.URL, "model": "claude-haiku-5-5", "apiKey": "sk-entered-again-4321"}, 200)
	s = get(t, w.admin, "/api/recipe-assistant/settings")
	if s["apiKeyReadable"] != true || s["apiKeyLast4"] != "4321" {
		t.Errorf("after re-entering: %v", s)
	}
	if st := get(t, w.user, "/api/recipe-assistant/status"); st["available"] != true {
		t.Errorf("status = %v", st)
	}
}

func TestRemovingTheSecretKeyAfterRestartTurnsTheFeatureUnavailable(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	w.env.Config.SecretKey = secretbox.MasterKey{}
	w.env.Restart(t)
	w.admin, w.user = w.env.LoginAdmin(t), w.env.LoginUser(t)
	if st := get(t, w.user, "/api/recipe-assistant/status"); st["available"] != false || st["reason"] != "no_secret_key" {
		t.Errorf("status = %v", st)
	}
	if s := get(t, w.admin, "/api/recipe-assistant/settings"); s["secretKeyConfigured"] != false {
		t.Errorf("settings = %v", s)
	}
}

func TestNoKeyFileIsEverCreatedInTheDataDirectory(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	for _, name := range []string{"secret.key", "secret", "feeder.key"} {
		if fileExists(w.env.DataDir + "/" + name) {
			t.Errorf("%s must never be created", name)
		}
	}
}

// ---- models and test connection --------------------------------------------------------------------------------

type modelsAnswer struct {
	Models []struct {
		ID, Name, Description, PriceTier, SpeedTier, Group, Lifecycle, RetiresAt string
		ImageInput                                                               *bool
	}
	Source, Notice string
}

func TestModelsAreFilteredToStructuredOutputsMergedWithTheCatalogueAndHaikuIsFirst(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	w.fake.SetModels([]fakeanthropic.Model{
		{ID: "claude-opus-5-5", DisplayName: "Claude Opus 5.5", StructuredOutputs: true, ImageInput: true},
		{ID: "claude-haiku-5-5", DisplayName: "Claude Haiku 5.5", StructuredOutputs: true, ImageInput: true},
		{ID: "claude-opus-4-6", DisplayName: "Claude Opus 4.6", StructuredOutputs: false, ImageInput: true},
		{ID: "claude-text-only", DisplayName: "Text Only", StructuredOutputs: true, ImageInput: false},
		{ID: "claude-old-dep", DisplayName: "Old Deprecated", StructuredOutputs: true, ImageInput: true, Lifecycle: "deprecated", RetiresAt: "2027-03-12T00:00:00Z"},
	})
	var a modelsAnswer
	must(t, w.admin.Post("/api/recipe-assistant/models", obj{}), 200).MustJSON(t, &a)
	if a.Source != "api" {
		t.Errorf("source = %q", a.Source)
	}
	var ids []string
	for _, m := range a.Models {
		ids = append(ids, m.ID)
	}
	if strings.Contains(strings.Join(ids, ","), "claude-opus-4-6") {
		t.Errorf("models without structured outputs are never offered: %v", ids)
	}
	if len(a.Models) < 4 || a.Models[0].ID != "claude-haiku-5-5" {
		t.Fatalf("Haiku 5.5 must come first: %v", ids)
	}
	h := a.Models[0]
	if h.Group != "Recommended" || h.PriceTier != "$" || h.Name != "Claude Haiku 5.5" || h.Description == "" || h.ImageInput == nil || !*h.ImageInput {
		t.Errorf("haiku = %+v", h)
	}
	for _, m := range a.Models {
		switch m.ID {
		case "claude-text-only":
			if m.ImageInput == nil || *m.ImageInput {
				t.Errorf("text-only must say imageInput false: %+v", m)
			}
			if m.Description == "" {
				t.Error("models the catalogue does not know still get a description line")
			}
		case "claude-old-dep":
			if m.Lifecycle != "deprecated" || !strings.HasPrefix(m.RetiresAt, "2027-03-12") {
				t.Errorf("deprecated model = %+v", m)
			}
		}
	}
}

func TestModelsFallBackToTheCatalogueWhenTheGatewayHasNoModelsEndpoint(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	w.fake.NoModelsEndpoint(true)
	var a modelsAnswer
	must(t, w.admin.Post("/api/recipe-assistant/models", obj{}), 200).MustJSON(t, &a)
	if a.Source != "catalogue" || a.Notice == "" || len(a.Models) < 3 || a.Models[0].ID != "claude-haiku-5-5" {
		t.Errorf("answer = %+v", a)
	}
}

func TestModelsWithARefusedKeyIs422(t *testing.T) {
	w := setup(t, masterA, fakeanthropic.WithKeys("sk-other"))
	r := must(t, w.admin.Post("/api/recipe-assistant/models", obj{"baseUrl": w.fake.URL, "apiKey": apiKey}), 422)
	if !has(r, "api_key_refused") {
		t.Errorf("codes = %v", codes(r))
	}
}

func TestTestConnectionRunsTheModelCheckThenATinyStructuredCall(t *testing.T) {
	w := setup(t, masterA)
	w.enable(t)
	before := len(w.fake.Requests())
	var a struct {
		OK     bool
		Checks []struct {
			Name string
			OK   bool
			Code string
		}
		Model     *struct{ ID, Name string }
		LatencyMs *int64
	}
	must(t, w.admin.Post("/api/recipe-assistant/test", obj{}), 200).MustJSON(t, &a)
	names := ""
	for _, c := range a.Checks {
		names += c.Name + ":" + fmt.Sprint(c.OK) + " "
	}
	if !a.OK || names != "key:true model:true output:true " || a.Model == nil || a.Model.ID != "claude-haiku-5-5" || a.LatencyMs == nil {
		t.Fatalf("answer = %+v (%s)", a, names)
	}
	reqs := w.fake.Requests()[before:]
	var sawModel, sawMsg bool
	for _, r := range reqs {
		switch {
		case r.Method == "GET" && r.Path == "/v1/models/claude-haiku-5-5":
			sawModel = true
		case r.Method == "POST" && r.Path == "/v1/messages":
			sawMsg = true
			j := r.JSON()
			if mt, _ := j["max_tokens"].(float64); mt > 1024 || mt == 0 {
				t.Errorf("max_tokens = %v, want at most 1024", j["max_tokens"])
			}
			if !strings.Contains(string(r.Body), "json_schema") || !strings.Contains(string(r.Body), `"ok"`) {
				t.Errorf("the output check must use a tiny json_schema with an ok field: %s", r.Body)
			}
			if r.Header.Get("anthropic-beta") != "" {
				t.Error("no beta header")
			}
		}
	}
	if !sawModel || !sawMsg {
		t.Errorf("model check %v, output check %v", sawModel, sawMsg)
	}
	// Unsaved form values are used: an unknown model fails the model check, not the whole request.
	must(t, w.admin.Post("/api/recipe-assistant/test", obj{"model": "claude-gone-9"}), 200).MustJSON(t, &a)
	if a.OK {
		t.Error("an unavailable model must not pass")
	}
	for _, c := range a.Checks {
		if c.Name == "model" && (c.OK || c.Code != "assistant_model_unavailable") {
			t.Errorf("model check = %+v", c)
		}
	}
}

func fileExists(p string) bool { _, err := os.Stat(p); return err == nil }
