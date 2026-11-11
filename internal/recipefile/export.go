package recipefile

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/units"
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
	var warns []Warning
	used := map[int64]bool{}
	f := File{
		Format:     Format,
		Version:    Version,
		ExportedAt: in.Now.UTC().Format(time.RFC3339),
		Recipes:    make([]Recipe, 0, len(in.Recipes)),
	}

	for i, r := range in.Recipes {
		base := fmt.Sprintf("$.recipes[%d]", i)
		out := Recipe{
			Name:              r.Name,
			Description:       r.Description,
			Yield:             r.Yield,
			ReadyMeal:         r.ReadyMeal,
			Tags:              r.Tags,
			CooldownDays:      copyInt(r.CooldownDays),
			LeftoverUseByDays: copyInt(r.LeftoverUseByDays),
			ReheatMinutes:     copyInt(r.ReheatMinutes),
		}
		if r.Source.URL != "" || r.Source.Attribution != "" {
			out.Source = &Source{URL: r.Source.URL, Attribution: r.Source.Attribution}
		}
		if r.Image != "" {
			if data, err := in.Image(r.Image); err != nil {
				warns = append(warns, Warning{Path: base + ".image", Code: WarnImageFailed, Message: "the photo could not be exported"})
			} else {
				out.Image = data
			}
		}
		for _, l := range r.Lines {
			used[l.IngredientID] = true
			out.Ingredients = append(out.Ingredients, lineOut(l, in.Ingredients))
		}
		for j, s := range r.Steps {
			st := Step{Text: s.Text, Kind: string(s.Kind), After: s.After}
			if s.DurationMinutes != 0 {
				st.DurationMinutes = floatPtr(float64(s.DurationMinutes))
			}
			if s.LeadTimeMinutes != 0 {
				st.LeadTimeMinutes = floatPtr(float64(s.LeadTimeMinutes))
			}
			if s.Image != "" {
				if data, err := in.Image(s.Image); err != nil {
					warns = append(warns, Warning{Path: fmt.Sprintf("%s.steps[%d].image", base, j), Code: WarnImageFailed, Message: "the photo could not be exported"})
				} else {
					st.Image = data
				}
			}
			for _, u := range s.Uses {
				used[u.IngredientID] = true
				st.Uses = append(st.Uses, lineOut(recipe.Line{IngredientID: u.IngredientID, Quantity: u.Quantity, Unit: u.Unit}, in.Ingredients))
			}
			out.Steps = append(out.Steps, st)
		}
		f.Recipes = append(f.Recipes, out)
	}

	var ids []int64
	for id := range used {
		if _, ok := in.Ingredients[id]; ok {
			ids = append(ids, id)
		}
	}
	sort.Slice(ids, func(i, j int) bool {
		a, b := in.Ingredients[ids[i]], in.Ingredients[ids[j]]
		if ka, kb := units.NormalizeName(a.Name), units.NormalizeName(b.Name); ka != kb {
			return ka < kb
		}
		return ids[i] < ids[j]
	})
	for idx, id := range ids {
		ing := in.Ingredients[id]
		def := Ingredient{
			Name:          ingredient.DisplayName(ing.Name),
			BaseUnit:      string(ing.Base),
			ShelfLifeDays: copyInt(ing.ShelfLifeDays),
		}
		for _, c := range ing.Conversions {
			def.Conversions = append(def.Conversions, Conversion{Unit: c.Unit, ToBase: c.ToBase})
		}
		if ing.Image != "" {
			if data, err := in.Image(ing.Image); err != nil {
				warns = append(warns, Warning{Path: fmt.Sprintf("$.ingredients[%d].image", idx), Code: WarnImageFailed, Message: "the photo could not be exported"})
			} else {
				def.Image = data
			}
		}
		f.Ingredients = append(f.Ingredients, def)
	}
	return f, warns
}

// lineOut writes a line (or a Step use) by the display name of its Ingredient.
func lineOut(l recipe.Line, defs map[int64]ingredient.Ingredient) Line {
	name := l.Ingredient
	if d, ok := defs[l.IngredientID]; ok {
		name = d.Name
	}
	return Line{
		Ingredient: ingredient.DisplayName(name),
		Quantity:   l.Quantity,
		Unit:       l.Unit,
		Note:       l.Note,
		Optional:   l.Optional,
	}
}

// Marshal encodes a File as indented JSON, terminated by a newline.
func Marshal(f File) ([]byte, error) {
	out, err := json.MarshalIndent(f, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(out, '\n'), nil
}

// ExportFileName is "feeder-recipes-YYYY-MM-DD.feeder.json" for the date of now.
func ExportFileName(now time.Time) string {
	return "feeder-recipes-" + now.Format("2006-01-02") + ".feeder.json"
}

func copyInt(p *int) *int {
	if p == nil {
		return nil
	}
	n := *p
	return &n
}

func floatPtr(f float64) *float64 { return &f }
