// Package httpapi exposes the recipes module: Recipes, Tags, images and Member
// preferences (see docs/dev/design/t8-recipes.md for the route table). Handlers
// are thin: parse, call internal/recipe/store, respond. Registers itself in init().
package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	imgs "github.com/fabbarix/feeder-ng/internal/images"
	"github.com/fabbarix/feeder-ng/internal/images/refs"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

func init() { app.Register(app.Module{Name: "recipes", Mount: mount}) }

// topic is the live-update topic the SPA invalidates its Recipe queries on.
const topic = "recipes"

func mount(r *app.Router, d app.Deps) {
	images := imaging.NewStore(filepath.Join(d.Config.DataDir, "images"))
	guarded := imgs.NewGuarded(images, refs.New(d.DB))
	ings := ingstore.New(d.DB, d.Clock)
	a := &api{
		store:  store.New(d.DB, d.Clock, ingredientSource{ings}).WithImages(guarded).WithReadyMeal(readyMealIngredients{ings}),
		images: images,
		events: d.Events,
	}
	r.User("GET /api/recipes", a.list)
	r.User("POST /api/recipes", a.create)
	r.User("GET /api/recipes/{id}", a.get)
	r.User("PUT /api/recipes/{id}", a.update)
	r.User("DELETE /api/recipes/{id}", a.delete)
	r.User("POST /api/recipes/{id}/archive", a.archive)
	r.User("POST /api/recipes/{id}/unarchive", a.unarchive)
	r.User("GET /api/recipe-preferences", a.getPreferences)
	r.User("PUT /api/recipes/{id}/preference", a.setPreference)
	r.User("PUT /api/ingredient-exclusions/{ingredientId}", a.setExclusion)
}

// ingredientSource adapts the ingredient store (T2) for recipe validation.
type ingredientSource struct{ s *ingstore.Store }

func (src ingredientSource) Units(ctx context.Context, id int64) (units.Ingredient, bool, error) {
	ing, err := src.s.Get(ctx, id)
	if errors.Is(err, ingstore.ErrNotFound) {
		return units.Ingredient{}, false, nil
	}
	if err != nil {
		return units.Ingredient{}, false, err
	}
	return ing.Units(), true, nil
}

// readyMealIngredients adapts the ingredient store for the Ready Meal rule.
type readyMealIngredients struct{ s *ingstore.Store }

func (r readyMealIngredients) Candidates(ctx context.Context) ([]recipe.ReadyMealCandidate, error) {
	list, err := r.s.List(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]recipe.ReadyMealCandidate, 0, len(list))
	for _, i := range list {
		out = append(out, recipe.ReadyMealCandidate{ID: i.ID, Name: i.Name, Base: i.Base})
	}
	return out, nil
}

func (r readyMealIngredients) CreatePieceTx(ctx context.Context, tx *sql.Tx, name string) (int64, error) {
	ing, err := r.s.CreateTx(ctx, tx, ingredient.Input{Name: name, Base: units.Piece})
	if errors.Is(err, ingstore.ErrNameTaken) {
		return 0, store.ErrReadyMealNameTaken
	}
	if err != nil {
		return 0, err
	}
	return ing.ID, nil
}

type api struct {
	store  *store.Store
	images *imaging.Store
	events *events.Bus
}

// JSON shapes.

type sourceJSON struct {
	URL         string `json:"url"`
	Attribution string `json:"attribution"`
}

type useJSON struct {
	IngredientID int64   `json:"ingredientId"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
}

type lineJSON struct {
	IngredientID int64   `json:"ingredientId"`
	Ingredient   string  `json:"ingredient"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
	Optional     bool    `json:"optional"`
	Note         string  `json:"note"`
}

type stepJSON struct {
	Text            string    `json:"text"`
	Kind            string    `json:"kind"`
	DurationMinutes int       `json:"durationMinutes"`
	LeadTimeMinutes int       `json:"leadTimeMinutes"`
	After           []int     `json:"after"`
	Uses            []useJSON `json:"uses"`
	Image           string    `json:"image"`
	ImageURL        string    `json:"imageUrl"`
}

type advanceJSON struct {
	Step            int `json:"step"`
	LeadTimeMinutes int `json:"leadTimeMinutes"`
}

type recipeJSON struct {
	ID                int64         `json:"id"`
	Name              string        `json:"name"`
	Description       string        `json:"description"`
	Yield             float64       `json:"yield"`
	ReadyMeal         bool          `json:"readyMeal"`
	Tags              []string      `json:"tags"`
	CooldownDays      *int          `json:"cooldownDays"`
	LeftoverUseByDays *int          `json:"leftoverUseByDays"`
	ReheatMinutes     *int          `json:"reheatMinutes"`
	Source            sourceJSON    `json:"source"`
	Image             string        `json:"image"`
	ImageURL          string        `json:"imageUrl"`
	Archived          bool          `json:"archived"`
	Courses           []courseJSON  `json:"courses"`
	WholeMeal         bool          `json:"wholeMeal"`
	Lines             []lineJSON    `json:"lines"`
	Steps             []stepJSON    `json:"steps"`
	TotalMinutes      int           `json:"totalMinutes"`
	AdvanceMinutes    int           `json:"advanceMinutes"`
	Advance           []advanceJSON `json:"advance"`
	CreatedAt         string        `json:"createdAt"`
	UpdatedAt         string        `json:"updatedAt"`
}

type summaryJSON struct {
	ID             int64    `json:"id"`
	Name           string   `json:"name"`
	Yield          float64  `json:"yield"`
	ReadyMeal      bool     `json:"readyMeal"`
	Tags           []string `json:"tags"`
	ImageURL       string   `json:"imageUrl"`
	Archived       bool     `json:"archived"`
	TotalMinutes   int      `json:"totalMinutes"`
	AdvanceMinutes int      `json:"advanceMinutes"`
	CourseIDs      []int64  `json:"courseIds"`
	WholeMeal      bool     `json:"wholeMeal"`
}

// courseJSON is a Course of a Recipe, in household order.
type courseJSON struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type prefsJSON struct {
	MemberID            int64             `json:"memberId"`
	Recipes             map[string]string `json:"recipes"`
	ExcludedIngredients []int64           `json:"excludedIngredients"`
}

// Request bodies.

type recipeBody struct {
	Name              string     `json:"name"`
	Description       string     `json:"description"`
	Yield             float64    `json:"yield"`
	ReadyMeal         bool       `json:"readyMeal"`
	Tags              []string   `json:"tags"`
	CooldownDays      *int       `json:"cooldownDays"`
	LeftoverUseByDays *int       `json:"leftoverUseByDays"`
	ReheatMinutes     *int       `json:"reheatMinutes"`
	Source            sourceJSON `json:"source"`
	Image             string     `json:"image"`
	// CourseIDs: absent or null keeps the stored Courses (a create gets the main Course); [] is refused.
	CourseIDs []int64 `json:"courseIds"`
	// WholeMeal: absent or null keeps the stored value (a create gets the default for the Recipe).
	WholeMeal *bool      `json:"wholeMeal"`
	Lines     []lineBody `json:"lines"`
	Steps     []stepBody `json:"steps"`
}

type lineBody struct {
	IngredientID int64   `json:"ingredientId"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
	Optional     bool    `json:"optional"`
	Note         string  `json:"note"`
}

type stepBody struct {
	Text            string    `json:"text"`
	Kind            string    `json:"kind"`
	DurationMinutes int       `json:"durationMinutes"`
	LeadTimeMinutes int       `json:"leadTimeMinutes"`
	After           []int     `json:"after"`
	Uses            []useJSON `json:"uses"`
	Image           string    `json:"image"`
}

func (b recipeBody) input() recipe.Input {
	in := recipe.Input{
		Name:              b.Name,
		Description:       b.Description,
		Yield:             b.Yield,
		ReadyMeal:         b.ReadyMeal,
		Tags:              b.Tags,
		CooldownDays:      b.CooldownDays,
		LeftoverUseByDays: b.LeftoverUseByDays,
		ReheatMinutes:     b.ReheatMinutes,
		Source:            recipe.Source{URL: b.Source.URL, Attribution: b.Source.Attribution},
		Image:             b.Image,
		CourseIDs:         b.CourseIDs,
		WholeMeal:         b.WholeMeal,
	}
	for _, l := range b.Lines {
		in.Lines = append(in.Lines, recipe.Line{IngredientID: l.IngredientID, Quantity: l.Quantity, Unit: l.Unit, Optional: l.Optional, Note: l.Note})
	}
	for _, s := range b.Steps {
		st := recipe.Step{
			Text:            s.Text,
			Kind:            schedule.Kind(s.Kind),
			DurationMinutes: s.DurationMinutes,
			LeadTimeMinutes: s.LeadTimeMinutes,
			After:           s.After,
			Image:           s.Image,
		}
		for _, u := range s.Uses {
			st.Uses = append(st.Uses, recipe.Use{IngredientID: u.IngredientID, Quantity: u.Quantity, Unit: u.Unit})
		}
		in.Steps = append(in.Steps, st)
	}
	return in
}

// Handlers.

func (a *api) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	archived := q.Get("archived")
	switch archived {
	case "", "no", "yes", "all":
	default:
		writeFieldError(w, "archived", "archived_invalid", "archived must be no, yes or all")
		return
	}
	course, ok := optionalID(q.Get("course"))
	if !ok || (course != nil && *course <= 0) {
		writeFieldError(w, "course", "course_invalid", "course must be a Course id")
		return
	}
	notCourse, ok := optionalID(q.Get("notCourse"))
	if !ok || (notCourse != nil && *notCourse <= 0) {
		writeFieldError(w, "notCourse", "course_invalid", "notCourse must be a Course id")
		return
	}
	f := store.ListFilter{Archived: archived, Tag: q.Get("tag"), Query: q.Get("q")}
	if course != nil {
		f.CourseID = *course
	}
	if notCourse != nil {
		f.NotCourseID = *notCourse
	}
	list, err := a.store.List(r.Context(), f)
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]summaryJSON, 0, len(list))
	for _, s := range list {
		out = append(out, summaryJSON{
			ID: s.ID, Name: s.Name, Yield: s.Yield, ReadyMeal: s.ReadyMeal, Tags: nonNil(s.Tags),
			ImageURL: imgs.URL(s.Image), Archived: s.Archived, TotalMinutes: s.TotalMinutes, AdvanceMinutes: s.AdvanceMinutes,
			CourseIDs: nonNilIDs(s.CourseIDs), WholeMeal: s.WholeMeal,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *api) create(w http.ResponseWriter, r *http.Request) {
	var b recipeBody
	if err := httpx.DecodeJSON(r, &b); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	rec, err := a.store.Create(r.Context(), b.input())
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(rec.ID)
	httpx.WriteJSON(w, http.StatusCreated, toRecipeJSON(rec))
}

func (a *api) get(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	rec, err := a.store.Get(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toRecipeJSON(rec))
}

func (a *api) update(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var b recipeBody
	if err := httpx.DecodeJSON(r, &b); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	rec, err := a.store.Update(r.Context(), id, b.input())
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	httpx.WriteJSON(w, http.StatusOK, toRecipeJSON(rec))
}

func (a *api) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if err := a.store.Delete(r.Context(), id); err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) archive(w http.ResponseWriter, r *http.Request) { a.setArchived(w, r, true) }

func (a *api) unarchive(w http.ResponseWriter, r *http.Request) { a.setArchived(w, r, false) }

func (a *api) setArchived(w http.ResponseWriter, r *http.Request, archived bool) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	rec, err := a.store.SetArchived(r.Context(), id, archived)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	httpx.WriteJSON(w, http.StatusOK, toRecipeJSON(rec))
}

func (a *api) getPreferences(w http.ResponseWriter, r *http.Request) {
	explicit, ok := optionalID(r.URL.Query().Get("memberId"))
	if !ok {
		writeErr(w, store.ErrUnknownMember)
		return
	}
	memberID, err := a.memberFor(r, explicit)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.writePreferences(w, r, memberID)
}

func (a *api) setPreference(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var b struct {
		State    string `json:"state"`
		MemberID *int64 `json:"memberId"`
	}
	if err := httpx.DecodeJSON(r, &b); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	st, ok := recipe.ParseState(b.State)
	if !ok {
		writeFieldError(w, "state", "state_invalid", "state must be favourite, dislike, exclusion or none")
		return
	}
	memberID, err := a.memberFor(r, b.MemberID)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := a.store.SetRecipeState(r.Context(), memberID, id, st); err != nil {
		writeErr(w, err)
		return
	}
	a.preferencesChanged(memberID)
	a.writePreferences(w, r, memberID)
}

func (a *api) setExclusion(w http.ResponseWriter, r *http.Request) {
	ingredientID, err := strconv.ParseInt(r.PathValue("ingredientId"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	var b struct {
		Excluded bool   `json:"excluded"`
		MemberID *int64 `json:"memberId"`
	}
	if err := httpx.DecodeJSON(r, &b); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	memberID, err := a.memberFor(r, b.MemberID)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := a.store.SetIngredientExclusion(r.Context(), memberID, ingredientID, b.Excluded); err != nil {
		writeErr(w, err)
		return
	}
	a.preferencesChanged(memberID)
	a.writePreferences(w, r, memberID)
}

// memberFor is the explicit Member, or else the Member linked to the signed-in User.
func (a *api) memberFor(r *http.Request, explicit *int64) (int64, error) {
	if explicit != nil {
		return *explicit, nil
	}
	u, ok := auth.UserFrom(r.Context())
	if !ok {
		return 0, store.ErrNoMember
	}
	return a.store.MemberForUser(r.Context(), u.ID)
}

func (a *api) writePreferences(w http.ResponseWriter, r *http.Request, memberID int64) {
	p, err := a.store.Preferences(r.Context(), memberID)
	if err != nil {
		writeErr(w, err)
		return
	}
	out := prefsJSON{MemberID: memberID, Recipes: map[string]string{}, ExcludedIngredients: []int64{}}
	for id, st := range p.Recipes {
		out.Recipes[strconv.FormatInt(id, 10)] = string(st)
	}
	out.ExcludedIngredients = append(out.ExcludedIngredients, p.ExcludedIngredients...)
	httpx.WriteJSON(w, http.StatusOK, out)
}

// Events.

func (a *api) changed(id int64) {
	a.events.Publish(topic, map[string]int64{"id": id})
}

func (a *api) preferencesChanged(memberID int64) {
	a.events.Publish(topic, map[string]int64{"preferences": memberID})
}

// Helpers.

func idParam(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return 0, false
	}
	return id, true
}

// optionalID parses an optional numeric query value; ok is false when it is not a number.
func optionalID(s string) (*int64, bool) {
	if s == "" {
		return nil, true
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return nil, false
	}
	return &n, true
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func toRecipeJSON(rec recipe.Recipe) recipeJSON {
	out := recipeJSON{
		ID: rec.ID, Name: rec.Name, Description: rec.Description, Yield: rec.Yield, ReadyMeal: rec.ReadyMeal,
		Tags: nonNil(rec.Tags), CooldownDays: rec.CooldownDays, LeftoverUseByDays: rec.LeftoverUseByDays, ReheatMinutes: rec.ReheatMinutes,
		Source: sourceJSON{URL: rec.Source.URL, Attribution: rec.Source.Attribution},
		Image:  rec.Image, ImageURL: imgs.URL(rec.Image), Archived: rec.Archived,
		Courses: []courseJSON{}, WholeMeal: rec.WholeMeal != nil && *rec.WholeMeal,
		Lines: []lineJSON{}, Steps: []stepJSON{}, Advance: []advanceJSON{},
		TotalMinutes: rec.Timing.TotalMinutes, AdvanceMinutes: rec.Timing.AdvanceMinutes,
		CreatedAt: rec.CreatedAt.UTC().Format(time.RFC3339), UpdatedAt: rec.UpdatedAt.UTC().Format(time.RFC3339),
	}
	for _, c := range rec.Courses {
		out.Courses = append(out.Courses, courseJSON{ID: c.ID, Name: c.Name})
	}
	for _, l := range rec.Lines {
		out.Lines = append(out.Lines, lineJSON{
			IngredientID: l.IngredientID, Ingredient: l.Ingredient, Quantity: l.Quantity, Unit: l.Unit,
			Optional: l.Optional, Note: l.Note,
		})
	}
	for _, s := range rec.Steps {
		sj := stepJSON{
			Text: s.Text, Kind: string(s.Kind), DurationMinutes: s.DurationMinutes, LeadTimeMinutes: s.LeadTimeMinutes,
			After: nonNilInts(s.After), Uses: []useJSON{}, Image: s.Image, ImageURL: imgs.URL(s.Image),
		}
		for _, u := range s.Uses {
			sj.Uses = append(sj.Uses, useJSON{IngredientID: u.IngredientID, Quantity: u.Quantity, Unit: u.Unit})
		}
		out.Steps = append(out.Steps, sj)
	}
	for _, a := range rec.Timing.Advance {
		out.Advance = append(out.Advance, advanceJSON{Step: a.Step, LeadTimeMinutes: a.LeadTimeMinutes})
	}
	return out
}

func nonNilIDs(s []int64) []int64 {
	if s == nil {
		return []int64{}
	}
	return s
}

func nonNilInts(s []int) []int {
	if s == nil {
		return []int{}
	}
	return s
}

// writeFieldError answers a request field the server refuses.
func writeFieldError(w http.ResponseWriter, field, reason, message string) {
	httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]string{
		"code": "validation_failed", "message": message, "field": field, "reason": reason,
	}})
}

// writeErr maps domain and store errors to responses.
func writeErr(w http.ResponseWriter, err error) {
	var ve *recipe.ValidationError
	var ue *recipe.UnknownUnitError
	switch {
	case errors.As(err, &ve):
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]string{
			"code": "validation_failed", "message": ve.Message, "field": ve.Field, "reason": ve.Code,
		}})
	case errors.As(err, &ue):
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
			"code": "unknown_unit", "message": ue.Error(), "field": ue.Field,
			"ingredientId": ue.IngredientID, "ingredient": ue.Ingredient, "unit": ue.Unit, "baseUnit": string(ue.Base),
		}})
	case errors.Is(err, store.ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
	case errors.Is(err, store.ErrAlreadyPlanned):
		httpx.WriteError(w, http.StatusConflict, "already_planned", "This Recipe was planned, so it can only be archived")
	case errors.Is(err, store.ErrReadyMealNameTaken):
		httpx.WriteError(w, http.StatusConflict, "name_taken", "An Ingredient with that name was just created; save again")
	case errors.Is(err, store.ErrUnknownMember):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "unknown_member", "That Member does not exist")
	case errors.Is(err, store.ErrNoMember):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "no_member", "You are not linked to a Member; name one")
	default:
		httpx.WriteAPIError(w, err)
	}
}
