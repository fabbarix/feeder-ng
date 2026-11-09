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
