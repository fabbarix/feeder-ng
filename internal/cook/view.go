package cook

import (
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// Step is a Recipe Step as Cook Mode needs it. Uses are as written (unscaled).
type Step struct {
	Kind            schedule.Kind
	Text            string
	DurationMinutes int
	LeadTimeMinutes int
	Uses            []schedule.Use // Ingredient = name
	ImageURL        string
}

// RecipeSteps is a Recipe's name and Steps.
type RecipeSteps struct {
	RecipeID int64
	Name     string
	Steps    []Step
}

// AdvanceItem is an Advance Step listed above the Steps.
type AdvanceItem struct {
	Step            int // index into the Recipe's Steps
	Text            string
	LeadTimeMinutes int
	Done            bool
	DoneAt          *time.Time
	Warning         bool // not done
}

// StepTimer is what a Passive Step starts when reached.
type StepTimer struct {
	Label           string
	DurationSeconds int
}

// CookStep is one Step in the cooking sequence (Advance Steps excluded).
type CookStep struct {
	Index           int // index into the Recipe's Steps (what marks and timers use)
	Number, Of      int // 1-based position in the cooking sequence, and its length
	Kind            schedule.Kind
	Text            string
	DurationMinutes int
	ImageURL        string
	Uses            []schedule.Use // scaled by the Batches
	Timer           *StepTimer     // Passive Steps only
}

// View is Cook Mode for one scope.
type View struct {
	Scope      Scope
	RecipeID   int64
	RecipeName string
	Batches    float64
	Advance    []AdvanceItem
	Steps      []CookStep
}

// BuildView returns the Cook Mode view: Advance Steps (in order) with their
// done marks, then the other Steps in order with `uses` scaled by batches via
// schedule.ScaleUses and a timer on each Passive Step (duration in seconds =
// minutes x 60, label from TimerLabel with the Step's Number). marks maps a
// Step index to when it was marked done. Invalid batches return
// schedule.ErrInvalidBatches.
func BuildView(scope Scope, rs RecipeSteps, batches float64, marks map[int]time.Time) (View, error) {
	panic("TODO")
}
