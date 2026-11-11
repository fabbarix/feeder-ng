package httpapi

import (
	"context"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/images"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/service"
)

// ingredientLookup adapts the Ingredient store (team T2) to service.Ingredients.
type ingredientLookup struct{ st *ingredientstore.Store }

func (l ingredientLookup) Ingredient(ctx context.Context, id int64) (service.IngredientInfo, error) {
	ing, err := l.st.Get(ctx, id)
	if errors.Is(err, ingredientstore.ErrNotFound) {
		return service.IngredientInfo{}, service.ErrUnknownIngredient
	}
	if err != nil {
		return service.IngredientInfo{}, err
	}
	return service.IngredientInfo{
		ID:            ing.ID,
		Name:          ing.Name,
		BaseUnit:      string(ing.Base),
		ShelfLifeDays: ing.ShelfLifeDays,
		ImageURL:      images.URL(ing.Image),
	}, nil
}

// householdToday returns today's date in the household time zone (T1's household
// settings) applied to d.Clock.Now(). An unset or unknown zone falls back to UTC.
func householdToday(d app.Deps) service.Today {
	hh := store.New(d.DB, d.Clock)
	return func(ctx context.Context) (stock.Date, error) {
		loc := time.UTC
		settings, err := hh.Settings(ctx)
		if err != nil {
			return stock.None, err
		}
		if settings.TimeZone != "" {
			if l, err := time.LoadLocation(settings.TimeZone); err == nil {
				loc = l
			}
		}
		return stock.Date(d.Clock.Now().In(loc).Format("2006-01-02")), nil
	}
}
