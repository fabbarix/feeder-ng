// Package httpapi exposes the notifications module: VAPID config, the signed-in
// User's push devices, and the dispatcher that sends due notifications. Handlers
// only parse, call notify/store and respond.
package httpapi

import (
	"context"
	"database/sql"
	"net/http"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/household"
	hstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/notify/store"
)

func init() { app.Register(app.Module{Name: "notify", Mount: mount}) }

var (
	dispatchers    sync.Map // *sql.DB -> *notify.Dispatcher
	_              = context.Background
	notImplemented = func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "not implemented yet")
	}
)

// DispatcherFor returns the dispatcher mounted on the app that uses db. Tests
// swap its Sender and FactSource; production wiring starts its Run loop.
func DispatcherFor(db *sql.DB) *notify.Dispatcher {
	d, _ := dispatchers.Load(db)
	dd, _ := d.(*notify.Dispatcher)
	return dd
}

// settings adapts the household store to notify.SettingsSource.
type settings struct{ st *hstore.Store }

func (s settings) Quiet(ctx context.Context) (household.QuietHours, *time.Location, error) {
	v, err := s.st.Settings(ctx)
	if err != nil {
		return household.QuietHours{}, nil, err
	}
	loc, err := time.LoadLocation(v.TimeZone)
	if err != nil {
		return household.QuietHours{}, nil, err
	}
	return v.QuietHours, loc, nil
}

// noFacts is the stub fact source until Planning and Stock are merged (see facts.go in the design note).
type noFacts struct{}

func (noFacts) Facts(context.Context, time.Time) (notify.Facts, error) { return notify.Facts{}, nil }

func mount(r *app.Router, d app.Deps) {
	st := store.New(d.DB, d.Clock)
	dispatchers.Store(d.DB, notify.NewDispatcher(notify.Config{
		Clock: d.Clock, Facts: noFacts{}, Settings: settings{hstore.New(d.DB, d.Clock)},
		Subs: st, Sent: st, Logger: d.Logger,
	}))

	r.User("GET /api/notifications/config", notImplemented)
	r.User("GET /api/notifications/devices", notImplemented)
	r.User("POST /api/notifications/devices", notImplemented)
	r.User("PUT /api/notifications/devices/{id}", notImplemented)
	r.User("DELETE /api/notifications/devices/{id}", notImplemented)
}
