package service_test

import (
	"context"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
	"github.com/fabbarix/feeder-ng/internal/scan/store"
	shopservice "github.com/fabbarix/feeder-ng/internal/shopping/service"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/stocktest"
)

var startTime = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

type fakeStock struct {
	lots    map[int64]service.StockAdd
	order   []int64
	byUUID  map[string]int64
	totals  map[int64]float64
	removed []int64
	sets    []float64
	next    int64
}

func newFakeStock() *fakeStock {
	return &fakeStock{lots: map[int64]service.StockAdd{}, byUUID: map[string]int64{}, totals: map[int64]float64{}}
}

func (f *fakeStock) AddLot(_ context.Context, in service.StockAdd) (int64, bool, error) {
	if id, ok := f.byUUID[in.ClientUUID]; ok && in.ClientUUID != "" {
		return id, false, nil
	}
	f.next++
	f.lots[f.next] = in
	f.order = append(f.order, f.next)
	f.byUUID[in.ClientUUID] = f.next
	f.totals[in.IngredientID] += in.Quantity
	return f.next, true, nil
}
func (f *fakeStock) RemoveLot(_ context.Context, id int64) error {
	if l, ok := f.lots[id]; ok {
		f.totals[l.IngredientID] -= l.Quantity
		delete(f.lots, id)
		f.removed = append(f.removed, id)
	}
	return nil
}
func (f *fakeStock) Total(_ context.Context, ing int64) (float64, error) { return f.totals[ing], nil }
func (f *fakeStock) SetTotal(_ context.Context, ing int64, total float64) error {
	f.totals[ing] = total
	f.sets = append(f.sets, total)
	return nil
}
func (f *fakeStock) lotCount() int { return len(f.lots) }

type fakeCatalogue struct {
	shops     map[int64]bool
	products  map[int64]service.ProductInfo
	owners    map[string]int64 // barcode (or "rule:item") -> product id
	created   []service.NewProduct
	soldAt    map[[2]int64]bool
	purchases map[int64]bool
	purchased []stock.Date
	prices    []*service.PriceInfo // live Prices
	priceProd map[int64]int64
	priceShop map[int64]int64
	nextID    int64
	recorded  []service.PriceInput
	deleted   []int64
}

func newFakeCatalogue() *fakeCatalogue {
	return &fakeCatalogue{
		shops:     map[int64]bool{1: true},
		products:  map[int64]service.ProductInfo{},
		owners:    map[string]int64{},
		soldAt:    map[[2]int64]bool{},
		purchases: map[int64]bool{},
		priceProd: map[int64]int64{},
		priceShop: map[int64]int64{},
		nextID:    100,
	}
}

func (f *fakeCatalogue) ShopExists(_ context.Context, id int64) (bool, error) {
	return f.shops[id], nil
}
func (f *fakeCatalogue) Product(_ context.Context, id int64) (service.ProductInfo, error) {
	p, ok := f.products[id]
	if !ok {
		return service.ProductInfo{}, service.ErrProductGone
	}
	return p, nil
}
func (f *fakeCatalogue) CreateProduct(_ context.Context, in service.NewProduct) (service.ProductInfo, error) {
	keys := append([]string(nil), in.Barcodes...)
	for _, sb := range in.ShopBarcodes {
		if sb.Code != "" {
			keys = append(keys, sb.Code)
		} else {
			keys = append(keys, "rule:"+itoa(sb.RuleID)+":"+sb.ItemCode)
		}
	}
	for _, k := range keys {
		if owner, ok := f.owners[k]; ok {
			return service.ProductInfo{}, &service.BarcodeTakenError{ProductID: owner}
		}
	}
	f.nextID++
	f.created = append(f.created, in)
	p := service.ProductInfo{ID: f.nextID, Name: in.Name, IngredientID: in.IngredientID, IngredientName: "ingredient " + itoa(in.IngredientID), BaseUnit: "g", PackSize: in.PackSize}
	f.products[p.ID] = p
	for _, k := range keys {
		f.owners[k] = p.ID
	}
	return p, nil
}
func (f *fakeCatalogue) SoldAt(_ context.Context, p, s int64) (bool, error) {
	return f.soldAt[[2]int64{p, s}], nil
}
func (f *fakeCatalogue) SetSoldAt(_ context.Context, p, s int64) error {
	f.soldAt[[2]int64{p, s}] = true
	return nil
}
func (f *fakeCatalogue) UnsetSoldAt(_ context.Context, p, s int64) error {
	delete(f.soldAt, [2]int64{p, s})
	return nil
}
func (f *fakeCatalogue) RecordPurchase(_ context.Context, _ int64, _ *int64, date stock.Date) (int64, error) {
	f.nextID++
	f.purchases[f.nextID] = true
	f.purchased = append(f.purchased, date)
	return f.nextID, nil
}
func (f *fakeCatalogue) DeletePurchase(_ context.Context, id int64) error {
	delete(f.purchases, id)
	return nil
}
func (f *fakeCatalogue) latest(p, s int64) *service.PriceInfo {
	var best *service.PriceInfo
	for _, pr := range f.prices {
		if f.priceProd[pr.ID] == p && f.priceShop[pr.ID] == s && (best == nil || pr.Date > best.Date || (pr.Date == best.Date && pr.ID > best.ID)) {
			best = pr
		}
	}
	return best
}
func (f *fakeCatalogue) LatestPrice(_ context.Context, p, s int64) (*service.PriceInfo, error) {
	return f.latest(p, s), nil
}
func (f *fakeCatalogue) PriceOn(_ context.Context, p, s int64, d stock.Date) (*service.PriceInfo, error) {
	for _, pr := range f.prices {
		if f.priceProd[pr.ID] == p && f.priceShop[pr.ID] == s && pr.Date == d {
			return pr, nil
		}
	}
	return nil, nil
}
func (f *fakeCatalogue) RecordPrice(_ context.Context, p int64, in service.PriceInput) (service.PriceInfo, error) {
	f.recorded = append(f.recorded, in)
	for _, pr := range f.prices { // the same day is replaced in place
		if f.priceProd[pr.ID] == p && f.priceShop[pr.ID] == in.ShopID && pr.Date == in.Date {
			pr.PriceCents, pr.PricePerKgCents = in.PriceCents, in.PricePerKgCents
			return *pr, nil
		}
	}
	f.nextID++
	pr := &service.PriceInfo{ID: f.nextID, Date: in.Date, PriceCents: in.PriceCents, PricePerKgCents: in.PricePerKgCents}
	f.prices = append(f.prices, pr)
	f.priceProd[pr.ID], f.priceShop[pr.ID] = p, in.ShopID
	return *pr, nil
}
func (f *fakeCatalogue) DeletePrice(_ context.Context, id int64) error {
	f.deleted = append(f.deleted, id)
	for i, pr := range f.prices {
		if pr.ID == id {
			f.prices = append(f.prices[:i], f.prices[i+1:]...)
			return nil
		}
	}
	return nil
}
func (f *fakeCatalogue) OfflineData(_ context.Context, shop *int64) (service.OfflineData, error) {
	return service.OfflineData{ShopID: shop, ShopName: "Coop"}, nil
}

func (f *fakeCatalogue) addProduct(id int64, name string, ing int64, ingName string, size float64) {
	f.products[id] = service.ProductInfo{ID: id, Name: name, IngredientID: ing, IngredientName: ingName, BaseUnit: "g", PackSize: size}
}
func (f *fakeCatalogue) seedPrice(product, shop int64, date stock.Date, cents int) {
	f.nextID++
	pr := &service.PriceInfo{ID: f.nextID, Date: date, PriceCents: &cents}
	f.prices = append(f.prices, pr)
	f.priceProd[pr.ID], f.priceShop[pr.ID] = product, shop
}

type fakeIngredients struct {
	byName map[string]int64
	calls  []string
	next   int64
}

func (f *fakeIngredients) Ensure(_ context.Context, name, _ string) (int64, error) {
	f.calls = append(f.calls, name)
	if id, ok := f.byName[name]; ok {
		return id, nil
	}
	f.next++
	id := 900 + f.next
	if f.byName == nil {
		f.byName = map[string]int64{}
	}
	f.byName[name] = id
	return id, nil
}

// fakeList keeps "remaining to buy" per Ingredient like the real Shopping List does.
type fakeList struct {
	remaining map[int64]float64
	ticked    map[int64]bool
	after     []shopservice.AfterLotInput
	undo      []shopservice.UndoLotInput
}

func (f *fakeList) AfterLot(_ context.Context, in shopservice.AfterLotInput) (shopservice.Effect, error) {
	f.after = append(f.after, in)
	rem, on := f.remaining[in.IngredientID]
	if !on {
		return shopservice.Effect{}, nil
	}
	rem -= in.Quantity
	if rem < 0 {
		rem = 0
	}
	f.remaining[in.IngredientID] = rem
	eff := shopservice.Effect{OnList: true, Remaining: rem}
	if rem <= 0 && !f.ticked[in.IngredientID] {
		f.ticked[in.IngredientID] = true
		eff.Ticked = true
	}
	return eff, nil
}
func (f *fakeList) UndoLot(_ context.Context, in shopservice.UndoLotInput) error {
	f.undo = append(f.undo, in)
	if _, on := f.remaining[in.IngredientID]; on {
		f.remaining[in.IngredientID] += in.Quantity
	}
	if in.Unmark {
		delete(f.ticked, in.IngredientID)
	}
	return nil
}

type household struct{}

func (household) Today(context.Context) (stock.Date, error) { return "2026-11-09", nil }
func (household) HorizonDays(context.Context) (int, error)  { return 7, nil }
func (household) Currency(context.Context) (string, error)  { return "USD", nil }

type utcDates struct{}

func (utcDates) DateOf(_ context.Context, t time.Time) (stock.Date, error) {
	return stock.Date(t.UTC().Format("2006-01-02")), nil
}

type bus struct {
	mu     sync.Mutex
	topics []string
}

func (b *bus) Publish(topic string, _ any) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.topics = append(b.topics, topic)
}
func (b *bus) count(topic string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := 0
	for _, x := range b.topics {
		if x == topic {
			n++
		}
	}
	return n
}

type env struct {
	svc    *service.Service
	ledger *store.Store
	stock  *fakeStock
	cat    *fakeCatalogue
	ing    *fakeIngredients
	list   *fakeList
	bus    *bus
}

const (
	passataIng = int64(2)
	milkIng    = int64(3)
	mutti      = int64(7)
	milkProd   = int64(8)
)

func newEnv(t *testing.T) *env {
	t.Helper()
	clk := clock.NewFake(startTime)
	e := &env{
		ledger: store.New(stocktest.NewDB(t), clk),
		stock:  newFakeStock(),
		cat:    newFakeCatalogue(),
		ing:    &fakeIngredients{},
		list:   &fakeList{remaining: map[int64]float64{passataIng: 1400}, ticked: map[int64]bool{}},
		bus:    &bus{},
	}
	e.cat.addProduct(mutti, "Mutti passata 700 g", passataIng, "Passata", 700)
	e.cat.addProduct(milkProd, "Milk 1 l", milkIng, "milk", 1000)
	e.svc = service.New(service.Deps{Ledger: e.ledger, Stock: e.stock, Catalogue: e.cat, Ingredients: e.ing, List: e.list,
		Household: household{}, Dates: utcDates{}, Clock: clk, Publisher: e.bus})
	return e
}

func i64(v int64) *int64    { return &v }
func ip(v int) *int         { return &v }
func fp(v float64) *float64 { return &v }
func itoa(n int64) string   { return strconv.FormatInt(n, 10) }

func packScan(uuid string, product int64, qty float64) scan.Op {
	return scan.Op{ClientUUID: uuid, ScannedAt: "2026-11-09T12:00:00Z", Kind: scan.KindShopScan, ShopID: i64(1), ProductID: product, Quantity: qty, RangeTo: "2026-11-15"}
}
