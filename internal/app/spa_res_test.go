package app_test

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
)

// B9-21 (RES-01, RES-04, RES-10): how the built frontend is served. The precompressed siblings are fake bytes: the
// handler picks a file, it never compresses or decompresses.
const (
	indexBody = "<html>SPA index</html>"
	jsRaw     = "console.log('entry')"
	jsBr      = "BROTLI-BYTES-of-entry-js"
	jsGz      = "GZIP-BYTES-of-entry-js"
	cssRaw    = "body{margin:0}"
	cssGz     = "GZIP-BYTES-of-entry-css"
)

func resSPA() fstest.MapFS {
	return fstest.MapFS{
		"index.html":                        {Data: []byte(indexBody)},
		"sw.js":                             {Data: []byte("self.addEventListener('install',()=>{})")},
		"registerSW.js":                     {Data: []byte("navigator.serviceWorker.register('/sw.js')")},
		"manifest.webmanifest":              {Data: []byte(`{"name":"Feeder"}`)},
		"favicon.svg":                       {Data: []byte("<svg/>")},
		"favicon.svg.br":                    {Data: []byte("BR-favicon")},
		"assets/index-AbC123.js":            {Data: []byte(jsRaw)},
		"assets/index-AbC123.js.br":         {Data: []byte(jsBr)},
		"assets/index-AbC123.js.gz":         {Data: []byte(jsGz)},
		"assets/index-AbC123.css":           {Data: []byte(cssRaw)},
		"assets/index-AbC123.css.gz":        {Data: []byte(cssGz)}, // no .br sibling
		"assets/tiny-9f8e7d.js":             {Data: []byte("x")},   // no sibling at all (the build writes none under 1 KB)
		"assets/figtree-latin-400.woff2":    {Data: []byte("woff2-bytes")},
		"assets/figtree-latin-400.woff2.br": {Data: []byte("must-never-be-served")},
	}
}

func getWith(h *harness, method, path string, hdr map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.app.Handler.ServeHTTP(rec, req)
	return rec
}

const immutable = "public, max-age=31536000, immutable"

// RES-01: GET /index.html is the shell itself, not the 301 to "./" that http.ServeFileFS answers.
func TestIndexHTMLIsServedDirectlyNotRedirected(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	for _, p := range []string{"/index.html", "/"} {
		rec := h.get(p, "")
		if rec.Code != 200 {
			t.Fatalf("GET %s = %d, want 200 (a redirected shell cannot be used for an offline navigation)", p, rec.Code)
		}
		if loc := rec.Header().Get("Location"); loc != "" {
			t.Errorf("GET %s has Location %q, want none", p, loc)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
			t.Errorf("GET %s Content-Type %q, want text/html", p, ct)
		}
		if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
			t.Errorf("GET %s Cache-Control %q, want no-cache", p, cc)
		}
		if rec.Body.String() != indexBody {
			t.Errorf("GET %s body %q, want the index bytes", p, rec.Body.String())
		}
	}
}

func TestHeadIndexHTMLHasHeadersAndNoBody(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	rec := getWith(h, "HEAD", "/index.html", nil)
	if rec.Code != 200 || rec.Header().Get("Location") != "" {
		t.Fatalf("HEAD /index.html = %d Location %q, want 200 and none", rec.Code, rec.Header().Get("Location"))
	}
	if rec.Header().Get("Cache-Control") != "no-cache" || rec.Body.Len() != 0 {
		t.Errorf("HEAD /index.html: Cache-Control %q, body %d bytes; want no-cache and no body", rec.Header().Get("Cache-Control"), rec.Body.Len())
	}
}

// RES-04 / RES-10: the worker script must always revalidate, or a new version is never found.
func TestServiceWorkerScriptsAlwaysRevalidate(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	for _, p := range []string{"/sw.js", "/registerSW.js"} {
		rec := h.get(p, "")
		if rec.Code != 200 {
			t.Fatalf("GET %s = %d", p, rec.Code)
		}
		if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
			t.Errorf("GET %s Cache-Control %q, want no-cache", p, cc)
		}
		if rec.Header().Get("Content-Encoding") != "" {
			t.Errorf("GET %s is encoded; the worker script is served as it is", p)
		}
	}
}

func TestHashedAssetWithBrotliServesTheBrotliSibling(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	rec := getWith(h, "GET", "/assets/index-AbC123.js", map[string]string{"Accept-Encoding": "gzip, deflate, br"})
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	if rec.Body.String() != jsBr {
		t.Errorf("body %q, want the .br file's bytes", rec.Body.String())
	}
	hd := rec.Header()
	if hd.Get("Content-Encoding") != "br" {
		t.Errorf("Content-Encoding %q, want br", hd.Get("Content-Encoding"))
	}
	if !strings.Contains(strings.ToLower(hd.Get("Vary")), "accept-encoding") {
		t.Errorf("Vary %q, want Accept-Encoding", hd.Get("Vary"))
	}
	if hd.Get("Cache-Control") != immutable {
		t.Errorf("Cache-Control %q, want %q", hd.Get("Cache-Control"), immutable)
	}
	// the type is the ORIGINAL file's (never the .br extension's)
	if ct := hd.Get("Content-Type"); !strings.Contains(ct, "javascript") {
		t.Errorf("Content-Type %q, want the JavaScript type of the original", ct)
	}
}

func TestHashedAssetPrefersBrotliOverGzipAndFallsBackToGzip(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	rec := getWith(h, "GET", "/assets/index-AbC123.js", map[string]string{"Accept-Encoding": "gzip"})
	if rec.Body.String() != jsGz || rec.Header().Get("Content-Encoding") != "gzip" {
		t.Errorf("gzip-only client: body %q encoding %q, want the .gz file and gzip", rec.Body.String(), rec.Header().Get("Content-Encoding"))
	}
	// the CSS has no .br sibling: a client that accepts both gets the gzip one
	rec = getWith(h, "GET", "/assets/index-AbC123.css", map[string]string{"Accept-Encoding": "br, gzip"})
	if rec.Body.String() != cssGz || rec.Header().Get("Content-Encoding") != "gzip" {
		t.Errorf("no .br sibling: body %q encoding %q, want the .gz file and gzip", rec.Body.String(), rec.Header().Get("Content-Encoding"))
	}
	if rec.Header().Get("Cache-Control") != immutable || !strings.Contains(strings.ToLower(rec.Header().Get("Vary")), "accept-encoding") {
		t.Errorf("gzip response: Cache-Control %q Vary %q", rec.Header().Get("Cache-Control"), rec.Header().Get("Vary"))
	}
}

// Design choice: "br;q=0" is a refusal, and a quality of 0 never selects an encoding.
func TestAcceptEncodingQualityZeroRefusesTheEncoding(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	rec := getWith(h, "GET", "/assets/index-AbC123.js", map[string]string{"Accept-Encoding": "br;q=0, gzip"})
	if rec.Header().Get("Content-Encoding") != "gzip" || rec.Body.String() != jsGz {
		t.Errorf("br;q=0, gzip: encoding %q body %q, want gzip", rec.Header().Get("Content-Encoding"), rec.Body.String())
	}
}

func TestHashedAssetWithoutAcceptEncodingIsTheRawFileStillImmutable(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	for _, ae := range []string{"", "identity", "deflate"} {
		hdr := map[string]string{}
		if ae != "" {
			hdr["Accept-Encoding"] = ae
		}
		rec := getWith(h, "GET", "/assets/index-AbC123.js", hdr)
		if rec.Body.String() != jsRaw || rec.Header().Get("Content-Encoding") != "" {
			t.Errorf("Accept-Encoding %q: body %q encoding %q, want the raw bytes", ae, rec.Body.String(), rec.Header().Get("Content-Encoding"))
		}
		if rec.Header().Get("Cache-Control") != immutable {
			t.Errorf("Accept-Encoding %q: Cache-Control %q, want immutable (the name is content-hashed)", ae, rec.Header().Get("Cache-Control"))
		}
		if !strings.Contains(strings.ToLower(rec.Header().Get("Vary")), "accept-encoding") {
			t.Errorf("Accept-Encoding %q: Vary %q, want Accept-Encoding on the raw answer too, so a shared cache keeps both", ae, rec.Header().Get("Vary"))
		}
	}
}

func TestAssetWithoutSiblingIsServedRawEvenWhenTheClientAcceptsBrotli(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	rec := getWith(h, "GET", "/assets/tiny-9f8e7d.js", map[string]string{"Accept-Encoding": "br, gzip"})
	if rec.Code != 200 || rec.Body.String() != "x" || rec.Header().Get("Content-Encoding") != "" {
		t.Errorf("status %d body %q encoding %q, want the raw file", rec.Code, rec.Body.String(), rec.Header().Get("Content-Encoding"))
	}
	if rec.Header().Get("Cache-Control") != immutable {
		t.Errorf("Cache-Control %q, want immutable", rec.Header().Get("Cache-Control"))
	}
}

func TestFontsAreImmutableAndNeverEncoded(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	rec := getWith(h, "GET", "/assets/figtree-latin-400.woff2", map[string]string{"Accept-Encoding": "br, gzip"})
	if rec.Body.String() != "woff2-bytes" || rec.Header().Get("Content-Encoding") != "" {
		t.Errorf("body %q encoding %q, want the font as it is (woff2 is already compressed)", rec.Body.String(), rec.Header().Get("Content-Encoding"))
	}
	if rec.Header().Get("Cache-Control") != immutable {
		t.Errorf("Cache-Control %q, want immutable", rec.Header().Get("Cache-Control"))
	}
}

func TestHeadOfACompressedAssetHasTheHeadersAndNoBody(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	rec := getWith(h, "HEAD", "/assets/index-AbC123.js", map[string]string{"Accept-Encoding": "br"})
	if rec.Code != 200 || rec.Body.Len() != 0 {
		t.Fatalf("HEAD = %d with %d body bytes, want 200 and none", rec.Code, rec.Body.Len())
	}
	if rec.Header().Get("Content-Encoding") != "br" || rec.Header().Get("Cache-Control") != immutable {
		t.Errorf("HEAD: Content-Encoding %q Cache-Control %q, want br and immutable", rec.Header().Get("Content-Encoding"), rec.Header().Get("Cache-Control"))
	}
}

// Design choice: a Range request is answered from the raw file (a byte range of a compressed body would mean nothing
// to the client), so it carries no Content-Encoding and the 206 is as it is today.
func TestRangeRequestOnAnAssetIsServedFromTheRawFile(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	rec := getWith(h, "GET", "/assets/index-AbC123.js", map[string]string{"Accept-Encoding": "br", "Range": "bytes=0-6"})
	if rec.Code != http.StatusPartialContent {
		t.Fatalf("status %d, want 206", rec.Code)
	}
	if rec.Body.String() != jsRaw[:7] || rec.Header().Get("Content-Encoding") != "" {
		t.Errorf("body %q encoding %q, want the first 7 raw bytes and no encoding", rec.Body.String(), rec.Header().Get("Content-Encoding"))
	}
}

// Only /assets/ is content-hashed. The root files keep their stable URLs and their short cache, and are not encoded.
func TestRootFilesKeepTheirCachePolicyAndAreNotEncoded(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	rec := getWith(h, "GET", "/favicon.svg", map[string]string{"Accept-Encoding": "br"})
	if rec.Header().Get("Content-Encoding") != "" || rec.Body.String() != "<svg/>" {
		t.Errorf("/favicon.svg: encoding %q body %q, want the raw file", rec.Header().Get("Content-Encoding"), rec.Body.String())
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "public, max-age=86400" {
		t.Errorf("/favicon.svg Cache-Control %q, want public, max-age=86400", cc)
	}
	if cc := h.get("/manifest.webmanifest", "").Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("/manifest.webmanifest Cache-Control %q, want no-cache", cc)
	}
}

// A missing hashed asset is still a 404, never the shell (a stale chunk URL must fail loudly), and the 404 is not cached.
func TestMissingAssetIs404NotTheShellAndNotImmutable(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	rec := getWith(h, "GET", "/assets/gone-000000.js", map[string]string{"Accept-Encoding": "br"})
	if rec.Code != 404 || strings.Contains(rec.Body.String(), "SPA index") {
		t.Errorf("status %d body %q, want 404", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Header().Get("Cache-Control"), "immutable") {
		t.Errorf("a 404 must not be immutable, got %q", rec.Header().Get("Cache-Control"))
	}
}

// RES-04: the SSE stream is never encoded or buffered, whatever the client accepts.
func TestEventStreamIsNeverEncoded(t *testing.T) {
	h := build(t, resSPA(), app.NewRegistry())
	token := h.token(t, "cook@example.test", false)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: h.app.Handler, ReadHeaderTimeout: 5 * time.Second}
	h.app.BindServer(srv)
	go srv.Serve(ln)
	defer srv.Close()

	req, _ := http.NewRequest("GET", "http://"+ln.Addr().String()+"/api/events", nil)
	req.Header.Set("Accept-Encoding", "br, gzip")
	req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: token})
	client := &http.Client{Transport: &http.Transport{DisableCompression: true}}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	if ce := resp.Header.Get("Content-Encoding"); ce != "" {
		t.Errorf("/api/events Content-Encoding %q, want none", ce)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Errorf("/api/events Content-Type %q, want text/event-stream", ct)
	}
	buf := make([]byte, 8)
	if _, err := resp.Body.Read(buf); err != nil { // the first bytes arrive without waiting for a buffer to fill
		t.Fatalf("no first bytes from the stream: %v", err)
	}
}
