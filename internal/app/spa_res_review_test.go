package app_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
)

// B9-21 review: the corners of serving the built frontend that the first tests leave open.

// Anything under /assets/ that is not a file is a 404, never the shell: a stale page asking for a deleted chunk, or a
// probe for the folder itself, must not get HTML where it expects a script.
func TestMissingPathsUnderAssetsAre404EvenWithoutAnExtension(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	for _, p := range []string{"/assets", "/assets/", "/assets/chunk-gone", "/assets/sub/dir/"} {
		rec := getWith(h, "GET", p, map[string]string{"Accept-Encoding": "br"})
		if rec.Code != http.StatusNotFound || strings.Contains(rec.Body.String(), "SPA index") {
			t.Errorf("GET %s = %d %q, want 404 and not the shell", p, rec.Code, rec.Body.String())
		}
	}
}

func TestAcceptEncodingWildcardCaseAndRefusals(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	for _, c := range []struct{ ae, enc, body string }{
		{"*", "br", jsBr},
		{"*;q=0", "", jsRaw},
		{"br;q=0, *", "gzip", jsGz},
		{"gzip;q=0, *;q=0.5", "br", jsBr},
		{"BR", "br", jsBr},
		{"gzip;q=1.0, br;q=0.000", "gzip", jsGz},
		{" identity ; q=1 ", "", jsRaw},
		{",,;", "", jsRaw},
	} {
		rec := getWith(h, "GET", "/assets/index-AbC123.js", map[string]string{"Accept-Encoding": c.ae})
		if rec.Header().Get("Content-Encoding") != c.enc || rec.Body.String() != c.body {
			t.Errorf("Accept-Encoding %q: encoding %q body %q, want %q %q", c.ae, rec.Header().Get("Content-Encoding"), rec.Body.String(), c.enc, c.body)
		}
		if !strings.Contains(strings.ToLower(rec.Header().Get("Vary")), "accept-encoding") {
			t.Errorf("Accept-Encoding %q: no Vary", c.ae)
		}
	}
}

// With a modification time (a build served from a directory on disk), a conditional request on an encoded answer is a
// 304 that keeps Vary and Cache-Control and has no body.
func TestConditionalRequestOnAnEncodedAssetIsNotModified(t *testing.T) {
	spa := resSPA()
	mod := time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	for _, n := range []string{"assets/index-AbC123.js", "assets/index-AbC123.js.br", "assets/index-AbC123.js.gz"} {
		f := spa[n]
		f.ModTime = mod
		spa[n] = f
	}
	h := build(t, spa, app.NewRegistry())
	rec := getWith(h, "GET", "/assets/index-AbC123.js", map[string]string{"Accept-Encoding": "br"})
	if lm := rec.Header().Get("Last-Modified"); lm == "" {
		t.Fatalf("no Last-Modified on the encoded answer")
	}
	rec = getWith(h, "GET", "/assets/index-AbC123.js", map[string]string{"Accept-Encoding": "br", "If-Modified-Since": mod.Format(http.TimeFormat)})
	if rec.Code != http.StatusNotModified || rec.Body.Len() != 0 {
		t.Fatalf("conditional GET = %d with %d bytes, want 304 and none", rec.Code, rec.Body.Len())
	}
	if !strings.Contains(strings.ToLower(rec.Header().Get("Vary")), "accept-encoding") || rec.Header().Get("Cache-Control") != immutable {
		t.Errorf("304: Vary %q Cache-Control %q", rec.Header().Get("Vary"), rec.Header().Get("Cache-Control"))
	}
}

// Encoded dots and parent segments never reach outside the built frontend, and the sibling lookup only ever adds a suffix
// to a file that exists.
func TestEncodedTraversalStaysInsideTheFrontend(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	for _, p := range []string{"/assets/%2e%2e/%2e%2e/etc/passwd", "/assets/..%2f..%2fgo.mod", "/..%2f..%2finternal/app/spa.go"} {
		req, _ := http.NewRequest("GET", "http://feeder.test"+p, nil)
		req.Header.Set("Accept-Encoding", "br, gzip")
		rec := httptest.NewRecorder()
		h.app.Handler.ServeHTTP(rec, req)
		if body := rec.Body.String(); strings.Contains(body, "root:") || strings.Contains(body, "module ") || strings.Contains(body, "package app") {
			t.Errorf("GET %s leaked a file outside the frontend: %q", p, body)
		}
		if rec.Header().Get("Content-Encoding") != "" {
			t.Errorf("GET %s answered an encoded sibling", p)
		}
	}
}
