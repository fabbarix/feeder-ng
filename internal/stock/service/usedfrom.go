package service

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/fabbarix/feeder-ng/internal/stock"
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
// Per Ingredient: step A validates every meal's picks against the Lots (all picks of all meals are summed per Lot) and
// takes them; step B takes each meal's rest (need minus its picked amount, if above 0) in default order, in meal order.
// So the outcome does not depend on which Course comes first. Never blocks on short Stock (Warnings, as before).
// Unknown Ingredients and non-positive needs are skipped, as before; a pick for an Ingredient that is not among that
// meal's needs is refused. Nothing is written when it returns an error.
func (s *Service) DeductForCookedPickedTx(ctx context.Context, tx *sql.Tx, meals []CookedMeal) (PickedDeduction, error) {
	return PickedDeduction{}, nil // red stub: b5-ufs developer implements
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
	return nil, nil // red stub: b5-ufs developer implements
}
