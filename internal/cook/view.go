package cook

import (
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// BaseRecipe names the Base recipe a composed Step comes from (BR-G): Name is the innermost one, Path the chain from the
// outermost ("Béchamel", "Roux").
type BaseRecipe struct {
	ID   int64
	Name string
	Path []string
}

// Step is a Recipe Step as Cook Mode needs it. Uses are as written (unscaled). BaseRecipe is set on the Steps of a Base
// recipe (composed in), and Covered on a Step whose Base recipe Stock covers: it is zero-length and left out of the view.
type Step struct {
	Kind            schedule.Kind
	Text            string
	DurationMinutes int
	LeadTimeMinutes int
	Uses            []schedule.Use // Ingredient = name
	ImageURL        string
	After           []int // indexes of the earlier Steps that must finish before this one starts
	BaseRecipe      *BaseRecipe
	Covered         bool
}

// RecipeSteps is a Recipe's name and Steps.
type RecipeSteps struct {
	RecipeID      int64
	Name          string
	Steps         []Step
	ReheatMinutes int // the Recipe's reheat time, 0 none (R12)
}

// AdvanceItem is an Advance Step listed above the Steps.
type AdvanceItem struct {
	Step            int // index into the Recipe's Steps
	Text            string
	LeadTimeMinutes int
	Done            bool
	DoneAt          *time.Time
	Warning         bool // not done
	BaseRecipe      *BaseRecipe
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
	After           []int          // Recipe Step indexes this Step waits for (never nil)
	BaseRecipe      *BaseRecipe    // the Base recipe the Step comes from, nil for the Recipe's own
}

// View is Cook Mode for one scope.
type View struct {
	Scope      Scope
	RecipeID   int64
	RecipeName string
	Batches    float64
	Advance    []AdvanceItem
	Steps      []CookStep
	Covered    []BaseRecipe // the Base recipes whose Steps Stock covers and the view leaves out (never nil from BuildView)
}

// BuildView returns the Cook Mode view: Advance Steps (in order) with their
// done marks, then the other Steps in order with `uses` scaled by batches via
// schedule.ScaleUses and a timer on each Passive Step (duration in seconds =
// minutes x 60, label from TimerLabel with the Step's Number). marks maps a
// Step index to when it was marked done. Invalid batches return
// schedule.ErrInvalidBatches.
//
// A covered Step (BR-G) is left out: its index stays the composed one, the Number and Of count only the Steps shown,
// and its Base recipe is listed in View.Covered once. A Step of a Base recipe labels its timer with the Base recipe's
// path ("Béchamel · Roux: Whisk ...") instead of the Step number.
func BuildView(scope Scope, rs RecipeSteps, batches float64, marks map[int]time.Time) (View, error) {
	if _, err := schedule.ScaleUses(nil, batches); err != nil {
		return View{}, err
	}
	v := View{Scope: scope, RecipeID: rs.RecipeID, RecipeName: rs.Name, Batches: batches, Covered: []BaseRecipe{}}
	of := 0
	for _, s := range rs.Steps {
		if s.Kind != schedule.Advance && !s.Covered {
			of++
		}
	}
	for i, s := range rs.Steps {
		if s.Covered {
			continue
		}
		if s.Kind == schedule.Advance {
			item := AdvanceItem{Step: i, Text: s.Text, LeadTimeMinutes: s.LeadTimeMinutes, BaseRecipe: s.BaseRecipe}
			if at, ok := marks[i]; ok {
				doneAt := at
				item.Done, item.DoneAt = true, &doneAt
			} else {
				item.Warning = true
			}
			v.Advance = append(v.Advance, item)
			continue
		}
		uses, err := schedule.ScaleUses(s.Uses, batches)
		if err != nil {
			return View{}, err
		}
		cs := CookStep{
			Index: i, Number: len(v.Steps) + 1, Of: of, Kind: s.Kind, Text: s.Text,
			DurationMinutes: s.DurationMinutes, ImageURL: s.ImageURL, Uses: uses, After: append([]int{}, s.After...),
			BaseRecipe: s.BaseRecipe,
		}
		if s.Kind == schedule.Passive {
			label := TimerLabel(cs.Number, s.Text)
			if s.BaseRecipe != nil {
				label = BaseTimerLabel(s.BaseRecipe, s.Text)
			}
			cs.Timer = &StepTimer{Label: label, DurationSeconds: s.DurationMinutes * 60}
		}
		v.Steps = append(v.Steps, cs)
	}
	v.Covered = OutermostCovered(rs.Steps)
	return v, nil
}

// OutermostCovered lists the Base recipes whose blocks Stock covers, one per block: a covered Step's Base recipe is left out
// when a covered Step of an enclosing Base recipe is on its path (a jar of Béchamel covers Roux inside it, so the list is
// [Béchamel]). In the order of the Steps, never nil.
func OutermostCovered(steps []Step) []BaseRecipe {
	out := []BaseRecipe{}
	for _, s := range steps {
		if !s.Covered || s.BaseRecipe == nil || enclosed(steps, s.BaseRecipe.Path) {
			continue
		}
		dup := false
		for _, c := range out {
			if c.ID == s.BaseRecipe.ID {
				dup = true
				break
			}
		}
		if !dup {
			out = append(out, BaseRecipe{ID: s.BaseRecipe.ID, Name: s.BaseRecipe.Name, Path: append([]string(nil), s.BaseRecipe.Path...)})
		}
	}
	return out
}

// enclosed reports whether a covered Step's Base recipe sits inside another covered Base recipe: some covered Step has a
// strictly shorter Path that is a prefix of path.
func enclosed(steps []Step, path []string) bool {
	for _, s := range steps {
		if !s.Covered || s.BaseRecipe == nil || len(s.BaseRecipe.Path) >= len(path) {
			continue
		}
		if hasPrefix(path, s.BaseRecipe.Path) {
			return true
		}
	}
	return false
}

func hasPrefix(path, prefix []string) bool {
	for i := range prefix {
		if path[i] != prefix[i] {
			return false
		}
	}
	return true
}

// BaseTimerLabel is the timer label of a Base recipe's Step: its path joined with " · ", then the Step's text.
func BaseTimerLabel(b *BaseRecipe, text string) string {
	label := strings.Join(b.Path, " · ")
	if text == "" {
		return label
	}
	return label + ": " + CutStepText(text)
}
