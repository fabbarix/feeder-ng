package app

import (
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
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
		if name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/"); name != "" {
			if info, err := fs.Stat(spa, name); err == nil && !info.IsDir() {
				switch {
				case iconFiles[name]:
					w.Header().Set("Cache-Control", "public, max-age=86400")
				case name == "manifest.webmanifest":
					// install metadata must revalidate
					w.Header().Set("Cache-Control", "no-cache")
				}
				http.ServeFileFS(w, r, spa, name)
				return
			}
		}
		if path.Ext(clean) != "" {
			http.NotFound(w, r)
			return
		}
		index, err := fs.ReadFile(spa, "index.html")
		if err != nil {
			http.Error(w, "frontend not built: run make build", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(index)
	}
}
