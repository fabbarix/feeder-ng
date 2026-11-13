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
	// BaseRecipes (beta.6, BR-C) are the Base recipes Build may add: every Recipe in Recipes whose Ingredient is one of these
	// is a Base recipe, and every one a line calls for (IngredientID == OwnIngredientID), at any depth, is added to the file.
	BaseRecipes []ExportBaseRecipe
	// NeededAtStep is a line's "needed at" Step, by Recipe id and line index.
	NeededAtStep map[LineRef]int
}

// ExportBaseRecipe is a Base recipe with the Ingredient it owns and its Yield unit.
type ExportBaseRecipe struct {
	Recipe          recipe.Recipe
	OwnIngredientID int64
	YieldUnit       string
}

// LineRef addresses a Recipe line.
type LineRef struct {
	RecipeID int64
	Line     int
}

// Build makes a Recipe File: Recipes in the given order, one definition for
// every Ingredient used (and none for unused ones) ordered by normalised name,
// ExportedAt = Now in RFC 3339 UTC, ingredient names as stored (display
// name), images embedded as data URLs. Zero values that mean "default" are
// omitted (nil CooldownDays, nil shelf life); 0 days is kept.
//
// Base recipes (beta.6, BR-C): every Base recipe a Recipe calls for, at any depth, is added after the requested
// Recipes, in discovery order, once each (docs/dev/design/base-recipes.md §11.1). A Base recipe is written with
// baseRecipe true, its yieldUnit, and none of the Course and planning fields. Its Ingredient is defined without the
// "batch" Unit Conversion, which belongs to the Yield. A line that calls for a Base recipe is written with recipe and,
// when NeededAtStep has it, neededAtStep. A file without Base recipes is written as before.
func Build(in ExportInput) (File, []Warning) {
	var warns []Warning
	used := map[int64]bool{}
	f := File{
		Format:     Format,
		Version:    Version,
		ExportedAt: in.Now.UTC().Format(time.RFC3339),
		Recipes:    make([]Recipe, 0, len(in.Recipes)),
	}

	byIngredient := map[int64]ExportBaseRecipe{}
	byRecipe := map[int64]ExportBaseRecipe{}
	for _, b := range in.BaseRecipes {
		byIngredient[b.OwnIngredientID] = b
		byRecipe[b.Recipe.ID] = b
	}
	// The Recipes to write, the requested ones first, then the Base recipes they call for (breadth first).
	order := append([]recipe.Recipe{}, in.Recipes...)
	seen := map[int64]bool{}
	for _, r := range in.Recipes {
		seen[r.ID] = true
	}
	for i := 0; i < len(order); i++ {
		for _, id := range callsFor(order[i]) {
			b, ok := byIngredient[id]
			if !ok || seen[b.Recipe.ID] {
				continue
			}
			seen[b.Recipe.ID] = true
			order = append(order, b.Recipe)
		}
	}

	for _, r := range order {
		base := fmt.Sprintf("$.recipes[%d]", len(f.Recipes))
		br, isBase := byRecipe[r.ID]
		out := Recipe{
			Name:        r.Name,
			Description: r.Description,
			Yield:       r.Yield,
			ReadyMeal:   r.ReadyMeal,
			Tags:        r.Tags,
		}
		if isBase {
			t := true
			out.BaseRecipe = &t
			out.YieldUnit = br.YieldUnit
			out.ReadyMeal = false
			used[br.OwnIngredientID] = true
		} else {
			out.CooldownDays = copyInt(r.CooldownDays)
			out.LeftoverUseByDays = copyInt(r.LeftoverUseByDays)
			out.ReheatMinutes = copyInt(r.ReheatMinutes)
			for _, c := range r.Courses {
				out.Courses = append(out.Courses, c.Name)
			}
			if r.WholeMeal != nil {
				w := *r.WholeMeal
				out.WholeMeal = &w
			}
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
		for j, l := range r.Lines {
			used[l.IngredientID] = true
			line := lineOut(l, in.Ingredients)
			if b, ok := byIngredient[l.IngredientID]; ok {
				line.Recipe = &LineRecipe{Name: b.Recipe.Name}
				if n, ok := in.NeededAtStep[LineRef{RecipeID: r.ID, Line: j}]; ok {
					line.NeededAtStep = &n
				}
			}
			out.Ingredients = append(out.Ingredients, line)
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
	// One definition per normalised name (beta.6, BR-C round 2): a plain Ingredient that shares its name with another
	// Ingredient of the file is merged into that definition. The definition is the Base recipe's Ingredient's when one
	// of the group is a Base recipe's (the Base recipe is then written by name, its own Ingredient is what it is), else
	// the first one. The others add their Unit Conversions (without "batch") and their Shelf Life where the definition
	// has none; a different base unit cannot be merged and is left out with a warning.
	var groups [][]int64
	groupAt := map[string]int{}
	for _, id := range ids {
		key := units.NormalizeName(in.Ingredients[id].Name)
		if g, ok := groupAt[key]; ok {
			groups[g] = append(groups[g], id)
			continue
		}
		groupAt[key] = len(groups)
		groups = append(groups, []int64{id})
	}
	for idx, group := range groups {
		primary, ownsBase := group[0], false
		for _, id := range group {
			if _, ok := byIngredient[id]; ok {
				primary, ownsBase = id, true
				break
			}
		}
		ing := in.Ingredients[primary]
		def := Ingredient{
			Name:          ingredient.DisplayName(ing.Name),
			BaseUnit:      string(ing.Base),
			ShelfLifeDays: copyInt(ing.ShelfLifeDays),
		}
		for _, c := range ing.Conversions {
			if _, isBase := byIngredient[primary]; isBase && units.NormalizeUnit(c.Unit) == "batch" {
				continue // the batch conversion is the Base recipe's Yield, set again on import
			}
			def.Conversions = append(def.Conversions, Conversion{Unit: c.Unit, ToBase: c.ToBase})
		}
		if ing.Image != "" {
			if data, err := in.Image(ing.Image); err != nil {
				warns = append(warns, Warning{Path: fmt.Sprintf("$.ingredients[%d].image", idx), Code: WarnImageFailed, Message: "the picture could not be exported"})
			} else {
				def.Image = data
			}
		}
		for _, id := range group {
			if id == primary {
				continue
			}
			other := in.Ingredients[id]
			if units.Base(other.Base) != ing.Base {
				warns = append(warns, Warning{Path: fmt.Sprintf("$.ingredients[%d].name", idx), Code: WarnSameNameIngredient,
					Message: fmt.Sprintf("%s is kept in Feeder with another base unit than the Base recipe's %s; its own definition is not written", def.Name, def.BaseUnit)})
				continue
			}
			if def.ShelfLifeDays == nil && other.ShelfLifeDays != nil {
				def.ShelfLifeDays = copyInt(other.ShelfLifeDays)
			}
			for _, c := range other.Conversions {
				if ownsBase && units.NormalizeUnit(c.Unit) == "batch" {
					continue
				}
				if _, have := findFileConv(def.Conversions, c.Unit); !have {
					def.Conversions = append(def.Conversions, Conversion{Unit: c.Unit, ToBase: c.ToBase})
				}
			}
		}
		f.Ingredients = append(f.Ingredients, def)
	}
	return f, warns
}

// findFileConv finds a definition's conversion for a unit, by normalised unit.
func findFileConv(cs []Conversion, unit string) (Conversion, bool) {
	for _, c := range cs {
		if units.NormalizeUnit(c.Unit) == units.NormalizeUnit(unit) {
			return c, true
		}
	}
	return Conversion{}, false
}

// callsFor lists the Ingredient ids a Recipe's lines and Step uses name, in document order.
func callsFor(r recipe.Recipe) []int64 {
	var out []int64
	for _, l := range r.Lines {
		out = append(out, l.IngredientID)
	}
	for _, s := range r.Steps {
		for _, u := range s.Uses {
			out = append(out, u.IngredientID)
		}
	}
	return out
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
