// Package service builds the Shopping List from its ports (Planning, Stock, Products, Ingredients, household),
// owns ticks and manual extras, and publishes `shopping` events.
package service

import (
	"context"
	"errors"
	"strings"
	"time"

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
	// ErrNotOnList: Not needed was asked for an Ingredient that has no open Line in the range.
	ErrNotOnList = errors.New("shopping: not on the list")
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

// TakenBack is what Stock took back from a Lot for an Undo of a tick (ADR 0019): Taken is what was taken, Removed
// says the Lot is gone.
type TakenBack struct {
	Taken   float64
	Removed bool
}

// Stock is the projected Stock and the way to add a Lot and to take back what a tick added.
type Stock interface {
	Lots(ctx context.Context) ([]stock.Lot, error)
	AddLot(ctx context.Context, in StockAdd) (lotID int64, created bool, err error)
	// TakeBack takes back what is left of the Lot, up to added. An unknown Lot is a no-op, not an error.
	TakeBack(ctx context.Context, lotID int64, added float64) (TakenBack, error)
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
	// RestockSupplies returns every Supply that has a Restock level (Supply true, RestockLevel set), by id (H4).
	RestockSupplies(ctx context.Context) (map[int64]shopping.IngredientInfo, error)
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

// BoughtRecorder keeps what each purchase was bought for (B5-BO, ADR 0013): the Planned Meals a Stock Lot covered. The
// real adapter writes planned_meal_bought through the plan store; Ports.Bought may be nil (nothing is recorded).
type BoughtRecorder interface {
	// RecordBought stores the shares of the Lot (see shopping.Attribute). It is called only with at least one share.
	RecordBought(ctx context.Context, lotID int64, shares []shopping.Share, at time.Time) error
	// RemoveBought removes every record of the Lot; a Lot with none is not an error.
	RemoveBought(ctx context.Context, lotID int64) error
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
	Bought      BoughtRecorder // optional
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
type Summary struct{ Lines, SpentCents, LotsAdded int }

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
func (s *Service) List(ctx context.Context, q Query) (View, error) {
	today, horizon, err := s.household(ctx)
	if err != nil {
		return View{}, err
	}
	to := shopping.ClampTo(today, horizon, q.To)
	in, err := s.input(ctx, today, to, q.ShopID)
	if err != nil {
		return View{}, err
	}
	list := shopping.Derive(in)
	spent, ledgerLots, err := s.ports.Ledger.Totals(ctx, to)
	if err != nil {
		return View{}, err
	}
	tickLots, err := s.st.LotsAdded(ctx, to)
	if err != nil {
		return View{}, err
	}
	currency, err := s.ports.Household.Currency(ctx)
	if err != nil {
		return View{}, err
	}
	return View{
		List:        list,
		Today:       today,
		HorizonDays: horizon,
		DefaultTo:   shopping.DefaultTo(today, horizon),
		MaxTo:       shopping.LastPlannedDate(today, horizon),
		Currency:    currency,
		Summary:     Summary{Lines: list.Progress.Total, SpentCents: spent, LotsAdded: ledgerLots + tickLots},
	}, nil
}

func (s *Service) household(ctx context.Context) (stock.Date, int, error) {
	today, err := s.ports.Household.Today(ctx)
	if err != nil {
		return stock.None, 0, err
	}
	horizon, err := s.ports.Household.HorizonDays(ctx)
	if err != nil {
		return stock.None, 0, err
	}
	return today, horizon, nil
}

// input gathers everything Derive needs for the range from..to; shopID (nil = any Shop) picks the Packs and Prices.
func (s *Service) input(ctx context.Context, from, to stock.Date, shopID *int64) (shopping.Input, error) {
	if shopID != nil {
		ok, err := s.ports.Products.ShopExists(ctx, *shopID)
		if err != nil {
			return shopping.Input{}, err
		}
		if !ok {
			return shopping.Input{}, ErrUnknownShop
		}
	}
	meals, err := s.ports.Plan.Meals(ctx, from, to)
	if err != nil {
		return shopping.Input{}, err
	}
	lots, err := s.ports.Stock.Lots(ctx)
	if err != nil {
		return shopping.Input{}, err
	}
	extras, err := s.st.Extras(ctx, from)
	if err != nil {
		return shopping.Input{}, err
	}
	ticks, err := s.st.Ticks(ctx, to)
	if err != nil {
		return shopping.Input{}, err
	}
	notNeeded, err := s.st.NotNeeded(ctx, to)
	if err != nil {
		return shopping.Input{}, err
	}
	restock, err := s.ports.Ingredients.RestockSupplies(ctx)
	if err != nil {
		return shopping.Input{}, err
	}
	ids := map[int64]bool{}
	for _, m := range meals {
		needIDs(ids, m.Needs)
	}
	// A Restock Line is a Line of its Supply: its Packs and Prices are looked up like any other (H4).
	for ing := range restock {
		ids[ing] = true
	}
	for _, e := range extras {
		if e.IngredientID != 0 {
			ids[e.IngredientID] = true
		}
	}
	for ing := range ticks {
		ids[ing] = true
	}
	for ing := range notNeeded {
		ids[ing] = true
	}
	idList := make([]int64, 0, len(ids))
	for id := range ids {
		idList = append(idList, id)
	}
	info, err := s.ports.Ingredients.Info(ctx, idList)
	if err != nil {
		return shopping.Input{}, err
	}
	for ing, v := range restock {
		info[ing] = v
	}
	packs, err := s.ports.Products.LastBought(ctx, idList, shopID)
	if err != nil {
		return shopping.Input{}, err
	}
	productIDs := make([]int64, 0, len(packs))
	for _, p := range packs {
		productIDs = append(productIDs, p.ProductID)
	}
	prices, err := s.ports.Products.PackPrices(ctx, productIDs, shopID)
	if err != nil {
		return shopping.Input{}, err
	}
	return shopping.Input{
		Now: s.clk.Now(), From: from, To: to, Meals: meals, Lots: lots, Ingredients: info,
		Packs: packs, PackPrices: prices, Extras: extras, Ticks: ticks, NotNeeded: notNeeded,
	}, nil
}

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
	if in.Quantity < 0 {
		return TickResult{}, ErrInvalid
	}
	info, err := s.ports.Ingredients.Info(ctx, []int64{in.IngredientID})
	if err != nil {
		return TickResult{}, err
	}
	if _, ok := info[in.IngredientID]; !ok {
		return TickResult{}, ErrUnknownIngredient
	}
	today, horizon, err := s.household(ctx)
	if err != nil {
		return TickResult{}, err
	}
	to := shopping.ClampTo(today, horizon, in.To)
	if err := s.purge(ctx, today); err != nil {
		return TickResult{}, err
	}
	needed, err := s.neededFor(ctx, today, to, in.IngredientID, in.ShopID)
	if err != nil {
		return TickResult{}, err
	}
	var res TickResult
	if in.Quantity > 0 {
		id, created, err := s.ports.Stock.AddLot(ctx, StockAdd{IngredientID: in.IngredientID, Quantity: in.Quantity,
			ShopID: in.ShopID, ClientUUID: in.ClientUUID})
		if err != nil {
			return TickResult{}, err
		}
		if err := s.recordTick(ctx, today, to, id, in.ShopID); err != nil {
			return TickResult{}, err
		}
		res.LotID, res.Created = &id, created
	}
	t := shopping.Tick{IngredientID: in.IngredientID, Needed: needed, By: "hand"}
	if res.LotID != nil {
		err = s.st.SetTickLot(ctx, to, t, *res.LotID, in.Quantity)
	} else {
		err = s.st.SetTick(ctx, to, t, nil)
	}
	if err != nil {
		return TickResult{}, err
	}
	s.publish("ticks")
	return res, nil
}

// recordTick records what the Stock Lot a tick by hand added was bought for (B5-BO). It runs again on a retried tick,
// which is harmless: a record is keyed by Planned Meal, Ingredient and Lot.
func (s *Service) recordTick(ctx context.Context, today, to stock.Date, lotID int64, shopID *int64) error {
	if s.ports.Bought == nil {
		return nil
	}
	in, err := s.input(ctx, today, to, shopID)
	if err != nil {
		return err
	}
	shares := shopping.Attribute(in, lotID)
	if len(shares) == 0 {
		return nil
	}
	return s.ports.Bought.RecordBought(ctx, lotID, shares, s.clk.Now())
}

// neededFor is the Line quantity a tick records: the quantity still to buy, or the amount of an existing tick.
func (s *Service) neededFor(ctx context.Context, today, to stock.Date, ingredientID int64, shopID *int64) (float64, error) {
	in, err := s.input(ctx, today, to, shopID)
	if err != nil {
		return 0, err
	}
	if t, ok := in.Ticks[ingredientID]; ok {
		return t.Needed, nil
	}
	line, ok := shopping.Derive(in).LineFor(ingredientID)
	if !ok {
		return 0, nil
	}
	return line.Quantity, nil
}

// Untick removes the tick and takes back the Stock Lot it added: what is left of that Lot, up to what the tick added
// (ADR 0019). A second untick, or an untick with no tick, changes nothing. A tick set by a Scan owns no Lot. If Stock
// fails the tick stays, so the Undo can be tried again. Stock records the take-back with it and takes a Lot back at
// most once, so a retry after a later step failed (the tick row is still there) takes nothing twice.
func (s *Service) Untick(ctx context.Context, ingredientID int64, to stock.Date) error {
	today, horizon, err := s.household(ctx)
	if err != nil {
		return err
	}
	r := shopping.ClampTo(today, horizon, to)
	lotID, added, hasLot, err := s.st.TickLot(ctx, r, ingredientID)
	if err != nil {
		return err
	}
	if hasLot {
		if err := s.takeBack(ctx, lotID, added); err != nil {
			return err
		}
	}
	if err := s.st.DeleteTick(ctx, r, ingredientID); err != nil {
		return err
	}
	s.publish("ticks")
	return nil
}

// takeBack takes back what is left of a Stock Lot a tick added, up to added, and forgets what the Lot was bought for
// once the Lot is gone (ADR 0013: a part-used Lot keeps its records).
func (s *Service) takeBack(ctx context.Context, lotID int64, added float64) error {
	taken, err := s.ports.Stock.TakeBack(ctx, lotID, added)
	if err != nil {
		return err
	}
	if taken.Removed {
		return s.ForgetLot(ctx, lotID)
	}
	return nil
}

// ExtraInput is a manual extra: Text, or IngredientID with Quantity.
type ExtraInput struct {
	Text         string
	IngredientID int64
	Quantity     float64
}

// AddExtra adds a manual extra (ErrInvalid, ErrUnknownIngredient).
func (s *Service) AddExtra(ctx context.Context, in ExtraInput) (shopping.Extra, error) {
	hasText := strings.TrimSpace(in.Text) != ""
	hasIngredient := in.IngredientID != 0
	if hasText == hasIngredient {
		return shopping.Extra{}, ErrInvalid
	}
	var (
		out shopping.Extra
		err error
	)
	if hasText {
		out, err = s.st.AddTextExtra(ctx, in.Text)
	} else {
		if !(in.Quantity > 0) {
			return shopping.Extra{}, ErrInvalid
		}
		info, ierr := s.ports.Ingredients.Info(ctx, []int64{in.IngredientID})
		if ierr != nil {
			return shopping.Extra{}, ierr
		}
		if _, ok := info[in.IngredientID]; !ok {
			return shopping.Extra{}, ErrUnknownIngredient
		}
		out, err = s.st.AddIngredientExtra(ctx, in.IngredientID, in.Quantity)
	}
	if err != nil {
		if errors.Is(err, store.ErrInvalid) {
			return shopping.Extra{}, ErrInvalid
		}
		return shopping.Extra{}, err
	}
	s.publish("extras")
	return out, nil
}

// DeleteExtra removes an extra (ErrNotFound).
func (s *Service) DeleteExtra(ctx context.Context, id int64) error {
	if err := s.st.DeleteExtra(ctx, id); err != nil {
		return mapStoreErr(err)
	}
	s.publish("extras")
	return nil
}

// TickExtra ticks an extra; an Ingredient extra with quantity > 0 also adds a Stock Lot. clientUUID makes a retry
// idempotent: the same UUID adds no second Lot and counts the quantity into the extra's `got` only once.
// (clientUUID is accepted but not used yet: the Developer implements the idempotency.)
func (s *Service) TickExtra(ctx context.Context, id int64, quantity float64, shopID *int64, clientUUID string) (TickResult, error) {
	today, _, err := s.household(ctx)
	if err != nil {
		return TickResult{}, err
	}
	extra, err := s.openExtra(ctx, today, id)
	if err != nil {
		return TickResult{}, err
	}
	var res TickResult
	if extra.IngredientID != 0 && quantity > 0 {
		// The client UUID makes a retried tick find the same Lot (Stock answers created false); only the first
		// answer counts the quantity into the extra's got.
		lot, created, err := s.ports.Stock.AddLot(ctx, StockAdd{IngredientID: extra.IngredientID, Quantity: quantity, ShopID: shopID, ClientUUID: clientUUID})
		if err != nil {
			return TickResult{}, err
		}
		if created {
			if _, err := s.st.AddGot(ctx, id, quantity); err != nil {
				return TickResult{}, mapStoreErr(err)
			}
		}
		res.LotID, res.Created = &lot, created
	}
	if res.LotID != nil {
		err = s.st.TickExtraLot(ctx, id, today, *res.LotID, quantity)
	} else {
		err = s.st.TickExtra(ctx, id, today)
	}
	if err != nil {
		return TickResult{}, mapStoreErr(err)
	}
	s.publish("extras")
	return res, nil
}

// openExtra finds an extra that is open or ticked today (ErrNotFound otherwise).
func (s *Service) openExtra(ctx context.Context, today stock.Date, id int64) (shopping.Extra, error) {
	extras, err := s.st.Extras(ctx, today)
	if err != nil {
		return shopping.Extra{}, err
	}
	for _, e := range extras {
		if e.ID == id {
			return e, nil
		}
	}
	return shopping.Extra{}, ErrNotFound
}

// Extra returns one extra as the list shows it (open, or ticked today); ErrNotFound otherwise.
func (s *Service) Extra(ctx context.Context, id int64) (shopping.ExtraLine, error) {
	today, _, err := s.household(ctx)
	if err != nil {
		return shopping.ExtraLine{}, err
	}
	e, err := s.openExtra(ctx, today, id)
	if err != nil {
		return shopping.ExtraLine{}, err
	}
	line := shopping.ExtraLine{ID: e.ID, Text: e.Text, IngredientID: e.IngredientID, Ticked: e.Ticked}
	if e.IngredientID != 0 {
		info, err := s.ports.Ingredients.Info(ctx, []int64{e.IngredientID})
		if err != nil {
			return shopping.ExtraLine{}, err
		}
		line.Name, line.BaseUnit, line.ImageURL = info[e.IngredientID].Name, info[e.IngredientID].BaseUnit, info[e.IngredientID].ImageURL
		line.Supply = info[e.IngredientID].Supply
		line.Quantity = e.Quantity - e.Got
		if line.Quantity < 0 {
			line.Quantity = 0
		}
	}
	return line, nil
}

// UntickExtra clears an extra's tick and takes back the Stock Lot an Ingredient extra's tick added (ADR 0019): what is
// left of it, up to the quantity the tick added. What was taken back comes off the extra's got, so an untouched Lot
// shows the extra's full quantity again. A second untick changes nothing.
func (s *Service) UntickExtra(ctx context.Context, id int64) error {
	lotID, added, hasLot, err := s.st.ExtraTickLot(ctx, id)
	if err != nil {
		return mapStoreErr(err)
	}
	if !hasLot {
		if err := s.st.UntickExtra(ctx, id); err != nil {
			return mapStoreErr(err)
		}
		s.publish("extras")
		return nil
	}
	// Stock answers a retried take-back with what it took the first time and changes nothing; the got and the tick
	// change together in one statement, so a retry after a failed step takes nothing twice.
	taken, err := s.ports.Stock.TakeBack(ctx, lotID, added)
	if err != nil {
		return err
	}
	if taken.Removed {
		if err := s.ForgetLot(ctx, lotID); err != nil {
			return err
		}
	}
	if err := s.st.UntickExtraTakenBack(ctx, id, taken.Taken); err != nil {
		return mapStoreErr(err)
	}
	s.publish("extras")
	return nil
}

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
	today, _, err := s.household(ctx)
	if err != nil {
		return Effect{}, err
	}
	base, err := s.input(ctx, today, in.To, in.ShopID)
	if err != nil {
		return Effect{}, err
	}
	withLot := base.Lots
	base.Lots = withoutLot(withLot, in.LotID)
	before := shopping.Derive(base)
	base.Lots = withLot
	after := shopping.Derive(base)
	if shares := shopping.Attribute(base, in.LotID); len(shares) > 0 && s.ports.Bought != nil {
		if err := s.ports.Bought.RecordBought(ctx, in.LotID, shares, s.clk.Now()); err != nil {
			return Effect{}, err
		}
	}

	if line, on := before.LineFor(in.IngredientID); on {
		_, ticked := base.Ticks[in.IngredientID]
		rem := 0.0
		afterLine, still := after.LineFor(in.IngredientID)
		if still {
			rem = afterLine.Quantity
		}
		eff := Effect{OnList: true, Remaining: rem}
		if rem <= 1e-9 && !ticked {
			if err := s.st.SetTick(ctx, in.To, shopping.Tick{IngredientID: in.IngredientID, Needed: line.Quantity, By: "scan"}, nil); err != nil {
				return Effect{}, err
			}
			eff.Ticked = true
		}
		return eff, nil
	}
	for _, e := range base.Extras {
		if e.IngredientID != in.IngredientID || e.Ticked {
			continue
		}
		got, err := s.st.AddGot(ctx, e.ID, in.Quantity)
		if err != nil {
			return Effect{}, mapStoreErr(err)
		}
		rem := got.Quantity - got.Got
		if rem < 0 {
			rem = 0
		}
		eff := Effect{OnList: true, Remaining: rem, ExtraID: e.ID}
		if rem <= 1e-9 {
			if err := s.st.TickExtra(ctx, e.ID, today); err != nil {
				return Effect{}, mapStoreErr(err)
			}
			eff.Ticked = true
		}
		return eff, nil
	}
	return Effect{}, nil
}

func withoutLot(lots []stock.Lot, id int64) []stock.Lot {
	out := make([]stock.Lot, 0, len(lots))
	for _, l := range lots {
		if l.ID != id {
			out = append(out, l)
		}
	}
	return out
}

// UndoLotInput reverses an Effect: Unmark removes the tick this scan set; ExtraID gets Quantity taken off `got`.
type UndoLotInput struct {
	IngredientID int64
	To           stock.Date
	Quantity     float64
	Unmark       bool
	ExtraID      int64
	// LotID is the Stock Lot the scan added (B5-BO): the records of what it was bought for are removed with it.
	// 0 = not known: nothing is removed.
	LotID int64
}

// UndoLot reverses AfterLot (the Lot itself is removed by the caller).
func (s *Service) UndoLot(ctx context.Context, in UndoLotInput) error {
	if in.LotID != 0 {
		if err := s.ForgetLot(ctx, in.LotID); err != nil {
			return err
		}
	}
	if in.Unmark {
		if err := s.st.DeleteTick(ctx, in.To, in.IngredientID); err != nil {
			return err
		}
	}
	if in.ExtraID != 0 {
		if _, err := s.st.AddGot(ctx, in.ExtraID, -in.Quantity); err != nil {
			return mapStoreErr(err)
		}
		if in.Unmark {
			if err := s.st.UntickExtra(ctx, in.ExtraID); err != nil && !errors.Is(err, store.ErrNotFound) {
				return err
			}
		}
	}
	return nil
}

// ForgetLot removes the records of what the Stock Lot was bought for (B5-BO). Lot Delete (Stock Lots, plan 2.6) calls
// it, and so does UndoLot through UndoLotInput.LotID; an unknown Lot is not an error.
func (s *Service) ForgetLot(ctx context.Context, lotID int64) error {
	if s.ports.Bought == nil {
		return nil
	}
	return s.ports.Bought.RemoveBought(ctx, lotID)
}

func (s *Service) purge(ctx context.Context, today stock.Date) error {
	return s.st.PurgeBefore(ctx, today)
}

func (s *Service) publish(changed string) {
	s.pub.Publish(Topic, map[string]string{"changed": changed})
}

func mapStoreErr(err error) error {
	if errors.Is(err, store.ErrNotFound) {
		return ErrNotFound
	}
	if errors.Is(err, store.ErrInvalid) {
		return ErrInvalid
	}
	return err
}

// NotNeededInput marks one Ingredient Line Not needed for a range. UserID 0 = none recorded.
type NotNeededInput struct {
	IngredientID int64
	To           stock.Date
	ShopID       *int64
	UserID       int64
}

// SetNotNeeded takes an open Line off the list for the range: no Stock Lot, no purchase (ErrUnknownIngredient,
// ErrNotOnList for an Ingredient without an open Line, ticked Lines included). Idempotent.
func (s *Service) SetNotNeeded(ctx context.Context, in NotNeededInput) error {
	if in.IngredientID <= 0 {
		return ErrInvalid
	}
	info, err := s.ports.Ingredients.Info(ctx, []int64{in.IngredientID})
	if err != nil {
		return err
	}
	if _, ok := info[in.IngredientID]; !ok {
		return ErrUnknownIngredient
	}
	today, horizon, err := s.household(ctx)
	if err != nil {
		return err
	}
	to := shopping.ClampTo(today, horizon, in.To)
	if err := s.purge(ctx, today); err != nil {
		return err
	}
	view, err := s.input(ctx, today, to, in.ShopID)
	if err != nil {
		return err
	}
	if _, marked := view.NotNeeded[in.IngredientID]; marked {
		return nil
	}
	if _, ticked := view.Ticks[in.IngredientID]; ticked {
		return ErrNotOnList
	}
	line, ok := shopping.Derive(view).LineFor(in.IngredientID)
	if !ok {
		return ErrNotOnList
	}
	if err := s.st.SetNotNeeded(ctx, to, shopping.NotNeeded{IngredientID: in.IngredientID, Needed: line.Quantity}, in.UserID); err != nil {
		return err
	}
	s.publish("list")
	return nil
}

// ClearNotNeeded puts the Line back ("Needed after all"); ErrNotFound when it was not Not needed for the range.
func (s *Service) ClearNotNeeded(ctx context.Context, ingredientID int64, to stock.Date) error {
	today, horizon, err := s.household(ctx)
	if err != nil {
		return err
	}
	if err := s.st.DeleteNotNeeded(ctx, shopping.ClampTo(today, horizon, to), ingredientID); err != nil {
		return mapStoreErr(err)
	}
	s.publish("list")
	return nil
}

// needIDs adds the Ingredients of the needs and of the Base recipe needs they make (BR-F: a Made child is a Line of its
// own, so its Ingredient must be named too).
func needIDs(ids map[int64]bool, needs []shopping.Need) {
	for _, n := range needs {
		ids[n.IngredientID] = true
		needIDs(ids, n.Made)
	}
}
