package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

// ErrUsedFromInvalid is returned (errors.Is; it also satisfies errors.Is(err, ErrInvalid)) when a Used from pick names
// an unknown Lot, a Lot of another Ingredient, an Ingredient not among the meal's needs, a non-positive quantity, or more
// than the Lot holds (summed across all meals of one DeductForCookedPickedTx call). The httpapi maps it to 422 used_from_invalid.
var ErrUsedFromInvalid = fmt.Errorf("%w: Used from", ErrInvalid)

// IngredientPicks are the Used from picks for one Ingredient of one Planned Meal.
type IngredientPicks struct {
	IngredientID int64
	Picks        []stock.Pick
}

// CookedMeal is one Planned Meal being Cooked: its needs (stock.CookedNeeds) and its Used from picks (nil = default).
type CookedMeal struct {
	Needs    []stock.Need
	UsedFrom []IngredientPicks
}

// PickedDeduction is Deduction plus the Warnings split per meal (PerMeal[i] belongs to meals[i], never nil).
type PickedDeduction struct {
	Deduction
	PerMeal [][]Warning
}

// DeductForCookedPickedTx is DeductForCookedTx with Used from, for one or several meals (Mark all Cooked passes one
// CookedMeal per Course). Same transaction contract as DeductForCookedTx (no begin, commit or publish).
// Before anything is written, every Ingredient's picks are validated against its Lots (one read of tx; all picks of
// all meals are summed per Lot), so a refused pick leaves Stock untouched even if the caller commits anyway. Then per
// Ingredient: step A takes the picks; step B takes each meal's rest (need minus its picked amount, if above 0) in
// default order, in meal order. So the outcome does not depend on which Course comes first. Never blocks on short
// Stock (Warnings, as before). Unknown Ingredients and non-positive needs are skipped, as before; a pick for an
// Ingredient that is not among that meal's needs is refused. Nothing is written when it returns an error.
func (s *Service) DeductForCookedPickedTx(ctx context.Context, tx *sql.Tx, meals []CookedMeal) (PickedDeduction, error) {
	plan, err := s.planPicked(ctx, meals)
	if err != nil {
		return PickedDeduction{}, err
	}
	d := PickedDeduction{PerMeal: make([][]Warning, len(meals))}
	for i := range d.PerMeal {
		d.PerMeal[i] = []Warning{}
	}
	d.Warnings = []Warning{}
	if len(plan.needs) == 0 {
		return d, nil
	}
	if err := s.checkPicks(ctx, tx, plan); err != nil {
		return PickedDeduction{}, err
	}
	today, err := s.today(ctx)
	if err != nil {
		return PickedDeduction{}, err
	}

	warnings := make([]*Warning, len(plan.needs)) // by position in plan.needs
	for _, id := range plan.ingOrder {
		idxs := plan.byIng[id]
		ing := plan.needs[idxs[0]].ing
		changed := false
		_, err := s.st.UpdateTx(ctx, tx, id, func(lots []stock.Lot) (store.Mutation, error) {
			// Step A: every pick of every meal, validated and taken before any default rest.
			a, err := stock.DeductPicked(lots, 0, plan.picks[id])
			if err != nil {
				return store.Mutation{}, fmt.Errorf("%w: %w", ErrUsedFromInvalid, err)
			}
			if len(a.Taken) > 0 {
				changed = true
			}
			// Step B: each meal's rest, in meal order.
			cur := a.Lots
			for _, i := range idxs {
				n := plan.needs[i]
				have := stock.Total(cur) + n.picked // what this meal could draw on, its own picks included
				rest := stock.Deduct(cur, n.need-n.picked)
				cur = rest.Lots
				if len(rest.Taken) > 0 {
					changed = true
				}
				if rest.Shortfall > 0 {
					warnings[i] = &Warning{
						IngredientID: id,
						Name:         ing.Name,
						BaseUnit:     ing.BaseUnit,
						Have:         have,
						Need:         n.need,
						Shortfall:    rest.Shortfall,
						Message:      stock.ShortfallMessage(ing.Name, ing.BaseUnit, have, n.need),
					}
				}
			}
			return store.Mutation{Lots: cur, Today: today}, nil
		})
		if err != nil {
			return PickedDeduction{}, err
		}
		if changed {
			d.ChangedIngredientIDs = append(d.ChangedIngredientIDs, id)
		}
	}

	for i, n := range plan.needs {
		if w := warnings[i]; w != nil {
			d.Warnings = append(d.Warnings, *w)
			d.PerMeal[n.meal] = append(d.PerMeal[n.meal], *w)
		}
	}
	return d, nil
}

// checkPicks validates every Ingredient's picks against its Lots, reading every Lot once inside tx. Nothing is written.
func (s *Service) checkPicks(ctx context.Context, tx *sql.Tx, plan pickedPlan) error {
	stored, err := s.st.LotsTx(ctx, tx)
	if err != nil {
		return err
	}
	byIng := map[int64][]stock.Lot{}
	for _, l := range stored {
		byIng[l.IngredientID] = append(byIng[l.IngredientID], l.Lot)
	}
	for _, id := range plan.ingOrder {
		if _, err := stock.DeductPicked(byIng[id], 0, plan.picks[id]); err != nil {
			return fmt.Errorf("%w: %w", ErrUsedFromInvalid, err)
		}
	}
	return nil
}

// pickedNeed is one resolved need of one meal (unknown Ingredients and non-positive needs are not in the plan).
type pickedNeed struct {
	meal   int // index of the CookedMeal
	ing    IngredientInfo
	need   float64
	picked float64 // the meal's picks of this Ingredient, counted on the meal's first need of it
}

// pickedPlan is a validated, resolved Mark as Cooked: nothing is written before it is complete.
type pickedPlan struct {
	needs    []pickedNeed           // meal order, then need order
	ingOrder []int64                // Ingredients in order of first appearance
	byIng    map[int64][]int        // Ingredient -> positions in needs, in meal order
	picks    map[int64][]stock.Pick // Ingredient -> every pick of every meal, meal order then pick order
}

// planPicked resolves every need and checks every pick names an Ingredient among its meal's resolved needs. Lookup errors
// other than an unknown Ingredient are returned as is. Quantities and Lots are checked by stock.DeductPicked in step A.
func (s *Service) planPicked(ctx context.Context, meals []CookedMeal) (pickedPlan, error) {
	p := pickedPlan{byIng: map[int64][]int{}, picks: map[int64][]stock.Pick{}}
	known := map[int64]IngredientInfo{}
	for mi, m := range meals {
		first := map[int64]int{} // Ingredient -> position of this meal's first need of it
		for _, n := range m.Needs {
			if !(n.Quantity > 0) || math.IsInf(n.Quantity, 0) {
				continue
			}
			ing, ok := known[n.IngredientID]
			if !ok {
				got, err := s.ingredient(ctx, n.IngredientID)
				if errors.Is(err, ErrUnknownIngredient) {
					continue
				}
				if err != nil {
					return pickedPlan{}, err
				}
				ing = got
				known[n.IngredientID] = ing
			}
			at := len(p.needs)
			p.needs = append(p.needs, pickedNeed{meal: mi, ing: ing, need: n.Quantity})
			if _, dup := first[ing.ID]; !dup {
				first[ing.ID] = at
			}
			if _, seen := p.byIng[ing.ID]; !seen {
				p.ingOrder = append(p.ingOrder, ing.ID)
			}
			p.byIng[ing.ID] = append(p.byIng[ing.ID], at)
		}
		for _, up := range m.UsedFrom {
			at, ok := first[up.IngredientID]
			if !ok {
				return pickedPlan{}, fmt.Errorf("%w: a pick for an Ingredient that is not among the meal's needs", ErrUsedFromInvalid)
			}
			p.picks[up.IngredientID] = append(p.picks[up.IngredientID], up.Picks...)
			for _, pk := range up.Picks {
				p.needs[at].picked += pk.Quantity
			}
		}
	}
	return p, nil
}

// PreviewLot is a Lot in the cook preview.
type PreviewLot struct {
	LotView
	StoragePlaceName string // "" when the Lot is not sorted
}

// NeedPreview is one need of a Cooked sheet with the Lots it can take from.
type NeedPreview struct {
	IngredientID int64
	Name         string
	BaseUnit     string
	Need         float64
	Have         float64       // Stock total
	Lots         []PreviewLot  // every Lot of the Ingredient, in default (Deduction) order
	Default      []stock.Taken // what the default order takes for Need: the sheet's preselection
	Shortfall    float64       // Need Stock cannot cover (>= 0)
}

// PreviewCooked lists, per need (input order), the Ingredient's Lots in default order and the default selection.
// Unknown Ingredients and non-positive needs are skipped. Read-only; no event.
func (s *Service) PreviewCooked(ctx context.Context, needs []stock.Need) ([]NeedPreview, error) {
	today, err := s.today(ctx)
	if err != nil {
		return nil, err
	}
	out := []NeedPreview{}
	places := map[int64]string{} // Storage Place ID -> name, resolved once for the whole preview
	for _, n := range needs {
		if !(n.Quantity > 0) || math.IsInf(n.Quantity, 0) {
			continue
		}
		ing, err := s.ingredient(ctx, n.IngredientID)
		if errors.Is(err, ErrUnknownIngredient) {
			continue
		}
		if err != nil {
			return nil, err
		}
		stored, err := s.st.Lots(ctx, ing.ID)
		if err != nil {
			return nil, err
		}
		plain := make([]stock.Lot, len(stored))
		for i, l := range stored {
			plain[i] = l.Lot
		}
		sorted := make([]store.StoredLot, 0, len(stored))
		sortedPlain := make([]stock.Lot, 0, len(stored))
		for _, i := range stock.ConsumptionOrder(plain) {
			sorted = append(sorted, stored[i])
			sortedPlain = append(sortedPlain, plain[i])
		}
		views, err := s.views(ctx, sorted, today)
		if err != nil {
			return nil, err
		}
		names, err := s.placeNames(ctx, sorted, places)
		if err != nil {
			return nil, err
		}
		lots := make([]PreviewLot, 0, len(views))
		for i, v := range views {
			lots = append(lots, PreviewLot{LotView: v, StoragePlaceName: names[i]})
		}
		res := stock.Deduct(sortedPlain, n.Quantity)
		def := res.Taken
		if def == nil {
			def = []stock.Taken{}
		}
		out = append(out, NeedPreview{
			IngredientID: ing.ID,
			Name:         ing.Name,
			BaseUnit:     ing.BaseUnit,
			Need:         n.Quantity,
			Have:         stock.Total(sortedPlain),
			Lots:         lots,
			Default:      def,
			Shortfall:    res.Shortfall,
		})
	}
	return out, nil
}

// placeNames returns the Storage Place name of each Lot ("" when unsorted, or the place no longer exists). byID caches
// the names already resolved by the caller, so each place is looked up once.
func (s *Service) placeNames(ctx context.Context, lots []store.StoredLot, byID map[int64]string) ([]string, error) {
	names := make([]string, len(lots))
	for i, l := range lots {
		if l.StoragePlaceID == nil {
			continue
		}
		name, ok := byID[*l.StoragePlaceID]
		if !ok {
			p, err := s.st.StoragePlace(ctx, *l.StoragePlaceID)
			switch {
			case errors.Is(err, store.ErrPlaceNotFound):
				name = ""
			case err != nil:
				return nil, err
			default:
				name = p.Name
			}
			byID[*l.StoragePlaceID] = name
		}
		names[i] = name
	}
	return names, nil
}
