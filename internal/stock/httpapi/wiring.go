package httpapi

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
)

// ingredientLookup adapts the Ingredient store (team T2) to service.Ingredients.
// Until T2 is merged it is a stub; the Developer reads `ingredients` through
// internal/ingredient/store.Store.Get and maps ErrNotFound to service.ErrUnknownIngredient.
type ingredientLookup struct{ d app.Deps }

func (l ingredientLookup) Ingredient(ctx context.Context, id int64) (service.IngredientInfo, error) {
	panic("TODO")
}

// householdToday returns today's date in the household time zone (team T1:
// household store Settings().TimeZone applied to d.Clock.Now()). Until T1 is
// merged the Developer may fall back to UTC.
func householdToday(d app.Deps) service.Today {
	return func(ctx context.Context) (stock.Date, error) { panic("TODO") }
}
