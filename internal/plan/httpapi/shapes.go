package httpapi

import (
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
)

// JSON shapes (camelCase), as in docs/dev/design/t11-planning.md.

type whyOut struct {
	Code         string   `json:"code"`
	Value        float64  `json:"value,omitempty"`
	MemberIDs    []int64  `json:"memberIds,omitempty"`
	Members      []string `json:"members,omitempty"`
	IngredientID int64    `json:"ingredientId,omitempty"`
	Ingredient   string   `json:"ingredient,omitempty"`
	RecipeID     int64    `json:"recipeId,omitempty"`
	Recipe       string   `json:"recipe,omitempty"`
	Tag          string   `json:"tag,omitempty"`
	Date         string   `json:"date,omitempty"`
}

// plannedForOut is one later meal the Cooked Leftover is planned for (the Cooked response's plannedFor).
type plannedForOut struct {
	Date         string `json:"date"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	RecipeName   string `json:"recipeName"`
}

type leftoverSourceOut struct {
	LeftoverID *int64 `json:"leftoverId"`
	Date       string `json:"date"`
	MealSlotID int64  `json:"mealSlotId"`
	RecipeName string `json:"recipeName"`
}

type mealOut struct {
	Date               string             `json:"date"`
	MealSlotID         int64              `json:"mealSlotId"`
	RecipeID           int64              `json:"recipeId"`
	RecipeName         string             `json:"recipeName"`
	Batches            float64            `json:"batches"`
	Portions           float64            `json:"portions"`
	State              string             `json:"state"`
	Pinned             bool               `json:"pinned"`
	ServedFromLeftover *leftoverSourceOut `json:"servedFromLeftover"`
	Why                []whyOut           `json:"why"`
	// Optional, additive (WP6): the Recipe's total time in minutes, the "HH:MM" to start cooking by (slot time less the
	// total time, household zone; slot views only) and the Recipe photo. Omitted when unknown.
	CookMinutes int    `json:"cookMinutes,omitempty"`
	StartBy     string `json:"startBy,omitempty"`
	PhotoURL    string `json:"photoUrl,omitempty"`
}

type eliminationsOut struct {
	Considered  int `json:"considered"`
	Exclusion   int `json:"exclusion"`
	CoolDown    int `json:"coolDown"`
	VarietyRule int `json:"varietyRule"`
	AdvanceStep int `json:"advanceStep"`
}

type unfilledOut struct {
	Reason          string          `json:"reason"`
	SlotRuleClaimed bool            `json:"slotRuleClaimed"`
	Eliminated      eliminationsOut `json:"eliminated"`
}

type attendeeOut struct {
	MemberID int64   `json:"memberId"`
	Name     string  `json:"name"`
	Factor   float64 `json:"factor"`
	// Optional, additive (WP6): the Member as an Avatar: id, name and colour (#rrggbb).
	ID     int64  `json:"id"`
	Colour string `json:"colour"`
}

type ruleOut struct {
	ID         int64  `json:"id"`
	MealSlotID int64  `json:"mealSlotId"`
	RecipeID   int64  `json:"recipeId,omitempty"`
	RecipeName string `json:"recipeName,omitempty"`
	Tag        string `json:"tag,omitempty"`
}

type slotOut struct {
	Date       string        `json:"date"`
	MealSlotID int64         `json:"mealSlotId"`
	Name       string        `json:"name"`
	Time       string        `json:"time"`
	At         string        `json:"at"`
	Portions   float64       `json:"portions"`
	Attendance []attendeeOut `json:"attendance"`
	Meal       *mealOut      `json:"meal"`
	Unfilled   *unfilledOut  `json:"unfilled"`
	Rules      []ruleOut     `json:"rules"`
}

type leftoverOut struct {
	ID             int64   `json:"id"`
	RecipeID       int64   `json:"recipeId"`
	RecipeName     string  `json:"recipeName"`
	Portions       float64 `json:"portions"`
	CookedOn       string  `json:"cookedOn"`
	UseBy          string  `json:"useBy"`
	FromDate       string  `json:"fromDate"`
	FromMealSlotID int64   `json:"fromMealSlotId"`
}

type warningOut struct {
	IngredientID int64   `json:"ingredientId"`
	Name         string  `json:"name"`
	BaseUnit     string  `json:"baseUnit"`
	Have         float64 `json:"have"`
	Need         float64 `json:"need"`
	Shortfall    float64 `json:"shortfall"`
	Message      string  `json:"message"`
}

type needOut struct {
	IngredientID int64   `json:"ingredientId"`
	Ingredient   string  `json:"ingredient"`
	Quantity     float64 `json:"quantity"`
}

type cookPreviewOut struct {
	Meal             mealOut   `json:"meal"`
	Fresh            bool      `json:"fresh"`
	Batches          float64   `json:"batches"`
	Yield            float64   `json:"yield"`
	PortionsNeeded   float64   `json:"portionsNeeded"`
	ProposedLeftover float64   `json:"proposedLeftover"`
	MaxLeftover      float64   `json:"maxLeftover"`
	LeftoverUseBy    string    `json:"leftoverUseBy"`
	Needs            []needOut `json:"needs"`
}

type alternativeOut struct {
	RecipeID            int64    `json:"recipeId"`
	RecipeName          string   `json:"recipeName"`
	Batches             int      `json:"batches"`
	NewLeftoverPortions float64  `json:"newLeftoverPortions"`
	NewLeftoverUseBy    string   `json:"newLeftoverUseBy"`
	Score               float64  `json:"score"`
	Why                 []whyOut `json:"why"`
	// Optional, additive (WP6): the Recipe photo.
	PhotoURL string `json:"photoUrl,omitempty"`
}

type varietyOut struct {
	Tag                string `json:"tag"`
	MaxPerWeek         int    `json:"maxPerWeek"`
	NotConsecutiveDays bool   `json:"notConsecutiveDays"`
}

func whyFor(ws []plan.Why, t table) []whyOut {
	out := make([]whyOut, 0, len(ws))
	for _, w := range ws {
		o := whyOut{Code: w.Code, Value: w.Value, MemberIDs: w.MemberIDs, IngredientID: w.IngredientID,
			RecipeID: w.RecipeID, Tag: w.Tag, Date: w.Date, Ingredient: t.ingredients[w.IngredientID],
			Recipe: t.recipes[w.RecipeID]}
		for _, m := range w.MemberIDs {
			o.Members = append(o.Members, t.members[m])
		}
		out = append(out, o)
	}
	return out
}

func mealFor(m plan.Meal, t table) *mealOut {
	out := &mealOut{
		Date: m.Key.Date, MealSlotID: m.Key.MealSlotID, RecipeID: m.RecipeID, RecipeName: t.recipes[m.RecipeID],
		Batches: m.Batches, Portions: m.Portions, State: string(m.State), Pinned: m.Pinned,
		Why:      whyFor(m.Why, t),
		PhotoURL: t.recipePhoto[m.RecipeID],
	}
	// A meal served from a Leftover is already cooked: no cook time, so no startBy either (slotFor).
	if m.From == nil {
		out.CookMinutes = t.recipeMinutes[m.RecipeID]
	}
	if m.From != nil {
		src := &leftoverSourceOut{Date: m.From.From.Date, MealSlotID: m.From.From.MealSlotID, RecipeName: t.recipes[m.RecipeID]}
		if m.From.LeftoverID != 0 {
			id := m.From.LeftoverID
			src.LeftoverID = &id
		}
		out.ServedFromLeftover = src
	}
	return out
}

func rulesFor(rs []plan.SlotRule, t table) []ruleOut {
	out := make([]ruleOut, 0, len(rs))
	for _, r := range rs {
		out = append(out, ruleFor(r, t))
	}
	return out
}

func ruleFor(r plan.SlotRule, t table) ruleOut {
	return ruleOut{ID: r.ID, MealSlotID: r.MealSlotID, RecipeID: r.RecipeID, RecipeName: t.recipes[r.RecipeID], Tag: r.Tag}
}

func slotFor(s runner.SlotView, t table) slotOut {
	out := slotOut{
		Date: s.Key.Date, MealSlotID: s.Key.MealSlotID, Name: s.Name, Time: s.Time,
		At: s.At.Format(time.RFC3339), Portions: s.Portions, Attendance: []attendeeOut{}, Rules: rulesFor(s.Rules, t),
	}
	for _, a := range s.Attendance {
		out.Attendance = append(out.Attendance, attendeeOut{MemberID: a.MemberID, Name: t.members[a.MemberID], Factor: a.Factor,
			ID: a.MemberID, Colour: t.memberColour[a.MemberID]})
	}
	if s.Meal != nil {
		out.Meal = mealFor(*s.Meal, t)
		out.Meal.StartBy = plan.StartBy(s.At, out.Meal.CookMinutes)
	}
	if s.Unfilled != nil {
		out.Unfilled = unfilledFor(*s.Unfilled)
	}
	return out
}

// alternativeFor is one alternative of the Swap sheet.
func alternativeFor(alt runner.Alternative, t table) alternativeOut {
	return alternativeOut{RecipeID: alt.RecipeID, RecipeName: t.recipes[alt.RecipeID], Batches: alt.Batches,
		NewLeftoverPortions: alt.NewLeftoverPortions, NewLeftoverUseBy: alt.NewLeftoverUseBy, Score: alt.Score,
		Why: whyFor(alt.Why, t), PhotoURL: t.recipePhoto[alt.RecipeID]}
}

func unfilledFor(u plan.Unfilled) *unfilledOut {
	return &unfilledOut{Reason: u.Reason, SlotRuleClaimed: u.SlotRuleClaimed, Eliminated: eliminationsOut{
		Considered: u.Eliminated.Considered, Exclusion: u.Eliminated.Exclusion, CoolDown: u.Eliminated.CoolDown,
		VarietyRule: u.Eliminated.VarietyRule, AdvanceStep: u.Eliminated.AdvanceStep}}
}

func leftoverFor(l plan.Leftover, t table) leftoverOut {
	return leftoverOut{ID: l.ID, RecipeID: l.RecipeID, RecipeName: t.recipes[l.RecipeID], Portions: l.Portions,
		CookedOn: l.CookedOn, UseBy: l.UseBy, FromDate: l.From.Date, FromMealSlotID: l.From.MealSlotID}
}
