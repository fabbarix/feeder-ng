// Package service builds the Shopping List from its ports (Planning, Stock, Products, Ingredients, household),
// owns ticks and manual extras, and publishes `shopping` events.
package service

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
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

// PricedPack is the priced Product of an Ingredient never bought (SSP-13) and the pack Price that chose it. The
// estimate uses that Price, so a newer per-kg-only Price of the same Product never leaves the Line unestimated.
type PricedPack struct {
	Pack       shopping.Pack
	PriceCents int
	// Date and ShopID (B9-23) are the Price's date and Shop: the Line's pack carries them (shopping.PackPrice).
	Date   stock.Date
	ShopID int64
}

// Products answers "the Product last bought" (at the Shop if one was bought there), the priced Product of an
// Ingredient never bought, and pack prices.
type Products interface {
	LastBought(ctx context.Context, ingredientIDs []int64, shopID *int64) (map[int64]shopping.Pack, error)
	// PricedPacks (SSP-13, decision SSP 5): per Ingredient, the active Product with a pack Price at the Shop, else at
	// any Shop; the most recent Price, ties broken by the lowest price per Base Unit. An Ingredient with none is absent.
	PricedPacks(ctx context.Context, ingredientIDs []int64, shopID *int64) (map[int64]PricedPack, error)
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
	// Adjust (B9-23, SSP-01 Change) sets a Stock Lot's quantity; the real adapter is the stock service's AdjustLot.
	// Optional: without it ChangeTick and ChangeExtraTick are ErrInvalid.
	Adjust Adjuster
	// Users (B9-23, RES-03) gives the names an addition shows ("who", `alsoTickedBy`). Optional: names are "" without it.
	Users Users
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
	if err := s.nameAdditions(ctx, list); err != nil {
		return View{}, err
	}
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
	in, idList, err := s.baseInput(ctx, from, to)
	if err != nil {
		return shopping.Input{}, err
	}
	return s.withPacks(ctx, in, idList, shopID)
}

// baseInput is the Input without Packs or Prices (what Snapshot derives from), and the Ingredients it names.
func (s *Service) baseInput(ctx context.Context, from, to stock.Date) (shopping.Input, []int64, error) {
	meals, err := s.ports.Plan.Meals(ctx, from, to)
	if err != nil {
		return shopping.Input{}, nil, err
	}
	lots, err := s.ports.Stock.Lots(ctx)
	if err != nil {
		return shopping.Input{}, nil, err
	}
	extras, err := s.st.Extras(ctx, from)
	if err != nil {
		return shopping.Input{}, nil, err
	}
	ticks, err := s.st.Ticks(ctx, to)
	if err != nil {
		return shopping.Input{}, nil, err
	}
	notNeeded, err := s.st.NotNeeded(ctx, to)
	if err != nil {
		return shopping.Input{}, nil, err
	}
	restock, err := s.ports.Ingredients.RestockSupplies(ctx)
	if err != nil {
		return shopping.Input{}, nil, err
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
		return shopping.Input{}, nil, err
	}
	for ing, v := range restock {
		info[ing] = v
	}
	return shopping.Input{Now: s.clk.Now(), From: from, To: to, Meals: meals, Lots: lots, Ingredients: info, Extras: extras,
		Ticks: ticks, NotNeeded: notNeeded}, idList, nil
}

// withPacks adds the Packs and Prices for the Ingredients: the Product last bought, else the priced Product (SSP-13).
func (s *Service) withPacks(ctx context.Context, in shopping.Input, idList []int64, shopID *int64) (shopping.Input, error) {
	packs, err := s.ports.Products.LastBought(ctx, idList, shopID)
	if err != nil {
		return shopping.Input{}, err
	}
	// SSP-13: an Ingredient never bought is priced by its priced Product, at the selected Shop else any Shop.
	neverBought := make([]int64, 0, len(idList))
	for _, id := range idList {
		if _, ok := packs[id]; !ok {
			neverBought = append(neverBought, id)
		}
	}
	pricedPacks := map[int64]PricedPack{}
	if len(neverBought) > 0 {
		if pricedPacks, err = s.ports.Products.PricedPacks(ctx, neverBought, shopID); err != nil {
			return shopping.Input{}, err
		}
	}
	productIDs := make([]int64, 0, len(packs))
	for _, p := range packs {
		productIDs = append(productIDs, p.ProductID)
	}
	prices, err := s.ports.Products.PackPrices(ctx, productIDs, shopID)
	if err != nil {
		return shopping.Input{}, err
	}
	// A priced Product is estimated from the pack Price that chose it.
	// The Line's pack carries that Price, so the Line sheet can say which one it was (B9-23).
	priced := make(map[int64]shopping.Pack, len(pricedPacks))
	for ing, pp := range pricedPacks {
		p := pp.Pack
		p.Price = &shopping.PackPrice{Cents: pp.PriceCents, Date: pp.Date, ShopID: pp.ShopID}
		priced[ing] = p
		if prices == nil {
			prices = map[int64]int{}
		}
		prices[pp.Pack.ProductID] = pp.PriceCents
	}
	in.Packs, in.Priced, in.PackPrices = packs, priced, prices
	return in, nil
}

// TickInput ticks one Ingredient by hand: Quantity is "how much?" (>= 0); > 0 adds a Stock Lot.
type TickInput struct {
	IngredientID int64
	To           stock.Date
	ShopID       *int64
	Quantity     float64
	ClientUUID   string
	// B9-23. UserID is who ticked (0 = unknown). Covers is the Line quantity the tick covers (SSP-02's Q0); 0 = what the
	// list shows now: the Line's quantity, or the More of a ticked Line. TickedAt is the phone's time for a queued tick
	// (zero = now); a queued tick (TickedAt set) records synced_at = now. RequireOnList refuses (ErrNotOnList) an
	// Ingredient that is not on the list for the range: no open Line, no ticked Line, not marked Not needed.
	UserID        int64
	Covers        float64
	TickedAt      time.Time
	RequireOnList bool
}

// AlsoTicked is an earlier addition to the Line by another User (RES 2: "ticked twice").
type AlsoTicked struct {
	Name     string
	Quantity float64
	By       string // "hand" | "scan"
}

// TickResult says which Stock Lot a tick added. Added is this tick's quantity. AlsoTickedBy lists the additions other
// Users made to the Line before this one (empty for the first); a retried tick (Created false) answers as the first time.
type TickResult struct {
	LotID        *int64
	Created      bool
	Added        float64
	AlsoTickedBy []AlsoTicked
}

// Tick ticks an Ingredient by hand for the range with one more addition (ADR 0024): Quantity > 0 puts a Stock Lot into
// Stock. A client UUID already recorded answers as the first time and changes nothing (Created false). Errors:
// ErrUnknownIngredient, ErrInvalid for a negative or non-finite amount, ErrNotOnList with RequireOnList.
func (s *Service) Tick(ctx context.Context, in TickInput) (TickResult, error) {
	if !validAmount(in.Quantity) || !validAmount(in.Covers) {
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
	if prev, ok, err := s.st.AdditionByUUID(ctx, in.ClientUUID); err != nil {
		return TickResult{}, err
	} else if ok {
		return s.tickResult(ctx, prev, false)
	}
	view, err := s.input(ctx, today, to, in.ShopID)
	if err != nil {
		return TickResult{}, err
	}
	line, on := shopping.Derive(view).LineFor(in.IngredientID)
	if in.RequireOnList && !on {
		return TickResult{}, ErrNotOnList
	}
	a := shopping.Addition{ClientUUID: in.ClientUUID, UserID: in.UserID, By: "hand", Quantity: in.Quantity,
		Covers: in.Covers, TickedAt: in.TickedAt}
	if a.Covers == 0 && on {
		// What the list shows now: the Line's quantity, or the More of a ticked Line (SSP-02).
		a.Covers = line.Quantity
		if line.Ticked {
			a.Covers = line.More
		}
	}
	if on && line.Ticked && line.More > 0 && line.Tick != nil {
		// A tick of the More row covers the More on top of the tick (SSP-02): with or without Stock, the More goes.
		a.Covers = shopping.CoversOfMore(*line.Tick, a.Covers)
	}
	if !in.TickedAt.IsZero() {
		a.SyncedAt = s.clk.Now()
	}
	if in.Quantity > 0 {
		id, _, err := s.ports.Stock.AddLot(ctx, StockAdd{IngredientID: in.IngredientID, Quantity: in.Quantity,
			ShopID: in.ShopID, ClientUUID: in.ClientUUID})
		if err != nil {
			return TickResult{}, err
		}
		if err := s.recordTick(ctx, today, to, id, in.ShopID); err != nil {
			return TickResult{}, err
		}
		a.LotID = id
	}
	id, ok, err := s.st.AddLineAddition(ctx, to, in.IngredientID, a)
	if err != nil {
		return TickResult{}, err
	}
	if !ok { // a racing request with the same client UUID recorded it first
		prev, _, err := s.st.AdditionByUUID(ctx, in.ClientUUID)
		if err != nil {
			return TickResult{}, err
		}
		return s.tickResult(ctx, prev, false)
	}
	s.publish("ticks")
	return s.tickResult(ctx, store.Addition{ID: id, RangeTo: to, IngredientID: in.IngredientID, Addition: a}, true)
}

// validAmount is a quantity a tick can carry: 0 or more, and finite.
func validAmount(q float64) bool { return q >= 0 && !math.IsInf(q, 0) && !math.IsNaN(q) }

// tickResult answers a tick by its addition: its Stock Lot and quantity, and the additions other Users made to the same
// Line (or extra) before it (RES 2), oldest first.
func (s *Service) tickResult(ctx context.Context, a store.Addition, created bool) (TickResult, error) {
	res := TickResult{Created: created, Added: finite(a.Quantity), AlsoTickedBy: []AlsoTicked{}}
	if a.LotID != 0 {
		lot := a.LotID
		res.LotID = &lot
	}
	var all []store.Addition
	var err error
	if a.ExtraID != 0 {
		all, err = s.st.ExtraAdditions(ctx, a.ExtraID)
	} else {
		all, err = s.st.LineAdditions(ctx, a.RangeTo, a.IngredientID)
	}
	if err != nil {
		return TickResult{}, err
	}
	var before []store.Addition
	ids := []int64{}
	for _, o := range all {
		if o.ID >= a.ID {
			break
		}
		if o.UserID == a.UserID {
			continue
		}
		before = append(before, o)
		ids = append(ids, o.UserID)
	}
	names, err := s.names(ctx, ids)
	if err != nil {
		return TickResult{}, err
	}
	for _, o := range before {
		res.AlsoTickedBy = append(res.AlsoTickedBy, AlsoTicked{Name: names[o.UserID], Quantity: finite(o.Quantity), By: o.By})
	}
	return res, nil
}

// finite is q, or 0 for the unknown quantity (+Inf) of a tick from before migration 1560.
func finite(q float64) float64 {
	if math.IsInf(q, 0) || math.IsNaN(q) {
		return 0
	}
	return q
}

// names resolves User ids to display names; without a Users port every name is "".
func (s *Service) names(ctx context.Context, ids []int64) (map[int64]string, error) {
	if s.ports.Users == nil || len(ids) == 0 {
		return map[int64]string{}, nil
	}
	return s.ports.Users.Names(ctx, ids)
}

// nameAdditions fills Who on every addition of the list's ticks (RES-03: the Line sheet names who ticked).
func (s *Service) nameAdditions(ctx context.Context, list shopping.List) error {
	var all []*shopping.Addition
	for _, l := range list.Lines {
		if l.Tick != nil {
			for i := range l.Tick.Additions {
				all = append(all, &l.Tick.Additions[i])
			}
		}
	}
	for _, e := range list.Extras {
		if e.Tick != nil {
			for i := range e.Tick.Additions {
				all = append(all, &e.Tick.Additions[i])
			}
		}
	}
	ids := make([]int64, 0, len(all))
	for _, a := range all {
		if a.UserID != 0 {
			ids = append(ids, a.UserID)
		}
	}
	names, err := s.names(ctx, ids)
	if err != nil {
		return err
	}
	for _, a := range all {
		a.Who = names[a.UserID]
	}
	return nil
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

// Untick removes the tick with all its additions and takes back the Stock Lot of every addition by hand: what is left of
// it, up to what the addition added (ADR 0019, 0024). A Scan's Stock Lot stays (it is undone from the Scanned list). A
// second untick, or an untick with no tick, changes nothing. If Stock fails the tick stays, so the Undo can be tried
// again; Stock takes a Lot back at most once, so a retry takes nothing twice.
func (s *Service) Untick(ctx context.Context, ingredientID int64, to stock.Date) error {
	today, horizon, err := s.household(ctx)
	if err != nil {
		return err
	}
	r := shopping.ClampTo(today, horizon, to)
	adds, err := s.st.LineAdditions(ctx, r, ingredientID)
	if err != nil {
		return err
	}
	for _, a := range adds {
		if a.By == "hand" && a.LotID != 0 {
			if err := s.takeBack(ctx, a.LotID, a.Quantity); err != nil {
				return err
			}
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
	_, err := s.takeBackTaken(ctx, lotID, added)
	return err
}

// takeBackTaken is takeBack that says how much Stock took back.
func (s *Service) takeBackTaken(ctx context.Context, lotID int64, added float64) (float64, error) {
	taken, err := s.ports.Stock.TakeBack(ctx, lotID, added)
	if err != nil {
		return 0, err
	}
	if taken.Removed {
		if err := s.ForgetLot(ctx, lotID); err != nil {
			return 0, err
		}
	}
	return taken.Taken, nil
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

// TickExtra ticks an extra; an Ingredient extra with quantity > 0 also adds a Stock Lot, as one more addition of the
// extra (ADR 0024). clientUUID makes a retry idempotent: a UUID already recorded answers as the first time (Created
// false), adds no second Lot and counts the quantity into the extra's `got` only once. The User is the signed-in one.
func (s *Service) TickExtra(ctx context.Context, id int64, quantity float64, shopID *int64, clientUUID string) (TickResult, error) {
	return s.TickExtraAt(ctx, ExtraTickInput{ID: id, Quantity: quantity, ShopID: shopID, ClientUUID: clientUUID})
}

// ExtraTickInput is a tick of an extra. TickedAt is the phone's time of a queued tick (RES-03 shop_tick; zero = now): the
// addition keeps it and records synced_at = now, as a queued tick of a Line does, so the extras keep their offline order.
type ExtraTickInput struct {
	ID         int64
	Quantity   float64
	ShopID     *int64
	ClientUUID string
	TickedAt   time.Time
}

// TickExtraAt is TickExtra with the time of a queued tick.
func (s *Service) TickExtraAt(ctx context.Context, in ExtraTickInput) (TickResult, error) {
	id, quantity, shopID, clientUUID := in.ID, in.Quantity, in.ShopID, in.ClientUUID
	if !validAmount(quantity) {
		return TickResult{}, ErrInvalid
	}
	today, _, err := s.household(ctx)
	if err != nil {
		return TickResult{}, err
	}
	extra, err := s.openExtra(ctx, today, id)
	if err != nil {
		return TickResult{}, err
	}
	if prev, ok, err := s.st.AdditionByUUID(ctx, clientUUID); err != nil {
		return TickResult{}, err
	} else if ok {
		return s.tickResult(ctx, prev, false)
	}
	if extra.IngredientID == 0 { // a text extra: ticked, nothing added, no addition
		if err := s.st.TickExtra(ctx, id, today); err != nil {
			return TickResult{}, mapStoreErr(err)
		}
		s.publish("extras")
		return TickResult{Created: true, AlsoTickedBy: []AlsoTicked{}}, nil
	}
	u, _ := auth.UserFrom(ctx)
	a := shopping.Addition{ClientUUID: clientUUID, UserID: u.ID, By: "hand", Quantity: quantity, Covers: math.Max(0, extra.Quantity-extra.Got),
		TickedAt: in.TickedAt}
	if !in.TickedAt.IsZero() {
		a.SyncedAt = s.clk.Now()
	}
	if quantity > 0 {
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
		a.LotID = lot
	}
	addID, ok, err := s.st.AddExtraAddition(ctx, id, today, a)
	if err != nil {
		return TickResult{}, mapStoreErr(err)
	}
	if !ok {
		prev, _, err := s.st.AdditionByUUID(ctx, clientUUID)
		if err != nil {
			return TickResult{}, err
		}
		return s.tickResult(ctx, prev, false)
	}
	s.publish("extras")
	return s.tickResult(ctx, store.Addition{ID: addID, ExtraID: id, Addition: a}, true)
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
	line := shopping.ExtraLine{ID: e.ID, Text: e.Text, IngredientID: e.IngredientID, Ticked: e.Ticked, Tick: shopping.ExtraTick(e)}
	if err := s.nameAdditions(ctx, shopping.List{Extras: []shopping.ExtraLine{line}}); err != nil {
		return shopping.ExtraLine{}, err
	}
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

// UntickExtra clears an extra's tick and takes back the Stock Lot of each of its additions by hand (ADR 0019, 0024): what
// is left of it, up to the quantity it added. What was taken back comes off the extra's got, so an untouched Lot shows
// the extra's full quantity again. A second untick changes nothing.
func (s *Service) UntickExtra(ctx context.Context, id int64) error {
	adds, err := s.st.ExtraAdditions(ctx, id)
	if err != nil {
		return err
	}
	// Stock answers a retried take-back with what it took the first time and changes nothing; the got and the tick
	// change together in one transaction, so a retry after a failed step takes nothing twice.
	taken := 0.0
	for _, a := range adds {
		if a.By != "hand" || a.LotID == 0 {
			continue
		}
		t, err := s.takeBackTaken(ctx, a.LotID, a.Quantity)
		if err != nil {
			return err
		}
		taken += t
	}
	if err := s.st.UntickExtraTakenBack(ctx, id, taken); err != nil {
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
	// B9-23: when this Lot ticks the Line, the tick is an addition by "scan" with this client UUID and User (0 = unknown).
	ClientUUID string
	UserID     int64
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
			// The Scan's tick is an addition by scan with its Stock Lot (ADR 0024): Change and Take back leave it alone.
			a := shopping.Addition{ClientUUID: in.ClientUUID, UserID: in.UserID, By: "scan", LotID: in.LotID, Quantity: in.Quantity,
				Covers: line.Quantity}
			_, ok, err := s.st.AddLineAddition(ctx, in.To, in.IngredientID, a)
			if err == nil && !ok { // the UUID belongs to a tick by hand: keep the Scan's addition without it
				a.ClientUUID = ""
				_, _, err = s.st.AddLineAddition(ctx, in.To, in.IngredientID, a)
			}
			if err != nil {
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
	if in.Unmark && in.ExtraID == 0 {
		if err := s.unmarkScan(ctx, in.To, in.IngredientID, in.LotID); err != nil {
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

// unmarkScan removes the tick a Scan's Stock Lot set: its addition by scan, and the tick with it when no other addition
// is left. A Scan's tick from before beta.9 (no addition) goes whole, unless a tick by hand was added to it since: that
// tick, with its Stock Lot, stays (it is unticked from the Shop, which takes its Lot back).
func (s *Service) unmarkScan(ctx context.Context, to stock.Date, ingredientID, lotID int64) error {
	adds, err := s.st.LineAdditions(ctx, to, ingredientID)
	if err != nil {
		return err
	}
	if lotID != 0 {
		for _, a := range adds {
			if a.By == "scan" && a.LotID == lotID {
				_, err := s.st.DeleteAddition(ctx, a.ID)
				return err
			}
		}
	}
	for _, a := range adds {
		if a.By == "hand" {
			return nil
		}
	}
	return s.st.DeleteTick(ctx, to, ingredientID)
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
// ErrNotOnList for an Ingredient without an open Line, or a ticked Line with no More). Idempotent.
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
	line, ok := shopping.Derive(view).LineFor(in.IngredientID)
	if !ok {
		return ErrNotOnList
	}
	needed := line.Quantity
	// A ticked Line can only be Not needed on its More (SSP-02): the mark takes that amount off and the tick stays.
	if line.Ticked {
		if line.More <= 0 {
			return ErrNotOnList
		}
		needed = line.More
	}
	if err := s.st.SetNotNeeded(ctx, to, shopping.NotNeeded{IngredientID: in.IngredientID, Needed: needed}, in.UserID); err != nil {
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
