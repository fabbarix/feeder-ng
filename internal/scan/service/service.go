// Package service applies the phone's Scan operations (functional spec §10): a Shop scan adds a Stock Lot, records
// the Product as sold at the Shop and a purchase, writes the Price, reduces and ticks the matching Shopping List
// line; Undo reverses it; an unknown barcode creates the Product first; Stock-take adjusts Stock. Everything is
// idempotent on the client UUID. It talks to Stock, Products, Ingredients and the Shopping List through ports.
// Stubs until implemented.
package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/store"
	shopservice "github.com/fabbarix/feeder-ng/internal/shopping/service"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Errors.
var (
	ErrNotFound    = errors.New("scan: not found")
	ErrNotUndoable = errors.New("scan: only a Shop scan can be undone")
	ErrProductGone = errors.New("scan: unknown Product")
	errTodo        = errors.New("not implemented")
)

// Rejection codes in scan.ErrInfo.
const (
	CodeValidation     = "validation_failed"
	CodeUnknownProduct = "unknown_product"
	CodeUnknownShop    = "unknown_shop"
	CodeUnknownIngr    = "unknown_ingredient"
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
	Barcodes     []string
	ShopBarcodes []ShopBarcode
}

// BarcodeTakenError is returned by CreateProduct when someone created the barcode first.
type BarcodeTakenError struct{ ProductID int64 }

func (e *BarcodeTakenError) Error() string {
	return fmt.Sprintf("barcode already belongs to product %d", e.ProductID)
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

// BundleProduct is a Product as the phone caches it.
type BundleProduct struct {
	ID             int64   `json:"id"`
	Name           string  `json:"name"`
	IngredientID   int64   `json:"ingredientId"`
	IngredientName string  `json:"ingredientName"`
	BaseUnit       string  `json:"baseUnit"`
	PackSize       float64 `json:"packSize"`
	LastPriceCents *int    `json:"lastPriceCents"`
}

// Bundle is what the phone caches to resolve and describe scans offline.
type Bundle struct {
	ShopID   *int64          `json:"shopId"`
	ShopName string          `json:"shopName"`
	Catalog  barcode.Catalog `json:"catalog"`
	Products []BundleProduct `json:"products"`
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
	LatestPrice(ctx context.Context, productID, shopID int64) (*PriceInfo, error)
	PriceOn(ctx context.Context, productID, shopID int64, date stock.Date) (*PriceInfo, error)
	RecordPrice(ctx context.Context, productID int64, in PriceInput) (PriceInfo, error)
	DeletePrice(ctx context.Context, id int64) error
	Bundle(ctx context.Context, shopID *int64) (Bundle, error)
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

// Service applies operations.
type Service struct{ d Deps }

// New returns a Service.
func New(d Deps) *Service { return &Service{d: d} }

// Apply applies one operation. A bad operation is a Result with status rejected (and no side effects); the
// error is only for infrastructure failures. A repeated client UUID answers status duplicate with the stored result.
func (s *Service) Apply(ctx context.Context, op scan.Op) (scan.Result, error) {
	return scan.Result{}, errTodo
}

// Sync applies the operations in the order given; results are in the same order.
func (s *Service) Sync(ctx context.Context, ops []scan.Op) ([]scan.Result, error) {
	return nil, errTodo
}

// UndoResult says whether this call reversed the scan or it was already undone.
type UndoResult struct{ Undone, AlreadyUndone bool }

// Undo reverses a Shop scan (ErrNotFound, ErrNotUndoable for a stock_take).
func (s *Service) Undo(ctx context.Context, clientUUID string) (UndoResult, error) {
	return UndoResult{}, errTodo
}

// SetPrice edits the Price a scan recorded ("✎"): ErrNotFound, ErrNotUndoable for a stock_take.
func (s *Service) SetPrice(ctx context.Context, clientUUID string, cents int) (scan.Result, error) {
	return scan.Result{}, errTodo
}

// Bundle returns the offline bundle for a Shop (nil = home).
func (s *Service) Bundle(ctx context.Context, shopID *int64) (Bundle, error) {
	return Bundle{}, errTodo
}
