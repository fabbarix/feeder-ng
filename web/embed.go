// Package web embeds the built SPA. dist/.gitkeep is a committed placeholder
// so `go build` works before the frontend has been built.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// FS returns the built SPA rooted at dist/ (index.html at the root when built).
func FS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
