// Package httpapi exposes the Stock routes under /api/stock. Handlers are thin:
// parse, call the stock service, respond. It registers itself in init().
package httpapi

import (
	"encoding/json"
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
	// Pantry: Storage Places (any User manages them) and moving a Lot between them.
	r.User("POST /api/stock/lots/{id}/move", a.moveLot)
	// Beta.5 ST: correct a Lot by hand (quantity, Bought on, Good until) or delete it (a correction, not waste).
	r.User("PATCH /api/stock/lots/{id}", a.editLot)
	r.User("DELETE /api/stock/lots/{id}", a.deleteLot)
	r.User("GET /api/storage-places", a.listPlaces)
	r.User("POST /api/storage-places", a.createPlace)
	r.User("PATCH /api/storage-places/{id}", a.updatePlace)
	r.User("DELETE /api/storage-places/{id}", a.deletePlace)
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
	// StoragePlaceID is the Storage Place the Lot is in; null = not sorted.
	StoragePlaceID *int64 `json:"storagePlaceId"`
	// IngredientImageURL is the Ingredient's Picture ("" without one), for the Pantry list.
	IngredientImageURL string `json:"ingredientImageUrl"`
	// ShelfLifeDays is the Shelf Life that applies where the Lot is (the frozen one in a Freezer); null = it does not
	// spoil there. The Edit sheet suggests Good until from it.
	ShelfLifeDays *int `json:"shelfLifeDays"`
	// Kind is the Ingredient's kind: "food" or "supply" (H4).
	Kind string `json:"kind"`
}

func lotToJSON(v service.LotView) lotJSON {
	out := lotJSON{
		ID:                 v.ID,
		IngredientID:       v.IngredientID,
		IngredientName:     v.IngredientName,
		BaseUnit:           v.BaseUnit,
		Quantity:           v.Quantity,
		Purchased:          string(v.Purchased),
		Source:             string(v.Source),
		ProductID:          v.ProductID,
		ShopID:             v.ShopID,
		Spoiled:            v.Spoiled,
		UseSoon:            v.UseSoon,
		StoragePlaceID:     v.StoragePlaceID,
		IngredientImageURL: v.IngredientImageURL,
		ShelfLifeDays:      v.ShelfLifeDays,
		Kind:               v.Kind,
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
	ImageURL     string  `json:"imageUrl"` // PE: always sent, "" without a Picture
	Kind         string  `json:"kind"`     // H4: "food" or "supply"
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
		ImageURL:     s.ImageURL,
		Kind:         s.Kind,
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
	a.writeLots(w, r, vs)
}

type addLotBody struct {
	IngredientID int64   `json:"ingredientId"`
	Quantity     float64 `json:"quantity"`
	Purchased    string  `json:"purchased"`
	Source       string  `json:"source"`
	ProductID    *int64  `json:"productId"`
	ShopID       *int64  `json:"shopId"`
	ClientUUID   string  `json:"clientUuid"`
	// StoragePlaceID puts the Lot there (and remembers it); absent = where the Ingredient was last put.
	StoragePlaceID *int64 `json:"storagePlaceId"`
}

func (a *api) addLot(w http.ResponseWriter, r *http.Request) {
	var body addLotBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	v, created, err := a.svc.AddLot(r.Context(), service.AddInput{
		IngredientID:   body.IngredientID,
		Quantity:       body.Quantity,
		Purchased:      stock.Date(body.Purchased),
		Source:         store.Source(body.Source),
		ProductID:      body.ProductID,
		ShopID:         body.ShopID,
		ClientUUID:     body.ClientUUID,
		StoragePlaceID: body.StoragePlaceID,
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
	a.writeLots(w, r, vs)
}

// writeLots answers {today, lots}: the household's date, so the web app words
// go-off dates against the server's day, and the lots with their flags.
func (a *api) writeLots(w http.ResponseWriter, r *http.Request, vs []service.LotView) {
	today, err := a.svc.Today(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"today": string(today), "lots": lotsToJSON(vs)})
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
	case errors.Is(err, store.ErrPlaceNotFound):
		return &httpx.APIError{Status: http.StatusNotFound, Code: "not_found", Message: "Storage Place not found"}
	case errors.Is(err, store.ErrPlaceNameTaken):
		return &httpx.APIError{Status: http.StatusConflict, Code: "name_taken", Message: "A Storage Place with that name already exists"}
	case errors.Is(err, store.ErrInvalidPlace):
		return &httpx.APIError{Status: http.StatusUnprocessableEntity, Code: "validation_failed", Message: "A Storage Place needs a name (up to 60 characters) and a kind: pantry, fridge or freezer"}
	case errors.Is(err, store.ErrNotFound):
		return &httpx.APIError{Status: http.StatusNotFound, Code: "not_found", Message: "Stock Lot not found"}
	}
	return err
}

func writeError(w http.ResponseWriter, err error) { httpx.WriteAPIError(w, mapError(err)) }

// ---- Pantry: Storage Places and moves ----

type moveBody struct {
	StoragePlaceID int64   `json:"storagePlaceId"`
	Quantity       float64 `json:"quantity"` // 0 or absent = the whole Lot
}

func (a *api) moveLot(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeNotFound(w, "Stock Lot not found")
		return
	}
	var body moveBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	v, err := a.svc.MoveLot(r.Context(), id, body.StoragePlaceID, body.Quantity)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, lotToJSON(v))
}

func (a *api) listPlaces(w http.ResponseWriter, r *http.Request) {
	list, err := a.svc.StoragePlaces(r.Context())
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, list)
}

type placeBody struct {
	Name    *string     `json:"name"`
	Kind    *stock.Kind `json:"kind"`
	Default *bool       `json:"default"`
}

func (a *api) createPlace(w http.ResponseWriter, r *http.Request) {
	var body placeBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	name, kind, def := "", stock.KindPantry, false
	if body.Name != nil {
		name = *body.Name
	}
	if body.Kind != nil {
		kind = *body.Kind
	}
	if body.Default != nil {
		def = *body.Default
	}
	p, err := a.svc.CreateStoragePlace(r.Context(), name, kind, def)
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, p)
}

func (a *api) updatePlace(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeNotFound(w, "Storage Place not found")
		return
	}
	var body placeBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	p, err := a.svc.UpdateStoragePlace(r.Context(), id, store.PlacePatch{Name: body.Name, Kind: body.Kind, Default: body.Default})
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, p)
}

func (a *api) deletePlace(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeNotFound(w, "Storage Place not found")
		return
	}
	if err := a.svc.DeleteStoragePlace(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- Beta.5 ST: edit and delete a Lot ----

// editLot answers PATCH /api/stock/lots/{id}. Body: any of `quantity` (Base Units, > 0), `purchased` (YYYY-MM-DD, not
// after today) and `goesOff` (YYYY-MM-DD, not before `purchased`; JSON null clears it). A field left out is left as it
// is. A changed `purchased` with no `goesOff` re-suggests Good until from the Shelf Life that applies where the Lot is.
// 200 with the Lot (the lotJSON shape), 404 not_found, 422 validation_failed (empty body, bad quantity or dates).
func (a *api) editLot(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeNotFound(w, "Stock Lot not found")
		return
	}
	var body editLotBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	v, err := a.svc.EditLot(r.Context(), id, body.edit())
	if err != nil {
		writeEditError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, lotToJSON(v))
}

// writeEditError answers a refused edit: 422 validation_failed with the field and reason in the error object
// ({"error":{"code","message","field","reason"}}). Anything else goes through writeError.
func writeEditError(w http.ResponseWriter, err error) {
	var ee *stock.EditError
	if !errors.As(err, &ee) {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]string{
		"code": "validation_failed", "message": ee.Error(), "field": ee.Field, "reason": ee.Reason,
	}})
}

// editLotBody is the PATCH body. Quantity is optional; Purchased and GoesOff are kept as raw JSON so that an absent
// field (left as it is) differs from JSON null (Purchased null is refused, GoesOff null clears the date).
type editLotBody struct {
	Quantity  *float64        `json:"quantity"`
	Purchased json.RawMessage `json:"purchased"`
	GoesOff   json.RawMessage `json:"goesOff"`
}

// notADate is a date no strict parse accepts: a field that is not a string fails validation rather than clearing.
const notADate = stock.Date("not a date")

func (b editLotBody) edit() stock.Edit {
	e := stock.Edit{Quantity: b.Quantity}
	if len(b.Purchased) > 0 {
		d := dateField(b.Purchased)
		e.Purchased = &d
	}
	if len(b.GoesOff) > 0 {
		d := dateField(b.GoesOff)
		e.GoesOff = &d
	}
	return e
}

// dateField reads one date from raw JSON: null is stock.None, a string is taken as it is, anything else notADate.
func dateField(raw json.RawMessage) stock.Date {
	if string(raw) == "null" {
		return stock.None
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return notADate
	}
	return stock.Date(s)
}

// deleteLot answers DELETE /api/stock/lots/{id}: 204. A correction (a double Scan), not waste: the Lot's go-off record
// goes with it. 404 not_found for an unknown Lot.
func (a *api) deleteLot(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeNotFound(w, "Stock Lot not found")
		return
	}
	if err := a.svc.DeleteLot(r.Context(), id); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
