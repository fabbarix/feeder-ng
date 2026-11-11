// Package httpapi exposes the Ingredient routes (see docs/dev/design/t2-ingredients.md).
// It registers itself with the app registry; handlers stay thin: parse, call
// internal/ingredient or its store, respond.
package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/images"
	"github.com/fabbarix/feeder-ng/internal/images/refs"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

func init() { app.Register(app.Module{Name: "ingredients", Mount: mount}) }

// topic is the live-update topic the SPA invalidates its Ingredient queries on.
const topic = "ingredients"

const defaultSearchLimit = 5

func mount(r *app.Router, d app.Deps) {
	files := imaging.NewStore(filepath.Join(d.Config.DataDir, "images"))
	a := &api{store: store.New(d.DB, d.Clock, store.WithImages(images.NewGuarded(files, refs.New(d.DB)))), events: d.Events}
	r.User("GET /api/ingredients", a.list)
	r.User("GET /api/ingredients/search", a.search)
	r.User("POST /api/ingredients", a.create)
	r.User("GET /api/ingredients/{id}", a.get)
	r.User("PATCH /api/ingredients/{id}", a.patch)
	r.User("DELETE /api/ingredients/{id}", a.delete)
	r.User("PUT /api/ingredients/{id}/conversions/{unit}", a.putConversion)
	r.User("DELETE /api/ingredients/{id}/conversions/{unit}", a.deleteConversion)
	r.User("GET /api/ingredients/{id}/merge-preview", a.mergePreview)
	r.User("POST /api/ingredients/{id}/merge", a.merge)
}

type api struct {
	store  *store.Store
	events *events.Bus
}

// JSON shapes.

type conversionJSON struct {
	Unit   string  `json:"unit"`
	ToBase float64 `json:"toBase"`
}

type ingredientJSON struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	BaseUnit      string `json:"baseUnit"`
	ShelfLifeDays *int   `json:"shelfLifeDays"`
	// FrozenShelfLifeDays is the Shelf Life in a Freezer; null = the Freezer does not change the go-off date.
	FrozenShelfLifeDays *int             `json:"frozenShelfLifeDays"`
	Conversions         []conversionJSON `json:"conversions"`
	Image               string           `json:"image"`
	ImageURL            string           `json:"imageUrl"`
}

func toJSON(i ingredient.Ingredient) ingredientJSON {
	out := ingredientJSON{
		ID:                  i.ID,
		Name:                i.Name,
		BaseUnit:            string(i.Base),
		ShelfLifeDays:       i.ShelfLifeDays,
		FrozenShelfLifeDays: i.FrozenShelfLifeDays,
		Conversions:         []conversionJSON{},
		Image:               i.Image,
	}
	if i.Image != "" {
		out.ImageURL = images.URL(i.Image)
	}
	for _, c := range i.Conversions {
		out.Conversions = append(out.Conversions, conversionJSON{Unit: c.Unit, ToBase: c.ToBase})
	}
	return out
}

func toConversionsJSON(cs []units.Conversion) []conversionJSON {
	out := []conversionJSON{}
	for _, c := range cs {
		out = append(out, conversionJSON{Unit: c.Unit, ToBase: c.ToBase})
	}
	return out
}

type detailJSON struct {
	ingredientJSON
	References map[string]int `json:"references"`
}

type suggestionJSON struct {
	Ingredient ingredientJSON `json:"ingredient"`
	Score      float64        `json:"score"`
}

type searchJSON struct {
	Exact       *ingredientJSON  `json:"exact"`
	Suggestions []suggestionJSON `json:"suggestions"`
}

type conflictJSON struct {
	Kind   string  `json:"kind"`
	Unit   string  `json:"unit"`
	Source float64 `json:"source"`
	Target float64 `json:"target"`
}

type previewJSON struct {
	Source           ingredientJSON   `json:"source"`
	Target           ingredientJSON   `json:"target"`
	Blocked          string           `json:"blocked"`
	Conversions      []conversionJSON `json:"conversions"`
	ShelfLifeDays    *int             `json:"shelfLifeDays"`
	Conflicts        []conflictJSON   `json:"conflicts"`
	SourceReferences map[string]int   `json:"sourceReferences"`
	TargetReferences map[string]int   `json:"targetReferences"`
}

// shelfLifeField is a presence-aware Shelf Life in a request body: absent (set
// false), null (set, days nil: clear it) or a number of days.
type shelfLifeField struct {
	set  bool
	days *int
}

func (f *shelfLifeField) UnmarshalJSON(b []byte) error {
	f.set = true
	if string(bytes.TrimSpace(b)) == "null" {
		f.days = nil
		return nil
	}
	var n int
	if err := json.Unmarshal(b, &n); err != nil {
		return err
	}
	f.days = &n
	return nil
}

type conversionIn struct {
	Unit   string  `json:"unit"`
	ToBase float64 `json:"toBase"`
}

type createBody struct {
	Name                string         `json:"name"`
	BaseUnit            string         `json:"baseUnit"`
	ShelfLifeDays       *int           `json:"shelfLifeDays"`
	FrozenShelfLifeDays *int           `json:"frozenShelfLifeDays"`
	Conversions         []conversionIn `json:"conversions"`
	Image               string         `json:"image"`
}

type patchBody struct {
	Name          *string        `json:"name"`
	BaseUnit      *string        `json:"baseUnit"`
	ShelfLifeDays shelfLifeField `json:"shelfLifeDays"`
	// FrozenShelfLifeDays is presence-aware like shelfLifeDays: absent keeps it, null clears it.
	FrozenShelfLifeDays shelfLifeField `json:"frozenShelfLifeDays"`
	Image               *string        `json:"image"` // nil = keep, "" = remove
}

type mergeBody struct {
	Into        int64         `json:"into"`
	Resolutions *resolutionIn `json:"resolutions"`
}

type resolutionIn struct {
	Conversions   map[string]float64 `json:"conversions"`
	ShelfLifeDays shelfLifeField     `json:"shelfLifeDays"`
}

// Handlers.

func (a *api) list(w http.ResponseWriter, r *http.Request) {
	all, err := a.store.List(r.Context())
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	q := units.NormalizeName(r.URL.Query().Get("q"))
	out := []ingredientJSON{}
	for _, i := range all {
		if q == "" || strings.Contains(i.Key(), q) {
			out = append(out, toJSON(i))
		}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *api) search(w http.ResponseWriter, r *http.Request) {
	limit := defaultSearchLimit
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil {
		limit = n
	}
	res, err := a.store.Search(r.Context(), r.URL.Query().Get("q"), limit)
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	out := searchJSON{Suggestions: []suggestionJSON{}}
	if res.Exact != nil {
		e := toJSON(*res.Exact)
		out.Exact = &e
	}
	for _, s := range res.Suggestions {
		out.Suggestions = append(out.Suggestions, suggestionJSON{Ingredient: toJSON(s.Ingredient), Score: s.Score})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *api) create(w http.ResponseWriter, r *http.Request) {
	var body createBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	in := ingredient.Input{Name: body.Name, Base: units.Base(body.BaseUnit), ShelfLifeDays: body.ShelfLifeDays, FrozenShelfLifeDays: body.FrozenShelfLifeDays, Image: body.Image}
	for _, c := range body.Conversions {
		in.Conversions = append(in.Conversions, units.Conversion{Unit: c.Unit, ToBase: c.ToBase})
	}
	created, err := a.store.Create(r.Context(), in)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(created.ID)
	httpx.WriteJSON(w, http.StatusCreated, toJSON(created))
}

func (a *api) get(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	i, err := a.store.Get(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	refs, err := a.store.References(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, detailJSON{ingredientJSON: toJSON(i), References: refs})
}

func (a *api) patch(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body patchBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	p := store.Patch{Name: body.Name, Image: body.Image}
	if body.BaseUnit != nil {
		b := units.Base(*body.BaseUnit)
		p.Base = &b
	}
	if body.ShelfLifeDays.set {
		p.ShelfLife = &store.ShelfLifePatch{Days: body.ShelfLifeDays.days}
	}
	if body.FrozenShelfLifeDays.set {
		p.FrozenShelfLife = &store.ShelfLifePatch{Days: body.FrozenShelfLifeDays.days}
	}
	updated, err := a.store.Update(r.Context(), id, p)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	httpx.WriteJSON(w, http.StatusOK, toJSON(updated))
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

func (a *api) putConversion(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body conversionIn
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	updated, err := a.store.SetConversion(r.Context(), id, units.Conversion{Unit: r.PathValue("unit"), ToBase: body.ToBase})
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	httpx.WriteJSON(w, http.StatusOK, toJSON(updated))
}

func (a *api) deleteConversion(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	updated, err := a.store.RemoveConversion(r.Context(), id, r.PathValue("unit"))
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	httpx.WriteJSON(w, http.StatusOK, toJSON(updated))
}

func (a *api) mergePreview(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	into, err := strconv.ParseInt(r.URL.Query().Get("into"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad_request", "The query needs into=<Ingredient id>")
		return
	}
	p, err := a.store.MergePreview(r.Context(), id, into)
	if err != nil {
		writeErr(w, err)
		return
	}
	out := previewJSON{
		Source:           toJSON(p.Source),
		Target:           toJSON(p.Target),
		Conversions:      toConversionsJSON(p.Plan.Conversions),
		ShelfLifeDays:    p.Plan.ShelfLifeDays,
		Conflicts:        []conflictJSON{},
		SourceReferences: p.SourceReferences,
		TargetReferences: p.TargetReferences,
	}
	if p.Plan.BaseMismatch {
		out.Blocked = "base_unit_mismatch"
	}
	for _, c := range p.Plan.Conflicts {
		out.Conflicts = append(out.Conflicts, conflictJSON{Kind: string(c.Kind), Unit: c.Unit, Source: c.Source, Target: c.Target})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *api) merge(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(w, r)
	if !ok {
		return
	}
	var body mergeBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	var res ingredient.Resolution
	if rs := body.Resolutions; rs != nil {
		res = ingredient.Resolution{
			Conversions:   rs.Conversions,
			ShelfLifeSet:  rs.ShelfLifeDays.set,
			ShelfLifeDays: rs.ShelfLifeDays.days,
		}
	}
	merged, err := a.store.Merge(r.Context(), id, body.Into, res)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed(id)
	a.changed(merged.ID)
	httpx.WriteJSON(w, http.StatusOK, toJSON(merged))
}

// changed tells the SPA that Ingredient id (and its lists) changed.
func (a *api) changed(id int64) {
	if a.events != nil {
		a.events.Publish(topic, map[string]int64{"id": id})
	}
}

// idParam reads the {id} path value; a malformed id is simply not found.
func idParam(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "No such Ingredient")
		return 0, false
	}
	return id, true
}

// writeErr maps domain and store errors onto the API's status codes and codes.
func writeErr(w http.ResponseWriter, err error) {
	var unresolved *ingredient.UnresolvedError
	switch {
	case errors.Is(err, ingredient.ErrInvalid):
		httpx.WriteError(w, http.StatusBadRequest, "invalid_ingredient", err.Error())
	case errors.Is(err, store.ErrNameTaken):
		httpx.WriteError(w, http.StatusConflict, "name_taken", "An Ingredient with that name already exists")
	case errors.Is(err, store.ErrInUse):
		httpx.WriteError(w, http.StatusConflict, "in_use", "Other features still use this Ingredient")
	case errors.Is(err, store.ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "not_found", "No such Ingredient")
	case errors.Is(err, store.ErrMergeSelf):
		httpx.WriteError(w, http.StatusBadRequest, "merge_self", "An Ingredient cannot be merged into itself")
	case errors.Is(err, ingredient.ErrBaseMismatch):
		httpx.WriteError(w, http.StatusConflict, "base_unit_mismatch", "The Ingredients have different Base Units")
	case errors.As(err, &unresolved):
		httpx.WriteError(w, http.StatusConflict, "merge_conflicts", unresolved.Error())
	default:
		httpx.WriteAPIError(w, err)
	}
}
