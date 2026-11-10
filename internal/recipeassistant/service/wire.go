package service

import (
	"context"
	"sync"

	"github.com/fabbarix/feeder-ng/internal/app"
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
		Photos:  nil, // TODO(IP1): recipeassistant.PreparePhotos over imaging.PrepareForModel; photo reads are unavailable until then
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
