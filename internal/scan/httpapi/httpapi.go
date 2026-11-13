// Package httpapi exposes the Scan routes under /api/scan. Handlers are thin: parse, call the scan service
// (built in wiring.go over Stock, Products, Ingredients and the Shopping List), respond. It registers itself in init().
package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
)

func init() { app.Register(app.Module{Name: "scan", Mount: mount}) }

// mount registers the routes listed in docs/dev/design/t13-shopping-scan.md (all r.User).
func mount(r *app.Router, d app.Deps) {
	a := &api{svc: ServiceFor(d)}
	r.User("GET /api/scan/offline", a.offline)
	r.User("POST /api/scan", a.apply)
	r.User("POST /api/scan/sync", a.sync)
	r.User("POST /api/scan/{clientUuid}/undo", a.undo)
	r.User("PATCH /api/scan/prices", a.setPrices)
	r.User("PATCH /api/scan/{clientUuid}", a.setPrice)
}

type api struct{ svc *service.Service }

func (a *api) offline(w http.ResponseWriter, r *http.Request) {
	var shopID *int64
	if raw := r.URL.Query().Get("shop"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found.")
			return
		}
		shopID = &id
	}
	b, err := a.svc.OfflineData(r.Context(), shopID)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, b)
}

// apply answers 200 for an applied or duplicate operation and 422 with the error for a rejected one.
func (a *api) apply(w http.ResponseWriter, r *http.Request) {
	var op scan.Op
	if err := httpx.DecodeJSON(r, &op); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	res, err := a.svc.Apply(r.Context(), op)
	if err != nil {
		writeError(w, err)
		return
	}
	status := http.StatusOK
	if res.Status == scan.StatusRejected {
		status = http.StatusUnprocessableEntity
	}
	httpx.WriteJSON(w, status, res)
}

type syncBody struct {
	Ops []scan.Op `json:"ops"`
}

func (a *api) sync(w http.ResponseWriter, r *http.Request) {
	var body syncBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	results, err := a.svc.Sync(r.Context(), body.Ops)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"results": results})
}

type undoJSON struct {
	Undone        bool `json:"undone"`
	AlreadyUndone bool `json:"alreadyUndone,omitempty"`
}

func (a *api) undo(w http.ResponseWriter, r *http.Request) {
	out, err := a.svc.Undo(r.Context(), r.PathValue("clientUuid"))
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, undoJSON{Undone: out.Undone, AlreadyUndone: out.AlreadyUndone})
}

type pricesBody struct {
	ClientUUIDs     []string `json:"clientUuids"`
	PriceCents      int      `json:"priceCents"`
	PricePerKgCents *int     `json:"pricePerKgCents"`
}

// setPrices answers 200 with the Result of each scan, in the order sent.
func (a *api) setPrices(w http.ResponseWriter, r *http.Request) {
	var body pricesBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	results, err := a.svc.SetPrices(r.Context(), service.SetPricesInput{ClientUUIDs: body.ClientUUIDs,
		PriceCents: body.PriceCents, PricePerKgCents: body.PricePerKgCents})
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"results": results})
}

type priceBody struct {
	PriceCents      int  `json:"priceCents"`
	PricePerKgCents *int `json:"pricePerKgCents"`
}

// setPrice is setPrices for one scan; the body is that scan's Result.
func (a *api) setPrice(w http.ResponseWriter, r *http.Request) {
	var body priceBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	results, err := a.svc.SetPrices(r.Context(), service.SetPricesInput{ClientUUIDs: []string{r.PathValue("clientUuid")},
		PriceCents: body.PriceCents, PricePerKgCents: body.PricePerKgCents})
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, results[0])
}

// writeError maps the service errors to the API's statuses.
func writeError(w http.ResponseWriter, err error) {
	var ve *scan.ValidationError
	switch {
	case errors.As(err, &ve), errors.Is(err, scan.ErrInvalid):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", "Check the highlighted fields.")
	case errors.Is(err, service.ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found.")
	case errors.Is(err, service.ErrNotUndoable):
		httpx.WriteError(w, http.StatusConflict, "not_undoable", "This scan cannot be undone.")
	case errors.Is(err, service.ErrAlreadyUndone):
		httpx.WriteError(w, http.StatusConflict, "already_undone", "This scan was undone; its price can no longer be edited.")
	default:
		httpx.WriteAPIError(w, err)
	}
}
