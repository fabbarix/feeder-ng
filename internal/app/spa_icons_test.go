package app_test

import (
	"os"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/fabbarix/feeder-ng/internal/app"
)

// LG: the Family Pot icons (web/public) are served with the right type, and cache headers that let a new icon reach people.
func iconSPA(t *testing.T) fstest.MapFS {
	t.Helper()
	fs := fstest.MapFS{
		"index.html":           {Data: []byte("<html>SPA index</html>")},
		"manifest.webmanifest": {Data: []byte(`{"name":"Feeder"}`)},
	}
	for _, n := range []string{"favicon.ico", "favicon.svg", "favicon-16.png", "favicon-32.png", "apple-touch-icon.png",
		"icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png", "safari-pinned-tab.svg"} {
		b, err := os.ReadFile("../../web/public/" + n)
		if err != nil {
			t.Fatalf("web/public/%s: %v", n, err)
		}
		fs[n] = &fstest.MapFile{Data: b}
	}
	return fs
}

func TestIconsAreServedWithTheirTypes(t *testing.T) {
	h := build(t, iconSPA(t), app.NewRegistry())
	cases := map[string][]string{
		"/favicon.ico":           {"image/x-icon", "image/vnd.microsoft.icon"},
		"/favicon.svg":           {"image/svg+xml"},
		"/safari-pinned-tab.svg": {"image/svg+xml"},
		"/favicon-16.png":        {"image/png"},
		"/favicon-32.png":        {"image/png"},
		"/apple-touch-icon.png":  {"image/png"},
		"/icon-192.png":          {"image/png"},
		"/icon-512.png":          {"image/png"},
		"/icon-maskable-192.png": {"image/png"},
		"/icon-maskable-512.png": {"image/png"},
		"/manifest.webmanifest":  {"application/manifest+json"},
	}
	for p, want := range cases {
		rec := h.get(p, "")
		if rec.Code != 200 {
			t.Errorf("%s: status %d, want 200", p, rec.Code)
			continue
		}
		ct := rec.Header().Get("Content-Type")
		ok := false
		for _, w := range want {
			ok = ok || strings.HasPrefix(ct, w)
		}
		if !ok {
			t.Errorf("%s: Content-Type %q, want one of %v", p, ct, want)
		}
		if strings.Contains(rec.Body.String(), "SPA index") {
			t.Errorf("%s: body is the SPA index", p)
		}
	}
}

// The icons live at stable, unhashed URLs: they are cached for a day (not forever), the manifest is always revalidated,
// and index.html stays no-cache. The service worker precache fetches them with cache:'reload', so an update still lands.
func TestIconCacheHeaders(t *testing.T) {
	h := build(t, iconSPA(t), app.NewRegistry())
	for _, p := range []string{"/favicon.ico", "/favicon.svg", "/favicon-16.png", "/favicon-32.png", "/apple-touch-icon.png",
		"/icon-192.png", "/icon-512.png", "/icon-maskable-192.png", "/icon-maskable-512.png", "/safari-pinned-tab.svg"} {
		if cc := h.get(p, "").Header().Get("Cache-Control"); cc != "public, max-age=86400" {
			t.Errorf("%s: Cache-Control %q, want %q", p, cc, "public, max-age=86400")
		}
	}
	if cc := h.get("/manifest.webmanifest", "").Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("manifest: Cache-Control %q, want no-cache", cc)
	}
	if cc := h.get("/", "").Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("index: Cache-Control %q, want no-cache", cc)
	}
}

// The favicon.ico is real now (browsers ask for it by name); a path that is not an icon is still a 404, never the index.
func TestMissingIconIs404NotIndex(t *testing.T) {
	h := build(t, iconSPA(t), app.NewRegistry())
	for _, p := range []string{"/icon-1024.png", "/apple-touch-icon-precomposed.png"} {
		if rec := h.get(p, ""); rec.Code != 404 {
			t.Errorf("%s: status %d, want 404", p, rec.Code)
		}
	}
}
