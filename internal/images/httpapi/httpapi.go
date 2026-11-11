// Package httpapi is the images module: POST /api/images (data URL), POST /api/images/from-url, DELETE
// /api/images/{id}, GET /api/images/{id}, and the nightly "images.sweep" job. Handlers are thin; images.Service does the work.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"path/filepath"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/images"
	"github.com/fabbarix/feeder-ng/internal/images/refs"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipefile/imagefetch"
)

func init() { app.Register(app.Module{Name: "images", Mount: mount}) }

// SweepAt is the household time of the nightly orphan sweep.
const SweepAt = "03:45"

// maxURLBody caps the from-url request body.
const maxURLBody = 4 << 10

func mount(r *app.Router, d app.Deps) {
	store := imaging.NewStore(filepath.Join(d.Config.DataDir, "images"))
	a := &api{
		store: store,
		svc:   images.NewService(store, overridableFetcher{imagefetch.New(imagefetch.Options{})}, refs.New(d.DB), d.Clock),
	}
	d.Scheduler.Daily("images.sweep", SweepAt, func(ctx context.Context, _ string) error {
		res, err := a.svc.Sweep(ctx)
		if err != nil {
			return err
		}
		if d.Logger != nil && (len(res.Deleted) > 0 || res.TempRemoved > 0) {
			d.Logger.Info("images.sweep", "deleted", len(res.Deleted), "kept", res.Kept, "temp_removed", res.TempRemoved)
		}
		return nil
	})
	r.User("POST /api/images", a.upload)
	r.User("POST /api/images/from-url", a.fromURL)
	r.User("GET /api/images/{id}", a.get)
	r.User("DELETE /api/images/{id}", a.discard)
}

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

// overridableFetcher downloads through the test override when one is set, else through the production fetcher.
type overridableFetcher struct{ real images.Fetcher }

func (o overridableFetcher) Fetch(ctx context.Context, u string) ([]byte, string, error) {
	if f := fetcherOverride; f != nil {
		return f.Fetch(ctx, u)
	}
	return o.real.Fetch(ctx, u)
}

type api struct {
	store *imaging.Store
	svc   *images.Service
}

// upload takes {"dataUrl": "data:image/...;base64,..."} and stores it as WebP. The request body is capped a little
// above the 8 MB photo limit, so an oversized photo answers 413 without being read whole.
func (a *api) upload(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, imaging.MaxBodyBytes)
	var b struct {
		DataURL string `json:"dataUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeErr(w, imaging.ErrTooLarge)
			return
		}
		httpx.WriteError(w, http.StatusBadRequest, "bad_request", "The request body must be JSON with a dataUrl")
		return
	}
	st, err := a.svc.IngestDataURL(b.DataURL)
	writeStored(w, st, err)
}

// fromURL takes {"url": "https://..."}; the server downloads it with the SSRF-guarded fetcher.
func (a *api) fromURL(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxURLBody)
	var b struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad_request", "The request body must be JSON with a url")
		return
	}
	st, err := a.svc.IngestURL(r.Context(), b.URL)
	writeStored(w, st, err)
}

func writeStored(w http.ResponseWriter, st images.Stored, err error) {
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"id": st.ID, "url": "/api/images/" + st.ID, "width": st.Width, "height": st.Height,
	})
}

func (a *api) get(w http.ResponseWriter, r *http.Request) {
	f, err := a.store.Open(r.PathValue("id"))
	if errors.Is(err, imaging.ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", "image/webp")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	http.ServeContent(w, r, "", time.Time{}, f)
}

// discard deletes an image nothing references: 204 (also when it is already gone), 404 for a malformed id, 409 when in use.
func (a *api) discard(w http.ResponseWriter, r *http.Request) {
	err := a.svc.Discard(r.Context(), r.PathValue("id"))
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, imaging.ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
	case errors.Is(err, images.ErrInUse):
		httpx.WriteError(w, http.StatusConflict, "image_in_use", "That image is still used")
	default:
		httpx.WriteAPIError(w, err)
	}
}

func writeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, imaging.ErrTooLarge):
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "image_too_large", "A photo must be 8 MB or smaller")
	case errors.Is(err, imaging.ErrTooManyPixels):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "image_too_large_pixels", "A photo must be at most 12000 pixels on its longest side and 50 megapixels")
	case errors.Is(err, images.ErrURLInvalid):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "image_url_invalid", "The link must start with https://")
	case errors.Is(err, images.ErrURLBlocked):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "image_url_blocked", "Feeder cannot download from a private address")
	case errors.Is(err, images.ErrURLUnreachable):
		httpx.WriteError(w, http.StatusBadGateway, "image_url_unreachable", "The image could not be downloaded from that link")
	case errors.Is(err, imaging.ErrUnsupportedFormat), errors.Is(err, imaging.ErrEmpty):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "unsupported_image", "That is not a JPEG, PNG, WebP or HEIC image")
	default:
		httpx.WriteAPIError(w, err)
	}
}
