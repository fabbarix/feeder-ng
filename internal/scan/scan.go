// Package scan holds the pure types of the phone's Scan operations (functional spec §10): the flat Op the phone
// queues and sends, its validation, and the Result the server returns. No SQL, HTTP or clock.
// Design: docs/dev/design/t13-shopping-scan.md. Stubs until the Developer implements Validate.
package scan

import "errors"

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

	// shop_unknown: the unknown-barcode form. Either Barcode (canonical), or RuleID + ItemCode for a weighed code.
	Barcode     string         `json:"barcode,omitempty"`
	RuleID      int64          `json:"ruleId,omitempty"`
	ItemCode    string         `json:"itemCode,omitempty"`
	Ingredient  *IngredientRef `json:"ingredient,omitempty"`
	ProductName string         `json:"productName,omitempty"`
	PackSize    float64        `json:"packSize,omitempty"` // Base Units; weighed codes default to Quantity
	Scope       Scope          `json:"scope,omitempty"`

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

// Validate checks the operation without touching any state (rules in the design note).
func (o Op) Validate() error { return nil }

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
}

// Applied is what an operation did.
type Applied struct {
	IngredientID   int64    `json:"ingredientId"`
	IngredientName string   `json:"ingredientName"`
	BaseUnit       string   `json:"baseUnit"`
	ProductID      int64    `json:"productId"`
	ProductName    string   `json:"productName"`
	Quantity       float64  `json:"quantity"`
	LotID          *int64   `json:"lotId"`
	PriceCents     *int     `json:"priceCents"`
	OnList         bool     `json:"onList"`
	Remaining      float64  `json:"remaining"`
	Ticked         bool     `json:"ticked"`
	ProductCreated bool     `json:"productCreated"`
	Merged         *Merged  `json:"merged,omitempty"`
	Total          *float64 `json:"total,omitempty"` // stock_take: the Ingredient's Stock after
}

// Result is the outcome of one operation.
type Result struct {
	ClientUUID string   `json:"clientUuid"`
	Status     Status   `json:"status"`
	Error      *ErrInfo `json:"error,omitempty"`
	Scan       *Applied `json:"scan,omitempty"`
}
