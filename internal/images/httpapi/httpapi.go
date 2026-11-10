// Package httpapi is the images module: POST /api/images (data URL), POST /api/images/from-url, DELETE
// /api/images/{id}, GET /api/images/{id}, and the nightly "images.sweep" job. Handlers are thin; images.Service does the work.
//
// IP1 stub: it registers the module but mounts nothing. The Developer moves the two image routes out of
// internal/recipe/httpapi (they must not be mounted twice), adds the new ones and the job.
package httpapi

import (
	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/images"
)

func init() { app.Register(app.Module{Name: "images", Mount: mount}) }

func mount(r *app.Router, d app.Deps) {}

// fetcherOverride is the test hook behind UseFetcher; nil means the production imagefetch.Fetcher.
var fetcherOverride images.Fetcher

// UseFetcher makes the module download through f until the returned function is called. A test hook (the
// production Fetcher refuses loopback, so tests cannot serve an image from httptest); tests must not run in parallel.
// The handler reads the override on each request, so it also applies to an already running app.
func UseFetcher(f images.Fetcher) (restore func()) {
	prev := fetcherOverride
	fetcherOverride = f
	return func() { fetcherOverride = prev }
}
