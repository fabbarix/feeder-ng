package app

import (
	"bytes"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
)

// iconFiles are the Family Pot icons at the root of the built frontend. They keep stable, unhashed URLs, so they are
// cached for a day rather than forever; the service worker precache refetches them with cache: 'reload' on update.
var iconFiles = map[string]bool{
	"favicon.ico": true, "favicon.svg": true, "favicon-16.png": true, "favicon-32.png": true,
	"apple-touch-icon.png": true, "icon-192.png": true, "icon-512.png": true,
	"icon-maskable-192.png": true, "icon-maskable-512.png": true, "safari-pinned-tab.svg": true,
}

func init() {
	// The manifest needs its own type; without it http.ServeFileFS falls back to text/plain and Chrome does not offer to install.
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
	// The icons' types are set here, not left to the host's /etc/mime.types.
	_ = mime.AddExtensionType(".ico", "image/x-icon")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
	_ = mime.AddExtensionType(".png", "image/png")
}

// spaHandler serves files from the built frontend, and index.html for any other
// GET or HEAD path so the client-side router can take over.
func spaHandler(spa fs.FS) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.URL.Path == "/robots.txt" {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = w.Write([]byte("User-agent: *\nDisallow: /\n"))
			return
		}
		if spa == nil {
			http.Error(w, "frontend not built", http.StatusServiceUnavailable)
			return
		}
		clean := path.Clean("/" + r.URL.Path)
		if clean == "/.well-known" || strings.HasPrefix(clean, "/.well-known/") {
			http.NotFound(w, r)
			return
		}
		name := strings.TrimPrefix(clean, "/")
		if name == "" || name == "index.html" {
			// The shell is written directly: http.ServeFileFS answers /index.html with a 301 to "./", and a redirected
			// response cannot answer an offline navigation from the service worker's cache (RES-01).
			serveIndex(w, r, spa)
			return
		}
		if info, err := fs.Stat(spa, name); err == nil && !info.IsDir() {
			switch {
			case strings.HasPrefix(name, "assets/"):
				serveAsset(w, r, spa, name)
				return
			case iconFiles[name]:
				w.Header().Set("Cache-Control", "public, max-age=86400")
			case name == "manifest.webmanifest", name == "sw.js", name == "registerSW.js":
				// install metadata and the worker scripts must revalidate, or a new version is never found
				w.Header().Set("Cache-Control", "no-cache")
			}
			http.ServeFileFS(w, r, spa, name)
			return
		}
		// A path with an extension, or anything under /assets/, is a file that is not there: a 404, never the shell, so a
		// stale page asking for a deleted chunk does not get HTML where it expects a script.
		if path.Ext(clean) != "" || name == "assets" || strings.HasPrefix(name, "assets/") {
			http.NotFound(w, r)
			return
		}
		serveIndex(w, r, spa)
	}
}

// serveIndex writes the SPA shell with no-cache, for "/", "/index.html" and every client-side route.
func serveIndex(w http.ResponseWriter, r *http.Request, spa fs.FS) {
	index, err := fs.ReadFile(spa, "index.html")
	if err != nil {
		http.Error(w, "frontend not built: run make build", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Content-Length", strconv.Itoa(len(index)))
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(index)
}

// immutableAsset is the cache policy of a content-hashed file under /assets/ (RES-04).
const immutableAsset = "public, max-age=31536000, immutable"

// encodable are the asset types the build precompresses; fonts and images are already compressed formats.
var encodable = map[string]bool{".js": true, ".mjs": true, ".css": true, ".svg": true, ".html": true, ".json": true, ".webmanifest": true}

// serveAsset serves a content-hashed file as immutable, from its .br or .gz sibling when the client accepts one.
// A Range request is answered from the raw file: a byte range of a compressed body would mean nothing to the client.
func serveAsset(w http.ResponseWriter, r *http.Request, spa fs.FS, name string) {
	h := w.Header()
	h.Set("Cache-Control", immutableAsset)
	ext := path.Ext(name)
	if !encodable[ext] {
		http.ServeFileFS(w, r, spa, name)
		return
	}
	h.Add("Vary", "Accept-Encoding")
	if r.Header.Get("Range") == "" {
		for _, enc := range negotiateEncodings(r.Header.Get("Accept-Encoding")) {
			data, err := fs.ReadFile(spa, name+enc.suffix)
			if err != nil {
				continue
			}
			if ct := mime.TypeByExtension(ext); ct != "" {
				h.Set("Content-Type", ct)
			}
			h.Set("Content-Encoding", enc.name)
			var mod time.Time
			if info, err := fs.Stat(spa, name); err == nil {
				mod = info.ModTime()
			}
			http.ServeContent(w, r, name, mod, bytes.NewReader(data))
			return
		}
	}
	http.ServeFileFS(w, r, spa, name)
}

type contentEncoding struct{ name, suffix string }

// negotiateEncodings lists the precompressed encodings the client accepts, brotli first. A quality of 0 refuses one.
func negotiateEncodings(acceptEncoding string) []contentEncoding {
	accepted := map[string]bool{}
	refused := map[string]bool{}
	wildcard := false
	for _, part := range strings.Split(acceptEncoding, ",") {
		fields := strings.Split(part, ";")
		coding := strings.ToLower(strings.TrimSpace(fields[0]))
		if coding == "" {
			continue
		}
		ok := true
		for _, param := range fields[1:] {
			k, v, found := strings.Cut(strings.TrimSpace(param), "=")
			if found && strings.EqualFold(strings.TrimSpace(k), "q") {
				if q, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil && q <= 0 {
					ok = false
				}
			}
		}
		switch {
		case coding == "*":
			wildcard = ok
		case ok:
			accepted[coding] = true
		default:
			refused[coding] = true
		}
	}
	var out []contentEncoding
	for _, enc := range []contentEncoding{{"br", ".br"}, {"gzip", ".gz"}} {
		if accepted[enc.name] || (wildcard && !refused[enc.name]) {
			out = append(out, enc)
		}
	}
	return out
}
