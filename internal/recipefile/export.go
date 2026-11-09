package recipefile

import (
	"time"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// ExportInput is what Build needs. Ingredients maps ingredient id -> definition
// for every Ingredient the Recipes use (lines and Step uses). Image turns a
// stored image id into a data URL ("data:image/webp;base64,..."); an error makes
// that image be left out with a Warning.
type ExportInput struct {
	Now         time.Time
	Recipes     []recipe.Recipe
	Ingredients map[int64]ingredient.Ingredient
	Image       func(id string) (dataURL string, err error)
}

// Build makes a Recipe File: Recipes in the given order, one definition for
// every Ingredient used (and none for unused ones) ordered by normalised name,
// ExportedAt = Now in RFC 3339 UTC, ingredient names as stored (display
// name), images embedded as data URLs. Zero values that mean "default" are
// omitted (nil CooldownDays, nil shelf life); 0 days is kept.
func Build(in ExportInput) (File, []Warning) {
	panic("not implemented") // Developer
}

// Marshal encodes a File as indented JSON, terminated by a newline.
func Marshal(f File) ([]byte, error) {
	panic("not implemented") // Developer
}

// ExportFileName is "feeder-recipes-YYYY-MM-DD.feeder.json" for the date of now.
func ExportFileName(now time.Time) string {
	panic("not implemented") // Developer
}
