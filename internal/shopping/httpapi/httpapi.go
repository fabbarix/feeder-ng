// Package httpapi exposes the Shopping List routes under /api/shopping. Handlers are thin: parse, call the
// shopping service (built in wiring.go from the real adapters), respond. It registers itself in init().
package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/service"
	"github.com/fabbarix/feeder-ng/internal/stock"
	stockservice "github.com/fabbarix/feeder-ng/internal/stock/service"
)

func init() { app.Register(app.Module{Name: "shopping", Mount: mount}) }

// mount registers the routes listed in docs/dev/design/t13-shopping-scan.md (all r.User).
func mount(r *app.Router, d app.Deps) {
	a := &api{svc: NewService(d)}
	r.User("GET /api/shopping/list", a.list)
	r.User("POST /api/shopping/extras", a.addExtra)
	r.User("DELETE /api/shopping/extras/{id}", a.deleteExtra)
	r.User("POST /api/shopping/extras/{id}/tick", a.tickExtra)
	r.User("DELETE /api/shopping/extras/{id}/tick", a.untickExtra)
	r.User("POST /api/shopping/ticks", a.tick)
	r.User("DELETE /api/shopping/ticks", a.untick)
}

type api struct{ svc *service.Service }

// JSON shapes (camelCase), see the design note.

type packJSON struct {
	ProductID int64   `json:"productId"`
	Name      string  `json:"name"`
	Size      float64 `json:"size"`
	Count     int     `json:"count"`
	Remainder float64 `json:"remainder"`
}

type lineJSON struct {
	IngredientID int64     `json:"ingredientId"`
	Name         string    `json:"name"`
	BaseUnit     string    `json:"baseUnit"`
	Need         float64   `json:"need"`
	Available    float64   `json:"available"`
	Quantity     float64   `json:"quantity"`
	Ticked       bool      `json:"ticked"`
	Pack         *packJSON `json:"pack"`
	CostCents    *int      `json:"costCents"`
}

type extraJSON struct {
	ID           int64    `json:"id"`
	Text         *string  `json:"text"`
	IngredientID *int64   `json:"ingredientId"`
	Name         *string  `json:"name"`
	BaseUnit     *string  `json:"baseUnit"`
	Quantity     *float64 `json:"quantity"`
	Ticked       bool     `json:"ticked"`
}

type listJSON struct {
	Today              stock.Date   `json:"today"`
	HorizonDays        int          `json:"horizonDays"`
	From               stock.Date   `json:"from"`
	To                 stock.Date   `json:"to"`
	DefaultTo          stock.Date   `json:"defaultTo"`
	MaxTo              stock.Date   `json:"maxTo"`
	Currency           string       `json:"currency"`
	Lines              []lineJSON   `json:"lines"`
	Extras             []extraJSON  `json:"extras"`
	Progress           progressJSON `json:"progress"`
	EstimatedCostCents int          `json:"estimatedCostCents"`
	UnpricedLines      int          `json:"unpricedLines"`
	Complete           bool         `json:"complete"`
	Summary            summaryJSON  `json:"summary"`
}

type progressJSON struct {
	Done  int `json:"done"`
	Total int `json:"total"`
}

type summaryJSON struct {
	Items      int `json:"items"`
	SpentCents int `json:"spentCents"`
	LotsAdded  int `json:"lotsAdded"`
}

type tickJSON struct {
	Ticked  bool   `json:"ticked"`
	LotID   *int64 `json:"lotId"`
	Created bool   `json:"created"`
}

func lineToJSON(l shopping.Line) lineJSON {
	out := lineJSON{IngredientID: l.IngredientID, Name: l.Name, BaseUnit: l.BaseUnit, Need: l.Need, Available: l.Available,
		Quantity: l.Quantity, Ticked: l.Ticked, CostCents: l.CostCents}
	if l.Pack != nil {
		out.Pack = &packJSON{ProductID: l.Pack.ProductID, Name: l.Pack.Name, Size: l.Pack.Size, Count: l.Pack.Count, Remainder: l.Pack.Remainder}
	}
	return out
}

func extraToJSON(e shopping.ExtraLine) extraJSON {
	out := extraJSON{ID: e.ID, Ticked: e.Ticked}
	if e.IngredientID != 0 {
		id, name, unit, qty := e.IngredientID, e.Name, e.BaseUnit, e.Quantity
		out.IngredientID, out.Name, out.BaseUnit, out.Quantity = &id, &name, &unit, &qty
	} else {
		text := e.Text
		out.Text = &text
	}
	return out
}

func (a *api) list(w http.ResponseWriter, r *http.Request) {
	var shopID *int64
	if raw := r.URL.Query().Get("shop"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			writeError(w, service.ErrInvalid)
			return
		}
		shopID = &id
	}
	v, err := a.svc.List(r.Context(), service.Query{ShopID: shopID, To: stock.Date(r.URL.Query().Get("to"))})
	if err != nil {
		writeError(w, err)
		return
	}
	out := listJSON{Today: v.Today, HorizonDays: v.HorizonDays, From: v.From, To: v.To, DefaultTo: v.DefaultTo, MaxTo: v.MaxTo,
		Currency: v.Currency, Lines: []lineJSON{}, Extras: []extraJSON{}, Progress: progressJSON{Done: v.Progress.Done, Total: v.Progress.Total},
		EstimatedCostCents: v.EstimatedCostCents, UnpricedLines: v.UnpricedLines, Complete: v.Complete,
		Summary: summaryJSON{Items: v.Summary.Items, SpentCents: v.Summary.SpentCents, LotsAdded: v.Summary.LotsAdded}}
	for _, l := range v.Lines {
		out.Lines = append(out.Lines, lineToJSON(l))
	}
	for _, e := range v.Extras {
		out.Extras = append(out.Extras, extraToJSON(e))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type extraBody struct {
	Text         string  `json:"text"`
	IngredientID int64   `json:"ingredientId"`
	Quantity     float64 `json:"quantity"`
}

func (a *api) addExtra(w http.ResponseWriter, r *http.Request) {
	var body extraBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	created, err := a.svc.AddExtra(r.Context(), service.ExtraInput{Text: body.Text, IngredientID: body.IngredientID, Quantity: body.Quantity})
	if err != nil {
		writeError(w, err)
		return
	}
	a.writeExtra(w, r, created.ID, http.StatusCreated)
}

func (a *api) writeExtra(w http.ResponseWriter, r *http.Request, id int64, status int) {
	e, err := a.svc.Extra(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, status, extraToJSON(e))
}

func (a *api) deleteExtra(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := a.svc.DeleteExtra(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type tickExtraBody struct {
	Quantity float64 `json:"quantity"`
	ShopID   *int64  `json:"shopId"`
}

func (a *api) tickExtra(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body tickExtraBody
	if r.ContentLength != 0 {
		if err := httpx.DecodeJSON(r, &body); err != nil {
			httpx.WriteAPIError(w, err)
			return
		}
	}
	if _, err := a.svc.TickExtra(r.Context(), id, body.Quantity, body.ShopID); err != nil {
		writeError(w, err)
		return
	}
	a.writeExtra(w, r, id, http.StatusOK)
}

func (a *api) untickExtra(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := a.svc.UntickExtra(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	a.writeExtra(w, r, id, http.StatusOK)
}

type tickBody struct {
	IngredientID int64   `json:"ingredientId"`
	To           string  `json:"to"`
	Quantity     float64 `json:"quantity"`
	ShopID       *int64  `json:"shopId"`
	ClientUUID   string  `json:"clientUuid"`
}

func (a *api) tick(w http.ResponseWriter, r *http.Request) {
	var body tickBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	res, err := a.svc.Tick(r.Context(), service.TickInput{IngredientID: body.IngredientID, To: stock.Date(body.To),
		ShopID: body.ShopID, Quantity: body.Quantity, ClientUUID: body.ClientUUID})
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, tickJSON{Ticked: true, LotID: res.LotID, Created: res.Created})
}

func (a *api) untick(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	ing, err := strconv.ParseInt(q.Get("ingredientId"), 10, 64)
	if err != nil {
		writeError(w, service.ErrInvalid)
		return
	}
	if err := a.svc.Untick(r.Context(), ing, stock.Date(q.Get("to"))); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found.")
		return 0, false
	}
	return id, true
}

// writeError maps the service errors to the API's statuses.
func writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrUnknownShop), errors.Is(err, service.ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found.")
	case errors.Is(err, service.ErrUnknownIngredient):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "unknown_ingredient", "That Ingredient does not exist.")
	case errors.Is(err, service.ErrInvalid), errors.Is(err, stockservice.ErrInvalid):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", "Check the highlighted fields.")
	default:
		httpx.WriteAPIError(w, err)
	}
}
