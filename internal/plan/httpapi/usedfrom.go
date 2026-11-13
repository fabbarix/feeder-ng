package httpapi

import (
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
)

// usedFromIn is one Ingredient of a Used from list: the Lots the User took it from, in Base Units.
type usedFromIn struct {
	IngredientID int64 `json:"ingredientId"`
	Lots         []struct {
		LotID    int64   `json:"lotId"`
		Quantity float64 `json:"quantity"`
	} `json:"lots"`
}

// usedFromOf maps the request's Used from list to the runner's picks (no logic: the Stock checks the picks).
func usedFromOf(in []usedFromIn) []runner.UsedFrom {
	out := make([]runner.UsedFrom, 0, len(in))
	for _, u := range in {
		picks := make([]runner.Pick, 0, len(u.Lots))
		for _, l := range u.Lots {
			picks = append(picks, runner.Pick{LotID: l.LotID, Quantity: l.Quantity})
		}
		out = append(out, runner.UsedFrom{IngredientID: u.IngredientID, Picks: picks})
	}
	return out
}

// lotPreviewOut is a Stock Lot on the Mark as Cooked sheet: goesOff is null when the Lot does not go off,
// storagePlaceName is "" when it is not sorted.
type lotPreviewOut struct {
	ID               int64   `json:"id"`
	Quantity         float64 `json:"quantity"`
	Purchased        string  `json:"purchased"`
	GoesOff          *string `json:"goesOff"`
	StoragePlaceName string  `json:"storagePlaceName"`
}

// cookNeedsOut is the needs of the Mark as Cooked sheet with each need's baseUnit and Lots (never null: [] for an
// Ingredient without Stock). The Lots come paired by Ingredient from the Stock preview.
func cookNeedsOut(needs []runner.Need, stock []runner.NeedPreview, t table) []needOut {
	byIngredient := make(map[int64]runner.NeedPreview, len(stock))
	for _, p := range stock {
		byIngredient[p.IngredientID] = p
	}
	out := make([]needOut, 0, len(needs))
	for _, n := range needs {
		p := byIngredient[n.IngredientID]
		lots := make([]lotPreviewOut, 0, len(p.Lots))
		for _, l := range p.Lots {
			lo := lotPreviewOut{ID: l.ID, Quantity: l.Quantity, Purchased: l.Purchased, StoragePlaceName: l.StoragePlaceName}
			if l.GoesOff != "" {
				g := l.GoesOff
				lo.GoesOff = &g
			}
			lots = append(lots, lo)
		}
		out = append(out, needOut{IngredientID: n.IngredientID, Ingredient: t.ingredients[n.IngredientID],
			Quantity: n.Quantity, BaseUnit: p.BaseUnit, Lots: lots})
	}
	return out
}
