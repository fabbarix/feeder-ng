package app

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

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
		if name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/"); name != "" {
			if info, err := fs.Stat(spa, name); err == nil && !info.IsDir() {
				http.ServeFileFS(w, r, spa, name)
				return
			}
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
