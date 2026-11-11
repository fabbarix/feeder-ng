package service

import (
	"context"
	"errors"
	"sync"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/store"
	"github.com/fabbarix/feeder-ng/internal/recipefile/imagefetch"
	"github.com/fabbarix/feeder-ng/internal/safehttp"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
)

var (
	forMu sync.Mutex
	byApp = map[appKey]*Service{}
)

// appKey identifies one running application: its database and its lifetime context (a restart on the same
// database is a new application with possibly another secret key).
type appKey struct {
	db  any
	ctx context.Context
}

// For returns the one Service of an application. The recipeassistant module (status, settings) and the
// recipefile module (reads) both call it with the same claude factory and get the same instance, so the Limiter
// and the job registry are shared. It is keyed by the application's database and lifetime and forgotten when the
// application closes. The factory is passed in because package claude imports this one.
func For(d app.Deps, claude ClaudeFactory) *Service {
	forMu.Lock()
	defer forMu.Unlock()
	key := appKey{db: d.DB, ctx: d.Context}
	if s, ok := byApp[key]; ok {
		return s
	}
	deps := Deps{
		Store:   store.New(d.DB, d.Clock),
		Claude:  claude,
		Pages:   lazyPages{dataDir: d.Config.DataDir},
		Images:  lazyImages{dataDir: d.Config.DataDir},
		Photos:  lazyPhotos{dataDir: d.Config.DataDir},
		Clock:   d.Clock,
		Logger:  d.Logger,
		Overall: 0,
	}
	if d.Config.HasSecretKey() {
		if box, err := secretbox.New(d.Config.SecretKey); err == nil {
			deps.Box, deps.MasterID = box, d.Config.SecretKey.ID()
		}
	}
	s := New(deps)
	byApp[key] = s
	if d.Context != nil {
		context.AfterFunc(d.Context, func() {
			forMu.Lock()
			delete(byApp, key)
			forMu.Unlock()
		})
	}
	return s
}

// lazyPages and lazyImages look the test hooks up when a fetch starts, never at mount time.
type lazyPages struct{ dataDir string }

func (l lazyPages) FetchPage(ctx context.Context, rawURL string) (safehttp.Page, error) {
	return safehttp.New(HooksFor(l.dataDir).Safehttp).FetchPage(ctx, rawURL)
}

type lazyImages struct{ dataDir string }

func (l lazyImages) Fetch(ctx context.Context, rawURL string) ([]byte, string, error) {
	h := HooksFor(l.dataDir).Safehttp
	return imagefetch.New(imagefetch.Options{LookupIP: h.LookupIP, Allow: h.Allow, TLSConfig: h.TLSConfig}).Fetch(ctx, rawURL)
}

// lazyPhotos prepares photos with recipeassistant.PreparePhotos; photo URLs go through the SSRF-guarded fetcher,
// which stops a little past 8 MB so PreparePhotos can tell "too large" from "unreachable".
type lazyPhotos struct{ dataDir string }

func (l lazyPhotos) Prepare(ctx context.Context, in []PhotoInput) ([]PreparedPhoto, error) {
	h := HooksFor(l.dataDir).Safehttp
	f := imagefetch.New(imagefetch.Options{MaxBytes: imaging.MaxBytes + 1, LookupIP: h.LookupIP, Allow: h.Allow, TLSConfig: h.TLSConfig})
	src := make([]recipeassistant.PhotoSource, len(in))
	for i, p := range in {
		src[i] = recipeassistant.PhotoSource{DataURL: p.DataURL, URL: p.URL}
	}
	prepared, err := recipeassistant.PreparePhotos(ctx, tooLargeMapper{f}, src)
	if err != nil {
		return nil, err
	}
	out := make([]PreparedPhoto, len(prepared))
	for i, p := range prepared {
		out[i] = PreparedPhoto{JPEG: p.JPEG, Width: p.Width, Height: p.Height}
	}
	return out, nil
}

// tooLargeMapper reports the HTTP guard's "larger than the limit" as recipeassistant.ErrPhotoTooLarge, so the
// recipeassistant package stays free of safehttp.
type tooLargeMapper struct{ f recipeassistant.Fetcher }

func (m tooLargeMapper) Fetch(ctx context.Context, rawURL string) ([]byte, string, error) {
	data, ct, err := m.f.Fetch(ctx, rawURL)
	if errors.Is(err, safehttp.ErrTooLarge) {
		return nil, "", recipeassistant.ErrPhotoTooLarge
	}
	return data, ct, err
}
