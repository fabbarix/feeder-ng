// Package httpapi exposes the Stock routes under /api/stock. Handlers are thin:
// parse, call the stock service, respond. It registers itself in init().
package httpapi

import (
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

func init() { app.Register(app.Module{Name: "stock", Mount: mount}) }

// mount registers the routes listed in docs/dev/design/t10-stock.md (all r.User).
func mount(r *app.Router, d app.Deps) {
	svc := service.New(store.New(d.DB, d.Clock), ingredientLookup{st: ingredientstore.New(d.DB, d.Clock)}, householdToday(d), d.Events)
	a := &api{svc: svc}
	r.User("GET /api/stock", a.totals)
	r.User("GET /api/stock/lots", a.lots)
	r.User("POST /api/stock/lots", a.addLot)
	r.User("PUT /api/stock/ingredients/{id}/total", a.setTotal)
	r.User("GET /api/stock/spoiled", a.spoiled)
	r.User("POST /api/stock/lots/{id}/throw-out", a.throwOut)
	r.User("POST /api/stock/lots/{id}/keep", a.keep)
	r.User("POST /api/stock/cooked", a.cooked)
	r.User("GET /api/stock/projected", a.projected)
	r.User("GET /api/stock/waste", a.waste)
}

type api struct{ svc *service.Service }

// JSON shapes (camelCase).

type lotJSON struct {
	ID             int64   `json:"id"`
	IngredientID   int64   `json:"ingredientId"`
	IngredientName string  `json:"ingredientName"`
	BaseUnit       string  `json:"baseUnit"`
	Quantity       float64 `json:"quantity"`
	Purchased      string  `json:"purchased"`
	GoesOff        *string `json:"goesOff"`
	Source         string  `json:"source"`
	ProductID      *int64  `json:"productId"`
	ShopID         *int64  `json:"shopId"`
	Spoiled        bool    `json:"spoiled"`
	UseSoon        bool    `json:"useSoon"`
}

func lotToJSON(v service.LotView) lotJSON {
	out := lotJSON{
		ID:             v.ID,
		IngredientID:   v.IngredientID,
		IngredientName: v.IngredientName,
		BaseUnit:       v.BaseUnit,
		Quantity:       v.Quantity,
		Purchased:      string(v.Purchased),
		Source:         string(v.Source),
		ProductID:      v.ProductID,
		ShopID:         v.ShopID,
		Spoiled:        v.Spoiled,
		UseSoon:        v.UseSoon,
	}
	if !v.GoesOff.IsNone() {
		g := string(v.GoesOff)
		out.GoesOff = &g
	}
	return out
}

func lotsToJSON(vs []service.LotView) []lotJSON {
	out := make([]lotJSON, 0, len(vs))
	for _, v := range vs {
		out = append(out, lotToJSON(v))
	}
	return out
}

type ingredientStockJSON struct {
	IngredientID int64   `json:"ingredientId"`
	Name         string  `json:"name"`
	BaseUnit     string  `json:"baseUnit"`
	Total        float64 `json:"total"`
	LotCount     int     `json:"lotCount"`
	NextGoesOff  *string `json:"nextGoesOff"`
	UseSoon      bool    `json:"useSoon"`
	SpoiledCount int     `json:"spoiledCount"`
}

func ingredientStockToJSON(s service.IngredientStock) ingredientStockJSON {
	out := ingredientStockJSON{
		IngredientID: s.IngredientID,
		Name:         s.Name,
		BaseUnit:     s.BaseUnit,
		Total:        s.Total,
		LotCount:     s.LotCount,
		UseSoon:      s.UseSoon,
		SpoiledCount: s.SpoiledCount,
	}
	if !s.NextGoesOff.IsNone() {
		g := string(s.NextGoesOff)
		out.NextGoesOff = &g
	}
	return out
}

type wasteJSON struct {
	ID           int64   `json:"id"`
	IngredientID *int64  `json:"ingredientId"`
	Quantity     float64 `json:"quantity"`
	WastedOn     string  `json:"wastedOn"`
	Reason       string  `json:"reason"`
	LotID        *int64  `json:"lotId"`
}

func wasteToJSON(w store.WasteRecord) wasteJSON {
	return wasteJSON{
		ID:           w.ID,
		IngredientID: w.IngredientID,
		Quantity:     w.Quantity,
		WastedOn:     string(w.WastedOn),
		Reason:       string(w.Reason),
		LotID:        w.LotID,
	}
}

// Handlers.

func (a *api) totals(w http.ResponseWriter, r *http.Request) {
	list, err := a.svc.Totals(r.Context())
	if err != nil {
		httpx.WriteAPIError(w, mapError(err))
		return
	}
	out := make([]ingredientStockJSON, 0, len(list))
	for _, s := range list {
		out = append(out, ingredientStockToJSON(s))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ingredients": out})
}

func (a *api) lots(w http.ResponseWriter, r *http.Request) {
	var ing int64
	if q := r.URL.Query().Get("ingredientId"); q != "" {
		n, err := strconv.ParseInt(q, 10, 64)
		if err != nil {
			writeError(w, service.ErrInvalid)
			return
		}
		ing = n
	}
	vs, err := a.svc.Lots(r.Context(), ing)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"lots": lotsToJSON(vs)})
}

type addLotBody struct {
	IngredientID int64   `json:"ingredientId"`
	Quantity     float64 `json:"quantity"`
	Purchased    string  `json:"purchased"`
	Source       string  `json:"source"`
	ProductID    *int64  `json:"productId"`
	ShopID       *int64  `json:"shopId"`
	ClientUUID   string  `json:"clientUuid"`
}

func (a *api) addLot(w http.ResponseWriter, r *http.Request) {
	var body addLotBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	v, created, err := a.svc.AddLot(r.Context(), service.AddInput{
		IngredientID: body.IngredientID,
		Quantity:     body.Quantity,
		Purchased:    stock.Date(body.Purchased),
		Source:       store.Source(body.Source),
		ProductID:    body.ProductID,
		ShopID:       body.ShopID,
		ClientUUID:   body.ClientUUID,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	httpx.WriteJSON(w, status, lotToJSON(v))
}

type setTotalBody struct {
	Total float64 `json:"total"`
}

func (a *api) setTotal(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeNotFound(w, "Ingredient not found")
		return
	}
	var body setTotalBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	s, err := a.svc.SetTotal(r.Context(), id, body.Total)
	if err != nil {
		writeError(w, err)
		return
	}
	lots, err := a.svc.Lots(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"ingredient": ingredientStockToJSON(s),
		"lots":       lotsToJSON(lots),
	})
}

func (a *api) spoiled(w http.ResponseWriter, r *http.Request) {
	vs, err := a.svc.Spoiled(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"lots": lotsToJSON(vs)})
}

func (a *api) throwOut(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeNotFound(w, "Stock Lot not found")
		return
	}
	rec, err := a.svc.ThrowOut(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, wasteToJSON(rec))
}

func (a *api) keep(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeNotFound(w, "Stock Lot not found")
		return
	}
	v, err := a.svc.Keep(r.Context(), id)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, lotToJSON(v))
}

type cookedBody struct {
	Needs []struct {
		IngredientID int64   `json:"ingredientId"`
		Quantity     float64 `json:"quantity"`
	} `json:"needs"`
}

type warningJSON struct {
	IngredientID int64   `json:"ingredientId"`
	Name         string  `json:"name"`
	BaseUnit     string  `json:"baseUnit"`
	Have         float64 `json:"have"`
	Need         float64 `json:"need"`
	Shortfall    float64 `json:"shortfall"`
	Message      string  `json:"message"`
}

func (a *api) cooked(w http.ResponseWriter, r *http.Request) {
	var body cookedBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	needs := make([]stock.Need, 0, len(body.Needs))
	for _, n := range body.Needs {
		needs = append(needs, stock.Need{IngredientID: n.IngredientID, Quantity: n.Quantity})
	}
	warns, err := a.svc.DeductForCooked(r.Context(), needs)
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]warningJSON, 0, len(warns))
	for _, x := range warns {
		out = append(out, warningJSON{
			IngredientID: x.IngredientID,
			Name:         x.Name,
			BaseUnit:     x.BaseUnit,
			Have:         x.Have,
			Need:         x.Need,
			Shortfall:    x.Shortfall,
			Message:      x.Message,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"warnings": out})
}

func (a *api) projected(w http.ResponseWriter, r *http.Request) {
	p, err := a.svc.Projected(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	type projLot struct {
		ID       int64   `json:"id"`
		Quantity float64 `json:"quantity"`
		GoesOff  *string `json:"goesOff"`
	}
	type projIng struct {
		IngredientID int64     `json:"ingredientId"`
		Lots         []projLot `json:"lots"`
	}
	ids := make([]int64, 0, len(p))
	for id := range p {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	out := make([]projIng, 0, len(ids))
	for _, id := range ids {
		pi := projIng{IngredientID: id, Lots: []projLot{}}
		for _, l := range p[id] {
			pl := projLot{ID: l.ID, Quantity: l.Quantity}
			if !l.GoesOff.IsNone() {
				g := string(l.GoesOff)
				pl.GoesOff = &g
			}
			pi.Lots = append(pi.Lots, pl)
		}
		out = append(out, pi)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ingredients": out})
}

func (a *api) waste(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	recs, err := a.svc.Waste(r.Context(), stock.Date(q.Get("from")), stock.Date(q.Get("to")))
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]wasteJSON, 0, len(recs))
	for _, rec := range recs {
		out = append(out, wasteToJSON(rec))
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"records": out})
}

// Helpers.

func pathID(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil
}

func writeNotFound(w http.ResponseWriter, msg string) {
	httpx.WriteError(w, http.StatusNotFound, "not_found", msg)
}

// mapError turns service and store errors into the API's error responses.
func mapError(err error) error {
	switch {
	case errors.Is(err, service.ErrUnknownIngredient):
		return &httpx.APIError{Status: http.StatusUnprocessableEntity, Code: "unknown_ingredient", Message: "That Ingredient does not exist"}
	case errors.Is(err, service.ErrInvalid):
		msg := strings.TrimPrefix(err.Error(), service.ErrInvalid.Error()+": ")
		return &httpx.APIError{Status: http.StatusUnprocessableEntity, Code: "validation_failed", Message: msg}
	case errors.Is(err, service.ErrNotSpoiled):
		return &httpx.APIError{Status: http.StatusConflict, Code: "not_spoiled", Message: "Only a spoiled Stock Lot can be thrown out or kept"}
	case errors.Is(err, store.ErrNotFound):
		return &httpx.APIError{Status: http.StatusNotFound, Code: "not_found", Message: "Stock Lot not found"}
	}
	return err
}

func writeError(w http.ResponseWriter, err error) { httpx.WriteAPIError(w, mapError(err)) }
