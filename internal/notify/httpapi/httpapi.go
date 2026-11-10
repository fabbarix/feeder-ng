// Package httpapi exposes the notifications module: VAPID config, the signed-in
// User's push devices, and the dispatcher that sends due notifications. Handlers
// only parse, call notify/store and respond. At Mount it starts the minute tick
// and the Timer finished subscription on app.Deps (stopped by Deps.Context) and
// schedules the sent-log prune.
package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	cookservice "github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/household"
	hstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/notify/facts"
	"github.com/fabbarix/feeder-ng/internal/notify/push"
	"github.com/fabbarix/feeder-ng/internal/notify/store"
)

func init() { app.Register(app.Module{Name: "notify", Mount: mount}) }

// tickEvery is how often due notifications are checked.
const tickEvery = time.Minute

// sentKeep is how long the sent log remembers a notification.
const sentKeep = 14 * 24 * time.Hour

var dispatchers sync.Map // *sql.DB -> *notify.Dispatcher

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

// mount wires the dispatcher and the routes (all r.User).
func mount(r *app.Router, d app.Deps) {
	vapid, err := push.LoadOrCreateVAPID(d.Config.DataDir)
	if err != nil {
		panic("notify: " + err.Error()) // a corrupt key file must stop the Feeder, not silently reset subscriptions
	}
	st := store.New(d.DB, d.Clock)
	hs := hstore.New(d.DB, d.Clock)
	disp := notify.NewDispatcher(notify.Config{
		Clock: d.Clock, Facts: facts.New(d.DB, d.Clock), Settings: settings{hs},
		Subs: st, Sent: st, Logger: d.Logger,
		Sender: &push.Sender{VAPID: vapid, Subject: "mailto:" + d.Config.AdminEmail},
	})
	dispatchers.Store(d.DB, disp)

	if d.Context != nil {
		d.Go(func() { disp.Run(d.Context, tickEvery) })
		d.Go(func() { announceTimers(d.Context, d.Events, disp, d.Logger) })
	}
	d.Scheduler.Daily("notify.prune", "03:30", func(ctx context.Context, _ string) error {
		_, err := st.PruneSent(ctx, d.Clock.Now().Add(-sentKeep))
		return err
	})

	a := &api{st: st, hs: hs, vapid: vapid.PublicKey}
	r.User("GET /api/notifications/config", a.config)
	r.User("GET /api/notifications/devices", a.devices)
	r.User("POST /api/notifications/devices", a.register)
	r.User("PUT /api/notifications/devices/{id}", a.update)
	r.User("DELETE /api/notifications/devices/{id}", a.remove)
}

// announceTimers pushes each finished timer (T14's `timers` events) until ctx ends.
func announceTimers(ctx context.Context, bus *events.Bus, disp *notify.Dispatcher, logger *slog.Logger) {
	ch, stop := cookservice.SubscribeFinished(bus)
	defer stop()
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			if _, err := disp.TimerFinished(ctx, notify.TimerEvent{TimerID: ev.TimerID, Label: ev.Label, RecipeName: ev.RecipeName}); err != nil && ctx.Err() == nil {
				logger.Error("timer finished push failed", "err", err)
			}
		}
	}
}

type api struct {
	st    *store.Store
	hs    *hstore.Store
	vapid string
}

// ---- config ----

type quietDTO struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

func (a *api) config(w http.ResponseWriter, r *http.Request) {
	s, err := a.hs.Settings(r.Context())
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
		return
	}
	types := make([]string, 0, len(notify.AllTypes()))
	for _, t := range notify.AllTypes() {
		types = append(types, string(t))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"vapidPublicKey": a.vapid,
		"types":          types,
		"quietHours":     quietDTO{Start: s.QuietHours.Start, End: s.QuietHours.End},
		"timeZone":       s.TimeZone,
	})
}

// ---- devices ----

type deviceDTO struct {
	ID           int64           `json:"id"`
	Label        string          `json:"label"`
	CreatedAt    string          `json:"createdAt"`
	EndpointHash string          `json:"endpointHash"`
	Types        map[string]bool `json:"types"`
}

func toDTO(d notify.Device) deviceDTO {
	types := map[string]bool{}
	for t, on := range d.Types {
		types[string(t)] = on
	}
	return deviceDTO{ID: d.ID, Label: d.Label, CreatedAt: d.CreatedAt.UTC().Format(time.RFC3339), EndpointHash: d.EndpointHash, Types: types}
}

func (a *api) devices(w http.ResponseWriter, r *http.Request) {
	u, ok := auth.UserFrom(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", "Sign in first")
		return
	}
	devs, err := a.st.Devices(r.Context(), u.ID)
	if err != nil {
		writeInternal(w, err)
		return
	}
	out := make([]deviceDTO, 0, len(devs))
	for _, d := range devs {
		out = append(out, toDTO(d))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"devices": out})
}

type keysBody struct {
	P256dh string `json:"p256dh"`
	Auth   string `json:"auth"`
}

type registerBody struct {
	Endpoint string          `json:"endpoint"`
	Keys     keysBody        `json:"keys"`
	Label    string          `json:"label"`
	Types    map[string]bool `json:"types"`
}

func (a *api) register(w http.ResponseWriter, r *http.Request) {
	u, ok := auth.UserFrom(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", "Sign in first")
		return
	}
	var in registerBody
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if err := push.ValidateEndpoint(in.Endpoint); err != nil {
		writeInvalid(w, "endpoint", err.Error())
		return
	}
	if err := push.ValidateKeys(in.Keys.P256dh, in.Keys.Auth); err != nil {
		writeInvalid(w, "keys", err.Error())
		return
	}
	types, err := parseTypes(in.Types)
	if err != nil {
		writeInvalid(w, "types", err.Error())
		return
	}
	label, err := parseLabel(in.Label)
	if err != nil {
		writeInvalid(w, "label", err.Error())
		return
	}
	d, created, err := a.st.Upsert(r.Context(), u.ID, notify.SubscriptionInput{
		Endpoint: in.Endpoint, P256dh: in.Keys.P256dh, Auth: in.Keys.Auth, Label: label, Types: types,
	})
	if err != nil {
		writeInternal(w, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	httpx.WriteJSON(w, status, toDTO(d))
}

type updateBody struct {
	Label *string         `json:"label"`
	Types map[string]bool `json:"types"`
}

func (a *api) update(w http.ResponseWriter, r *http.Request) {
	u, ok := auth.UserFrom(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", "Sign in first")
		return
	}
	id, ok := positiveID(r.PathValue("id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "No such push device")
		return
	}
	var in updateBody
	if err := httpx.DecodeJSON(r, &in); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	types, err := parseTypes(in.Types)
	if err != nil {
		writeInvalid(w, "types", err.Error())
		return
	}
	var label *string
	if in.Label != nil {
		l, err := parseLabel(*in.Label)
		if err != nil {
			writeInvalid(w, "label", err.Error())
			return
		}
		label = &l
	}
	d, err := a.st.Update(r.Context(), u.ID, id, label, types)
	if errors.Is(err, store.ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "No such push device")
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toDTO(d))
}

func (a *api) remove(w http.ResponseWriter, r *http.Request) {
	u, ok := auth.UserFrom(r.Context())
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", "Sign in first")
		return
	}
	id, ok := positiveID(r.PathValue("id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "No such push device")
		return
	}
	err := a.st.Delete(r.Context(), u.ID, id)
	if errors.Is(err, store.ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "No such push device")
		return
	}
	if err != nil {
		writeInternal(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- helpers ----

func parseTypes(in map[string]bool) (map[notify.Type]bool, error) {
	out := make(map[notify.Type]bool, len(in))
	for name, on := range in {
		t, ok := notify.ParseType(name)
		if !ok {
			return nil, errors.New("unknown notification type " + strconv.Quote(name))
		}
		out[t] = on
	}
	return out, nil
}

func parseLabel(s string) (string, error) {
	s = strings.TrimSpace(s)
	if len([]rune(s)) > 80 {
		return "", errors.New("the label is longer than 80 characters")
	}
	return s, nil
}

func positiveID(s string) (int64, bool) {
	n, err := strconv.ParseInt(s, 10, 64)
	return n, err == nil && n > 0
}

func writeInvalid(w http.ResponseWriter, field, message string) {
	httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{
		"error": map[string]string{"code": "validation_failed", "message": message, "field": field},
	})
}

func writeInternal(w http.ResponseWriter, err error) {
	slog.Default().Error("notify request failed", "err", err)
	httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
}
