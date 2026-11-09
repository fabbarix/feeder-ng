package service_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/service"
	"github.com/fabbarix/feeder-ng/internal/shopping/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
)

// Household clock: Monday 2026-11-09 12:00 UTC; the household date is 2026-11-09.
var startTime = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

type fakePlan struct {
	meals []shopping.Meal
	calls [][2]stock.Date
}

func (f *fakePlan) Meals(_ context.Context, from, to stock.Date) ([]shopping.Meal, error) {
	f.calls = append(f.calls, [2]stock.Date{from, to})
	return f.meals, nil
}

type fakeStock struct {
	lots    []stock.Lot
	adds    []service.StockAdd
	seen    map[string]int64
	nextLot int64
}

func (f *fakeStock) Lots(context.Context) ([]stock.Lot, error) { return f.lots, nil }
func (f *fakeStock) AddLot(_ context.Context, in service.StockAdd) (int64, bool, error) {
	if f.seen == nil {
		f.seen = map[string]int64{}
	}
	if in.ClientUUID != "" {
		if id, ok := f.seen[in.ClientUUID]; ok {
			return id, false, nil
		}
	}
	f.nextLot++
	f.adds = append(f.adds, in)
	if in.ClientUUID != "" {
		f.seen[in.ClientUUID] = f.nextLot
	}
	f.lots = append(f.lots, stock.Lot{ID: f.nextLot, IngredientID: in.IngredientID, Quantity: in.Quantity, Purchased: "2026-11-09"})
	return f.nextLot, true, nil
}

type fakeProducts struct {
	packs                     map[int64]shopping.Pack
	prices                    map[int64]int
	shops                     map[int64]bool
	lastBoughtShop, priceShop []*int64
}

func (f *fakeProducts) LastBought(_ context.Context, _ []int64, shop *int64) (map[int64]shopping.Pack, error) {
	f.lastBoughtShop = append(f.lastBoughtShop, shop)
	return f.packs, nil
}
func (f *fakeProducts) PackPrices(_ context.Context, _ []int64, shop *int64) (map[int64]int, error) {
	f.priceShop = append(f.priceShop, shop)
	return f.prices, nil
}
func (f *fakeProducts) ShopExists(_ context.Context, id int64) (bool, error) { return f.shops[id], nil }

type fakeIngredients map[int64]shopping.IngredientInfo

func (f fakeIngredients) Info(_ context.Context, ids []int64) (map[int64]shopping.IngredientInfo, error) {
	out := map[int64]shopping.IngredientInfo{}
	for _, id := range ids {
		if v, ok := f[id]; ok {
			out[id] = v
		}
	}
	return out, nil
}

type fakeHousehold struct {
	today    stock.Date
	horizon  int
	currency string
}

func (f fakeHousehold) Today(context.Context) (stock.Date, error) { return f.today, nil }
func (f fakeHousehold) HorizonDays(context.Context) (int, error)  { return f.horizon, nil }
func (f fakeHousehold) Currency(context.Context) (string, error)  { return f.currency, nil }

type fakeLedger struct{ spent, lots int }

func (f fakeLedger) Totals(context.Context, stock.Date) (int, int, error) {
	return f.spent, f.lots, nil
}

type bus struct {
	mu     sync.Mutex
	events []busEvent
}
type busEvent struct {
	Topic string
	Data  any
}

func (b *bus) Publish(topic string, data any) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.events = append(b.events, busEvent{topic, data})
}
func (b *bus) count(topic string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := 0
	for _, e := range b.events {
		if e.Topic == topic {
			n++
		}
	}
	return n
}

const (
	milk    = "milk"
	passata = "passata"
)

type env struct {
	svc      *service.Service
	st       *store.Store
	plan     *fakePlan
	stock    *fakeStock
	products *fakeProducts
	ledger   *fakeLedger
	bus      *bus
	ids      map[string]int64
}

func newEnv(t *testing.T) *env {
	t.Helper()
	db := stocktest.NewDB(t)
	clk := clock.NewFake(startTime)
	e := &env{
		st:       store.New(db, clk),
		plan:     &fakePlan{},
		stock:    &fakeStock{},
		products: &fakeProducts{shops: map[int64]bool{1: true, 2: true}},
		ledger:   &fakeLedger{},
		bus:      &bus{},
		ids: map[string]int64{
			milk:    stocktest.SeedIngredient(t, db, "milk", "ml", nil),
			passata: stocktest.SeedIngredient(t, db, "Passata", "g", nil),
		},
	}
	ing := fakeIngredients{
		e.ids[milk]:    {Name: "milk", BaseUnit: "ml"},
		e.ids[passata]: {Name: "Passata", BaseUnit: "g"},
	}
	e.svc = service.New(e.st, service.Ports{
		Plan: e.plan, Stock: e.stock, Products: e.products, Ingredients: ing,
		Household: fakeHousehold{today: "2026-11-09", horizon: 7, currency: "USD"}, Ledger: e.ledger,
	}, clk, e.bus)
	return e
}

func dinner(date string, batches float64, needs ...shopping.Need) shopping.Meal {
	at, _ := time.Parse("2006-01-02 15:04", date+" 19:00")
	return shopping.Meal{Date: stock.Date(date), At: at, Batches: batches, Needs: needs}
}
