// Package service builds the Shopping List from its ports (Planning, Stock, Products, Ingredients, household),
// owns ticks and manual extras, and publishes `shopping` events. Stubs until implemented.
package service

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Topic is the live-update topic; data is {"changed":"list|ticks|extras|scan"}.
const Topic = "shopping"

// Errors.
var (
	ErrUnknownIngredient = errors.New("shopping: unknown Ingredient")
	ErrUnknownShop       = errors.New("shopping: unknown Shop")
	ErrNotFound          = errors.New("shopping: not found")
	ErrInvalid           = errors.New("shopping: invalid")
	errTodo              = errors.New("not implemented")
)

// StockAdd asks Stock for a new Stock Lot (source manual for a tick by hand; the scan service has its own port).
type StockAdd struct {
	IngredientID int64
	Quantity     float64
	ShopID       *int64
	ClientUUID   string
}

// Plan returns the uncooked, non-skipped Planned Meals dated from..to (inclusive), with each Recipe's Needs per Batch in Base Units.
type Plan interface {
	Meals(ctx context.Context, from, to stock.Date) ([]shopping.Meal, error)
}

// Stock is the projected Stock and the way to add a Lot.
type Stock interface {
	Lots(ctx context.Context) ([]stock.Lot, error)
	AddLot(ctx context.Context, in StockAdd) (lotID int64, created bool, err error)
}

// Products answers "the Product last bought" (at the Shop if one was bought there) and pack prices.
type Products interface {
	LastBought(ctx context.Context, ingredientIDs []int64, shopID *int64) (map[int64]shopping.Pack, error)
	// PackPrices: cents per pack, from the latest Price at the Shop, else at any Shop; a Product with no pack Price is absent.
	PackPrices(ctx context.Context, productIDs []int64, shopID *int64) (map[int64]int, error)
	ShopExists(ctx context.Context, id int64) (bool, error)
}

// Ingredients resolves names and Base Units; an unknown id is absent from the map.
type Ingredients interface {
	Info(ctx context.Context, ids []int64) (map[int64]shopping.IngredientInfo, error)
}

// Household supplies the household date, the Planning Horizon and the currency.
type Household interface {
	Today(ctx context.Context) (stock.Date, error)
	HorizonDays(ctx context.Context) (int, error)
	Currency(ctx context.Context) (string, error)
}

// Ledger is the scan ledger's totals for one range (implemented by scan/store).
type Ledger interface {
	Totals(ctx context.Context, rangeTo stock.Date) (spentCents, lots int, err error)
}

// Publisher is *events.Bus.
type Publisher interface{ Publish(topic string, data any) }

// Ports groups the collaborators.
type Ports struct {
	Plan        Plan
	Stock       Stock
	Products    Products
	Ingredients Ingredients
	Household   Household
	Ledger      Ledger
}

// Service is the Shopping List use-case layer.
type Service struct {
	st    *store.Store
	ports Ports
	clk   clock.Clock
	pub   Publisher
}

// New returns a Service.
func New(st *store.Store, ports Ports, clk clock.Clock, pub Publisher) *Service {
	return &Service{st: st, ports: ports, clk: clk, pub: pub}
}

// Query selects a list: the Shop whose last-bought Products and Prices are preferred, and the last date (clamped).
type Query struct {
	ShopID *int64
	To     stock.Date
}

// Summary feeds the "Shopping list complete" celebration.
type Summary struct{ Items, SpentCents, LotsAdded int }

// View is a derived list plus what the SPA needs around it.
type View struct {
	shopping.List
	Today       stock.Date
	HorizonDays int
	DefaultTo   stock.Date
	MaxTo       stock.Date
	Currency    string
	Summary     Summary
}

// List derives the Shopping List now (ErrUnknownShop for a Shop that does not exist).
func (s *Service) List(ctx context.Context, q Query) (View, error) { return View{}, errTodo }

// TickInput ticks one Ingredient by hand: Quantity is "how much?" (>= 0); > 0 adds a Stock Lot.
type TickInput struct {
	IngredientID int64
	To           stock.Date
	ShopID       *int64
	Quantity     float64
	ClientUUID   string
}

// TickResult says which Stock Lot a tick added.
type TickResult struct {
	LotID   *int64
	Created bool
}

// Tick ticks an Ingredient by hand for the range (ErrUnknownIngredient, ErrInvalid for a negative quantity).
func (s *Service) Tick(ctx context.Context, in TickInput) (TickResult, error) {
	return TickResult{}, errTodo
}

// Untick removes the tick (the Lot it added stays).
func (s *Service) Untick(ctx context.Context, ingredientID int64, to stock.Date) error {
	return errTodo
}

// ExtraInput is a manual extra: Text, or IngredientID with Quantity.
type ExtraInput struct {
	Text         string
	IngredientID int64
	Quantity     float64
}

// AddExtra adds a manual extra (ErrInvalid, ErrUnknownIngredient).
func (s *Service) AddExtra(ctx context.Context, in ExtraInput) (shopping.Extra, error) {
	return shopping.Extra{}, errTodo
}

// DeleteExtra removes an extra (ErrNotFound).
func (s *Service) DeleteExtra(ctx context.Context, id int64) error { return errTodo }

// TickExtra ticks an extra; an Ingredient extra with quantity > 0 also adds a Stock Lot.
func (s *Service) TickExtra(ctx context.Context, id int64, quantity float64, shopID *int64) (TickResult, error) {
	return TickResult{}, errTodo
}

// UntickExtra clears an extra's tick.
func (s *Service) UntickExtra(ctx context.Context, id int64) error { return errTodo }

// AfterLotInput describes a Stock Lot that a scan just added (it is already in Stock).
type AfterLotInput struct {
	IngredientID int64
	To           stock.Date
	ShopID       *int64
	LotID        int64
	Quantity     float64
}

// Effect is what a scanned Lot did to the list.
type Effect struct {
	OnList    bool    // the Ingredient was on the list (a Line, a tick, or an open Ingredient extra) before the Lot
	Remaining float64 // still to buy after the Lot (0 when covered)
	Ticked    bool    // this Lot ticked it (remaining <= 0 and it was not ticked already)
	ExtraID   int64   // the Ingredient extra it counted against, if no plan Line matched
}

// AfterLot reduces the matching Line (or open Ingredient extra) and ticks it at remaining <= 0.
func (s *Service) AfterLot(ctx context.Context, in AfterLotInput) (Effect, error) {
	return Effect{}, errTodo
}

// UndoLotInput reverses an Effect: Unmark removes the tick this scan set; ExtraID gets Quantity taken off `got`.
type UndoLotInput struct {
	IngredientID int64
	To           stock.Date
	Quantity     float64
	Unmark       bool
	ExtraID      int64
}

// UndoLot reverses AfterLot (the Lot itself is removed by the caller).
func (s *Service) UndoLot(ctx context.Context, in UndoLotInput) error { return errTodo }
