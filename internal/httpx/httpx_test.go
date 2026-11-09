package httpx_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func TestWriteJSONSetsStatusAndContentType(t *testing.T) {
	rec := httptest.NewRecorder()
	httpx.WriteJSON(rec, http.StatusCreated, map[string]any{"displayName": "Anna", "n": 2})
	if rec.Code != 201 {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q", ct)
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || got["displayName"] != "Anna" {
		t.Fatalf("body = %s (%v)", rec.Body, err)
	}
}

func TestWriteErrorShape(t *testing.T) {
	rec := httptest.NewRecorder()
	httpx.WriteError(rec, http.StatusForbidden, "forbidden", "Admins only")
	if rec.Code != 403 {
		t.Fatalf("status = %d", rec.Code)
	}
	var got struct {
		Error struct{ Code, Message string } `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Error.Code != "forbidden" || got.Error.Message != "Admins only" {
		t.Fatalf("body = %s", rec.Body)
	}
}

func TestWriteAPIError(t *testing.T) {
	rec := httptest.NewRecorder()
	httpx.WriteAPIError(rec, &httpx.APIError{Status: 409, Code: "conflict", Message: "already there"})
	if rec.Code != 409 || !strings.Contains(rec.Body.String(), `"conflict"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	rec = httptest.NewRecorder()
	httpx.WriteAPIError(rec, errors.New("secret database detail"))
	if rec.Code != 500 || !strings.Contains(rec.Body.String(), `"internal"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if strings.Contains(rec.Body.String(), "secret database detail") {
		t.Fatal("internal error details must not leak to the client")
	}
}

func TestDecodeJSON(t *testing.T) {
	type in struct {
		Email string `json:"email"`
	}
	var v in
	r := httptest.NewRequest("POST", "/", strings.NewReader(`{"email":"a@x.test"}`))
	if err := httpx.DecodeJSON(r, &v); err != nil || v.Email != "a@x.test" {
		t.Fatalf("v=%+v err=%v", v, err)
	}
	for name, body := range map[string]string{"empty": "", "garbage": "{nope", "array": "[1]"} {
		var w in
		err := httpx.DecodeJSON(httptest.NewRequest("POST", "/", strings.NewReader(body)), &w)
		var apiErr *httpx.APIError
		if !errors.As(err, &apiErr) || apiErr.Status != 400 || apiErr.Code != "bad_request" {
			t.Errorf("%s: err = %v, want *APIError 400 bad_request", name, err)
		}
	}
}

func TestDecodeJSONCapsBodySize(t *testing.T) {
	big := `{"email":"` + strings.Repeat("a", 2<<20) + `"}`
	var v struct{ Email string }
	err := httpx.DecodeJSON(httptest.NewRequest("POST", "/", strings.NewReader(big)), &v)
	var apiErr *httpx.APIError
	if !errors.As(err, &apiErr) || apiErr.Status != 400 {
		t.Fatalf("err = %v, want 400 APIError for >1 MiB body", err)
	}
}

func guarded(baseURL string) http.Handler {
	return httpx.CSRFGuard(baseURL, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
}

func send(h http.Handler, method, path, body string, hdr map[string]string) *httptest.ResponseRecorder {
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, strings.NewReader(body))
	}
	r.Host = "feeder.example.test"
	for k, v := range hdr {
		r.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, r)
	return rec
}

func errCode(rec *httptest.ResponseRecorder) string {
	var b struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &b)
	return b.Error.Code
}

func TestCSRFGuardRequiresJSONWhenThereIsABody(t *testing.T) {
	h := guarded("")
	for _, m := range []string{"POST", "PUT", "PATCH", "DELETE"} {
		for _, ct := range []string{"", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"} {
			rec := send(h, m, "/api/things", `{"a":1}`, map[string]string{"Content-Type": ct})
			if rec.Code != 415 || errCode(rec) != "unsupported_media_type" {
				t.Errorf("%s with Content-Type %q: %d %s, want 415 unsupported_media_type", m, ct, rec.Code, rec.Body)
			}
		}
		for _, ct := range []string{"application/json", "application/json; charset=utf-8", "Application/JSON"} {
			if rec := send(h, m, "/api/things", `{"a":1}`, map[string]string{"Content-Type": ct}); rec.Code != 204 {
				t.Errorf("%s with Content-Type %q: %d, want 204", m, ct, rec.Code)
			}
		}
		if rec := send(h, m, "/api/things", "", nil); rec.Code != 204 {
			t.Errorf("%s without a body needs no Content-Type: %d", m, rec.Code)
		}
	}
}

func TestCSRFGuardLeavesSafeMethodsAndOtherPathsAlone(t *testing.T) {
	h := guarded("https://feeder.example.test")
	evil := map[string]string{"Origin": "https://evil.example", "Content-Type": "text/plain"}
	if rec := send(h, "GET", "/api/things", "", evil); rec.Code != 204 {
		t.Errorf("GET /api: %d, want 204", rec.Code)
	}
	if rec := send(h, "POST", "/auth/google/login", "x=1", evil); rec.Code != 204 {
		t.Errorf("POST outside /api: %d, want 204", rec.Code)
	}
}

func TestCSRFGuardChecksOriginAgainstBaseURL(t *testing.T) {
	h := guarded("https://feeder.example.test/")
	json := map[string]string{"Content-Type": "application/json"}
	with := func(origin string) map[string]string {
		return map[string]string{"Content-Type": "application/json", "Origin": origin}
	}
	cases := map[string]int{
		"https://feeder.example.test":      204,
		"https://evil.example":             403,
		"http://feeder.example.test":       403, // wrong scheme
		"https://feeder.example.test:8443": 403, // wrong port
		"https://feeder.example.test.evil": 403,
		"null":                             403,
	}
	for origin, want := range cases {
		rec := send(h, "POST", "/api/things", `{}`, with(origin))
		if rec.Code != want {
			t.Errorf("Origin %q: %d, want %d", origin, rec.Code, want)
		}
		if want == 403 && errCode(rec) != "cross_origin" {
			t.Errorf("Origin %q: code %q, want cross_origin", origin, errCode(rec))
		}
	}
	if rec := send(h, "POST", "/api/things", `{}`, json); rec.Code != 204 {
		t.Errorf("no Origin header (non-browser client): %d, want 204", rec.Code)
	}
	if rec := send(h, "DELETE", "/api/things/1", "", with("https://evil.example")); rec.Code != 403 {
		t.Errorf("bodiless DELETE from another Origin: %d, want 403", rec.Code)
	}
}

func TestCSRFGuardFallsBackToRequestHostWithoutBaseURL(t *testing.T) {
	h := guarded("")
	hdr := func(origin string) map[string]string {
		return map[string]string{"Content-Type": "application/json", "Origin": origin}
	}
	if rec := send(h, "POST", "/api/things", `{}`, hdr("http://feeder.example.test")); rec.Code != 204 {
		t.Errorf("same-host Origin: %d, want 204", rec.Code)
	}
	if rec := send(h, "POST", "/api/things", `{}`, hdr("http://evil.example")); rec.Code != 403 {
		t.Errorf("other-host Origin: %d, want 403", rec.Code)
	}
}
