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
	CourseID     int64  `json:"courseId"`
}

type leftoverSourceOut struct {
	LeftoverID *int64 `json:"leftoverId"`
	Date       string `json:"date"`
	MealSlotID int64  `json:"mealSlotId"`
	RecipeName string `json:"recipeName"`
}

type mealOut struct {
	Date       string `json:"date"`
	MealSlotID int64  `json:"mealSlotId"`
	// CourseID is the real id of the Course the meal fills (crs-c2); CourseName its name.
	CourseID           int64              `json:"courseId"`
	CourseName         string             `json:"courseName"`
	RecipeID           int64              `json:"recipeId"`
	RecipeName         string             `json:"recipeName"`
	WholeMeal          bool               `json:"wholeMeal"`
	Relaxed            bool               `json:"relaxed"`
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
	// R12: the Recipe's reheat time in minutes, sent only for a meal served from a Leftover and only when set.
	ReheatMinutes int `json:"reheatMinutes,omitempty"`
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
	// PE: the Member's Photo ("/api/images/<id>") and emoji, so every Avatar can draw them.
	PhotoURL string `json:"photoUrl,omitempty"`
	Avatar   string `json:"avatar,omitempty"`
}

type ruleOut struct {
	ID         int64  `json:"id"`
	MealSlotID int64  `json:"mealSlotId"`
	CourseID   int64  `json:"courseId"`
	RecipeID   int64  `json:"recipeId,omitempty"`
	RecipeName string `json:"recipeName,omitempty"`
	Tag        string `json:"tag,omitempty"`
}

type slotOut struct {
	Date       string  `json:"date"`
	MealSlotID int64   `json:"mealSlotId"`
	Name       string  `json:"name"`
	Time       string  `json:"time"` // the EFFECTIVE time: the date's own when set (ADR 0014), else the usual one
	At         string  `json:"at"`
	Portions   float64 `json:"portions"` // Guests included
	// B5-SD (ADR 0014): the usual time (differs from time only when the date has its own), whether the Meal Slot is
	// Not served on the date, and its Guests. Filled by slotFor.
	UsualTime  string        `json:"usualTime"`
	NotServed  bool          `json:"notServed"`
	Guests     int           `json:"guests"`
	Attendance []attendeeOut `json:"attendance"`
	Rules      []ruleOut     `json:"rules"`
	// Courses are the slot's Course rows in the slot's order, then history rows (crs-c2 §3.1).
	Courses []courseOut `json:"courses"`
	// CookMinutes is the slot's timeline total in minutes, null when nothing fresh is left to cook; StartBy the time to
	// start cooking by (omitted with CookMinutes null).
	CookMinutes *int   `json:"cookMinutes"`
	StartBy     string `json:"startBy,omitempty"`
}

// courseOut is one Course row of a slot (crs-c2 §3.1): exactly one of meal, unfilled, coveredBy and unserved is set,
// or none for a date the planner has not planned.
type courseOut struct {
	CourseID        int64         `json:"courseId"`
	Name            string        `json:"name"`
	Main            bool          `json:"main"`
	Optional        bool          `json:"optional"`
	OptOutMemberIDs []int64       `json:"optOutMemberIds"`
	Meal            *mealOut      `json:"meal"`
	Unfilled        *unfilledOut  `json:"unfilled"`
	CoveredBy       *coveredByOut `json:"coveredBy"`
	Unserved        *string       `json:"unserved"`
}

type coveredByOut struct {
	CourseID   int64  `json:"courseId"`
	RecipeID   int64  `json:"recipeId"`
	RecipeName string `json:"recipeName"`
}

// listEntryOut is one entry of the to-confirm and couldn't-plan lists: a slot occurrence for one Course, with that
// Course's own meal or reason (crs-c3 §1: the slot itself carries neither).
type listEntryOut struct {
	slotOut
	CourseID   int64        `json:"courseId"`
	CourseName string       `json:"courseName"`
	Meal       *mealOut     `json:"meal"`
	Unfilled   *unfilledOut `json:"unfilled"`
}

// listEntryFor is one flat list entry.
func listEntryFor(e runner.ListEntry, t table) listEntryOut {
	out := listEntryOut{slotOut: slotFor(e.SlotView, t), CourseID: e.Key.CourseID, CourseName: t.courses[e.Key.CourseID]}
	if e.Meal != nil {
		out.Meal = mealFor(*e.Meal, t)
		out.Meal.StartBy = plan.StartBy(e.At, out.Meal.CookMinutes)
	}
	if e.Unfilled != nil {
		out.Unfilled = unfilledFor(*e.Unfilled)
	}
	return out
}

// putOut is the answer of a PUT: the meal and the Courses a Whole meal removed (covered, always a list).
type putOut struct {
	*mealOut
	Covered []int64 `json:"covered"`
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
	FromCourseID   int64   `json:"fromCourseId"`
	// B5-LO (ADR 0012): where it sits and what Feeder asks. storagePlaceId and storagePlaceName are null for a Leftover
	// in no Storage Place (or whose place was deleted); frozenOn is null when it is not frozen; plannedPortions is what
	// the Planned Meals served from it are planned to use. NOT FILLED yet (test commit).
	StoragePlaceID   *int64  `json:"storagePlaceId"`
	StoragePlaceName *string `json:"storagePlaceName"`
	Frozen           bool    `json:"frozen"`
	FrozenOn         *string `json:"frozenOn"`
	ToAnswer         bool    `json:"toAnswer"`
	PlannedPortions  float64 `json:"plannedPortions"`
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
	WholeMeal           bool     `json:"wholeMeal"`
	Covers              []string `json:"covers"` // the names of the Courses a Whole meal would cover
	Relaxed             bool     `json:"relaxed"`
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
	courseID := m.Key.CourseID
	out := &mealOut{
		Date: m.Key.Date, MealSlotID: m.Key.MealSlotID, CourseID: courseID, CourseName: t.courses[courseID],
		RecipeID: m.RecipeID, RecipeName: t.recipes[m.RecipeID], WholeMeal: t.whole[m.RecipeID], Relaxed: m.Relaxed,
		Batches: m.Batches, Portions: m.Portions, State: string(m.State), Pinned: m.Pinned,
		Why:      whyFor(m.Why, t),
		PhotoURL: t.recipePhoto[m.RecipeID],
	}
	// A meal served from a Leftover is already cooked: no cook time, so no startBy either (slotFor).
	if m.From == nil {
		out.CookMinutes = t.recipeMinutes[m.RecipeID]
	}
	if m.From != nil {
		from := m.From.From
		if from.Date == "" && m.From.LeftoverID != 0 {
			if k, ok := t.leftoverFrom[m.From.LeftoverID]; ok {
				from = k
			}
		}
		src := &leftoverSourceOut{Date: from.Date, MealSlotID: from.MealSlotID, RecipeName: t.recipes[m.RecipeID]}
		if m.From.LeftoverID != 0 {
			id := m.From.LeftoverID
			src.LeftoverID = &id
		}
		out.ServedFromLeftover = src
		out.ReheatMinutes = t.recipeReheat[m.RecipeID]
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
	return ruleOut{ID: r.ID, MealSlotID: r.MealSlotID, CourseID: r.CourseID, RecipeID: r.RecipeID,
		RecipeName: t.recipes[r.RecipeID], Tag: r.Tag}
}

// courseFor is one Course row of a slot occurrence at the instant at. The row's meal carries its startBy (crs-c3 §1).
func courseFor(c runner.CourseView, at time.Time, t table) courseOut {
	out := courseOut{CourseID: c.CourseID, Name: t.courses[c.CourseID], Main: c.Main, Optional: c.Optional,
		OptOutMemberIDs: append([]int64{}, c.OptOutMemberIDs...)}
	if c.Meal != nil {
		out.Meal = mealFor(*c.Meal, t)
		out.Meal.StartBy = plan.StartBy(at, out.Meal.CookMinutes)
	}
	if c.Unfilled != nil {
		out.Unfilled = unfilledFor(*c.Unfilled)
	}
	if c.CoveredBy != nil {
		out.CoveredBy = &coveredByOut{CourseID: c.CoveredBy.CourseID, RecipeID: c.CoveredBy.RecipeID,
			RecipeName: t.recipes[c.CoveredBy.RecipeID]}
	}
	if c.Unserved != "" {
		reason := c.Unserved
		out.Unserved = &reason
	}
	return out
}

func slotFor(s runner.SlotView, t table) slotOut {
	out := slotOut{
		Date: s.Key.Date, MealSlotID: s.Key.MealSlotID, Name: s.Name, Time: s.Time,
		At: s.At.Format(time.RFC3339), Portions: s.Portions, Attendance: []attendeeOut{}, Rules: rulesFor(s.Rules, t),
		Courses: []courseOut{}, UsualTime: s.UsualTime, NotServed: s.NotServed, Guests: s.Guests,
	}
	for _, c := range s.Courses {
		out.Courses = append(out.Courses, courseFor(c, s.At, t))
	}
	if s.CookMinutes != nil {
		minutes := *s.CookMinutes
		out.CookMinutes = &minutes
		out.StartBy = plan.StartBy(s.At, minutes)
	}
	for _, a := range s.Attendance {
		out.Attendance = append(out.Attendance, attendeeOut{MemberID: a.MemberID, Name: t.members[a.MemberID], Factor: a.Factor,
			ID: a.MemberID, Colour: t.memberColour[a.MemberID],
			PhotoURL: t.memberPhoto[a.MemberID], Avatar: t.memberAvatar[a.MemberID]})
	}
	return out
}

// alternativeFor is one alternative of the Swap sheet.
func alternativeFor(alt runner.Alternative, t table) alternativeOut {
	covers := []string{}
	for _, c := range alt.Covers {
		covers = append(covers, t.courses[c])
	}
	return alternativeOut{RecipeID: alt.RecipeID, RecipeName: t.recipes[alt.RecipeID], Batches: alt.Batches,
		NewLeftoverPortions: alt.NewLeftoverPortions, NewLeftoverUseBy: alt.NewLeftoverUseBy, Score: alt.Score,
		Why: whyFor(alt.Why, t), PhotoURL: t.recipePhoto[alt.RecipeID], WholeMeal: alt.WholeMeal, Covers: covers,
		Relaxed: alt.Relaxed}
}

func unfilledFor(u plan.Unfilled) *unfilledOut {
	return &unfilledOut{Reason: u.Reason, SlotRuleClaimed: u.SlotRuleClaimed, Eliminated: eliminationsOut{
		Considered: u.Eliminated.Considered, Exclusion: u.Eliminated.Exclusion, CoolDown: u.Eliminated.CoolDown,
		VarietyRule: u.Eliminated.VarietyRule, AdvanceStep: u.Eliminated.AdvanceStep}}
}

func leftoverFor(l plan.Leftover, t table) leftoverOut {
	return leftoverOut{ID: l.ID, RecipeID: l.RecipeID, RecipeName: t.recipes[l.RecipeID], Portions: l.Portions,
		CookedOn: l.CookedOn, UseBy: l.UseBy, FromDate: l.From.Date, FromMealSlotID: l.From.MealSlotID,
		FromCourseID: l.From.CourseID}
}
