package httpapi

import (
	"errors"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
)

// Quick Use of a Supply (H9, household-items.md section 4.11). Handlers are thin: parse, call the service, respond.

type useBody struct {
	Quantity float64 `json:"quantity"`
}

type undoBody struct {
	Taken []usedLotJSON `json:"taken"`
}

// usedLotJSON is one Lot's share of a Use, as the web sends it back to Undo.
type usedLotJSON struct {
	LotID          int64   `json:"lotId"`
	Quantity       float64 `json:"quantity"`
	Purchased      string  `json:"purchased"`
	StoragePlaceID *int64  `json:"storagePlaceId"`
	ProductID      *int64  `json:"productId"`
	ShopID         *int64  `json:"shopId"`
}

type supplyUseJSON struct {
	IngredientID int64         `json:"ingredientId"`
	Name         string        `json:"name"`
	BaseUnit     string        `json:"baseUnit"`
	Quantity     float64       `json:"quantity"`
	Total        float64       `json:"total"`
	Taken        []usedLotJSON `json:"taken"`
}

// useSupply answers POST /api/stock/ingredients/{id}/use: 200 with what was taken.
func (a *api) useSupply(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeNotFound(w, "That Ingredient does not exist")
		return
	}
	var body useBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	out, err := a.svc.UseSupply(r.Context(), id, body.Quantity)
	if err != nil {
		writeUseError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, supplyUseToJSON(out))
}

// undoSupplyUse answers POST /api/stock/ingredients/{id}/use/undo: 200 with what came back.
func (a *api) undoSupplyUse(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeNotFound(w, "That Ingredient does not exist")
		return
	}
	var body undoBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	taken := make([]service.UsedLot, 0, len(body.Taken))
	for _, t := range body.Taken {
		taken = append(taken, service.UsedLot{
			LotID:          t.LotID,
			Quantity:       t.Quantity,
			Purchased:      stock.Date(t.Purchased),
			StoragePlaceID: t.StoragePlaceID,
			ProductID:      t.ProductID,
			ShopID:         t.ShopID,
		})
	}
	out, err := a.svc.UndoSupplyUse(r.Context(), id, taken)
	if err != nil {
		writeUseError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, supplyUseToJSON(out))
}

func supplyUseToJSON(u service.SupplyUse) supplyUseJSON {
	taken := make([]usedLotJSON, 0, len(u.Taken))
	for _, t := range u.Taken {
		taken = append(taken, usedLotJSON{
			LotID:          t.LotID,
			Quantity:       t.Quantity,
			Purchased:      string(t.Purchased),
			StoragePlaceID: t.StoragePlaceID,
			ProductID:      t.ProductID,
			ShopID:         t.ShopID,
		})
	}
	return supplyUseJSON{
		IngredientID: u.IngredientID,
		Name:         u.Name,
		BaseUnit:     u.BaseUnit,
		Quantity:     u.Quantity,
		Total:        u.Total,
		Taken:        taken,
	}
}

// writeUseError answers a refused Use or Undo. An unknown Ingredient is 404 here (not the 422 of other routes).
func writeUseError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrUnknownIngredient):
		writeNotFound(w, "That Ingredient does not exist")
	case errors.Is(err, service.ErrNotSupply):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "ingredient_not_supply", "Only a Supply can be used this way")
	case errors.Is(err, service.ErrUseExceedsStock):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "use_exceeds_stock", "There is not that much in Stock")
	case errors.Is(err, service.ErrUseInvalid):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "use_quantity_invalid", "A use needs a quantity of more than 0")
	default:
		writeError(w, err)
	}
}
