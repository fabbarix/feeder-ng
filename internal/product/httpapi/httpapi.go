// Package httpapi exposes the Shop, Product, Price, catalog and resolve routes
// (docs/dev/design/t9-products-shops.md). Handlers stay thin: parse, call
// internal/product or its store, respond.
package httpapi

import (
	"errors"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/images"
	"github.com/fabbarix/feeder-ng/internal/images/refs"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/product/store"
)

func init() { app.Register(app.Module{Name: "products", Mount: mount}) }

// topic is the live-update topic the SPA invalidates its Product queries on.
const topic = "products"

func mount(r *app.Router, d app.Deps) {
	files := imaging.NewStore(filepath.Join(d.Config.DataDir, "images"))
	a := &api{store: store.New(d.DB, d.Clock, store.WithImages(images.NewGuarded(files, refs.New(d.DB)))), events: d.Events}

	// Shops: every User reads, adds one (standing in it, from the Shop or Scan screen) and saves its Shop Location;
	// the Admin renames and deletes. Weight Barcode Rules: the Admin writes, every User reads.
	r.User("GET /api/shops", a.listShops)
	r.User("POST /api/shops", a.createShop)
	r.User("PUT /api/shops/{id}/location", a.setShopLocation)
	r.Admin("PATCH /api/shops/{id}", a.renameShop)
	r.Admin("DELETE /api/shops/{id}", a.deleteShop)
	r.User("GET /api/shops/{id}/weight-rules", a.listRules)
	r.Admin("POST /api/shops/{id}/weight-rules", a.createRule)
	r.Admin("PUT /api/weight-rules/{id}", a.updateRule)
	r.Admin("DELETE /api/weight-rules/{id}", a.deleteRule)

	// Shop Barcodes: any User (the scan sheet adds them in the Shop).
	r.User("GET /api/shops/{id}/barcodes", a.listShopBarcodes)
	r.User("POST /api/shops/{id}/barcodes", a.createShopBarcode)
	r.User("DELETE /api/shop-barcodes/{id}", a.deleteShopBarcode)

	// Products, their barcodes and Shops.
	r.User("GET /api/products", a.listProducts)
	r.User("POST /api/products", a.createProduct)
	r.User("GET /api/products/last-bought", a.lastBought)
	r.User("GET /api/products/{id}", a.getProduct)
	r.User("PATCH /api/products/{id}", a.patchProduct)
	r.User("DELETE /api/products/{id}", a.deleteProduct)
	r.User("POST /api/products/{id}/archive", a.archiveProduct)
	r.User("POST /api/products/{id}/unarchive", a.unarchiveProduct)
	r.User("POST /api/products/{id}/barcodes", a.addBarcode)
	r.User("DELETE /api/products/{id}/barcodes/{code}", a.removeBarcode)
	r.User("PUT /api/products/{id}/shops/{shopId}", a.setSoldAt)
	r.User("DELETE /api/products/{id}/shops/{shopId}", a.unsetSoldAt)

	// Prices and purchases.
	r.User("GET /api/products/{id}/prices", a.listPrices)
	r.User("GET /api/products/{id}/prices/latest", a.latestPrice)
	r.User("PUT /api/products/{id}/prices", a.recordPrice)
	r.User("DELETE /api/prices/{id}", a.deletePrice)
	r.User("POST /api/purchases", a.recordPurchase)
	r.User("DELETE /api/purchases/{id}", a.deletePurchase)

	// Catalog and resolution.
	r.User("GET /api/catalog", a.catalog)
	r.User("GET /api/resolve", a.resolve)
}

type api struct {
	store  *store.Store
	events *events.Bus
}

// changed tells the SPA that part of the Product domain changed
// (shops, products, prices or purchases).
func (a *api) changed(what string) {
	if a.events != nil {
		a.events.Publish(topic, map[string]string{"changed": what})
	}
}

// ---- Shops and Weight Barcode Rules ----

type shopBody struct {
	Name string `json:"name"`
	// Location is optional on create (absent or null = not saved); renames ignore it.
	Location *product.Location `json:"location"`
}

func (a *api) listShops(w http.ResponseWriter, r *http.Request) {
	list, err := a.store.Shops(r.Context())
	if err != nil {
		writeErr(w, err, "shop")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, list)
}

func (a *api) createShop(w http.ResponseWriter, r *http.Request) {
	var body shopBody
	if !decode(w, r, &body) {
		return
	}
	sh, err := a.store.CreateShop(r.Context(), body.Name, body.Location)
	if err != nil {
		writeErr(w, err, "shop")
		return
	}
	a.changed("shops")
	httpx.WriteJSON(w, http.StatusCreated, sh)
}

func (a *api) renameShop(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body shopBody
	if !decode(w, r, &body) {
		return
	}
	sh, err := a.store.RenameShop(r.Context(), id, body.Name)
	if err != nil {
		writeErr(w, err, "shop")
		return
	}
	a.changed("shops")
	httpx.WriteJSON(w, http.StatusOK, sh)
}

func (a *api) setShopLocation(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body product.Location
	if !decode(w, r, &body) {
		return
	}
	sh, err := a.store.SetShopLocation(r.Context(), id, body)
	if err != nil {
		writeErr(w, err, "shop")
		return
	}
	a.changed("shops")
	httpx.WriteJSON(w, http.StatusOK, sh)
}

func (a *api) deleteShop(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := a.store.DeleteShop(r.Context(), id); err != nil {
		writeErr(w, err, "shop")
		return
	}
	a.changed("shops")
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) listRules(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	list, err := a.store.Rules(r.Context(), id)
	if err != nil {
		writeErr(w, err, "rule")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, list)
}

// ruleBody is a Weight Barcode Rule as sent; the id comes from the path or the store.
type ruleBody = barcode.WeightRule

func (a *api) createRule(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body ruleBody
	if !decode(w, r, &body) {
		return
	}
	rule, err := a.store.CreateRule(r.Context(), id, body)
	if err != nil {
		writeErr(w, err, "rule")
		return
	}
	a.changed("shops")
	httpx.WriteJSON(w, http.StatusCreated, rule)
}

func (a *api) updateRule(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body ruleBody
	if !decode(w, r, &body) {
		return
	}
	rule, err := a.store.UpdateRule(r.Context(), id, body)
	if err != nil {
		writeErr(w, err, "rule")
		return
	}
	a.changed("shops")
	httpx.WriteJSON(w, http.StatusOK, rule)
}

func (a *api) deleteRule(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := a.store.DeleteRule(r.Context(), id); err != nil {
		writeErr(w, err, "rule")
		return
	}
	a.changed("shops")
	w.WriteHeader(http.StatusNoContent)
}

// ---- Shop Barcodes ----

type shopBarcodeBody struct {
	ProductID int64  `json:"productId"`
	Code      string `json:"code"`
	RuleID    int64  `json:"ruleId"`
	ItemCode  string `json:"itemCode"`
}

func (a *api) listShopBarcodes(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	list, err := a.store.ShopBarcodes(r.Context(), id)
	if err != nil {
		writeErr(w, err, "barcode")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, list)
}

func (a *api) createShopBarcode(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body shopBarcodeBody
	if !decode(w, r, &body) {
		return
	}
	var sb store.ShopBarcode
	var err error
	if body.RuleID != 0 {
		sb, err = a.store.AddWeighedShopBarcode(r.Context(), id, body.ProductID, body.RuleID, body.ItemCode)
	} else {
		sb, err = a.store.AddShopBarcode(r.Context(), id, body.ProductID, body.Code)
	}
	if err != nil {
		writeErr(w, err, "barcode")
		return
	}
	a.changed("products")
	httpx.WriteJSON(w, http.StatusCreated, sb)
}

func (a *api) deleteShopBarcode(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := a.store.DeleteShopBarcode(r.Context(), id); err != nil {
		writeErr(w, err, "barcode")
		return
	}
	a.changed("products")
	w.WriteHeader(http.StatusNoContent)
}

// ---- Products ----

type shopBarcodeIn struct {
	ShopID   int64  `json:"shopId"`
	Code     string `json:"code"`
	RuleID   int64  `json:"ruleId"`
	ItemCode string `json:"itemCode"`
}

type productBody struct {
	Name         string          `json:"name"`
	IngredientID int64           `json:"ingredientId"`
	PackSize     float64         `json:"packSize"`
	Image        string          `json:"image"`
	Barcodes     []string        `json:"barcodes"`
	ShopBarcodes []shopBarcodeIn `json:"shopBarcodes"`
}

type productPatch struct {
	Name     *string  `json:"name"`
	PackSize *float64 `json:"packSize"`
	Image    *string  `json:"image"` // absent keeps, "" removes, an id sets
}

type codeBody struct {
	Code string `json:"code"`
}

func (a *api) listProducts(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := store.Filter{Query: q.Get("q"), Barcode: q.Get("barcode")}
	if raw := q.Get("includeArchived"); raw != "" {
		f.IncludeArchived = raw == "1" || raw == "true"
	}
	if raw := q.Get("ingredient"); raw != "" {
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "bad_request", "ingredient must be an Ingredient id")
			return
		}
		f.IngredientID = id
	}
	list, err := a.store.Products(r.Context(), f)
	if err != nil {
		writeErr(w, err, "product")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, list)
}

func (a *api) createProduct(w http.ResponseWriter, r *http.Request) {
	var body productBody
	if !decode(w, r, &body) {
		return
	}
	in := store.NewProduct{
		Input:    product.Input{Name: body.Name, IngredientID: body.IngredientID, PackSize: body.PackSize, Image: body.Image},
		Barcodes: body.Barcodes,
	}
	for _, sb := range body.ShopBarcodes {
		in.ShopBarcodes = append(in.ShopBarcodes, store.NewShopBarcode{ShopID: sb.ShopID, Code: sb.Code, RuleID: sb.RuleID, ItemCode: sb.ItemCode})
	}
	d, err := a.store.CreateProduct(r.Context(), in)
	if err != nil {
		writeErr(w, err, "product")
		return
	}
	a.changed("products")
	httpx.WriteJSON(w, http.StatusCreated, d)
}

// lastBought answers ?ingredient=ID (one Product, or 404) or ?ingredients=1,2
// (a map from Ingredient id to Product; Ingredients never bought are absent).
func (a *api) lastBought(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	shopID, ok := optionalID(w, q.Get("shop"))
	if !ok {
		return
	}
	if raw := q.Get("ingredients"); raw != "" {
		var ids []int64
		for _, part := range strings.Split(raw, ",") {
			id, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64)
			if err != nil {
				httpx.WriteError(w, http.StatusBadRequest, "bad_request", "ingredients must be Ingredient ids")
				return
			}
			ids = append(ids, id)
		}
		many, err := a.store.LastBoughtMany(r.Context(), ids, shopID)
		if err != nil {
			writeErr(w, err, "product")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, many)
		return
	}
	id, err := strconv.ParseInt(q.Get("ingredient"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad_request", "The query needs ingredient=<Ingredient id>")
		return
	}
	p, found, err := a.store.LastBought(r.Context(), id, shopID)
	if err != nil {
		writeErr(w, err, "product")
		return
	}
	if !found {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Nothing bought yet for that Ingredient")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, p)
}

func (a *api) getProduct(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	d, err := a.store.Product(r.Context(), id)
	if err != nil {
		writeErr(w, err, "product")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, d)
}

func (a *api) patchProduct(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body productPatch
	if !decode(w, r, &body) {
		return
	}
	d, err := a.store.PatchProduct(r.Context(), id, body.Name, body.PackSize, body.Image)
	if err != nil {
		writeErr(w, err, "product")
		return
	}
	a.changed("products")
	httpx.WriteJSON(w, http.StatusOK, d)
}

func (a *api) deleteProduct(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := a.store.DeleteProduct(r.Context(), id); err != nil {
		writeErr(w, err, "product")
		return
	}
	a.changed("products")
	w.WriteHeader(http.StatusNoContent)
}

// archiveProduct and unarchiveProduct set the archived flag (idempotent). The body is ignored.
func (a *api) archiveProduct(w http.ResponseWriter, r *http.Request) {
	a.setArchived(w, r, true)
}

func (a *api) unarchiveProduct(w http.ResponseWriter, r *http.Request) {
	a.setArchived(w, r, false)
}

func (a *api) setArchived(w http.ResponseWriter, r *http.Request, archived bool) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	d, err := a.store.SetArchived(r.Context(), id, archived)
	if err != nil {
		writeErr(w, err, "product")
		return
	}
	a.changed("products")
	httpx.WriteJSON(w, http.StatusOK, d)
}

func (a *api) addBarcode(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body codeBody
	if !decode(w, r, &body) {
		return
	}
	if err := a.store.AddBarcode(r.Context(), id, body.Code); err != nil {
		writeErr(w, err, "product")
		return
	}
	a.changed("products")
	d, err := a.store.Product(r.Context(), id)
	if err != nil {
		writeErr(w, err, "product")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, d)
}

func (a *api) removeBarcode(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := a.store.RemoveBarcode(r.Context(), id, r.PathValue("code")); err != nil {
		writeErr(w, err, "product")
		return
	}
	a.changed("products")
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) setSoldAt(w http.ResponseWriter, r *http.Request) {
	id, shopID, ok := productAndShop(w, r)
	if !ok {
		return
	}
	if err := a.store.SetSoldAt(r.Context(), id, shopID); err != nil {
		writeErr(w, err, "product")
		return
	}
	a.changed("products")
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) unsetSoldAt(w http.ResponseWriter, r *http.Request) {
	id, shopID, ok := productAndShop(w, r)
	if !ok {
		return
	}
	if err := a.store.UnsetSoldAt(r.Context(), id, shopID); err != nil {
		writeErr(w, err, "product")
		return
	}
	a.changed("products")
	w.WriteHeader(http.StatusNoContent)
}

// ---- Prices ----

type priceBody struct {
	ShopID          int64  `json:"shopId"`
	Date            string `json:"date"`
	PriceCents      *int   `json:"priceCents"`
	PricePerKgCents *int   `json:"pricePerKgCents"`
}

func (a *api) listPrices(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	shopID, ok := optionalID(w, r.URL.Query().Get("shop"))
	if !ok {
		return
	}
	list, err := a.store.Prices(r.Context(), id, shopID)
	if err != nil {
		writeErr(w, err, "price")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, list)
}

// latestPrice answers the latest Price (at ?shop, else anywhere), or JSON null.
func (a *api) latestPrice(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	shopID, ok := optionalID(w, r.URL.Query().Get("shop"))
	if !ok {
		return
	}
	p, found, err := a.store.LatestPrice(r.Context(), id, shopID)
	if err != nil {
		writeErr(w, err, "price")
		return
	}
	if !found {
		httpx.WriteJSON(w, http.StatusOK, nil)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, p)
}

func (a *api) recordPrice(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body priceBody
	if !decode(w, r, &body) {
		return
	}
	p, err := a.store.RecordPrice(r.Context(), id, product.PriceInput{
		ShopID: body.ShopID, Date: body.Date, PriceCents: body.PriceCents, PricePerKgCents: body.PricePerKgCents,
	})
	if err != nil {
		writeErr(w, err, "price")
		return
	}
	a.changed("prices")
	httpx.WriteJSON(w, http.StatusOK, p)
}

func (a *api) deletePrice(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := a.store.DeletePrice(r.Context(), id); err != nil {
		writeErr(w, err, "price")
		return
	}
	a.changed("prices")
	w.WriteHeader(http.StatusNoContent)
}

// ---- Purchases ----

type purchaseBody struct {
	ProductID int64  `json:"productId"`
	ShopID    *int64 `json:"shopId"`
	Date      string `json:"date"`
}

func (a *api) recordPurchase(w http.ResponseWriter, r *http.Request) {
	var body purchaseBody
	if !decode(w, r, &body) {
		return
	}
	id, err := a.store.RecordPurchase(r.Context(), body.ProductID, body.ShopID, body.Date)
	if err != nil {
		writeErr(w, err, "purchase")
		return
	}
	a.changed("purchases")
	httpx.WriteJSON(w, http.StatusCreated, map[string]int64{"id": id})
}

func (a *api) deletePurchase(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := a.store.DeletePurchase(r.Context(), id); err != nil {
		writeErr(w, err, "purchase")
		return
	}
	a.changed("purchases")
	w.WriteHeader(http.StatusNoContent)
}

// ---- Catalog and resolution ----

func (a *api) catalog(w http.ResponseWriter, r *http.Request) {
	shopID, ok := optionalID(w, r.URL.Query().Get("shop"))
	if !ok {
		return
	}
	c, err := a.store.Catalog(r.Context(), shopID)
	if err != nil {
		writeErr(w, err, "catalog")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, c)
}

func (a *api) resolve(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	raw := q.Get("barcode")
	if strings.TrimSpace(raw) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "bad_request", "The query needs barcode=<code>")
		return
	}
	shopID, ok := optionalID(w, q.Get("shop"))
	if !ok {
		return
	}
	res, err := a.store.Resolve(r.Context(), raw, barcode.Format(q.Get("format")), shopID)
	if err != nil {
		writeErr(w, err, "catalog")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, res)
}

// ---- helpers ----

// decode reads a JSON body into v, writing the 400 itself on failure.
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := httpx.DecodeJSON(r, v); err != nil {
		httpx.WriteAPIError(w, err)
		return false
	}
	return true
}

// idParam reads the {id} path value; a malformed id is simply not found.
func idParam(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return 0, false
	}
	return id, true
}

// productAndShop reads {id} (a Product) and {shopId}.
func productAndShop(w http.ResponseWriter, r *http.Request) (int64, int64, bool) {
	id, ok := idParam(w, r)
	if !ok {
		return 0, 0, false
	}
	shopID, err := strconv.ParseInt(r.PathValue("shopId"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return 0, 0, false
	}
	return id, shopID, true
}

// optionalID parses an optional id query value; empty means nil.
func optionalID(w http.ResponseWriter, raw string) (*int64, bool) {
	if raw == "" {
		return nil, true
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad_request", "shop must be a Shop id")
		return nil, false
	}
	return &id, true
}

// writeErr maps domain and store errors onto the API's status codes and codes.
// kind names the resource for the generic invalid_<kind> code.
func writeErr(w http.ResponseWriter, err error, kind string) {
	var ve *product.ValidationError
	var taken *store.BarcodeTakenError
	switch {
	case errors.As(err, &ve):
		code := "invalid_" + kind
		switch ve.Field {
		case "date":
			code = "invalid_date"
		case "rule":
			code = "invalid_rule"
		}
		httpx.WriteError(w, http.StatusBadRequest, code, err.Error())
	case errors.Is(err, product.ErrInvalidBarcode):
		httpx.WriteError(w, http.StatusBadRequest, "invalid_barcode", "That is not a readable barcode")
	case errors.Is(err, product.ErrInvalidItemCode):
		httpx.WriteError(w, http.StatusBadRequest, "invalid_item_code", "The item code must have the rule's item digits")
	case errors.Is(err, store.ErrUnknownIngredient):
		httpx.WriteError(w, http.StatusBadRequest, "unknown_ingredient", "No such Ingredient")
	case errors.As(err, &taken) && taken.Archived:
		httpx.WriteError(w, http.StatusConflict, "barcode_archived", err.Error())
	case errors.As(err, &taken):
		httpx.WriteError(w, http.StatusConflict, "barcode_taken", err.Error())
	case errors.Is(err, store.ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
	case errors.Is(err, store.ErrNameTaken):
		httpx.WriteError(w, http.StatusConflict, "name_taken", "A Shop with that name already exists")
	case errors.Is(err, store.ErrDuplicatePrefix):
		httpx.WriteError(w, http.StatusConflict, "duplicate_prefix", "This Shop already has a rule with that prefix")
	case errors.Is(err, store.ErrBought):
		httpx.WriteError(w, http.StatusConflict, "product_bought", "This Product was bought, so it cannot be deleted; archive it instead.")
	case errors.Is(err, store.ErrInUse):
		httpx.WriteError(w, http.StatusConflict, "in_use", "It is still in use")
	case errors.Is(err, product.ErrInvalid):
		httpx.WriteError(w, http.StatusBadRequest, "invalid_"+kind, err.Error())
	default:
		httpx.WriteAPIError(w, err)
	}
}
