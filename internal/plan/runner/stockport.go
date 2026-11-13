package runner

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/household"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/planner"
	"github.com/fabbarix/feeder-ng/internal/stock"
	stockservice "github.com/fabbarix/feeder-ng/internal/stock/service"
	stockstore "github.com/fabbarix/feeder-ng/internal/stock/store"
)

// StockService is the Stock adapter over T10's service: the projection, the Cooked deduction, the waste of discarded
// Leftovers. It implements StockPort and TxWaster.
type StockService struct {
	svc *stockservice.Service
	ing *ingredientstore.Store
}

// NewStockService builds the Stock service planning uses (the same service and store as the Stock feature, over the
// same database; the household time zone decides "today").
func NewStockService(db *sql.DB, clk clock.Clock, bus *events.Bus) *StockService {
	ing := ingredientstore.New(db, clk)
	hh := householdstore.New(db, clk)
	svc := stockservice.New(stockstore.New(db, clk), ingredientLookup{ing}, householdToday(hh, clk), bus)
	return &StockService{svc: svc, ing: ing}
}

// ingredientLookup adapts the Ingredient store to the Stock service.
type ingredientLookup struct{ st *ingredientstore.Store }

func (l ingredientLookup) Ingredient(ctx context.Context, id int64) (stockservice.IngredientInfo, error) {
	ing, err := l.st.Get(ctx, id)
	if err == ingredientstore.ErrNotFound {
		return stockservice.IngredientInfo{}, stockservice.ErrUnknownIngredient
	}
	if err != nil {
		return stockservice.IngredientInfo{}, err
	}
	// Supply as in the other adapters (H4): Cooked never draws a Supply, but every view and any Lot this service writes
	// then follows the same go-off guard and kind.
	return stockservice.IngredientInfo{ID: ing.ID, Name: ing.Name, BaseUnit: string(ing.Base), ShelfLifeDays: ing.ShelfLifeDays,
		FrozenShelfLifeDays: ing.FrozenShelfLifeDays, Supply: ing.IsSupply()}, nil
}

// householdToday returns today's date in the household zone.
func householdToday(hh *householdstore.Store, clk clock.Clock) stockservice.Today {
	return func(ctx context.Context) (stock.Date, error) {
		hs, err := hh.Settings(ctx)
		if err != nil {
			return stock.None, err
		}
		loc, _ := householdLocation(hs)
		return stock.Date(clk.Now().In(loc).Format("2006-01-02")), nil
	}
}

func householdLocation(hs household.Settings) (*time.Location, error) {
	if hs.TimeZone == "" {
		return time.UTC, nil
	}
	if l, err := time.LoadLocation(hs.TimeZone); err == nil {
		return l, nil
	}
	return time.UTC, nil
}

// Lots implements StockPort: the projection inside the write's transaction when the context carries one.
func (a *StockService) Lots(ctx context.Context) ([]planner.StockLot, map[planner.IngredientID]int, error) {
	var proj stock.ProjectedStock
	var err error
	if tx := txFrom(ctx); tx != nil {
		proj, err = a.svc.ProjectedTx(ctx, tx)
	} else {
		proj, err = a.svc.Projected(ctx)
	}
	if err != nil {
		return nil, nil, err
	}
	ids := make([]int64, 0, len(proj))
	for id := range proj {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	var lots []planner.StockLot
	for _, id := range ids {
		for _, l := range proj[id] {
			lots = append(lots, planner.StockLot{ID: l.ID, IngredientID: planner.IngredientID(l.IngredientID),
				Quantity: l.Quantity, Purchased: planner.Date(l.Purchased), GoesOff: planner.Date(l.GoesOff)})
		}
	}
	all, err := a.ing.List(ctx)
	if err != nil {
		return nil, nil, err
	}
	shelf := map[planner.IngredientID]int{}
	for _, ing := range all {
		if ing.ShelfLifeDays != nil {
			shelf[planner.IngredientID(ing.ID)] = *ing.ShelfLifeDays
		}
	}
	return lots, shelf, nil
}

// DeductCookedTx implements StockPort: the deduction inside tx; nothing is published here.
func (a *StockService) DeductCookedTx(ctx context.Context, tx *sql.Tx, needs []Need) (Deduction, error) {
	sn := make([]stock.Need, 0, len(needs))
	for _, n := range needs {
		sn = append(sn, stock.Need{IngredientID: n.IngredientID, Quantity: n.Quantity})
	}
	d, err := a.svc.DeductForCookedTx(ctx, tx, sn)
	if err != nil {
		return Deduction{}, err
	}
	warnings := make([]Warning, 0, len(d.Warnings))
	for _, w := range d.Warnings {
		warnings = append(warnings, Warning{IngredientID: w.IngredientID, Name: w.Name, BaseUnit: w.BaseUnit,
			Have: w.Have, Need: w.Need, Shortfall: w.Shortfall, Message: w.Message})
	}
	return Deduction{Warnings: warnings, Handle: d}, nil
}

// DeductCookedPickedTx implements PickedDeducter: the Used from deduction for the meals (Course order), inside tx.
// The stock service's refusals become ErrUsedFromInvalid.
func (a *StockService) DeductCookedPickedTx(ctx context.Context, tx *sql.Tx, meals []CookedMeal) (Deduction, error) {
	sm := make([]stockservice.CookedMeal, 0, len(meals))
	for _, m := range meals {
		cm := stockservice.CookedMeal{Needs: make([]stock.Need, 0, len(m.Needs))}
		for _, n := range m.Needs {
			cm.Needs = append(cm.Needs, stock.Need{IngredientID: n.IngredientID, Quantity: n.Quantity})
		}
		for _, u := range m.UsedFrom {
			ip := stockservice.IngredientPicks{IngredientID: u.IngredientID, Picks: make([]stock.Pick, 0, len(u.Picks))}
			for _, p := range u.Picks {
				ip.Picks = append(ip.Picks, stock.Pick{LotID: p.LotID, Quantity: p.Quantity})
			}
			cm.UsedFrom = append(cm.UsedFrom, ip)
		}
		sm = append(sm, cm)
	}
	d, err := a.svc.DeductForCookedPickedTx(ctx, tx, sm)
	if errors.Is(err, stockservice.ErrUsedFromInvalid) {
		return Deduction{}, fmt.Errorf("%w: %w", ErrUsedFromInvalid, err)
	}
	if err != nil {
		return Deduction{}, err
	}
	warnings := make([]Warning, 0, len(d.Warnings))
	for _, w := range d.Warnings {
		warnings = append(warnings, Warning{IngredientID: w.IngredientID, Name: w.Name, BaseUnit: w.BaseUnit,
			Have: w.Have, Need: w.Need, Shortfall: w.Shortfall, Message: w.Message})
	}
	return Deduction{Warnings: warnings, Handle: d.Deduction}, nil
}

// PreviewCooked implements CookPreviewer: the Lots of each need in default order, read-only.
func (a *StockService) PreviewCooked(ctx context.Context, needs []Need) ([]NeedPreview, error) {
	sn := make([]stock.Need, 0, len(needs))
	for _, n := range needs {
		sn = append(sn, stock.Need{IngredientID: n.IngredientID, Quantity: n.Quantity})
	}
	ps, err := a.svc.PreviewCooked(ctx, sn)
	if err != nil {
		return nil, err
	}
	out := make([]NeedPreview, 0, len(ps))
	for _, p := range ps {
		np := NeedPreview{IngredientID: p.IngredientID, BaseUnit: p.BaseUnit, Lots: make([]PreviewLot, 0, len(p.Lots))}
		for _, l := range p.Lots {
			np.Lots = append(np.Lots, PreviewLot{ID: l.ID, Quantity: l.Quantity, Purchased: string(l.Purchased),
				GoesOff: string(l.GoesOff), StoragePlaceName: l.StoragePlaceName})
		}
		out = append(out, np)
	}
	return out, nil
}

// PublishDeduction implements StockPort: the `stock` event, after the commit.
func (a *StockService) PublishDeduction(d Deduction) {
	if sd, ok := d.Handle.(stockservice.Deduction); ok {
		a.svc.PublishDeduction(sd)
	}
}

// RecordLeftoverWaste implements StockPort (after the commit; used only without TxWaster).
func (a *StockService) RecordLeftoverWaste(ctx context.Context, w LeftoverWaste) error {
	_, err := a.svc.RecordWaste(ctx, stockstore.WasteRecord{Quantity: w.Portions,
		Reason: stockstore.ReasonLeftoverDiscarded, WastedOn: stock.Date(w.On)})
	return err
}

// RecordLeftoverWasteTx implements TxWaster: the waste row inside the discard transaction.
func (a *StockService) RecordLeftoverWasteTx(ctx context.Context, tx *sql.Tx, w LeftoverWaste) error {
	_, err := a.svc.RecordWasteTx(ctx, tx, stockstore.WasteRecord{Quantity: w.Portions,
		Reason: stockstore.ReasonLeftoverDiscarded, WastedOn: stock.Date(w.On)})
	return err
}
