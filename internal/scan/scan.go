// Package scan holds the pure types of the phone's Scan operations (functional spec §10): the flat Op the phone
// queues and sends, its validation, and the Result the server returns. No SQL, HTTP or clock.
// Design: docs/dev/design/t13-shopping-scan.md.
package scan

import (
	"errors"
	"math"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
)

// Kind is the operation kind.
type Kind string

// Operation kinds.
const (
	KindShopScan    Kind = "shop_scan"    // the phone resolved the barcode to a Product
	KindShopUnknown Kind = "shop_unknown" // unknown barcode: create the Product, then as shop_scan
	KindStockTake   Kind = "stock_take"   // at home, no Shop
)

// Action is a Stock-take sheet action.
type Action string

// Stock-take actions.
const (
	PlusPack  Action = "plus_pack"
	MinusPack Action = "minus_pack"
	SetTotal  Action = "set_total"
)

// Scope says whether the new barcode is global or only this Shop's.
type Scope string

// Barcode scopes.
const (
	ScopeGlobal Scope = "global"
	ScopeShop   Scope = "shop"
)

// IngredientRef names an existing Ingredient (ID) or one to find-or-create (Name + BaseUnit g|ml|piece).
type IngredientRef struct {
	ID       int64  `json:"id,omitempty"`
	Name     string `json:"name,omitempty"`
	BaseUnit string `json:"baseUnit,omitempty"`
	// Kind is "food" or "supply" for a new Ingredient (H4); empty means food. An existing Ingredient keeps its own kind.
	Kind string `json:"kind,omitempty"`
}

// Op is one operation from the phone. ClientUUID is the idempotency key; ScannedAt (RFC 3339) the phone's timestamp.
type Op struct {
	ClientUUID string `json:"clientUuid"`
	ScannedAt  string `json:"scannedAt"`
	Kind       Kind   `json:"kind"`
	ShopID     *int64 `json:"shopId,omitempty"`
	// RangeTo is the last date of the Shopping List range the scan counts against (optional; default range when empty).
	RangeTo string `json:"rangeTo,omitempty"`

	// shop_scan and stock_take: the resolved Product. Quantity is the Lot size in Base Units (pack size or decoded weight).
	ProductID       int64   `json:"productId,omitempty"`
	Quantity        float64 `json:"quantity,omitempty"`
	PriceCents      *int    `json:"priceCents,omitempty"`
	PricePerKgCents *int    `json:"pricePerKgCents,omitempty"`
	// Weighed marks a shop_scan whose Quantity was decoded from a weight-valued Weight Barcode (r3-scan-fixes B5):
	// with no PriceCents the server prices it as Quantity x the price per kg (PricePerKgCents, else the latest Price).
	Weighed bool `json:"weighed,omitempty"`

	// shop_unknown: the unknown-barcode form. Either Barcode (canonical), or RuleID + ItemCode for a weighed code.
	Barcode     string         `json:"barcode,omitempty"`
	RuleID      int64          `json:"ruleId,omitempty"`
	ItemCode    string         `json:"itemCode,omitempty"`
	Ingredient  *IngredientRef `json:"ingredient,omitempty"`
	ProductName string         `json:"productName,omitempty"`
	// ProductImage is the Picture of the Product this shop_unknown creates: an image id from /api/images, "" = none (PP).
	// A malformed id is rejected (code "validation", field productImage). An id with no stored file (never uploaded, or swept before a queued scan
	// synced) is dropped and the scan still applies (PPX). When the barcode already belongs to a Product the scan merges into it and the Picture
	// fills it only if it has none (Merged.PictureFilled).
	ProductImage string  `json:"productImage,omitempty"`
	PackSize     float64 `json:"packSize,omitempty"` // Base Units; weighed codes default to Quantity
	Scope        Scope   `json:"scope,omitempty"`

	// stock_take
	Action Action   `json:"action,omitempty"`
	Total  *float64 `json:"total,omitempty"`
}

// ErrInvalid is matched (errors.Is) by every *ValidationError.
var ErrInvalid = errors.New("scan: invalid operation")

// ValidationError names the JSON field that is wrong.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Message }

// Is makes errors.Is(err, ErrInvalid) true.
func (e *ValidationError) Is(target error) bool { return target == ErrInvalid }

// ReservedUUID is the one client UUID refused: PATCH /api/scan/prices is the batch Price route, so a scan with that
// UUID could never be priced alone (the phone sends crypto.randomUUID, the receipt Apply "receipt:<readId>:<n>").
const ReservedUUID = "prices"

// Validate checks the operation without touching any state (rules in the design note).
func (o Op) Validate() error {
	if u := strings.TrimSpace(o.ClientUUID); u == "" || len(o.ClientUUID) > 64 {
		return &ValidationError{Field: "clientUuid", Message: "a client UUID of 1 to 64 characters is required"}
	}
	if o.ClientUUID == ReservedUUID {
		return &ValidationError{Field: "clientUuid", Message: `"prices" is not a client UUID`}
	}
	if _, err := time.Parse(time.RFC3339, o.ScannedAt); err != nil {
		return &ValidationError{Field: "scannedAt", Message: "scannedAt must be an RFC 3339 time"}
	}
	if o.Weighed && o.Kind != KindShopScan {
		return &ValidationError{Field: "weighed", Message: "only a shop scan can be weighed"}
	}
	if img := strings.TrimSpace(o.ProductImage); img != "" {
		if !imaging.ValidID(img) {
			return &ValidationError{Field: "productImage", Message: "the picture is not a valid image"}
		}
		if o.Kind != KindShopUnknown {
			return &ValidationError{Field: "productImage", Message: "only an unknown barcode can carry a picture"}
		}
	}
	switch o.Kind {
	case KindShopScan:
		return o.validateShopScan()
	case KindShopUnknown:
		return o.validateShopUnknown()
	case KindStockTake:
		return o.validateStockTake()
	}
	return &ValidationError{Field: "kind", Message: "kind must be shop_scan, shop_unknown or stock_take"}
}

func (o Op) validateShopScan() error {
	if o.ShopID == nil || *o.ShopID <= 0 {
		return &ValidationError{Field: "shopId", Message: "a Shop is required"}
	}
	if o.ProductID <= 0 {
		return &ValidationError{Field: "productId", Message: "a Product is required"}
	}
	if !positive(o.Quantity) {
		return &ValidationError{Field: "quantity", Message: "the quantity must be more than 0"}
	}
	return o.validatePrices()
}

func (o Op) validatePrices() error {
	if o.PriceCents != nil && *o.PriceCents <= 0 {
		return &ValidationError{Field: "priceCents", Message: "a price must be more than 0"}
	}
	if o.PricePerKgCents != nil && *o.PricePerKgCents <= 0 {
		return &ValidationError{Field: "pricePerKgCents", Message: "a price per kg must be more than 0"}
	}
	if o.RangeTo != "" && !validDate(o.RangeTo) {
		return &ValidationError{Field: "rangeTo", Message: "rangeTo must be a date as YYYY-MM-DD"}
	}
	return nil
}

func (o Op) validateShopUnknown() error {
	if o.ShopID == nil || *o.ShopID <= 0 {
		return &ValidationError{Field: "shopId", Message: "a Shop is required"}
	}
	weighed := o.RuleID != 0 || o.ItemCode != ""
	if weighed {
		return o.validateWeighed()
	}
	if strings.TrimSpace(o.Barcode) == "" {
		return &ValidationError{Field: "barcode", Message: "a barcode is required"}
	}
	if err := o.validateScope(); err != nil {
		return err
	}
	if !positive(o.PackSize) {
		return &ValidationError{Field: "packSize", Message: "the pack size must be more than 0"}
	}
	if !positive(o.Quantity) {
		return &ValidationError{Field: "quantity", Message: "the quantity must be more than 0"}
	}
	if err := o.validateNewProductDetails(); err != nil {
		return err
	}
	return o.validatePrices()
}

func (o Op) validateWeighed() error {
	if o.Barcode != "" {
		return &ValidationError{Field: "barcode", Message: "a barcode and a weight rule cannot both be given"}
	}
	if o.RuleID <= 0 {
		return &ValidationError{Field: "ruleId", Message: "a weight rule is required"}
	}
	if o.ItemCode == "" || !digits(o.ItemCode) {
		return &ValidationError{Field: "itemCode", Message: "the item code must be digits"}
	}
	if o.Scope == ScopeGlobal {
		return &ValidationError{Field: "scope", Message: "a weighed code can only be this Shop's"}
	}
	if !positive(o.Quantity) {
		return &ValidationError{Field: "quantity", Message: "the decoded weight must be more than 0"}
	}
	if err := o.validateNewProductDetails(); err != nil {
		return err
	}
	return o.validatePrices()
}

func (o Op) validateScope() error {
	if o.Scope != ScopeGlobal && o.Scope != ScopeShop {
		return &ValidationError{Field: "scope", Message: "scope must be global or shop"}
	}
	return nil
}

// validateNewProductDetails checks the Ingredient (existing, or new with a Base Unit) and the product name.
func (o Op) validateNewProductDetails() error {
	if o.Ingredient == nil {
		return &ValidationError{Field: "ingredient", Message: "an Ingredient is required"}
	}
	if o.Ingredient.Kind != "" {
		if _, ok := ingredient.ParseKind(o.Ingredient.Kind); !ok {
			return &ValidationError{Field: "ingredient", Message: "the kind must be food or supply"}
		}
	}
	if o.Ingredient.ID <= 0 {
		if strings.TrimSpace(o.Ingredient.Name) == "" {
			return &ValidationError{Field: "ingredient", Message: "an Ingredient needs an id or a name"}
		}
		switch o.Ingredient.BaseUnit {
		case "g", "ml", "piece":
		default:
			return &ValidationError{Field: "ingredient", Message: "a new Ingredient needs a Base Unit of g, ml or piece"}
		}
	}
	if strings.TrimSpace(o.ProductName) == "" {
		return &ValidationError{Field: "productName", Message: "a product name is required"}
	}
	return nil
}

func (o Op) validateStockTake() error {
	if o.ProductID <= 0 {
		return &ValidationError{Field: "productId", Message: "a Product is required"}
	}
	if o.ShopID != nil {
		return &ValidationError{Field: "shopId", Message: "a Stock-take has no Shop"}
	}
	switch o.Action {
	case PlusPack, MinusPack:
	case SetTotal:
		if o.Total == nil || *o.Total < 0 || math.IsNaN(*o.Total) || math.IsInf(*o.Total, 0) {
			return &ValidationError{Field: "total", Message: "the total must be 0 or more"}
		}
	default:
		return &ValidationError{Field: "action", Message: "action must be plus_pack, minus_pack or set_total"}
	}
	return nil
}

func positive(v float64) bool { return v > 0 && !math.IsInf(v, 0) }

func digits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}

func validDate(s string) bool {
	t, err := time.Parse("2006-01-02", s)
	return err == nil && t.Format("2006-01-02") == s
}

// Status of an applied operation.
type Status string

// Result statuses.
const (
	StatusApplied   Status = "applied"
	StatusDuplicate Status = "duplicate" // the client UUID was applied before; nothing changed
	StatusRejected  Status = "rejected"
)

// ErrInfo is the error of a rejected operation.
type ErrInfo struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Merged says the barcode already belonged to another Product (created first), which this scan used.
type Merged struct {
	ProductID   int64  `json:"productId"`
	ProductName string `json:"productName"`
	// PictureFilled (PPX): the Product had no Picture and took the one from this scan's form.
	PictureFilled bool `json:"pictureFilled,omitempty"`
}

// Applied is what an operation did.
type Applied struct {
	IngredientID   int64  `json:"ingredientId"`
	IngredientName string `json:"ingredientName"`
	IngredientKind string `json:"ingredientKind"` // H4: "food" or "supply", the kind of the Ingredient
	BaseUnit       string `json:"baseUnit"`
	ProductID      int64  `json:"productId"`
	ProductName    string `json:"productName"`
	// ProductImageURL is "/api/images/<id>" of the Product's Picture; absent when it has none (PP).
	ProductImageURL string `json:"productImageUrl,omitempty"`
	// IngredientImageURL is the Ingredient's Picture; absent when it has none (PE).
	IngredientImageURL string   `json:"ingredientImageUrl,omitempty"`
	Quantity           float64  `json:"quantity"`
	LotID              *int64   `json:"lotId"`
	PriceCents         *int     `json:"priceCents"`
	OnList             bool     `json:"onList"`
	Remaining          float64  `json:"remaining"`
	Ticked             bool     `json:"ticked"`
	ProductCreated     bool     `json:"productCreated"`
	Merged             *Merged  `json:"merged,omitempty"`
	Total              *float64 `json:"total,omitempty"` // stock_take: the Ingredient's Stock after
}

// Result is the outcome of one operation.
type Result struct {
	ClientUUID string   `json:"clientUuid"`
	Status     Status   `json:"status"`
	Error      *ErrInfo `json:"error,omitempty"`
	Scan       *Applied `json:"scan,omitempty"`
}
