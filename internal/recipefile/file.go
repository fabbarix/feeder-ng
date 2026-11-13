// Package recipefile is the pure core of Recipe File import and export
// (docs/spec/recipe-file.md): parsing and schema validation, building a file
// from Recipes, Import Review planning (Ingredient matching, unit check, Recipe
// conflicts), image resolution and the Agent Prompt. No net/http, no
// database/sql; image downloading sits behind the Fetcher interface and lives
// in recipefile/imagefetch. See docs/dev/design/t12-import-export.md.
package recipefile

// Format and Version are the only values this importer accepts.
const (
	Format  = "feeder-recipe-file"
	Version = 1
)

// File is a decoded Recipe File. The JSON tags are the file format itself.
type File struct {
	Format      string       `json:"format"`
	Version     int          `json:"version"`
	ExportedAt  string       `json:"exportedAt,omitempty"`
	Ingredients []Ingredient `json:"ingredients,omitempty"`
	Recipes     []Recipe     `json:"recipes"`
}

// Ingredient is an Ingredient definition.
type Ingredient struct {
	Name          string       `json:"name"`
	BaseUnit      string       `json:"baseUnit"`
	Conversions   []Conversion `json:"conversions,omitempty"`
	ShelfLifeDays *int         `json:"shelfLifeDays,omitempty"`
	Image         string       `json:"image,omitempty"` // IM2: data URL or https URL, like a Recipe's
}

// Conversion is an Ingredient-specific Unit Conversion: 1 Unit = ToBase Base Units.
type Conversion struct {
	Unit   string  `json:"unit"`
	ToBase float64 `json:"toBase"`
}

// Source says where a Recipe came from.
type Source struct {
	URL         string `json:"url,omitempty"`
	Attribution string `json:"attribution,omitempty"`
}

// Recipe is one Recipe of the file. CooldownDays and LeftoverUseByDays are
// pointers so that 0 ("same day") differs from absent. Image is a data URL or
// an https URL.
type Recipe struct {
	Name        string  `json:"name"`
	Description string  `json:"description,omitempty"`
	Yield       float64 `json:"yield"`
	ReadyMeal   bool    `json:"readyMeal,omitempty"`
	// BaseRecipe (beta.6, BR-C) is nil when absent or null, true for a Base recipe, false for "plannable, said so".
	// With it, Yield is the amount of one Batch in YieldUnit.
	BaseRecipe *bool  `json:"baseRecipe,omitempty"`
	YieldUnit  string `json:"yieldUnit,omitempty"`
	// Courses are Course names (crs-e1): written in household order, matched on import with course.NameKey.
	// Empty means the main Course.
	Courses []string `json:"courses,omitempty"`
	// WholeMeal is a pointer so that false differs from absent; absent and null both mean "use the default".
	WholeMeal         *bool    `json:"wholeMeal,omitempty"`
	Tags              []string `json:"tags,omitempty"`
	CooldownDays      *int     `json:"cooldownDays,omitempty"`
	LeftoverUseByDays *int     `json:"leftoverUseByDays,omitempty"`
	ReheatMinutes     *int     `json:"reheatMinutes,omitempty"`
	Image             string   `json:"image,omitempty"`
	Source            *Source  `json:"source,omitempty"`
	Ingredients       []Line   `json:"ingredients"`
	Steps             []Step   `json:"steps,omitempty"`
}

// Line is an ingredient quantity (a Recipe line or a Step's `uses`).
type Line struct {
	Ingredient string  `json:"ingredient"`
	Quantity   float64 `json:"quantity"`
	Unit       string  `json:"unit"`
	Note       string  `json:"note,omitempty"`
	Optional   bool    `json:"optional,omitempty"`
	// Recipe (beta.6, BR-C): this line calls for another recipe. NeededAtStep is the 0-based Step by which it must be ready.
	Recipe       *LineRecipe `json:"recipe,omitempty"`
	NeededAtStep *int        `json:"neededAtStep,omitempty"`
}

// LineRecipe is the reference a line makes to another recipe: its name, and the words in the source that point at it.
type LineRecipe struct {
	Name string `json:"name"`
	Cue  string `json:"cue,omitempty"`
}

// Step is one Step. Minutes are fractional in the file format; the importer
// rounds them up to whole minutes.
type Step struct {
	Text            string   `json:"text"`
	Kind            string   `json:"kind"`
	DurationMinutes *float64 `json:"durationMinutes,omitempty"`
	LeadTimeMinutes *float64 `json:"leadTimeMinutes,omitempty"`
	After           []int    `json:"after,omitempty"`
	Image           string   `json:"image,omitempty"`
	Uses            []Line   `json:"uses,omitempty"`
}
