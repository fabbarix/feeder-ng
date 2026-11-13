// Package httpapi exposes the recipes module: Recipes, Tags, images and Member
// preferences (see docs/dev/design/t8-recipes.md for the route table). Handlers
// are thin: parse, call internal/recipe/store, respond. Registers itself in init().
package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
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
	planstore "github.com/fabbarix/feeder-ng/internal/plan/store"
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
	// The Base recipe port (ADR 0015): the Ingredient guards see this module's Base recipes.
	ings := ingstore.New(d.DB, d.Clock, ingstore.WithBaseRecipes(store.NewBaseRecipePort(d.DB)))
	a := &api{
		store:  store.New(d.DB, d.Clock, ingredientSource{ings}).WithImages(guarded).WithReadyMeal(readyMealIngredients{ings}).WithIngredients(ings),
		images: images,
		events: d.Events,
		// Last cooked comes from the plan store (beta.5 F7): the recipe store never reads plan tables.
		lastCooked: planstore.New(d.DB, d.Clock).LastCooked,
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
	r.User("POST /api/recipes/{id}/to-base", a.toBase)
	r.User("POST /api/recipes/{id}/to-plannable", a.toPlannable)
	r.User("POST /api/recipes/{id}/lines/{lineId}/base", a.linkLine)
	r.User("DELETE /api/recipes/{id}/lines/{lineId}/base", a.unlinkLine)
	r.User("GET /api/recipes/{id}/link-candidates", a.linkCandidates)
	r.User("POST /api/recipes/{id}/link", a.link)
	r.User("POST /api/recipes/{id}/unlink", a.unlink)
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
	// lastCooked is the port to the plan store (beta.5 F7, ADR 0010 pattern): Recipe id -> latest date (YYYY-MM-DD) of
	// a Cooked fresh Planned Meal. Wired at mount; nil means no Recipe was ever cooked. The recipe store never reads
	// plan tables.
	lastCooked LastCooked
}

// LastCooked answers, for every Recipe that was cooked fresh, the latest date it was. A Recipe never cooked is absent.
type LastCooked func(ctx context.Context) (map[int64]string, error)

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
	ID           int64   `json:"id"`
	IngredientID int64   `json:"ingredientId"`
	Ingredient   string  `json:"ingredient"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
	Optional     bool    `json:"optional"`
	Note         string  `json:"note"`
	// BaseRecipe is the Base recipe the line calls for (null for a plain line); NeededAtStep is the stored override,
	// NeededAt the effective Step index (§3.3).
	BaseRecipe             *baseRefJSON `json:"baseRecipe"`
	NeededAtStep           *int         `json:"neededAtStep"`
	NeededAt               int          `json:"neededAt"`
	LinkedFromIngredientID *int64       `json:"linkedFromIngredientId"`
	// NeededAtDefault is the Step the default rule gives, with the override cleared (null for a plain line).
	NeededAtDefault *int `json:"neededAtDefault"`
}

// baseRefJSON is the Base recipe a line calls for.
type baseRefJSON struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Archived bool   `json:"archived"`
	Empty    bool   `json:"empty"`
}

// refJSON names a Recipe.
type refJSON struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Archived bool   `json:"archived"`
}

// withinJSON is an Ingredient inside a Base recipe a Recipe calls for, with the chain of Base recipes to it.
type withinJSON struct {
	IngredientID int64    `json:"ingredientId"`
	Name         string   `json:"name"`
	Path         []string `json:"path"`
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
	FrozenUseByDays   *int          `json:"frozenUseByDays"`
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
	// LastCookedOn: see summaryJSON. Filled by GET /api/recipes/{id} only; null on the write responses.
	LastCookedOn *string `json:"lastCookedOn"`
	// Base recipes (§10): the kind, the Yield's unit (null for a plannable Recipe), its Ingredient, the Recipes that
	// call for it, and the Ingredients inside it.
	BaseRecipe       bool         `json:"baseRecipe"`
	YieldUnit        *string      `json:"yieldUnit"`
	BaseIngredientID int64        `json:"baseIngredientId"`
	UsedBy           []refJSON    `json:"usedBy"`
	Within           []withinJSON `json:"within"`
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
	// LastCookedOn is the latest date a Cooked fresh Planned Meal of the Recipe had, null when it was never cooked.
	LastCookedOn *string `json:"lastCookedOn"`
	BaseRecipe   bool    `json:"baseRecipe"`
	YieldUnit    *string `json:"yieldUnit"`
	UsedByCount  int     `json:"usedByCount"`
	// BaseIngredientID is the Base recipe's Ingredient (0 for a plannable Recipe); WouldCycle is set with ?for= (round 2).
	BaseIngredientID int64 `json:"baseIngredientId"`
	WouldCycle       bool  `json:"wouldCycle"`
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
	FrozenUseByDays   *int       `json:"frozenUseByDays"`
	ReheatMinutes     *int       `json:"reheatMinutes"`
	Source            sourceJSON `json:"source"`
	Image             string     `json:"image"`
	// CourseIDs: absent or null keeps the stored Courses (a create gets the main Course); [] is refused.
	CourseIDs []int64 `json:"courseIds"`
	// WholeMeal: absent or null keeps the stored value (a create gets the default for the Recipe).
	WholeMeal *bool      `json:"wholeMeal"`
	Lines     []lineBody `json:"lines"`
	Steps     []stepBody `json:"steps"`
	// BaseRecipe: absent keeps the stored kind; YieldUnit is the unit of a Base recipe's Yield; TakeOver answers the
	// take-over ask of §3.2.
	BaseRecipe *bool  `json:"baseRecipe"`
	YieldUnit  string `json:"yieldUnit"`
	TakeOver   *bool  `json:"takeOver"`
}

type lineBody struct {
	ID           int64   `json:"id"`
	IngredientID int64   `json:"ingredientId"`
	BaseRecipeID int64   `json:"baseRecipeId"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
	Optional     bool    `json:"optional"`
	Note         string  `json:"note"`
	NeededAtStep *int    `json:"neededAtStep"`
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
		FrozenUseByDays:   b.FrozenUseByDays,
		ReheatMinutes:     b.ReheatMinutes,
		Source:            recipe.Source{URL: b.Source.URL, Attribution: b.Source.Attribution},
		Image:             b.Image,
		CourseIDs:         b.CourseIDs,
		WholeMeal:         b.WholeMeal,
		BaseRecipe:        b.BaseRecipe,
		YieldUnit:         b.YieldUnit,
		TakeOver:          b.TakeOver,
	}
	for _, l := range b.Lines {
		in.Lines = append(in.Lines, recipe.Line{ID: l.ID, IngredientID: l.IngredientID, BaseRecipeID: l.BaseRecipeID,
			Quantity: l.Quantity, Unit: l.Unit, Optional: l.Optional, Note: l.Note, NeededAtStep: l.NeededAtStep})
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

// Sorts of the Recipe list (?sort=). The empty value and "name" are the default: by name.
const (
	sortName           = "name"
	sortLastCookedAsc  = "last_cooked_asc"
	sortLastCookedDesc = "last_cooked_desc"
)

// parseSort reads ?sort=; ok is false for a sort the list does not know.
func parseSort(s string) (string, bool) {
	switch s {
	case "", sortName:
		return sortName, true
	case sortLastCookedAsc, sortLastCookedDesc:
		return s, true
	}
	return "", false
}

// lastCookedOf reads Recipe id -> last cooked date through the port; no port (or none cooked) is an empty map.
func (a *api) lastCookedOf(r *http.Request) (map[int64]string, error) {
	if a.lastCooked == nil {
		return map[int64]string{}, nil
	}
	return a.lastCooked(r.Context())
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
	sort, ok := parseSort(q.Get("sort"))
	if !ok {
		writeFieldError(w, "sort", "sort_invalid", "sort must be name, last_cooked_asc or last_cooked_desc")
		return
	}
	kind := q.Get("kind")
	switch kind {
	case "", "plannable", "base", "all":
	default:
		writeFieldError(w, "kind", "kind_invalid", "kind must be plannable, base or all")
		return
	}
	forID, ok := optionalID(q.Get("for"))
	if !ok || (forID != nil && *forID <= 0) {
		writeFieldError(w, "for", "for_invalid", "for must be a Recipe id")
		return
	}
	f := store.ListFilter{Archived: archived, Tag: q.Get("tag"), Query: q.Get("q"), Kind: kind}
	if forID != nil {
		f.For = *forID
	}
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
	cooked, err := a.lastCookedOf(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	switch sort {
	case sortLastCookedAsc:
		recipe.SortLastCookedAsc(list, cooked)
	case sortLastCookedDesc:
		recipe.SortLastCookedDesc(list, cooked)
	}
	out := make([]summaryJSON, 0, len(list))
	for _, s := range list {
		j := summaryJSON{
			ID: s.ID, Name: s.Name, Yield: s.Yield, ReadyMeal: s.ReadyMeal, Tags: nonNil(s.Tags),
			ImageURL: imgs.URL(s.Image), Archived: s.Archived, TotalMinutes: s.TotalMinutes, AdvanceMinutes: s.AdvanceMinutes,
			CourseIDs: nonNilIDs(s.CourseIDs), WholeMeal: s.WholeMeal,
			BaseRecipe: s.BaseRecipe, YieldUnit: yieldUnitPtr(s.YieldUnit), UsedByCount: s.UsedByCount,
			BaseIngredientID: s.BaseIngredientID, WouldCycle: s.WouldCycle,
		}
		if d, ok := cooked[s.ID]; ok {
			j.LastCookedOn = &d
		}
		out = append(out, j)
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
	a.ingredientChanged(rec)
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
	cooked, err := a.lastCookedOf(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	j := toRecipeJSON(rec)
	if d, ok := cooked[id]; ok {
		j.LastCookedOn = &d
	}
	httpx.WriteJSON(w, http.StatusOK, j)
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
	a.ingredientChanged(rec)
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

// ingredientChanged tells the Ingredient lists that a Base recipe's Ingredient may have been renamed or taken over
// (round 2): a Base recipe save publishes its Ingredient.
func (a *api) ingredientChanged(rec recipe.Recipe) {
	if rec.IsBase() {
		a.events.Publish("ingredients", map[string]int64{"id": rec.BaseIngredientID})
	}
}

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
		Tags: nonNil(rec.Tags), CooldownDays: rec.CooldownDays, LeftoverUseByDays: rec.LeftoverUseByDays, FrozenUseByDays: rec.FrozenUseByDays,
		ReheatMinutes: rec.ReheatMinutes,
		Source:        sourceJSON{URL: rec.Source.URL, Attribution: rec.Source.Attribution},
		Image:         rec.Image, ImageURL: imgs.URL(rec.Image), Archived: rec.Archived,
		Courses: []courseJSON{}, WholeMeal: rec.WholeMeal != nil && *rec.WholeMeal,
		Lines: []lineJSON{}, Steps: []stepJSON{}, Advance: []advanceJSON{},
		TotalMinutes: rec.Timing.TotalMinutes, AdvanceMinutes: rec.Timing.AdvanceMinutes,
		CreatedAt: rec.CreatedAt.UTC().Format(time.RFC3339), UpdatedAt: rec.UpdatedAt.UTC().Format(time.RFC3339),
	}
	out.BaseRecipe = rec.IsBase()
	out.YieldUnit = yieldUnitPtr(rec.YieldUnit)
	out.BaseIngredientID = rec.BaseIngredientID
	out.UsedBy = []refJSON{}
	for _, u := range rec.UsedBy {
		out.UsedBy = append(out.UsedBy, refJSON{ID: u.ID, Name: u.Name, Archived: u.Archived})
	}
	out.Within = []withinJSON{}
	for _, w := range rec.Within {
		out.Within = append(out.Within, withinJSON{IngredientID: w.IngredientID, Name: w.Name, Path: nonNil(w.Path)})
	}
	for _, c := range rec.Courses {
		out.Courses = append(out.Courses, courseJSON{ID: c.ID, Name: c.Name})
	}
	for _, l := range rec.Lines {
		lj := lineJSON{
			ID: l.ID, IngredientID: l.IngredientID, Ingredient: l.Ingredient, Quantity: l.Quantity, Unit: l.Unit,
			Optional: l.Optional, Note: l.Note, NeededAtStep: l.NeededAtStep, NeededAt: l.NeededAt,
		}
		if l.Base != nil {
			lj.BaseRecipe = &baseRefJSON{ID: l.Base.ID, Name: l.Base.Name, Archived: l.Base.Archived, Empty: l.Base.Empty}
			def := l.NeededAtDefault
			lj.NeededAtDefault = &def
		}
		if l.LinkedFromIngredientID != 0 {
			from := l.LinkedFromIngredientID
			lj.LinkedFromIngredientID = &from
		}
		out.Lines = append(out.Lines, lj)
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

// WriteValidation answers a field the domain refuses (422 validation_failed). The Import Review's Confirm answers the same
// shape, so both are written here.
func WriteValidation(w http.ResponseWriter, ve *recipe.ValidationError) {
	httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]string{
		"code": "validation_failed", "message": ve.Message, "field": ve.Field, "reason": ve.Code,
	}})
}

// WriteTakeOver answers a take-over ask (409 base_recipe_take_over). The Import Review's Confirm answers the same shape,
// so both are written here.
func WriteTakeOver(w http.ResponseWriter, ask *recipe.TakeOverError) {
	recs := []refJSON{}
	for _, u := range ask.Recipes {
		recs = append(recs, refJSON{ID: u.ID, Name: u.Name, Archived: u.Archived})
	}
	httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": map[string]any{
		"code": "base_recipe_take_over", "message": ask.Error(),
		"ingredient": refJSON{ID: ask.Ingredient.ID, Name: ask.Ingredient.Name}, "recipes": recs,
		"stockLots": ask.StockLots, "convertible": ask.Convertible,
	}})
}

// writeErr maps domain and store errors to responses.
func writeErr(w http.ResponseWriter, err error) {
	var ve *recipe.ValidationError
	var ue *recipe.UnknownUnitError
	var ce *recipe.CycleError
	var inUse *recipe.InUseError
	var ask *recipe.TakeOverError
	var taken *recipe.NameTakenError
	switch {
	case errors.As(err, &ce):
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
			"code": "validation_failed", "message": ce.Error(), "field": ce.Field, "reason": recipe.CodeBaseRecipeCycle, "path": ce.Path,
		}})
	case errors.As(err, &inUse):
		used := []refJSON{}
		for _, u := range inUse.UsedBy {
			used = append(used, refJSON{ID: u.ID, Name: u.Name, Archived: u.Archived})
		}
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": map[string]any{
			"code": "base_recipe_in_use", "message": inUse.Error(), "usedBy": used,
		}})
	case errors.As(err, &ask):
		WriteTakeOver(w, ask)
	case errors.As(err, &taken):
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": map[string]any{
			"code": "ingredient_name_taken", "message": taken.Error(),
			"ingredient": refJSON{ID: taken.Ingredient.ID, Name: taken.Ingredient.Name},
		}})
	case errors.Is(err, recipe.ErrBaseUnitInUse):
		httpx.WriteError(w, http.StatusConflict, "base_unit_in_use", "The Yield's unit changes the Base Unit while the Ingredient has Stock, Products or lines")
	case errors.As(err, &ve):
		WriteValidation(w, ve)
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

// Base recipes (ADR 0015, §10). The handlers parse, call the store and respond.

// yieldUnitPtr is the Yield's unit, null for a plannable Recipe.
func yieldUnitPtr(u string) *string {
	if u == "" {
		return nil
	}
	return &u
}

// planJSON is the dry run of to-base (§3.6): what the confirm names.
type planJSON struct {
	PlannedMeals []plannedMealJSON `json:"plannedMeals"`
	SlotRules    []slotRuleJSON    `json:"slotRules"`
	Leftovers    int               `json:"leftovers"`
	Preferences  int               `json:"preferences"`
}

type plannedMealJSON struct {
	Date         string `json:"date"`
	MealSlotName string `json:"mealSlotName"`
	CourseName   string `json:"courseName"`
	Pinned       bool   `json:"pinned"`
	Bought       bool   `json:"bought"`
}

type slotRuleJSON struct {
	ID           int64  `json:"id"`
	MealSlotName string `json:"mealSlotName"`
	CourseName   string `json:"courseName"`
}

// kindBody is the body of a kind change (to-base) or of a Base recipe's line link (create / convert).
type kindBody struct {
	Yield     float64 `json:"yield"`
	YieldUnit string  `json:"yieldUnit"`
	TakeOver  *bool   `json:"takeOver"`
	CourseIDs []int64 `json:"courseIds"`
}

// optionalBody reads a JSON body when there is one; an empty body leaves v as it is.
func optionalBody(r *http.Request, v any) {
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(v)
	}
}

func (a *api) toBase(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	if r.URL.Query().Get("dryRun") != "" {
		plan, err := a.store.ToBasePreview(r.Context(), id)
		if err != nil {
			writeErr(w, err)
			return
		}
		out := planJSON{PlannedMeals: []plannedMealJSON{}, SlotRules: []slotRuleJSON{}, Leftovers: plan.Leftovers, Preferences: plan.Preferences}
		for _, m := range plan.PlannedMeals {
			out.PlannedMeals = append(out.PlannedMeals, plannedMealJSON{Date: m.Date, MealSlotName: m.MealSlotName,
				CourseName: m.CourseName, Pinned: m.Pinned, Bought: m.Bought})
		}
		for _, sr := range plan.SlotRules {
			out.SlotRules = append(out.SlotRules, slotRuleJSON{ID: sr.ID, MealSlotName: sr.MealSlotName, CourseName: sr.CourseName})
		}
		httpx.WriteJSON(w, http.StatusOK, out)
		return
	}
	var b kindBody
	if err := httpx.DecodeJSON(r, &b); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	rec, err := a.store.ToBase(r.Context(), id, recipe.ToBaseInput{Yield: b.Yield, YieldUnit: b.YieldUnit, TakeOver: b.TakeOver})
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	a.ingredientChanged(rec)
	httpx.WriteJSON(w, http.StatusOK, toRecipeJSON(rec))
}

func (a *api) toPlannable(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var b kindBody
	if err := httpx.DecodeJSON(r, &b); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	rec, err := a.store.ToPlannable(r.Context(), id, recipe.ToPlannableInput{Yield: b.Yield, CourseIDs: b.CourseIDs})
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	httpx.WriteJSON(w, http.StatusOK, toRecipeJSON(rec))
}

// linkBody is the body of the line link: exactly one of baseRecipeId, create or convertRecipeId (§3.7).
type linkBody struct {
	BaseRecipeID    int64 `json:"baseRecipeId"`
	ConvertRecipeID int64 `json:"convertRecipeId"`
	Create          *struct {
		Name      string  `json:"name"`
		Yield     float64 `json:"yield"`
		YieldUnit string  `json:"yieldUnit"`
	} `json:"create"`
	Yield     float64 `json:"yield"`
	YieldUnit string  `json:"yieldUnit"`
	TakeOver  *bool   `json:"takeOver"`
}

func (a *api) linkLine(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	lineID, err := strconv.ParseInt(r.PathValue("lineId"), 10, 64)
	if err != nil || lineID <= 0 {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	var b linkBody
	if err := httpx.DecodeJSON(r, &b); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	req := recipe.LinkRequest{BaseRecipeID: b.BaseRecipeID, ConvertRecipeID: b.ConvertRecipeID, Yield: b.Yield, YieldUnit: b.YieldUnit, TakeOver: b.TakeOver}
	if b.Create != nil {
		req.Create = &recipe.NewBase{Name: b.Create.Name, Yield: b.Create.Yield, YieldUnit: b.Create.YieldUnit}
	}
	rec, err := a.store.LinkLine(r.Context(), id, lineID, req)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	httpx.WriteJSON(w, http.StatusOK, toRecipeJSON(rec))
}

func (a *api) unlinkLine(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	lineID, err := strconv.ParseInt(r.PathValue("lineId"), 10, 64)
	if err != nil || lineID <= 0 {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	var b struct {
		IngredientID int64 `json:"ingredientId"`
	}
	optionalBody(r, &b)
	rec, err := a.store.UnlinkLine(r.Context(), id, lineID, b.IngredientID)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	httpx.WriteJSON(w, http.StatusOK, toRecipeJSON(rec))
}

func (a *api) linkCandidates(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	cands, err := a.store.LinkCandidates(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	type lineOut struct {
		LineID         int64   `json:"lineId"`
		RecipeID       int64   `json:"recipeId"`
		RecipeName     string  `json:"recipeName"`
		Archived       bool    `json:"archived"`
		IngredientID   int64   `json:"ingredientId"`
		IngredientName string  `json:"ingredientName"`
		Quantity       float64 `json:"quantity"`
		Unit           string  `json:"unit"`
		Linkable       bool    `json:"linkable"`
		Reason         string  `json:"reason,omitempty"`
	}
	unit, err := a.store.BaseUnit(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	out := struct {
		BaseUnit string    `json:"baseUnit"`
		Lines    []lineOut `json:"lines"`
	}{BaseUnit: unit, Lines: []lineOut{}}
	for _, c := range cands {
		out.Lines = append(out.Lines, lineOut{LineID: c.LineID, RecipeID: c.RecipeID, RecipeName: c.RecipeName, Archived: c.Archived,
			IngredientID: c.IngredientID, IngredientName: c.IngredientName, Quantity: c.Quantity, Unit: c.Unit,
			Linkable: c.Linkable, Reason: c.Reason})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// lineIDsBody is the body of the bulk link and its undo.
type lineIDsBody struct {
	LineIDs []int64 `json:"lineIds"`
}

func (a *api) link(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var b lineIDsBody
	if err := httpx.DecodeJSON(r, &b); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	res, err := a.store.Link(r.Context(), id, b.LineIDs)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	type mergeOut struct {
		IngredientID int64  `json:"ingredientId"`
		Name         string `json:"name"`
		StockLots    int    `json:"stockLots"`
		Products     int    `json:"products"`
		Exclusions   int    `json:"exclusions"`
	}
	out := struct {
		Linked     []int64    `json:"linked"`
		MergeOffer []mergeOut `json:"mergeOffer"`
	}{Linked: nonNilIDs(res.Linked), MergeOffer: []mergeOut{}}
	for _, m := range res.MergeOffer {
		out.MergeOffer = append(out.MergeOffer, mergeOut{IngredientID: m.IngredientID, Name: m.Name, StockLots: m.StockLots,
			Products: m.Products, Exclusions: m.Exclusions})
	}
	for _, rid := range res.Recipes {
		a.changed(rid)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *api) unlink(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var b lineIDsBody
	if err := httpx.DecodeJSON(r, &b); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	affected, err := a.store.Unlink(r.Context(), id, b.LineIDs)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	for _, rid := range affected {
		a.changed(rid)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string][]int64{"unlinked": nonNilIDs(b.LineIDs)})
}
