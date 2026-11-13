package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/course"
	coursestore "github.com/fabbarix/feeder-ng/internal/course/store"
	household "github.com/fabbarix/feeder-ng/internal/household"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/images"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	planstore "github.com/fabbarix/feeder-ng/internal/plan/store"
	productstore "github.com/fabbarix/feeder-ng/internal/product/store"
	scanstore "github.com/fabbarix/feeder-ng/internal/scan/store"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/service"
	"github.com/fabbarix/feeder-ng/internal/shopping/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
	stockservice "github.com/fabbarix/feeder-ng/internal/stock/service"
	stockstore "github.com/fabbarix/feeder-ng/internal/stock/store"
)

// This file holds the real adapters of the Shopping List's ports (Planning, Stock, Products, Ingredients,
// household). The Scan module reuses the household, Stock and Shopping List constructors below.

// Household answers the household's date, Planning Horizon, currency and time zone.
type Household struct {
	hh  *householdstore.Store
	clk clock.Clock
}

// NewHousehold returns the household port.
func NewHousehold(d app.Deps) *Household {
	return &Household{hh: householdstore.New(d.DB, d.Clock), clk: d.Clock}
}

func (h *Household) location(ctx context.Context) (*time.Location, household.Settings, error) {
	s, err := h.hh.Settings(ctx)
	if err != nil {
		return nil, household.Settings{}, err
	}
	loc := time.UTC
	if s.TimeZone != "" {
		if l, err := time.LoadLocation(s.TimeZone); err == nil {
			loc = l
		}
	}
	return loc, s, nil
}

// Today is the household's calendar date now.
func (h *Household) Today(ctx context.Context) (stock.Date, error) {
	loc, _, err := h.location(ctx)
	if err != nil {
		return stock.None, err
	}
	return stock.Date(h.clk.Now().In(loc).Format("2006-01-02")), nil
}

// HorizonDays is the Planning Horizon in days.
func (h *Household) HorizonDays(ctx context.Context) (int, error) {
	_, s, err := h.location(ctx)
	return s.PlanningHorizonDays, err
}

// Currency is the household currency (ISO code).
func (h *Household) Currency(ctx context.Context) (string, error) {
	_, s, err := h.location(ctx)
	return s.Currency, err
}

// DateOf is the household date of an instant.
func (h *Household) DateOf(ctx context.Context, t time.Time) (stock.Date, error) {
	loc, _, err := h.location(ctx)
	if err != nil {
		return stock.None, err
	}
	return stock.Date(t.In(loc).Format("2006-01-02")), nil
}

// NewStock returns the Stock service (T10) the Shopping List and the Scan module add Lots through.
func NewStock(d app.Deps) *stockservice.Service {
	hh := NewHousehold(d)
	return stockservice.New(stockstore.New(d.DB, d.Clock), stockIngredients{st: ingredientstore.New(d.DB, d.Clock)}, hh.Today, d.Events)
}

type stockIngredients struct{ st *ingredientstore.Store }

func (l stockIngredients) Ingredient(ctx context.Context, id int64) (stockservice.IngredientInfo, error) {
	ing, err := l.st.Get(ctx, id)
	if errors.Is(err, ingredientstore.ErrNotFound) {
		return stockservice.IngredientInfo{}, stockservice.ErrUnknownIngredient
	}
	if err != nil {
		return stockservice.IngredientInfo{}, err
	}
	return stockservice.IngredientInfo{ID: ing.ID, Name: ing.Name, BaseUnit: string(ing.Base), ShelfLifeDays: ing.ShelfLifeDays, FrozenShelfLifeDays: ing.FrozenShelfLifeDays}, nil
}

// NewService builds the Shopping List service over the real adapters. The Scan module shares it.
func NewService(d app.Deps) *service.Service {
	hh := NewHousehold(d)
	stockSvc := NewStock(d)
	return service.New(store.New(d.DB, d.Clock), service.Ports{
		Plan:        plans{st: planstore.New(d.DB, d.Clock), hh: householdstore.New(d.DB, d.Clock), sources: runner.NewDBSources(d.DB, d.Clock, slog.Default()), courses: coursestore.New(d.DB, d.Clock)},
		Stock:       stockPort{svc: stockSvc, st: stockstore.New(d.DB, d.Clock)},
		Products:    products{st: productstore.New(d.DB, d.Clock)},
		Ingredients: ingredients{st: ingredientstore.New(d.DB, d.Clock)},
		Household:   hh,
		Ledger:      scanstore.New(d.DB, d.Clock),
		Bought:      boughts{st: planstore.New(d.DB, d.Clock)},
	}, d.Clock, d.Events)
}

// boughts keeps what each purchase was bought for in planned_meal_bought, through the plan store (B5-BO, ADR 0013).
type boughts struct{ st *planstore.Store }

// RecordBought stores one record per share: the Planned Meal, the Ingredient and the Lot.
func (b boughts) RecordBought(ctx context.Context, lotID int64, shares []shopping.Share, at time.Time) error {
	recs := make([]plan.BoughtRecord, 0, len(shares))
	for _, sh := range shares {
		recs = append(recs, plan.BoughtRecord{MealID: sh.MealID, IngredientID: sh.IngredientID, LotID: lotID,
			Quantity: sh.Quantity, At: at})
	}
	return b.st.AddBought(ctx, recs)
}

// RemoveBought removes the records of the Lot.
func (b boughts) RemoveBought(ctx context.Context, lotID int64) error {
	_, err := b.st.RemoveBoughtForLot(ctx, lotID)
	return err
}

// plans lists the uncooked, non-skipped Planned Meals fresh from a Leftover, with the Needs of one Batch.
type plans struct {
	st      *planstore.Store
	hh      *householdstore.Store
	sources *runner.DBSources
	courses *coursestore.Store
}

func (p plans) Meals(ctx context.Context, _, to stock.Date) ([]shopping.Meal, error) {
	_, loc, err := p.sources.Settings(ctx)
	if err != nil {
		return nil, err
	}
	// Every planned meal up to To, including those dated before From: a meal from before the range waiting in
	// To confirm still counts (see shopping.Derive). The range's start is not a filter here.
	list, err := p.st.Meals(ctx, "", string(to))
	if err != nil {
		return nil, err
	}
	recipes, err := p.sources.Recipes(ctx)
	if err != nil {
		return nil, err
	}
	byID := map[int64][]shopping.Need{}
	for _, r := range recipes {
		needs := make([]shopping.Need, 0, len(r.Needs))
		for _, n := range r.Needs {
			needs = append(needs, shopping.Need{IngredientID: int64(n.IngredientID), Quantity: n.Quantity, Optional: n.Optional})
		}
		byID[int64(r.ID)] = needs
	}
	slots := map[int64]household.MealSlot{}
	courseNames := map[int64]string{}
	out := []shopping.Meal{}
	for _, m := range list {
		if m.State != plan.StatePlanned || !m.Fresh() {
			continue
		}
		if _, ok := courseNames[m.Key.CourseID]; !ok && m.Key.CourseID != 0 {
			c, err := p.courses.Get(ctx, m.Key.CourseID)
			if err != nil && !errors.Is(err, course.ErrNotFound) {
				return nil, err
			}
			courseNames[m.Key.CourseID] = c.Name
		}
		slot, ok := slots[m.Key.MealSlotID]
		if !ok {
			slot, err = p.hh.Slot(ctx, m.Key.MealSlotID)
			if err != nil {
				return nil, err
			}
			slots[m.Key.MealSlotID] = slot
		}
		// The slot's effective time on the date: the date's own time when it has one (ADR 0014).
		day, err := p.hh.SlotDate(ctx, m.Key.MealSlotID, m.Key.Date)
		if err != nil {
			return nil, err
		}
		at, err := time.ParseInLocation("2006-01-02 15:04", m.Key.Date+" "+household.EffectiveTime(slot.Time, day), loc)
		if err != nil {
			return nil, err
		}
		out = append(out, shopping.Meal{Date: stock.Date(m.Key.Date), At: at, Batches: m.Batches, Needs: byID[m.RecipeID],
			MealID: m.ID, SlotID: m.Key.MealSlotID, SlotName: slot.Name, CourseName: courseNames[m.Key.CourseID]})
	}
	return out, nil
}

// stockPort adds Lots through Stock (source manual, or the scan source for a tick by hand) and lists them.
type stockPort struct {
	svc *stockservice.Service
	st  *stockstore.Store
}

func (p stockPort) Lots(ctx context.Context) ([]stock.Lot, error) {
	rows, err := p.st.Lots(ctx, 0)
	if err != nil {
		return nil, err
	}
	out := make([]stock.Lot, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.Lot)
	}
	return out, nil
}

func (p stockPort) AddLot(ctx context.Context, in service.StockAdd) (int64, bool, error) {
	v, created, err := p.svc.AddLot(ctx, stockservice.AddInput{IngredientID: in.IngredientID, Quantity: in.Quantity,
		Source: stockstore.SourceManual, ShopID: in.ShopID, ClientUUID: in.ClientUUID})
	if err != nil {
		return 0, false, err
	}
	return v.ID, created, nil
}

// products answers last-bought Products, pack prices and Shop existence (T9).
type products struct{ st *productstore.Store }

func (p products) LastBought(ctx context.Context, ids []int64, shopID *int64) (map[int64]shopping.Pack, error) {
	got, err := p.st.LastBoughtMany(ctx, ids, shopID)
	if err != nil {
		return nil, err
	}
	out := map[int64]shopping.Pack{}
	for ing, pr := range got {
		out[ing] = shopping.Pack{ProductID: pr.ID, Name: pr.Name, Size: pr.PackSize}
	}
	return out, nil
}

func (p products) PackPrices(ctx context.Context, productIDs []int64, shopID *int64) (map[int64]int, error) {
	out := map[int64]int{}
	for _, id := range productIDs {
		pr, ok, err := p.st.LatestPrice(ctx, id, shopID)
		if err != nil {
			return nil, err
		}
		if ok && pr.PriceCents != nil {
			out[id] = *pr.PriceCents
		}
	}
	return out, nil
}

func (p products) ShopExists(ctx context.Context, id int64) (bool, error) {
	_, err := p.st.Shop(ctx, id)
	if errors.Is(err, productstore.ErrNotFound) {
		return false, nil
	}
	return err == nil, err
}

// ingredients names Ingredients for the list (T2); an unknown id is left out.
type ingredients struct{ st *ingredientstore.Store }

func (i ingredients) Info(ctx context.Context, ids []int64) (map[int64]shopping.IngredientInfo, error) {
	out := map[int64]shopping.IngredientInfo{}
	for _, id := range ids {
		ing, err := i.st.Get(ctx, id)
		if errors.Is(err, ingredientstore.ErrNotFound) {
			continue
		}
		if err != nil {
			return nil, err
		}
		out[id] = shopping.IngredientInfo{Name: ing.Name, BaseUnit: string(ing.Base), ImageURL: images.URL(ing.Image)}
	}
	return out, nil
}

// Compile-time checks that the adapters satisfy the ports.
var (
	_ service.Plan           = plans{}
	_ service.Stock          = stockPort{}
	_ service.Products       = products{}
	_ service.Ingredients    = ingredients{}
	_ service.Household      = (*Household)(nil)
	_ service.Ledger         = (*scanstore.Store)(nil)
	_ service.BoughtRecorder = boughts{}
)
