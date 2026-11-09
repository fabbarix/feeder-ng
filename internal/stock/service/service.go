// Package service orchestrates Stock: it loads and saves Stock Lots through the
// store, applies the pure rules of package stock, and publishes `stock` events.
// Ingredients and "today" come in through small interfaces so the service does
// not depend on the Ingredient or household modules.
package service

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

var (
	// ErrUnknownIngredient is returned (by Ingredients and the service) for an Ingredient that does not exist.
	ErrUnknownIngredient = errors.New("unknown ingredient")
	// ErrNotSpoiled is returned by ThrowOut and Keep for a lot that has not gone off.
	ErrNotSpoiled = errors.New("stock lot has not gone off")
	// ErrInvalid wraps every input validation failure (errors.Is); the message names the field.
	ErrInvalid = errors.New("invalid stock input")
)

// IngredientInfo is what Stock needs to know about an Ingredient.
type IngredientInfo struct {
	ID            int64
	Name          string
	BaseUnit      string // g, ml or piece
	ShelfLifeDays *int
}

// Ingredients looks Ingredients up (adapter over the Ingredient store).
type Ingredients interface {
	// Ingredient returns ErrUnknownIngredient for an unknown id.
	Ingredient(ctx context.Context, id int64) (IngredientInfo, error)
}

// Today returns today's date in household time.
type Today func(ctx context.Context) (stock.Date, error)

// Publisher is satisfied by *events.Bus.
type Publisher interface{ Publish(topic string, data any) }

// Service is the Stock use-case layer.
type Service struct {
	st    *store.Store
	ing   Ingredients
	today Today
	pub   Publisher
}

// New returns a Service.
func New(st *store.Store, ing Ingredients, today Today, pub Publisher) *Service {
	return &Service{st: st, ing: ing, today: today, pub: pub}
}

// AddInput is a manual add or a scan. Purchased defaults to today; Source to manual.
type AddInput struct {
	IngredientID int64
	Quantity     float64 // Base Units, > 0
	Purchased    stock.Date
	Source       store.Source // manual or scan
	ProductID    *int64
	ShopID       *int64
	ClientUUID   string
}

// LotView is a Stock Lot with the Ingredient facts the screens need.
type LotView struct {
	store.StoredLot
	IngredientName string
	BaseUnit       string
	Spoiled        bool // GoesOff before today
	UseSoon        bool // GoesOff within stock.UseSoonDays
}

// IngredientStock is one Ingredient's Stock: the total and its soonest go-off date.
type IngredientStock struct {
	IngredientID int64
	Name         string
	BaseUnit     string
	Total        float64
	LotCount     int
	NextGoesOff  stock.Date // soonest go-off among its lots, None if no lot has one
	UseSoon      bool
	SpoiledCount int
}

// Warning says Stock could not cover a Cooked meal's need for an Ingredient.
type Warning struct {
	IngredientID int64
	Name         string
	BaseUnit     string
	Have         float64 // Stock before the deduction
	Need         float64
	Shortfall    float64
	Message      string // stock.ShortfallMessage
}

// AddLot adds a Stock Lot. created is false when ClientUUID repeats an earlier scan.
func (s *Service) AddLot(ctx context.Context, in AddInput) (LotView, bool, error) {
	panic("TODO")
}

// SetTotal is a Stock-take: it makes the Ingredient's Stock equal total (Base Units).
func (s *Service) SetTotal(ctx context.Context, ingredientID int64, total float64) (IngredientStock, error) {
	panic("TODO")
}

// Totals lists every Ingredient with Stock, those with spoiled or use-soon lots
// first, then by name.
func (s *Service) Totals(ctx context.Context) ([]IngredientStock, error) { panic("TODO") }

// Lots lists the lots of one Ingredient (0 = all).
func (s *Service) Lots(ctx context.Context, ingredientID int64) ([]LotView, error) {
	panic("TODO")
}

// Spoiled lists the lots past their go-off date ("Throw out or keep?").
func (s *Service) Spoiled(ctx context.Context) ([]LotView, error) { panic("TODO") }

// ThrowOut removes a spoiled lot and records the waste (reason spoiled, dated today).
func (s *Service) ThrowOut(ctx context.Context, lotID int64) (store.WasteRecord, error) {
	panic("TODO")
}

// Keep pushes a spoiled lot's go-off date out by 1 day from its existing go-off date.
func (s *Service) Keep(ctx context.Context, lotID int64) (LotView, error) { panic("TODO") }

// DeductForCooked takes needs (Base Units) out of Stock when a Planned Meal is
// Cooked. It never blocks: Stock floors at 0, unknown Ingredients and
// non-positive needs are skipped, and each uncovered need yields a Warning.
func (s *Service) DeductForCooked(ctx context.Context, needs []stock.Need) ([]Warning, error) {
	panic("TODO")
}

// Projected returns the current lots per Ingredient in consumption order.
func (s *Service) Projected(ctx context.Context) (stock.ProjectedStock, error) { panic("TODO") }

// RecordWaste records waste directly (Planning: discarded Leftovers, reason leftover_expired).
func (s *Service) RecordWaste(ctx context.Context, in store.WasteRecord) (store.WasteRecord, error) {
	panic("TODO")
}

// Waste lists waste records with a date in [from, to] (empty bound = open).
func (s *Service) Waste(ctx context.Context, from, to stock.Date) ([]store.WasteRecord, error) {
	panic("TODO")
}
