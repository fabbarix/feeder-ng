package httpapi

import (
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
)

// baseRecipeDTO is the Base recipe a Step comes from (BR-G): name is the innermost one, path the names from the outermost.
type baseRecipeDTO struct {
	ID   int64    `json:"id"`
	Name string   `json:"name"`
	Path []string `json:"path"`
}

// baseRecipeOf maps a Step's Base recipe: null for the Recipe's own Steps.
func baseRecipeOf(b *cook.BaseRecipe) *baseRecipeDTO {
	if b == nil {
		return nil
	}
	return &baseRecipeDTO{ID: b.ID, Name: b.Name, Path: append([]string{}, b.Path...)}
}

// baseRecipesOf maps the covered Base recipes; [] rather than null.
func baseRecipesOf(bs []cook.BaseRecipe) []baseRecipeDTO {
	out := make([]baseRecipeDTO, 0, len(bs))
	for i := range bs {
		out = append(out, *baseRecipeOf(&bs[i]))
	}
	return out
}

// The cooking timeline of a slot (GET /api/cook/meals/{date}/{slotId}/all, spec §11, crs-c2 §5.1).

type timelineCourseDTO struct {
	CourseID      int64   `json:"courseId"`
	Name          string  `json:"name"`
	RecipeID      int64   `json:"recipeId"`
	RecipeName    string  `json:"recipeName"`
	Scope         string  `json:"scope"`
	Batches       float64 `json:"batches"`
	Fresh         bool    `json:"fresh"`
	State         string  `json:"state"`
	ReheatSeconds *int    `json:"reheatSeconds"`
}

type timelineAdvanceDTO struct {
	CourseID        int64          `json:"courseId"`
	Scope           string         `json:"scope"`
	Step            int            `json:"step"`
	Text            string         `json:"text"`
	LeadTimeMinutes int            `json:"leadTimeMinutes"`
	Done            bool           `json:"done"`
	DoneAt          *string        `json:"doneAt"`
	Warning         bool           `json:"warning"`
	BaseRecipe      *baseRecipeDTO `json:"baseRecipe"`
}

type timelineItemDTO struct {
	CourseID        int64          `json:"courseId"`
	Scope           string         `json:"scope"`
	Kind            string         `json:"kind"`
	Step            *int           `json:"step"`
	Number          int            `json:"number"`
	Text            string         `json:"text"`
	DurationMinutes int            `json:"durationMinutes"`
	StartSeconds    int            `json:"startSeconds"`
	EndSeconds      int            `json:"endSeconds"`
	Uses            []useDTO       `json:"uses"`
	ImageURL        string         `json:"imageUrl"`
	Timer           *stepTimerDTO  `json:"timer"`
	After           []int          `json:"after"`
	BaseRecipe      *baseRecipeDTO `json:"baseRecipe"`
}

type timelineDTO struct {
	Date         string               `json:"date"`
	MealSlotID   int64                `json:"mealSlotId"`
	SlotName     string               `json:"slotName"`
	Time         string               `json:"time"`
	StartAt      string               `json:"startAt"`
	TotalMinutes int                  `json:"totalMinutes"`
	Courses      []timelineCourseDTO  `json:"courses"`
	Advance      []timelineAdvanceDTO `json:"advance"`
	Items        []timelineItemDTO    `json:"items"`
	Covered      []baseRecipeDTO      `json:"covered"`
}

// timelineOf maps the service's timeline to the API shape; every array is [] rather than null.
func timelineOf(t service.Timeline) timelineDTO {
	d := timelineDTO{
		Date: t.Date, MealSlotID: t.MealSlotID, SlotName: t.SlotName, Time: t.Time, StartAt: instant(t.StartAt),
		TotalMinutes: t.TotalMinutes, Courses: []timelineCourseDTO{}, Advance: []timelineAdvanceDTO{}, Items: []timelineItemDTO{},
		Covered: baseRecipesOf(t.Covered),
	}
	for _, c := range t.Courses {
		row := timelineCourseDTO{CourseID: c.CourseID, Name: c.Name, RecipeID: c.RecipeID, RecipeName: c.RecipeName,
			Scope: string(c.Scope), Batches: c.Batches, Fresh: c.Fresh, State: c.State}
		if c.State == "planned" && !c.Fresh {
			secs := c.ReheatSeconds
			row.ReheatSeconds = &secs
		}
		d.Courses = append(d.Courses, row)
	}
	for _, a := range t.Advance {
		row := timelineAdvanceDTO{CourseID: a.CourseID, Scope: string(a.Scope), Step: a.Step, Text: a.Text,
			LeadTimeMinutes: a.LeadTimeMinutes, Done: a.Done, Warning: a.Warning, BaseRecipe: baseRecipeOf(a.BaseRecipe)}
		if a.DoneAt != nil {
			s := instant(*a.DoneAt)
			row.DoneAt = &s
		}
		d.Advance = append(d.Advance, row)
	}
	for _, it := range t.Items {
		row := timelineItemDTO{CourseID: it.CourseID, Scope: string(it.Scope), Kind: it.Kind, Number: it.Number,
			Text: it.Text, DurationMinutes: it.DurationMinutes, StartSeconds: it.StartSeconds, EndSeconds: it.EndSeconds,
			ImageURL: it.ImageURL, Uses: []useDTO{}, After: append([]int{}, it.After...), BaseRecipe: baseRecipeOf(it.BaseRecipe)}
		if it.Step >= 0 {
			step := it.Step
			row.Step = &step
		}
		for _, u := range it.Uses {
			row.Uses = append(row.Uses, useDTO{IngredientID: u.IngredientID, Ingredient: u.Ingredient, Quantity: u.Quantity, Unit: u.Unit})
		}
		if it.TimerSeconds > 0 {
			row.Timer = &stepTimerDTO{Label: it.TimerLabel, DurationSeconds: it.TimerSeconds}
		}
		d.Items = append(d.Items, row)
	}
	return d
}
