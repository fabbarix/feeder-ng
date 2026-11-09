// Package store persists Shops, Products, Shop Barcodes, Weight Barcode Rules,
// Prices and purchases in SQLite and builds the barcode Catalog.
// See docs/dev/design/t9-products-shops.md.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var (
	ErrNotFound          = errors.New("not found")
	ErrNameTaken         = errors.New("name taken")
	ErrInUse             = errors.New("in use")
	ErrDuplicatePrefix   = errors.New("duplicate prefix")
	ErrUnknownIngredient = errors.New("unknown ingredient")
)

// BarcodeTakenError: the code already belongs to ProductID (global), or is
// already a Shop Barcode of that Shop (ProductID = its Product).
type BarcodeTakenError struct {
	Code      string
	ProductID int64
}

func (e *BarcodeTakenError) Error() string {
	return fmt.Sprintf("barcode already belongs to product %d", e.ProductID)
}

// Shop is a place the Household buys from.
type Shop struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// Rule is a Weight Barcode Rule of a Shop.
type Rule struct {
	barcode.WeightRule
	ShopID int64 `json:"shopId"`
}

// Product summary.
type Product struct {
	ID             int64      `json:"id"`
	Name           string     `json:"name"`
	IngredientID   int64      `json:"ingredientId"`
	IngredientName string     `json:"ingredientName"`
	BaseUnit       units.Base `json:"baseUnit"`
	PackSize       float64    `json:"packSize"`
}

// ShopBarcode as stored.
type ShopBarcode struct {
	ID        int64  `json:"id"`
	ShopID    int64  `json:"shopId"`
	ProductID int64  `json:"productId"`
	Code      string `json:"code,omitempty"`
	RuleID    int64  `json:"ruleId,omitempty"`
	ItemCode  string `json:"itemCode,omitempty"`
}

// Price as served: PricePerKgCents is explicit or derived (PricePerKgDerived).
type Price struct {
	ID                int64  `json:"id"`
	ProductID         int64  `json:"productId"`
	ShopID            int64  `json:"shopId"`
	Date              string `json:"date"`
	PriceCents        *int   `json:"priceCents"`
	PricePerKgCents   *int   `json:"pricePerKgCents"`
	PricePerKgDerived bool   `json:"pricePerKgDerived"`
}

// Detail is a Product with everything attached to it.
type Detail struct {
	Product
	Barcodes     []string      `json:"barcodes"`     // canonical, sorted
	Shops        []Shop        `json:"shops"`        // known to sell it
	ShopBarcodes []ShopBarcode `json:"shopBarcodes"` // plain and weighed, by id
	LatestPrices []Price       `json:"latestPrices"` // one per Shop, by shop name
}

// NewProduct is the atomic create (global barcodes and Shop Barcodes in one go).
type NewProduct struct {
	product.Input
	Barcodes     []string // raw, canonicalised by the store
	ShopBarcodes []NewShopBarcode
}

// NewShopBarcode: plain when Code is set, weighed when RuleID and ItemCode are.
type NewShopBarcode struct {
	ShopID   int64
	Code     string
	RuleID   int64
	ItemCode string
}

// Filter for Products. Zero values do not filter. Barcode is raw and canonicalised.
type Filter struct {
	Query        string // normalised substring of the name
	IngredientID int64
	Barcode      string
}

// Resolved is the outcome of Store.Resolve.
type Resolved struct {
	Resolution barcode.Resolution `json:"resolution"`
	Product    *Product           `json:"product"`
}

// UsageCounter reports how many rows of another feature reference a Product.
type UsageCounter func(ctx context.Context, q Querier, productID int64) (int, error)

// Querier is satisfied by *sql.DB and *sql.Tx.
type Querier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// RegisterUsage registers a UsageCounter (call from init()); a Product with a
// non-zero count cannot be deleted (ErrInUse). Panics on empty or duplicate name.
func RegisterUsage(name string, f UsageCounter) { panic("TODO") }

// Store is the SQLite-backed store.
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

func New(d *sql.DB, clk clock.Clock) *Store { return &Store{db: d, clk: clk} }

// ---- Shops ----

// CreateShop: ErrNameTaken when the normalised name exists; *product.ValidationError.
func (s *Store) CreateShop(ctx context.Context, name string) (Shop, error)           { panic("TODO") }
func (s *Store) RenameShop(ctx context.Context, id int64, name string) (Shop, error) { panic("TODO") }
func (s *Store) Shop(ctx context.Context, id int64) (Shop, error)                    { panic("TODO") }

// Shops is ordered by normalised name.
func (s *Store) Shops(ctx context.Context) ([]Shop, error) { panic("TODO") }

// DeleteShop removes its barcodes, rules and Prices; purchases keep a NULL Shop.
func (s *Store) DeleteShop(ctx context.Context, id int64) error { panic("TODO") }

// ---- Weight Barcode Rules ----

// CreateRule validates with barcode.WeightRule.Validate (error wrapped as
// *product.ValidationError{Field:"rule"}); ErrDuplicatePrefix; ErrNotFound (Shop).
// The ID of the argument is ignored.
func (s *Store) CreateRule(ctx context.Context, shopID int64, r barcode.WeightRule) (Rule, error) {
	panic("TODO")
}

// UpdateRule replaces the rule. ErrInUse when Item.Length changes while weighed
// Shop Barcodes use it; ErrDuplicatePrefix.
func (s *Store) UpdateRule(ctx context.Context, id int64, r barcode.WeightRule) (Rule, error) {
	panic("TODO")
}

// DeleteRule also deletes the weighed Shop Barcodes of the rule.
func (s *Store) DeleteRule(ctx context.Context, id int64) error { panic("TODO") }

// Rules of a Shop, by id. ErrNotFound for an unknown Shop.
func (s *Store) Rules(ctx context.Context, shopID int64) ([]Rule, error) { panic("TODO") }

// ---- Products ----

// CreateProduct validates, canonicalises barcodes, and writes the Product, its
// global barcodes, its Shop Barcodes and the "sold at" links of those Shops in one
// transaction. ErrUnknownIngredient, *BarcodeTakenError, ErrNotFound (a Shop or
// rule), product.ErrInvalidBarcode / ErrInvalidItemCode / ErrInvalid.
func (s *Store) CreateProduct(ctx context.Context, in NewProduct) (Detail, error) { panic("TODO") }

func (s *Store) Product(ctx context.Context, id int64) (Detail, error) { panic("TODO") }

// Products are ordered by name (case-insensitive), then id.
func (s *Store) Products(ctx context.Context, f Filter) ([]Product, error) { panic("TODO") }

// UpdateProduct changes name and/or pack size (nil = keep). The Ingredient is fixed.
func (s *Store) UpdateProduct(ctx context.Context, id int64, name *string, packSize *float64) (Detail, error) {
	panic("TODO")
}

// DeleteProduct: ErrInUse while a purchase exists or a registered UsageCounter > 0.
func (s *Store) DeleteProduct(ctx context.Context, id int64) error { panic("TODO") }

// AddBarcode adds a global barcode (raw, canonicalised). *BarcodeTakenError when
// another Product owns it; adding one the Product already has is a no-op.
func (s *Store) AddBarcode(ctx context.Context, productID int64, raw string) error { panic("TODO") }
func (s *Store) RemoveBarcode(ctx context.Context, productID int64, raw string) error {
	panic("TODO")
}

// SetSoldAt / UnsetSoldAt manage "Shops known to sell it" (idempotent).
func (s *Store) SetSoldAt(ctx context.Context, productID, shopID int64) error   { panic("TODO") }
func (s *Store) UnsetSoldAt(ctx context.Context, productID, shopID int64) error { panic("TODO") }

// ---- Shop Barcodes ----

// AddShopBarcode adds a plain Shop-only code (raw, canonicalised) and marks the Product as sold at the Shop.
func (s *Store) AddShopBarcode(ctx context.Context, shopID, productID int64, raw string) (ShopBarcode, error) {
	panic("TODO")
}

// AddWeighedShopBarcode maps a rule's item code to a Product (product.ValidateItemCode).
func (s *Store) AddWeighedShopBarcode(ctx context.Context, shopID, productID, ruleID int64, itemCode string) (ShopBarcode, error) {
	panic("TODO")
}
func (s *Store) ShopBarcodes(ctx context.Context, shopID int64) ([]ShopBarcode, error) { panic("TODO") }
func (s *Store) DeleteShopBarcode(ctx context.Context, id int64) error                 { panic("TODO") }

// ---- Prices ----

// RecordPrice upserts on (product, shop, date) and marks the Product as sold at the Shop.
func (s *Store) RecordPrice(ctx context.Context, productID int64, in product.PriceInput) (Price, error) {
	panic("TODO")
}

// Prices, newest first (date desc, id desc); shopID nil = all Shops.
func (s *Store) Prices(ctx context.Context, productID int64, shopID *int64) ([]Price, error) {
	panic("TODO")
}

// LatestPrice at the Shop; with a nil shopID, or none at that Shop, the latest at any Shop.
func (s *Store) LatestPrice(ctx context.Context, productID int64, shopID *int64) (Price, bool, error) {
	panic("TODO")
}
func (s *Store) DeletePrice(ctx context.Context, id int64) error { panic("TODO") }

// ---- Purchases and "last bought" ----

// RecordPurchase logs that a Product was bought (shopID nil = at home) and marks it sold at the Shop.
func (s *Store) RecordPurchase(ctx context.Context, productID int64, shopID *int64, date string) (int64, error) {
	panic("TODO")
}
func (s *Store) DeletePurchase(ctx context.Context, id int64) error { panic("TODO") }

// LastBought: see the design note.
func (s *Store) LastBought(ctx context.Context, ingredientID int64, shopID *int64) (Product, bool, error) {
	panic("TODO")
}

// LastBoughtMany answers for many Ingredients at once; Ingredients with no purchase are absent.
func (s *Store) LastBoughtMany(ctx context.Context, ingredientIDs []int64, shopID *int64) (map[int64]Product, error) {
	panic("TODO")
}

// ---- Catalog and resolution ----

// Catalog for a Shop, or for home when shopID is nil (ErrNotFound for an unknown Shop).
func (s *Store) Catalog(ctx context.Context, shopID *int64) (barcode.Catalog, error) { panic("TODO") }

// Resolve parses raw (barcode.Parse with format), builds the Catalog and resolves.
func (s *Store) Resolve(ctx context.Context, raw string, format barcode.Format, shopID *int64) (Resolved, error) {
	panic("TODO")
}
