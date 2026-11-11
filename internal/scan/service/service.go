// Package service applies the phone's Scan operations (functional spec §10): a Shop scan adds a Stock Lot, records
// the Product as sold at the Shop and a purchase, writes the Price, reduces and ticks the matching Shopping List
// line; Undo reverses it; an unknown barcode creates the Product first; Stock-take adjusts Stock. Everything is
// idempotent on the client UUID. It talks to Stock, Products, Ingredients and the Shopping List through ports.
package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/store"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	shopservice "github.com/fabbarix/feeder-ng/internal/shopping/service"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Errors.
var (
	ErrNotFound    = errors.New("scan: not found")
	ErrNotUndoable = errors.New("scan: only a Shop scan can be undone")
	ErrProductGone = errors.New("scan: unknown Product")
	// ErrUnknownIngredient is what the Catalogue and Ingredients ports return for an Ingredient that no longer
	// exists (for example merged away while the phone was offline). Apply turns it into a rejected Result.
	ErrUnknownIngredient = errors.New("scan: unknown Ingredient")
	// ErrAlreadyUndone is returned by SetPrice for a scan that was undone (the API answers 409 already_undone).
	ErrAlreadyUndone = errors.New("scan: the scan was undone")
)

// Rejection codes in scan.ErrInfo.
const (
	CodeValidation     = "validation_failed"
	CodeUnknownProduct = "unknown_product"
	CodeUnknownShop    = "unknown_shop"
	CodeUnknownIngr    = "unknown_ingredient"
	// CodeBarcodeArchived rejects a shop_unknown whose barcode belongs to an archived Product (R8): the phone offers to unarchive it.
	CodeBarcodeArchived = "barcode_archived"
)

// StockAdd asks Stock for a Lot (source scan). Purchased is the household date of the scan.
type StockAdd struct {
	IngredientID int64
	Quantity     float64
	Purchased    stock.Date
	ProductID    *int64
	ShopID       *int64
	ClientUUID   string
}

// Stock is the Stock Lot port (T10). RemoveLot is the small addition Undo needs.
type Stock interface {
	AddLot(ctx context.Context, in StockAdd) (lotID int64, created bool, err error)
	RemoveLot(ctx context.Context, lotID int64) error
	Total(ctx context.Context, ingredientID int64) (float64, error)
	SetTotal(ctx context.Context, ingredientID int64, total float64) error
}

// ProductInfo is a Product with its Ingredient.
type ProductInfo struct {
	ID             int64
	Name           string
	IngredientID   int64
	IngredientName string
	BaseUnit       string
	PackSize       float64
	ImageURL       string // "/api/images/<id>" of the Product's Picture, "" = none (PP)
}

// ShopBarcode is a Shop-only barcode: a plain code, or RuleID + ItemCode for a weighed one.
type ShopBarcode struct {
	ShopID   int64
	Code     string
	RuleID   int64
	ItemCode string
}

// NewProduct is the unknown-barcode form turned into a Product.
type NewProduct struct {
	Name         string
	IngredientID int64
	PackSize     float64
	Image        string // the Picture's image id, "" = none (PP)
	Barcodes     []string
	ShopBarcodes []ShopBarcode
}

// BarcodeTakenError is returned by CreateProduct when someone created the barcode first.
// Archived: the owner is an archived Product, so the Op is rejected with CodeBarcodeArchived instead of merged (WP7).
type BarcodeTakenError struct {
	ProductID int64
	Archived  bool
}

func (e *BarcodeTakenError) Error() string {
	return "barcode already belongs to product " + itoa(e.ProductID)
}

// PriceInfo is a stored Price.
type PriceInfo struct {
	ID              int64
	Date            stock.Date
	PriceCents      *int
	PricePerKgCents *int
}

// PriceInput records a Price for the Product at a Shop on a date (the same day is replaced).
type PriceInput struct {
	ShopID          int64
	Date            stock.Date
	PriceCents      *int
	PricePerKgCents *int
}

// OfflineProduct is a Product as the phone caches it.
type OfflineProduct struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	IngredientID   int64   `json:"ingredientId"`
	IngredientName string  `json:"ingredientName"`
	BaseUnit       string  `json:"baseUnit"`
	PackSize       float64 `json:"packSize"`
	ImageURL       string  `json:"imageUrl,omitempty"` // PP: the Picture, so a scan can be described offline
	LastPriceCents *int    `json:"lastPriceCents"`
}

// OfflineData is what the phone caches to resolve and describe scans offline.
type OfflineData struct {
	ShopID   *int64           `json:"shopId"`
	ShopName string           `json:"shopName"`
	Catalog  barcode.Catalog  `json:"catalog"`
	Products []OfflineProduct `json:"products"`
}

// Catalogue is the Products/Shops port (T9).
type Catalogue interface {
	ShopExists(ctx context.Context, id int64) (bool, error)
	Product(ctx context.Context, id int64) (ProductInfo, error) // ErrProductGone
	CreateProduct(ctx context.Context, in NewProduct) (ProductInfo, error)
	SoldAt(ctx context.Context, productID, shopID int64) (bool, error)
	SetSoldAt(ctx context.Context, productID, shopID int64) error
	UnsetSoldAt(ctx context.Context, productID, shopID int64) error
	RecordPurchase(ctx context.Context, productID int64, shopID *int64, date stock.Date) (int64, error)
	DeletePurchase(ctx context.Context, id int64) error
	// LatestPrice is the latest Price at this Shop only (nil when none).
	LatestPrice(ctx context.Context, productID, shopID int64) (*PriceInfo, error)
	PriceOn(ctx context.Context, productID, shopID int64, date stock.Date) (*PriceInfo, error)
	RecordPrice(ctx context.Context, productID int64, in PriceInput) (PriceInfo, error)
	DeletePrice(ctx context.Context, id int64) error
	OfflineData(ctx context.Context, shopID *int64) (OfflineData, error)
}

// Ingredients finds or creates an Ingredient by name (name key), returning its id.
type Ingredients interface {
	Ensure(ctx context.Context, name, baseUnit string) (int64, error)
}

// List is the Shopping List port (implemented by shopping/service.Service).
type List interface {
	AfterLot(ctx context.Context, in shopservice.AfterLotInput) (shopservice.Effect, error)
	UndoLot(ctx context.Context, in shopservice.UndoLotInput) error
}

// Dates converts the phone's timestamp to a household date.
type Dates interface {
	DateOf(ctx context.Context, t time.Time) (stock.Date, error)
}

// Publisher is *events.Bus.
type Publisher interface{ Publish(topic string, data any) }

// Deps are the collaborators.
type Deps struct {
	Ledger      *store.Store
	Stock       Stock
	Catalogue   Catalogue
	Ingredients Ingredients
	List        List
	Household   shopservice.Household
	Dates       Dates
	Clock       clock.Clock
	Publisher   Publisher
}

// Service applies operations. mu serialises Apply, Undo and SetPrice: the app is one process on one SQLite file,
// so one lock is enough to make a repeated or racing request see the first one's ledger row.
type Service struct {
	d  Deps
	mu sync.Mutex
}

// New returns a Service.
func New(d Deps) *Service { return &Service{d: d} }

// priceSnapshot is a same-day Price as it was before a scan replaced it (restored on Undo).
type priceSnapshot struct {
	Date            stock.Date `json:"date"`
	PriceCents      *int       `json:"priceCents"`
	PricePerKgCents *int       `json:"pricePerKgCents"`
}

// Apply applies one operation. A bad operation is a Result with status rejected (and no side effects); the
// error is only for infrastructure failures. A repeated client UUID answers status duplicate with the stored result.
func (s *Service) Apply(ctx context.Context, op scan.Op) (scan.Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := op.Validate(); err != nil {
		return rejected(op.ClientUUID, CodeValidation, err.Error()), nil
	}
	ev, ok, err := s.d.Ledger.Get(ctx, op.ClientUUID)
	if err != nil {
		return scan.Result{}, err
	}
	if ok {
		return duplicate(ev)
	}
	var res scan.Result
	switch op.Kind {
	case scan.KindStockTake:
		res, err = s.stockTake(ctx, op)
	case scan.KindShopScan:
		res, err = s.shopScan(ctx, op)
	default:
		res, err = s.shopUnknown(ctx, op)
	}
	if err != nil {
		return domainRejection(op.ClientUUID, err)
	}
	return res, nil
}

// domainRejection turns a domain error raised by any step into that operation's rejected Result, so one stale
// op (an Ingredient merged away while the phone was offline) does not fail the whole batch. Infrastructure
// failures stay errors.
func domainRejection(uuid string, err error) (scan.Result, error) {
	switch {
	case errors.Is(err, ErrUnknownIngredient):
		return rejected(uuid, CodeUnknownIngr, "unknown Ingredient"), nil
	case errors.Is(err, ErrProductGone):
		return rejected(uuid, CodeUnknownProduct, "unknown Product"), nil
	}
	return scan.Result{}, err
}

// Sync applies the operations in the order given; results are in the same order.
func (s *Service) Sync(ctx context.Context, ops []scan.Op) ([]scan.Result, error) {
	out := make([]scan.Result, 0, len(ops))
	for _, op := range ops {
		res, err := s.Apply(ctx, op)
		if err != nil {
			return nil, err
		}
		out = append(out, res)
	}
	return out, nil
}

func rejected(uuid, code, msg string) scan.Result {
	return scan.Result{ClientUUID: uuid, Status: scan.StatusRejected, Error: &scan.ErrInfo{Code: code, Message: msg}}
}

func duplicate(ev store.Event) (scan.Result, error) {
	var res scan.Result
	if err := json.Unmarshal([]byte(ev.ResultJSON), &res); err != nil {
		return scan.Result{}, err
	}
	res.Status, res.Error = scan.StatusDuplicate, nil
	return res, nil
}

func (s *Service) shopScan(ctx context.Context, op scan.Op) (scan.Result, error) {
	ok, err := s.d.Catalogue.ShopExists(ctx, *op.ShopID)
	if err != nil {
		return scan.Result{}, err
	}
	if !ok {
		return rejected(op.ClientUUID, CodeUnknownShop, "unknown Shop"), nil
	}
	p, err := s.d.Catalogue.Product(ctx, op.ProductID)
	if errors.Is(err, ErrProductGone) {
		return rejected(op.ClientUUID, CodeUnknownProduct, "unknown Product"), nil
	}
	if err != nil {
		return scan.Result{}, err
	}
	return s.purchase(ctx, op, p, nil, nil)
}

func (s *Service) shopUnknown(ctx context.Context, op scan.Op) (scan.Result, error) {
	ok, err := s.d.Catalogue.ShopExists(ctx, *op.ShopID)
	if err != nil {
		return scan.Result{}, err
	}
	if !ok {
		return rejected(op.ClientUUID, CodeUnknownShop, "unknown Shop"), nil
	}
	ingredientID := op.Ingredient.ID
	if ingredientID <= 0 {
		if ingredientID, err = s.d.Ingredients.Ensure(ctx, strings.TrimSpace(op.Ingredient.Name), op.Ingredient.BaseUnit); err != nil {
			return scan.Result{}, err
		}
	}
	shop := *op.ShopID
	weighed := op.RuleID != 0
	np := NewProduct{Name: strings.Join(strings.Fields(op.ProductName), " "), IngredientID: ingredientID, PackSize: op.PackSize,
		Image: strings.TrimSpace(op.ProductImage)}
	switch {
	case weighed:
		np.PackSize = op.Quantity
		np.ShopBarcodes = []ShopBarcode{{ShopID: shop, RuleID: op.RuleID, ItemCode: op.ItemCode}}
		if op.PriceCents != nil && op.PricePerKgCents == nil {
			if perKg, ok := barcode.PricePerKgFromWeight(*op.PriceCents, op.Quantity); ok {
				op.PricePerKgCents = &perKg
			}
		}
	case op.Scope == scan.ScopeGlobal:
		np.Barcodes = []string{op.Barcode}
	default:
		np.ShopBarcodes = []ShopBarcode{{ShopID: shop, Code: op.Barcode}}
	}

	var merged *scan.Merged
	created := true
	p, err := s.d.Catalogue.CreateProduct(ctx, np)
	var taken *BarcodeTakenError
	if errors.As(err, &taken) {
		// WP7 / R8: an archived owner is never merged into (its Stock would be added to a retired pack); the phone offers to unarchive it.
		if taken.Archived {
			return rejected(op.ClientUUID, CodeBarcodeArchived, taken.Error()), nil
		}
		created = false
		if p, err = s.d.Catalogue.Product(ctx, taken.ProductID); err != nil {
			return scan.Result{}, err
		}
		merged = &scan.Merged{ProductID: p.ID, ProductName: p.Name}
	} else if err != nil {
		var ve *scan.ValidationError
		if errors.As(err, &ve) {
			return rejected(op.ClientUUID, CodeValidation, ve.Error()), nil
		}
		return scan.Result{}, err
	}
	return s.purchase(ctx, op, p, &created, merged)
}

// weighedPrice prices a weighed scan (r3-scan-fixes B5): the scanned grams at the price per kg the phone sent, else
// the latest Price at the Shop. It returns the price and the price per kg it was taken from (explicit or derived), so
// the recorded Price carries both. Nothing when there is no basis.
func (s *Service) weighedPrice(ctx context.Context, op scan.Op, p ProductInfo, shop int64) (*int, *int, error) {
	base := units.Base(p.BaseUnit)
	basis := product.Price{PricePerKgCents: op.PricePerKgCents}
	if op.PricePerKgCents == nil {
		latest, err := s.d.Catalogue.LatestPrice(ctx, p.ID, shop)
		if err != nil {
			return nil, nil, err
		}
		if latest == nil {
			return nil, nil, nil
		}
		basis = product.Price{PriceCents: latest.PriceCents, PricePerKgCents: latest.PricePerKgCents}
	}
	cents, ok := product.PriceForWeight(basis, p.PackSize, base, op.Quantity)
	if !ok {
		return nil, nil, nil
	}
	perKg := basis.PricePerKgCents
	if perKg == nil {
		if k, _, ok := product.PricePerKg(basis, p.PackSize, base); ok {
			perKg = &k
		}
	}
	return &cents, perKg, nil
}

// purchase is the Shop-scan core: Stock Lot, sold-at link, purchase, Price, Shopping List line, ledger row.
// Every step that writes is undone in reverse order when a later step fails.
func (s *Service) purchase(ctx context.Context, op scan.Op, p ProductInfo, created *bool, merged *scan.Merged) (scan.Result, error) {
	shop := *op.ShopID
	today, horizon, err := s.household(ctx)
	if err != nil {
		return scan.Result{}, err
	}
	date, err := s.scanDate(ctx, op.ScannedAt, today)
	if err != nil {
		return scan.Result{}, err
	}
	rangeTo := shopping.ClampTo(today, horizon, stock.Date(op.RangeTo))
	pid := p.ID
	var undo []func(context.Context)
	fail := func(err error) (scan.Result, error) {
		for i := len(undo) - 1; i >= 0; i-- {
			undo[i](ctx)
		}
		return scan.Result{}, err
	}

	lotID, lotCreated, err := s.d.Stock.AddLot(ctx, StockAdd{IngredientID: p.IngredientID, Quantity: op.Quantity, Purchased: date,
		ProductID: &pid, ShopID: &shop, ClientUUID: op.ClientUUID})
	if err != nil {
		return fail(err)
	}
	if lotCreated {
		undo = append(undo, func(ctx context.Context) { _ = s.d.Stock.RemoveLot(ctx, lotID) })
	}

	sold, err := s.d.Catalogue.SoldAt(ctx, pid, shop)
	if err != nil {
		return fail(err)
	}
	if !sold {
		if err := s.d.Catalogue.SetSoldAt(ctx, pid, shop); err != nil {
			return fail(err)
		}
		undo = append(undo, func(ctx context.Context) { _ = s.d.Catalogue.UnsetSoldAt(ctx, pid, shop) })
	}

	purchaseID, err := s.d.Catalogue.RecordPurchase(ctx, pid, &shop, date)
	if err != nil {
		return fail(err)
	}
	undo = append(undo, func(ctx context.Context) { _ = s.d.Catalogue.DeletePurchase(ctx, purchaseID) })

	price, perKg := op.PriceCents, op.PricePerKgCents
	if op.Weighed && price == nil {
		price, perKg, err = s.weighedPrice(ctx, op, p, shop)
		if err != nil {
			return fail(err)
		}
	} else if price == nil && perKg == nil {
		latest, err := s.d.Catalogue.LatestPrice(ctx, pid, shop)
		if err != nil {
			return fail(err)
		}
		if latest != nil && latest.PriceCents != nil {
			c := *latest.PriceCents
			price = &c
		}
	}
	var priceID *int64
	var prevJSON string
	if price != nil || perKg != nil {
		prev, err := s.d.Catalogue.PriceOn(ctx, pid, shop, date)
		if err != nil {
			return fail(err)
		}
		var before *priceSnapshot
		if prev != nil {
			// Copy the values now: recording the new Price may overwrite the same-day row in place.
			before = &priceSnapshot{Date: prev.Date, PriceCents: copyInt(prev.PriceCents), PricePerKgCents: copyInt(prev.PricePerKgCents)}
			b, _ := json.Marshal(before)
			prevJSON = string(b)
		}
		rec, err := s.d.Catalogue.RecordPrice(ctx, pid, PriceInput{ShopID: shop, Date: date, PriceCents: price, PricePerKgCents: perKg})
		if err != nil {
			return fail(err)
		}
		id := rec.ID
		priceID = &id
		if before != nil {
			undo = append(undo, func(ctx context.Context) {
				_, _ = s.d.Catalogue.RecordPrice(ctx, pid, PriceInput{ShopID: shop, Date: before.Date, PriceCents: before.PriceCents, PricePerKgCents: before.PricePerKgCents})
			})
		} else {
			undo = append(undo, func(ctx context.Context) { _ = s.d.Catalogue.DeletePrice(ctx, id) })
		}
	}

	eff, err := s.d.List.AfterLot(ctx, shopservice.AfterLotInput{IngredientID: p.IngredientID, To: rangeTo, ShopID: &shop,
		LotID: lotID, Quantity: op.Quantity})
	if err != nil {
		return fail(err)
	}
	undo = append(undo, func(ctx context.Context) {
		_ = s.d.List.UndoLot(ctx, shopservice.UndoLotInput{IngredientID: p.IngredientID, To: rangeTo, Quantity: op.Quantity,
			Unmark: eff.Ticked, ExtraID: eff.ExtraID})
	})

	applied := scan.Applied{IngredientID: p.IngredientID, IngredientName: p.IngredientName, BaseUnit: p.BaseUnit,
		ProductID: pid, ProductName: p.Name, ProductImageURL: p.ImageURL, Quantity: op.Quantity, LotID: &lotID, PriceCents: price,
		OnList: eff.OnList, Remaining: eff.Remaining, Ticked: eff.Ticked, Merged: merged}
	if created != nil {
		applied.ProductCreated = *created
	}
	res := scan.Result{ClientUUID: op.ClientUUID, Status: scan.StatusApplied, Scan: &applied}
	resJSON, err := json.Marshal(res)
	if err != nil {
		return fail(err)
	}
	ing := p.IngredientID
	ev := store.Event{ClientUUID: op.ClientUUID, Kind: string(op.Kind), ScannedAt: op.ScannedAt, ShopID: &shop, ProductID: &pid,
		IngredientID: &ing, Quantity: op.Quantity, PriceCents: price, RangeTo: rangeTo, OnList: eff.OnList, Ticked: eff.Ticked,
		LotID: &lotID, PurchaseID: &purchaseID, SoldAtAdded: !sold, PriceID: priceID, PrevPriceJSON: prevJSON,
		ProductCreated: applied.ProductCreated, ResultJSON: string(resJSON)}
	if merged != nil {
		m := merged.ProductID
		ev.MergedInto = &m
	}
	if eff.ExtraID != 0 {
		x := eff.ExtraID
		ev.ExtraID = &x
	}
	if _, err := s.d.Ledger.Insert(ctx, ev); err != nil {
		if errors.Is(err, store.ErrDuplicate) {
			for i := len(undo) - 1; i >= 0; i-- {
				undo[i](ctx)
			}
			return duplicate(mustGet(ctx, s.d.Ledger, op.ClientUUID))
		}
		return fail(err)
	}
	s.publish()
	return res, nil
}

func (s *Service) stockTake(ctx context.Context, op scan.Op) (scan.Result, error) {
	p, err := s.d.Catalogue.Product(ctx, op.ProductID)
	if errors.Is(err, ErrProductGone) {
		return rejected(op.ClientUUID, CodeUnknownProduct, "unknown Product"), nil
	}
	if err != nil {
		return scan.Result{}, err
	}
	today, _, err := s.household(ctx)
	if err != nil {
		return scan.Result{}, err
	}
	ing := p.IngredientID
	var (
		quantity float64
		lotID    *int64
	)
	switch op.Action {
	case scan.PlusPack:
		quantity = p.PackSize
		id, _, err := s.d.Stock.AddLot(ctx, StockAdd{IngredientID: ing, Quantity: quantity, Purchased: today, ProductID: &p.ID, ClientUUID: op.ClientUUID})
		if err != nil {
			return scan.Result{}, err
		}
		lotID = &id
	case scan.MinusPack:
		quantity = p.PackSize
		total, err := s.d.Stock.Total(ctx, ing)
		if err != nil {
			return scan.Result{}, err
		}
		if err := s.d.Stock.SetTotal(ctx, ing, maxf(0, total-quantity)); err != nil {
			return scan.Result{}, err
		}
	case scan.SetTotal:
		if err := s.d.Stock.SetTotal(ctx, ing, *op.Total); err != nil {
			return scan.Result{}, err
		}
	}
	after, err := s.d.Stock.Total(ctx, ing)
	if err != nil {
		return scan.Result{}, err
	}
	pid := p.ID
	applied := scan.Applied{IngredientID: ing, IngredientName: p.IngredientName, BaseUnit: p.BaseUnit, ProductID: pid,
		ProductName: p.Name, ProductImageURL: p.ImageURL, Quantity: quantity, LotID: lotID, Total: &after}
	res := scan.Result{ClientUUID: op.ClientUUID, Status: scan.StatusApplied, Scan: &applied}
	resJSON, err := json.Marshal(res)
	if err != nil {
		return scan.Result{}, err
	}
	if _, err := s.d.Ledger.Insert(ctx, store.Event{ClientUUID: op.ClientUUID, Kind: string(scan.KindStockTake),
		ScannedAt: op.ScannedAt, ProductID: &pid, IngredientID: &ing, Quantity: quantity, LotID: lotID, ResultJSON: string(resJSON)}); err != nil {
		if errors.Is(err, store.ErrDuplicate) {
			return duplicate(mustGet(ctx, s.d.Ledger, op.ClientUUID))
		}
		return scan.Result{}, err
	}
	return res, nil
}

// UndoResult says whether this call reversed the scan or it was already undone.
type UndoResult struct{ Undone, AlreadyUndone bool }

// Undo reverses a Shop scan (ErrNotFound, ErrNotUndoable for a stock_take). The steps run in a fixed order and
// each is recorded in the ledger when it succeeds, so a retry after a failure skips the steps already done and
// UndoneAt is set only after the last one. The steps are not all idempotent on their own: List.UndoLot gives the
// quantity back and is not, so the journal is what stops a recorded step running twice. Removing a missing Lot,
// purchase or Price is a no-op, but a crash between a step and its record can repeat that step on retry.
func (s *Service) Undo(ctx context.Context, clientUUID string) (UndoResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ev, ok, err := s.d.Ledger.Get(ctx, clientUUID)
	if err != nil {
		return UndoResult{}, err
	}
	if !ok {
		return UndoResult{}, ErrNotFound
	}
	if ev.Kind == string(scan.KindStockTake) {
		return UndoResult{}, ErrNotUndoable
	}
	if ev.UndoneAt != "" {
		return UndoResult{AlreadyUndone: true}, nil
	}
	done := map[string]bool{}
	for _, st := range ev.UndoSteps {
		done[st] = true
	}
	step := func(name string, run func() error) error {
		if done[name] {
			return nil
		}
		if err := run(); err != nil {
			return err
		}
		return s.d.Ledger.MarkUndoStep(ctx, clientUUID, name)
	}

	ing := derefInt(ev.IngredientID)
	steps := []struct {
		name string
		run  func() error
	}{
		{store.UndoStepList, func() error {
			return s.d.List.UndoLot(ctx, shopservice.UndoLotInput{IngredientID: ing, To: ev.RangeTo, Quantity: ev.Quantity,
				Unmark: ev.Ticked, ExtraID: derefInt(ev.ExtraID)})
		}},
		{store.UndoStepLot, func() error {
			if ev.LotID == nil {
				return nil
			}
			return s.d.Stock.RemoveLot(ctx, *ev.LotID)
		}},
		{store.UndoStepPurchase, func() error {
			if ev.PurchaseID == nil {
				return nil
			}
			return s.d.Catalogue.DeletePurchase(ctx, *ev.PurchaseID)
		}},
		// Restoring a Price re-links the Product to the Shop, so the sold-at link is removed after it.
		{store.UndoStepPrice, func() error {
			if ev.PriceID == nil || ev.ProductID == nil || ev.ShopID == nil {
				return nil
			}
			return s.restorePrice(ctx, ev)
		}},
		{store.UndoStepSoldAt, func() error {
			if !ev.SoldAtAdded || ev.ProductID == nil || ev.ShopID == nil {
				return nil
			}
			return s.d.Catalogue.UnsetSoldAt(ctx, *ev.ProductID, *ev.ShopID)
		}},
	}
	for _, st := range steps {
		if err := step(st.name, st.run); err != nil {
			return UndoResult{}, err
		}
	}
	if _, err := s.d.Ledger.MarkUndone(ctx, clientUUID); err != nil {
		return UndoResult{}, err
	}
	s.publish()
	return UndoResult{Undone: true}, nil
}

// restorePrice puts back the same-day Price a scan replaced, or removes the one it wrote.
func (s *Service) restorePrice(ctx context.Context, ev store.Event) error {
	if ev.PrevPriceJSON == "" {
		return s.d.Catalogue.DeletePrice(ctx, *ev.PriceID)
	}
	var prev priceSnapshot
	if err := json.Unmarshal([]byte(ev.PrevPriceJSON), &prev); err != nil {
		return err
	}
	_, err := s.d.Catalogue.RecordPrice(ctx, *ev.ProductID, PriceInput{ShopID: *ev.ShopID, Date: prev.Date,
		PriceCents: prev.PriceCents, PricePerKgCents: prev.PricePerKgCents})
	return err
}

// SetPrice edits the Price a scan recorded ("✎"): ErrNotFound, ErrNotUndoable for a stock_take.
func (s *Service) SetPrice(ctx context.Context, clientUUID string, cents int) (scan.Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ev, ok, err := s.d.Ledger.Get(ctx, clientUUID)
	if err != nil {
		return scan.Result{}, err
	}
	if !ok {
		return scan.Result{}, ErrNotFound
	}
	if ev.Kind == string(scan.KindStockTake) || ev.ProductID == nil || ev.ShopID == nil {
		return scan.Result{}, ErrNotUndoable
	}
	if ev.UndoneAt != "" {
		return scan.Result{}, ErrAlreadyUndone
	}
	if cents <= 0 {
		return scan.Result{}, &scan.ValidationError{Field: "priceCents", Message: "a price must be more than 0"}
	}
	today, _, err := s.household(ctx)
	if err != nil {
		return scan.Result{}, err
	}
	date, err := s.scanDate(ctx, ev.ScannedAt, today)
	if err != nil {
		return scan.Result{}, err
	}
	var perKg *int
	if existing, err := s.d.Catalogue.PriceOn(ctx, *ev.ProductID, *ev.ShopID, date); err != nil {
		return scan.Result{}, err
	} else if existing != nil {
		perKg = existing.PricePerKgCents
	}
	c := cents
	rec, err := s.d.Catalogue.RecordPrice(ctx, *ev.ProductID, PriceInput{ShopID: *ev.ShopID, Date: date, PriceCents: &c, PricePerKgCents: perKg})
	if err != nil {
		return scan.Result{}, err
	}
	if err := s.d.Ledger.UpdatePrice(ctx, clientUUID, cents, &rec.ID); err != nil {
		return scan.Result{}, err
	}
	res, err := duplicate(ev)
	if err != nil {
		return scan.Result{}, err
	}
	res.Status = scan.StatusApplied
	if res.Scan != nil {
		res.Scan.PriceCents = &c
	}
	s.publish()
	return res, nil
}

// OfflineData returns the offline data for a Shop (nil = home).
func (s *Service) OfflineData(ctx context.Context, shopID *int64) (OfflineData, error) {
	b, err := s.d.Catalogue.OfflineData(ctx, shopID)
	return OfflineData(b), err
}

func (s *Service) household(ctx context.Context) (stock.Date, int, error) {
	today, err := s.d.Household.Today(ctx)
	if err != nil {
		return stock.None, 0, err
	}
	horizon, err := s.d.Household.HorizonDays(ctx)
	if err != nil {
		return stock.None, 0, err
	}
	return today, horizon, nil
}

// scanDate is the household date a scan was made on, never later than today (a phone clock running ahead).
func (s *Service) scanDate(ctx context.Context, scannedAt string, today stock.Date) (stock.Date, error) {
	t, err := time.Parse(time.RFC3339, scannedAt)
	if err != nil {
		return today, nil
	}
	d, err := s.d.Dates.DateOf(ctx, t)
	if err != nil {
		return stock.None, err
	}
	if d == stock.None || d > today {
		return today, nil
	}
	return d, nil
}

func (s *Service) publish() {
	s.d.Publisher.Publish(shopservice.Topic, map[string]string{"changed": "scan"})
}

func mustGet(ctx context.Context, st *store.Store, uuid string) store.Event {
	ev, _, _ := st.Get(ctx, uuid)
	return ev
}

func copyInt(p *int) *int {
	if p == nil {
		return nil
	}
	v := *p
	return &v
}

func derefInt(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}

func maxf(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func itoa(n int64) string {
	const digits = "0123456789"
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b []byte
	for n > 0 {
		b = append([]byte{digits[n%10]}, b...)
		n /= 10
	}
	if neg {
		b = append([]byte{'-'}, b...)
	}
	return string(b)
}
