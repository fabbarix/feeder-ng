// Package httpapi exposes Recipe File import and export (routes in
// docs/dev/design/t12-import-export.md). Handlers are thin: parse, call
// internal/recipefile (+ its store), respond. Registers itself in init().
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/claude"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/recipefile/imagefetch"
	"github.com/fabbarix/feeder-ng/internal/recipefile/store"
)

func init() { app.Register(app.Module{Name: "recipefile", Mount: mount}) }

// Live-update topics the SPA invalidates its caches on.
const (
	topicRecipes     = "recipes"
	topicIngredients = "ingredients"
	topicHousehold   = "household"
)

func mount(r *app.Router, d app.Deps) {
	images := imaging.NewStore(filepath.Join(d.Config.DataDir, "images"))
	tmpl, tmplErr := recipefile.ExtractTemplate(spec.RecipeFileMD)
	a := &api{
		store:     store.New(d.DB, d.Clock, images),
		sessions:  recipefile.NewSessions(d.Clock),
		fetcher:   imagefetch.New(imagefetch.Options{}),
		events:    d.Events,
		template:  tmpl,
		tmplOK:    tmplErr == nil,
		assistant: service.For(d, claude.Factory(d.Logger)),
	}
	r.Public("GET /schema/recipe-file-v1.json", schema)
	r.User("GET /api/recipe-file/agent-prompt", a.agentPrompt)
	r.User("GET /api/recipe-file/export", a.export)
	r.User("POST /api/imports", a.open)
	r.User("POST /api/imports/{id}/plan", a.plan)
	r.User("POST /api/imports/{id}/confirm", a.confirm)
	r.User("DELETE /api/imports/{id}", a.close)
	r.User("GET /api/imports/{id}/photos/{index}", a.photo)
	// The Recipe Assistant's reads end in an Import Review, so this package, which owns the sessions, serves them.
	r.User("POST /api/recipe-assistant/reads", a.startRead)
	r.User("GET /api/recipe-assistant/reads/{id}", a.getRead)
	r.User("DELETE /api/recipe-assistant/reads/{id}", a.cancelRead)
}

type api struct {
	store    *store.Store
	sessions *recipefile.Sessions
	fetcher  recipefile.Fetcher
	events   *events.Bus
	template string // the Agent Prompt template; the prompt is built per request with the Courses (crs-e1)
	tmplOK   bool
	// assistant is the one Recipe Assistant service of the application (shared with its settings module).
	assistant *service.Service
}

// schema serves the embedded schema. It is public: the spec says the running
// app serves it, and it is not secret.
func schema(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_, _ = w.Write(spec.Schema)
}

// agentPrompt answers the Agent Prompt, built now from the Household's active Courses.
func (a *api) agentPrompt(w http.ResponseWriter, r *http.Request) {
	if !a.tmplOK {
		httpx.WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong")
		return
	}
	prompt, err := a.buildPrompt(r.Context())
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"prompt": prompt})
}

// buildPrompt is the Agent Prompt for the Household's active Courses as they are now.
func (a *api) buildPrompt(ctx context.Context) (string, error) {
	courses, err := a.store.PromptCourses(ctx)
	if err != nil {
		return "", err
	}
	return recipefile.AgentPrompt(a.template, string(spec.Schema), string(spec.Example), courses), nil
}

// export answers GET /api/recipe-file/export?all=1 or ?ids=1,2 with the file.
func (a *api) export(w http.ResponseWriter, r *http.Request) {
	var ids []int64
	all := r.URL.Query().Get("all") == "1"
	if !all {
		parsed, ok := parseIDs(r.URL.Query().Get("ids"))
		if !ok {
			httpx.WriteError(w, http.StatusBadRequest, "bad_request", "Give ids=1,2 or all=1")
			return
		}
		ids = parsed
	}
	in, err := a.store.Exportable(r.Context(), ids)
	if errors.Is(err, store.ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if all && len(in.Recipes) == 0 {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "nothing_to_export", "There are no Recipes to export")
		return
	}
	file, _ := recipefile.Build(in)
	data, err := recipefile.Marshal(file)
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, recipefile.ExportFileName(in.Now)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// parseIDs reads "1,2,3": positive integers, no blanks.
func parseIDs(s string) ([]int64, bool) {
	if s == "" {
		return nil, false
	}
	var ids []int64
	for _, part := range strings.Split(s, ",") {
		id, err := strconv.ParseInt(part, 10, 64)
		if err != nil || id <= 0 {
			return nil, false
		}
		ids = append(ids, id)
	}
	return ids, true
}

// open takes {"text": "..."}, parses and validates the file, resolves its
// images and starts an Import Review.
func (a *api) open(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, recipefile.MaxFileBytes)
	var body struct {
		Text *string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			httpx.WriteError(w, http.StatusRequestEntityTooLarge, "file_too_large", "The file is larger than 64 MB")
			return
		}
		httpx.WriteError(w, http.StatusBadRequest, "bad_request", "The request body must be JSON with a text")
		return
	}
	if body.Text == nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad_request", "The request body must be JSON with a text")
		return
	}
	file, err := recipefile.Parse([]byte(*body.Text))
	if err != nil {
		writeParseError(w, err)
		return
	}
	user, _ := auth.UserFrom(r.Context())
	images := recipefile.ResolveImages(r.Context(), file, a.fetcher)
	rv := a.sessions.Open(user.ID, file, images)
	plan, err := a.planFor(r.Context(), rv, recipefile.Decisions{})
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, reviewJSON{ID: rv.ID, Plan: plan})
}

// plan answers the User's decisions with the current Import Review.
func (a *api) plan(w http.ResponseWriter, r *http.Request) {
	rv, ok := a.review(w, r)
	if !ok {
		return
	}
	d, ok := decisionsBody(w, r)
	if !ok {
		return
	}
	plan, err := a.planFor(r.Context(), rv, d)
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, reviewJSON{ID: rv.ID, Plan: plan})
}

// confirm writes the Recipes and Ingredients of a finished Import Review in one
// transaction. The Review is taken first (single use: a second or parallel
// confirm finds nothing) and put back on any failure, so the User can retry.
func (a *api) confirm(w http.ResponseWriter, r *http.Request) {
	rv, ok := a.take(w, r)
	if !ok {
		return
	}
	done := false
	defer func() {
		if !done {
			a.sessions.Restore(rv)
		}
	}()
	d, choice, ok := confirmBody(w, r)
	if !ok {
		return
	}
	file, images := rv.File, rv.Images
	if choice != nil {
		var err error
		if file, images, err = recipefile.WithPhoto(file, images, rv.Photos, *choice); err != nil {
			httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
				"code": "validation_failed", "message": "That photo cannot be used for this Recipe", "field": "photo",
			}})
			return
		}
	}
	existing, err := a.store.Existing(r.Context())
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	commit, err := recipefile.BuildCommit(file, existing, d, images)
	if errors.Is(err, recipefile.ErrStale) {
		httpx.WriteError(w, http.StatusConflict, "import_stale", "The data changed since the review; review again")
		return
	}
	var notReady *recipefile.NotReadyError
	if errors.As(err, &notReady) {
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
			"code": "import_not_ready", "message": "Finish the Import Review before confirming", "plan": notReady.Plan,
		}})
		return
	}
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	// Only an Admin adds or unarchives a Course (spec 13). The Review stays open for the User to answer again.
	if user, _ := auth.UserFrom(r.Context()); !user.IsAdmin && (len(commit.NewCourses) > 0 || len(commit.UnarchiveCourses) > 0) {
		httpx.WriteError(w, http.StatusForbidden, "forbidden", "Only Admins can add or unarchive a Course")
		return
	}
	res, err := a.store.Apply(r.Context(), commit)
	if errors.Is(err, recipefile.ErrStale) {
		httpx.WriteError(w, http.StatusConflict, "import_stale", "The data changed since the review; review again")
		return
	}
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	done = true // imported: the Review stays closed
	a.published(res)
	httpx.WriteJSON(w, http.StatusOK, confirmAnswer(res))
}

// close drops an owned Import Review.
func (a *api) close(w http.ResponseWriter, r *http.Request) {
	rv, ok := a.review(w, r)
	if !ok {
		return
	}
	a.sessions.Close(rv.UserID, rv.ID)
	w.WriteHeader(http.StatusNoContent)
}

// take removes the signed-in User's open Import Review from the store; 404
// otherwise (unknown, expired, not theirs, or already taken by another confirm).
func (a *api) take(w http.ResponseWriter, r *http.Request) (recipefile.Review, bool) {
	user, _ := auth.UserFrom(r.Context())
	rv, ok := a.sessions.Take(user.ID, r.PathValue("id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
	}
	return rv, ok
}

// review finds the signed-in User's open Import Review; 404 otherwise.
func (a *api) review(w http.ResponseWriter, r *http.Request) (recipefile.Review, bool) {
	user, _ := auth.UserFrom(r.Context())
	rv, ok := a.sessions.Get(user.ID, r.PathValue("id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
	}
	return rv, ok
}

// planFor recomputes the Import Review from the current data.
func (a *api) planFor(ctx context.Context, rv recipefile.Review, d recipefile.Decisions) (recipefile.Plan, error) {
	existing, err := a.store.Existing(ctx)
	if err != nil {
		return recipefile.Plan{}, err
	}
	return recipefile.BuildPlan(rv.File, existing, d, rv.Images), nil
}

// published tells the SPA which caches the import changed.
func (a *api) published(res store.Result) {
	for _, rec := range res.Recipes {
		a.events.Publish(topicRecipes, map[string]int64{"id": rec.ID})
	}
	if res.IngredientsCreated > 0 || res.ConversionsAdded > 0 {
		a.events.Publish(topicIngredients, map[string]int{"created": res.IngredientsCreated, "conversions": res.ConversionsAdded})
	}
	if res.CoursesCreated > 0 || res.CoursesUnarchived > 0 {
		a.events.Publish(topicHousehold, map[string]string{"changed": "courses"})
	}
}

// Bodies and shapes.

type reviewJSON struct {
	ID   string          `json:"id"`
	Plan recipefile.Plan `json:"plan"`
}

// confirmJSON is the answer to a Confirm: what was written.
type confirmJSON struct {
	Recipes            []appliedJSON `json:"recipes"`
	IngredientsCreated int           `json:"ingredientsCreated"`
	ConversionsAdded   int           `json:"conversionsAdded"`
	CoursesCreated     int           `json:"coursesCreated"`
	CoursesUnarchived  int           `json:"coursesUnarchived"`
}

type appliedJSON struct {
	Index  int    `json:"index"`
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Action string `json:"action"`
}

func confirmAnswer(res store.Result) confirmJSON {
	out := confirmJSON{Recipes: []appliedJSON{}, IngredientsCreated: res.IngredientsCreated, ConversionsAdded: res.ConversionsAdded,
		CoursesCreated: res.CoursesCreated, CoursesUnarchived: res.CoursesUnarchived}
	for _, r := range res.Recipes {
		out.Recipes = append(out.Recipes, appliedJSON{Index: r.Index, ID: r.ID, Name: r.Name, Action: r.Action})
	}
	return out
}

// confirmBody reads {"decisions": {...}, "photo": {"index", "recipe"}?}.
func confirmBody(w http.ResponseWriter, r *http.Request) (recipefile.Decisions, *recipefile.PhotoChoice, bool) {
	var body struct {
		Decisions recipefile.Decisions `json:"decisions"`
		Photo     *struct {
			Index  int `json:"index"`
			Recipe int `json:"recipe"`
		} `json:"photo"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return recipefile.Decisions{}, nil, false
	}
	if body.Photo == nil {
		return body.Decisions, nil, true
	}
	return body.Decisions, &recipefile.PhotoChoice{Index: body.Photo.Index, Recipe: body.Photo.Recipe}, true
}

// decisionsBody reads {"decisions": {...}}.
func decisionsBody(w http.ResponseWriter, r *http.Request) (recipefile.Decisions, bool) {
	var body struct {
		Decisions recipefile.Decisions `json:"decisions"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return recipefile.Decisions{}, false
	}
	return body.Decisions, true
}

// writeParseError maps recipefile.Parse errors to their HTTP answers.
func writeParseError(w http.ResponseWriter, err error) {
	var version *recipefile.VersionError
	var schema *recipefile.SchemaError
	switch {
	case errors.Is(err, recipefile.ErrTooLarge):
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "file_too_large", "The file is larger than 64 MB")
	case errors.As(err, &version):
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
			"code": "unsupported_version", "message": "This Feeder reads Recipe File version 1 only", "version": json.RawMessage(version.Version),
		}})
	case errors.As(err, &schema):
		httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
			"code": "invalid_recipe_file", "message": "The file does not match the Recipe File format", "errors": schema.Errors,
		}})
	case errors.Is(err, recipefile.ErrSyntax):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "invalid_json", "The file is not valid JSON")
	default:
		httpx.WriteAPIError(w, err)
	}
}
