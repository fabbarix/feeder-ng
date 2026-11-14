// Package httpapi exposes the Shopping List routes under /api/shopping. Handlers are thin: parse, call the
// shopping service (built in wiring.go from the real adapters), respond. It registers itself in init().
package httpapi

import (
	"errors"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
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
	r.User("PATCH /api/shopping/extras/{id}/tick", a.changeExtraTick)
	r.User("POST /api/shopping/ticks", a.tick)
	r.User("PATCH /api/shopping/ticks", a.changeTick)
	r.User("DELETE /api/shopping/ticks", a.untick)
	r.User("POST /api/shopping/not-needed", a.notNeeded)
	r.User("DELETE /api/shopping/not-needed/{ingredientId}", a.neededAfterAll)
}

type api struct{ svc *service.Service }

// JSON shapes (camelCase), see the design note.

type packJSON struct {
	ProductID int64   `json:"productId"`
	Name      string  `json:"name"`
	Size      float64 `json:"size"`
	Count     int     `json:"count"`
	Remainder float64 `json:"remainder"`
	Bought    bool    `json:"bought"` // SSP-13: the Product last bought; false for the priced Product of an Ingredient never bought
	// Price (B9-23) is the pack Price behind a priced fallback (bought false); null for a Product last bought.
	Price *packPriceJSON `json:"price"`
}

type packPriceJSON struct {
	Cents  int    `json:"cents"`
	Date   string `json:"date"`
	ShopID int64  `json:"shopId"`
}

// tickStateJSON is a ticked Line's or extra's tick (B9-23): who ticked it first, what it put into Stock in all (null when
// nothing, or not known for a tick from before beta.8) and its additions, oldest first.
type tickStateJSON struct {
	By        string         `json:"by"`
	Added     *float64       `json:"added"`
	Additions []additionJSON `json:"additions"`
}

type additionJSON struct {
	Who        string   `json:"who"`
	Mine       bool     `json:"mine"`
	By         string   `json:"by"`
	Quantity   *float64 `json:"quantity"` // null: not known (a tick from before beta.8)
	ClientUUID *string  `json:"clientUuid"`
	TickedAt   string   `json:"tickedAt"`
	SyncedAt   *string  `json:"syncedAt"` // null for a tick made online
}

// tickStateToJSON shows a tick to the User me (mine marks their own additions).
func tickStateToJSON(t *shopping.Tick, me int64) *tickStateJSON {
	if t == nil {
		return nil
	}
	out := &tickStateJSON{By: t.By, Additions: []additionJSON{}}
	if out.By == "" {
		out.By = "hand"
	}
	if !t.AddedUnknown && t.Added != 0 {
		added := t.Added
		out.Added = &added
	}
	for _, a := range t.Additions {
		j := additionJSON{Who: a.Who, Mine: a.UserID != 0 && a.UserID == me, By: a.By, Quantity: amount(a.Quantity),
			TickedAt: a.TickedAt.UTC().Format(time.RFC3339)}
		if a.ClientUUID != "" {
			uuid := a.ClientUUID
			j.ClientUUID = &uuid
		}
		if !a.SyncedAt.IsZero() {
			at := a.SyncedAt.UTC().Format(time.RFC3339)
			j.SyncedAt = &at
		}
		out.Additions = append(out.Additions, j)
	}
	return out
}

// amount is q, or null when it is not known (+Inf: a tick from before migration 1560).
func amount(q float64) *float64 {
	if math.IsInf(q, 0) || math.IsNaN(q) {
		return nil
	}
	return &q
}

type lineJSON struct {
	IngredientID       int64          `json:"ingredientId"`
	Name               string         `json:"name"`
	BaseUnit           string         `json:"baseUnit"`
	ImageURL           string         `json:"imageUrl"` // PE: always sent, "" without a Picture
	Need               float64        `json:"need"`
	Available          float64        `json:"available"`
	Quantity           float64        `json:"quantity"`
	Ticked             bool           `json:"ticked"`
	More               float64        `json:"more,omitempty"` // SSP-02: what a ticked Line needs past its tick; absent when none
	Tick               *tickStateJSON `json:"tick"`           // B9-23: null for an open Line
	Pack               *packJSON      `json:"pack"`
	EstimatedCostCents *int           `json:"estimatedCostCents"`
	PastPlannedMeals   []pastMealJSON `json:"pastPlannedMeals"` // B5-SH: always sent, [] when none
	PlannedMeals       []plannedJSON  `json:"plannedMeals"`     // SSP-14: always sent, [] when none
	Kind               string         `json:"kind"`             // H4: "food" or "supply"
	Restock            *restockJSON   `json:"restock"`          // H4: a Restock Line's level and Stock; null otherwise
}

type restockJSON struct {
	Level float64 `json:"level"`
	Stock float64 `json:"stock"`
}

type pastMealJSON struct {
	Date         string `json:"date"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	CourseName   string `json:"courseName"`
}

// plannedJSON is a Planned Meal a Line is for (SSP-14).
type plannedJSON struct {
	Date         string `json:"date"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	CourseName   string `json:"courseName"`
	RecipeName   string `json:"recipeName"`
}

type extraJSON struct {
	ID           int64          `json:"id"`
	Text         *string        `json:"text"`
	IngredientID *int64         `json:"ingredientId"`
	Name         *string        `json:"name"`
	BaseUnit     *string        `json:"baseUnit"`
	ImageURL     string         `json:"imageUrl"` // PE: always sent, "" for free text or without a Picture
	Kind         *string        `json:"kind"`     // H4: "food" or "supply" for an Ingredient extra, null for free text
	Quantity     *float64       `json:"quantity"`
	Ticked       bool           `json:"ticked"`
	Tick         *tickStateJSON `json:"tick"` // B9-23: null for an open extra
}

// kindName is the JSON kind of an Ingredient line: "supply" for a Supply, else "food".
func kindName(supply bool) string {
	if supply {
		return "supply"
	}
	return "food"
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
	NotNeeded          []lineJSON   `json:"notNeeded"` // B5-SH: always sent, [] when none
	Extras             []extraJSON  `json:"extras"`
	Progress           progressJSON `json:"progress"`
	EstimatedCostCents int          `json:"estimatedCostCents"`
	UnpricedLines      int          `json:"unpricedLines"`
	Complete           bool         `json:"complete"`
	Summary            summaryJSON  `json:"summary"`
}

type progressJSON struct {
	Ticked int `json:"ticked"`
	Total  int `json:"total"`
}

type summaryJSON struct {
	Lines      int `json:"lines"`
	SpentCents int `json:"spentCents"`
	LotsAdded  int `json:"lotsAdded"`
}

type tickJSON struct {
	Ticked       bool             `json:"ticked"`
	LotID        *int64           `json:"lotId"`
	Created      bool             `json:"created"`
	Added        float64          `json:"added"`
	AlsoTickedBy []alsoTickedJSON `json:"alsoTickedBy"` // RES 2: earlier additions by other Users, [] when none
}

type alsoTickedJSON struct {
	Name     string  `json:"name"`
	Quantity float64 `json:"quantity"`
	By       string  `json:"by"`
}

func lineToJSON(l shopping.Line, me int64) lineJSON {
	out := lineJSON{IngredientID: l.IngredientID, Name: l.Name, BaseUnit: l.BaseUnit, ImageURL: l.ImageURL, Need: l.Need, Available: l.Available,
		Quantity: l.Quantity, Ticked: l.Ticked, More: l.More, Tick: tickStateToJSON(l.Tick, me), EstimatedCostCents: l.EstimatedCostCents,
		PastPlannedMeals: []pastMealJSON{}, PlannedMeals: []plannedJSON{}, Kind: kindName(l.Supply)}
	if l.Restock != nil {
		out.Restock = &restockJSON{Level: l.Restock.Level, Stock: l.Restock.Stock}
	}
	for _, p := range l.PastPlannedMeals {
		out.PastPlannedMeals = append(out.PastPlannedMeals, pastMealJSON{Date: string(p.Date), MealSlotID: p.MealSlotID,
			MealSlotName: p.MealSlotName, CourseName: p.CourseName})
	}
	for _, p := range l.PlannedMeals {
		out.PlannedMeals = append(out.PlannedMeals, plannedJSON{Date: string(p.Date), MealSlotID: p.MealSlotID,
			MealSlotName: p.MealSlotName, CourseName: p.CourseName, RecipeName: p.RecipeName})
	}
	if l.Pack != nil {
		out.Pack = &packJSON{ProductID: l.Pack.ProductID, Name: l.Pack.Name, Size: l.Pack.Size, Count: l.Pack.Count,
			Remainder: l.Pack.Remainder, Bought: l.Pack.Bought}
		if p := l.Pack.Price; p != nil {
			out.Pack.Price = &packPriceJSON{Cents: p.Cents, Date: string(p.Date), ShopID: p.ShopID}
		}
	}
	return out
}

func extraToJSON(e shopping.ExtraLine, me int64) extraJSON {
	out := extraJSON{ID: e.ID, Ticked: e.Ticked, ImageURL: e.ImageURL, Tick: tickStateToJSON(e.Tick, me)}
	if e.IngredientID != 0 {
		id, name, unit, qty, kind := e.IngredientID, e.Name, e.BaseUnit, e.Quantity, kindName(e.Supply)
		out.IngredientID, out.Name, out.BaseUnit, out.Quantity, out.Kind = &id, &name, &unit, &qty, &kind
	} else {
		text := e.Text
		out.Text = &text
	}
	return out
}

// shopParam reads the optional ?shop= Shop id (nil = any Shop).
func shopParam(r *http.Request) (*int64, error) {
	raw := r.URL.Query().Get("shop")
	if raw == "" {
		return nil, nil
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return nil, service.ErrInvalid
	}
	return &id, nil
}

func (a *api) list(w http.ResponseWriter, r *http.Request) {
	shopID, err := shopParam(r)
	if err != nil {
		writeError(w, err)
		return
	}
	a.writeList(w, r, shopID, stock.Date(r.URL.Query().Get("to")))
}

// writeList answers the Shopping List for the range ending on to (the default when empty).
func (a *api) writeList(w http.ResponseWriter, r *http.Request, shopID *int64, to stock.Date) {
	v, err := a.svc.List(r.Context(), service.Query{ShopID: shopID, To: to})
	if err != nil {
		writeError(w, err)
		return
	}
	out := listJSON{Today: v.Today, HorizonDays: v.HorizonDays, From: v.From, To: v.To, DefaultTo: v.DefaultTo, MaxTo: v.MaxTo,
		Currency: v.Currency, Lines: []lineJSON{}, NotNeeded: []lineJSON{}, Extras: []extraJSON{}, Progress: progressJSON{Ticked: v.Progress.Ticked, Total: v.Progress.Total},
		EstimatedCostCents: v.EstimatedCostCents, UnpricedLines: v.UnpricedLines, Complete: v.Complete,
		Summary: summaryJSON{Lines: v.Summary.Lines, SpentCents: v.Summary.SpentCents, LotsAdded: v.Summary.LotsAdded}}
	me := userID(r)
	for _, l := range v.Lines {
		out.Lines = append(out.Lines, lineToJSON(l, me))
	}
	for _, l := range v.NotNeeded {
		out.NotNeeded = append(out.NotNeeded, lineToJSON(l, me))
	}
	for _, e := range v.Extras {
		out.Extras = append(out.Extras, extraToJSON(e, me))
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
	httpx.WriteJSON(w, status, extraToJSON(e, userID(r)))
}

// userID is the signed-in User's id (0 when none).
func userID(r *http.Request) int64 {
	u, _ := auth.UserFrom(r.Context())
	return u.ID
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
	Quantity   float64 `json:"quantity"`
	ShopID     *int64  `json:"shopId"`
	ClientUUID string  `json:"clientUuid"`
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
	if _, err := a.svc.TickExtra(r.Context(), id, body.Quantity, body.ShopID, body.ClientUUID); err != nil {
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
		ShopID: body.ShopID, Quantity: body.Quantity, ClientUUID: body.ClientUUID, UserID: userID(r)})
	if err != nil {
		writeError(w, err)
		return
	}
	out := tickJSON{Ticked: true, LotID: res.LotID, Created: res.Created, Added: res.Added, AlsoTickedBy: []alsoTickedJSON{}}
	for _, o := range res.AlsoTickedBy {
		out.AlsoTickedBy = append(out.AlsoTickedBy, alsoTickedJSON{Name: o.Name, Quantity: o.Quantity, By: o.By})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type changeTickBody struct {
	IngredientID int64    `json:"ingredientId"`
	To           string   `json:"to"`
	Quantity     *float64 `json:"quantity"`
	ClientUUID   string   `json:"clientUuid"`
	ShopID       *int64   `json:"shopId"`
}

type changedJSON struct {
	Ticked   bool    `json:"ticked"`
	LotID    *int64  `json:"lotId"`
	Quantity float64 `json:"quantity"`
}

// changeTick sets what a tick addition put into Stock (SSP-01 Change; 0 = Take back, the tick stays).
func (a *api) changeTick(w http.ResponseWriter, r *http.Request) {
	var body changeTickBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if body.Quantity == nil {
		writeError(w, service.ErrInvalid)
		return
	}
	res, err := a.svc.ChangeTick(r.Context(), service.ChangeInput{IngredientID: body.IngredientID, To: stock.Date(body.To),
		ShopID: body.ShopID, Quantity: *body.Quantity, ClientUUID: body.ClientUUID, UserID: userID(r)})
	if err != nil {
		writeError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, changedJSON{Ticked: true, LotID: res.LotID, Quantity: res.Quantity})
}

type changeExtraBody struct {
	Quantity *float64 `json:"quantity"`
}

// changeExtraTick is changeTick for an Ingredient extra's tick; it answers the extra as the list shows it.
func (a *api) changeExtraTick(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var body changeExtraBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if body.Quantity == nil {
		writeError(w, service.ErrInvalid)
		return
	}
	if _, err := a.svc.ChangeExtraTick(r.Context(), id, *body.Quantity); err != nil {
		writeError(w, err)
		return
	}
	a.writeExtra(w, r, id, http.StatusOK)
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

type notNeededBody struct {
	IngredientID int64  `json:"ingredientId"`
	To           string `json:"to"`
	ShopID       *int64 `json:"shopId"`
}

// notNeeded takes an open Line off the list for the range and answers the list.
func (a *api) notNeeded(w http.ResponseWriter, r *http.Request) {
	var body notNeededBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	err := a.svc.SetNotNeeded(r.Context(), service.NotNeededInput{IngredientID: body.IngredientID, To: stock.Date(body.To),
		ShopID: body.ShopID, UserID: userID(r)})
	if err != nil {
		writeNotNeededError(w, err)
		return
	}
	a.writeList(w, r, body.ShopID, stock.Date(body.To))
}

// neededAfterAll puts a Not needed Line back for the range (?to=) and answers the list.
func (a *api) neededAfterAll(w http.ResponseWriter, r *http.Request) {
	ing, err := strconv.ParseInt(r.PathValue("ingredientId"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found.")
		return
	}
	shopID, err := shopParam(r)
	if err != nil {
		writeError(w, err)
		return
	}
	to := stock.Date(r.URL.Query().Get("to"))
	if err := a.svc.ClearNotNeeded(r.Context(), ing, to); err != nil {
		writeError(w, err)
		return
	}
	a.writeList(w, r, shopID, to)
}

// writeNotNeededError: an unknown Ingredient is a 404 here, an Ingredient with no open Line a 409.
func writeNotNeededError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrUnknownIngredient):
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found.")
	case errors.Is(err, service.ErrNotOnList):
		httpx.WriteError(w, http.StatusConflict, "not_on_list", "That Ingredient is not on the list.")
	default:
		writeError(w, err)
	}
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
	case errors.Is(err, service.ErrNotByHand):
		httpx.WriteError(w, http.StatusConflict, "not_by_hand", "A Scan ticked this. Undo it from the Scanned list.")
	case errors.Is(err, service.ErrNotYours):
		httpx.WriteError(w, http.StatusForbidden, "not_yours", "Only the User who ticked it can change it.")
	default:
		httpx.WriteAPIError(w, err)
	}
}
