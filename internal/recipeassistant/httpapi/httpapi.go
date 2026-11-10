// Package httpapi exposes the Recipe Assistant's status, settings, models and connection-test routes
// (design §7). Handlers are thin: parse, call internal/recipeassistant/service, respond. The reads routes live in
// internal/recipefile/httpapi/reads.go because that package owns the in-memory Import Review sessions.
// Registers itself in init().
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/claude"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/store"
)

func init() { app.Register(app.Module{Name: "recipeassistant", Mount: mount}) }

// topic is the live-update topic Settings pages invalidate on; the data never carries a secret.
const topic = "recipeAssistant"

// maxBody bounds the JSON bodies of these routes.
const maxBody = 1 << 20

type api struct {
	svc    *service.Service
	events *events.Bus
}

func mount(r *app.Router, d app.Deps) {
	a := &api{svc: service.For(d, claude.Factory(d.Logger)), events: d.Events}
	r.User("GET /api/recipe-assistant/status", a.status)
	r.Admin("GET /api/recipe-assistant/settings", a.settings)
	r.Admin("PUT /api/recipe-assistant/settings", a.save)
	r.Admin("DELETE /api/recipe-assistant/settings/api-key", a.removeKey)
	r.Admin("POST /api/recipe-assistant/models", a.models)
	r.Admin("POST /api/recipe-assistant/test", a.test)
}

func caller(r *http.Request) recipeassistant.Caller {
	u, _ := auth.UserFrom(r.Context())
	return recipeassistant.Caller{UserID: u.ID, HouseholdID: 1, Admin: u.IsAdmin}
}

func actor(r *http.Request) store.Actor {
	u, _ := auth.UserFrom(r.Context())
	return store.Actor{UserID: u.ID, Email: u.Email}
}

type refJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type limitJSON struct {
	Remaining       int `json:"remaining"`
	ResetsInSeconds int `json:"resetsInSeconds"`
}

type statusJSON struct {
	Available bool       `json:"available"`
	Reason    string     `json:"reason,omitempty"`
	Model     *refJSON   `json:"model,omitempty"`
	Photos    bool       `json:"photos"`
	Limit     *limitJSON `json:"limit,omitempty"`
}

func (a *api) status(w http.ResponseWriter, r *http.Request) {
	st, err := a.svc.Status(r.Context(), caller(r))
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	out := statusJSON{Available: st.Available, Reason: st.Reason, Photos: st.Photos}
	if st.Model != nil {
		out.Model = &refJSON{ID: st.Model.ID, Name: st.Model.Name}
	}
	if st.Limit != nil {
		out.Limit = &limitJSON{Remaining: st.Limit.Remaining, ResetsInSeconds: st.Limit.ResetsInSeconds}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type changeJSON struct {
	At        string `json:"at"`
	ActorName string `json:"actorName"`
	Action    string `json:"action"`
	Detail    string `json:"detail"`
}

type warningJSON struct {
	Code string `json:"code"`
}

// settingsJSON never has a key field: only whether one is saved and its last four characters.
type settingsJSON struct {
	SecretKeyConfigured bool          `json:"secretKeyConfigured"`
	Enabled             bool          `json:"enabled"`
	BaseURL             string        `json:"baseUrl"`
	DefaultBaseURL      string        `json:"defaultBaseUrl"`
	Model               string        `json:"model"`
	HasAPIKey           bool          `json:"hasApiKey"`
	APIKeyLast4         string        `json:"apiKeyLast4"`
	APIKeyReadable      bool          `json:"apiKeyReadable"`
	ModelStatus         string        `json:"modelStatus"`
	RetiresAt           string        `json:"retiresAt,omitempty"`
	Changes             []changeJSON  `json:"changes"`
	Warnings            []warningJSON `json:"warnings,omitempty"`
}

func settingsBody(v service.SettingsView, warnings []service.Warning) settingsJSON {
	out := settingsJSON{
		SecretKeyConfigured: v.SecretKeyConfigured, Enabled: v.Settings.Enabled, BaseURL: v.Settings.BaseURL,
		DefaultBaseURL: v.DefaultBaseURL, Model: v.Settings.Model, HasAPIKey: v.Settings.HasKey,
		APIKeyLast4: v.Settings.KeyLast4, APIKeyReadable: v.APIKeyReadable, ModelStatus: v.ModelStatus,
		RetiresAt: v.RetiresAt, Changes: []changeJSON{},
	}
	for _, e := range v.Changes {
		out.Changes = append(out.Changes, changeJSON{At: e.At.UTC().Format("2006-01-02T15:04:05Z"), ActorName: e.ActorEmail, Action: e.Action, Detail: e.Detail})
	}
	for _, w := range warnings {
		out.Warnings = append(out.Warnings, warningJSON{Code: w.Code})
	}
	return out
}

func (a *api) settings(w http.ResponseWriter, r *http.Request) {
	v, err := a.svc.Settings(r.Context())
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, settingsBody(v, nil))
}

func (a *api) changed() { a.events.Publish(topic, map[string]string{"changed": "settings"}) }

func (a *api) save(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Enabled bool    `json:"enabled"`
		BaseURL string  `json:"baseUrl"`
		Model   string  `json:"model"`
		APIKey  *string `json:"apiKey"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	up := recipeassistant.Update{Enabled: body.Enabled, BaseURL: body.BaseURL, Model: strings.TrimSpace(body.Model)}
	if body.APIKey != nil {
		up.APIKey = recipeassistant.Secret(*body.APIKey)
	}
	res, err := a.svc.SaveSettings(r.Context(), actor(r), up)
	var se *service.SettingsError
	switch {
	case errors.As(err, &se):
		writeSettingsErrors(w, se)
		return
	case err != nil:
		writeError(w, err)
		return
	}
	if res.Changed {
		a.changed()
	}
	httpx.WriteJSON(w, http.StatusOK, settingsBody(res.View, res.Warnings))
}

func writeSettingsErrors(w http.ResponseWriter, se *service.SettingsError) {
	type fe struct {
		Field string `json:"field"`
		Code  string `json:"code"`
	}
	errs := make([]fe, 0, len(se.Errors))
	for _, e := range se.Errors {
		errs = append(errs, fe{Field: e.Field, Code: e.Code})
	}
	httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]any{
		"code": "invalid_settings", "message": "Some settings were refused.", "errors": errs,
	}})
}

// writeError answers a domain error as 422 with its bare code, anything else as a generic 500.
func writeError(w http.ResponseWriter, err error) {
	var ae *recipeassistant.Error
	if errors.As(err, &ae) {
		httpx.WriteError(w, http.StatusUnprocessableEntity, ae.Code, service.Message(ae.Code))
		return
	}
	httpx.WriteAPIError(w, err)
}

func (a *api) removeKey(w http.ResponseWriter, r *http.Request) {
	v, err := a.svc.RemoveKey(r.Context(), actor(r))
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	a.changed()
	httpx.WriteJSON(w, http.StatusOK, settingsBody(v, nil))
}

// connBody is the body of the models and test routes; an empty body means "the saved values".
func connBody(r *http.Request) (service.ConnInput, bool, error) {
	var body struct {
		BaseURL string  `json:"baseUrl"`
		APIKey  *string `json:"apiKey"`
		Model   string  `json:"model"`
		Refresh bool    `json:"refresh"`
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	if err != nil || len(raw) > maxBody {
		return service.ConnInput{}, false, &httpx.APIError{Status: http.StatusBadRequest, Code: "bad_request", Message: "The request body must be JSON"}
	}
	if strings.TrimSpace(string(raw)) != "" {
		if err := json.Unmarshal(raw, &body); err != nil {
			return service.ConnInput{}, false, &httpx.APIError{Status: http.StatusBadRequest, Code: "bad_request", Message: "The request body must be JSON"}
		}
	}
	in := service.ConnInput{BaseURL: body.BaseURL, Model: body.Model}
	if body.APIKey != nil {
		in.APIKey = *body.APIKey
	}
	return in, body.Refresh, nil
}

type modelJSON struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	PriceTier   string `json:"priceTier"`
	SpeedTier   string `json:"speedTier"`
	Group       string `json:"group"`
	Lifecycle   string `json:"lifecycle"`
	RetiresAt   string `json:"retiresAt,omitempty"`
	ImageInput  *bool  `json:"imageInput,omitempty"`
}

func (a *api) models(w http.ResponseWriter, r *http.Request) {
	in, refresh, err := connBody(r)
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	list, err := a.svc.Models(r.Context(), in, refresh)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		writeError(w, err)
		return
	}
	out := struct {
		Models []modelJSON `json:"models"`
		Source string      `json:"source"`
		Notice string      `json:"notice,omitempty"`
	}{Models: []modelJSON{}, Source: list.Source, Notice: list.Notice}
	for _, m := range list.Models {
		out.Models = append(out.Models, modelJSON{ID: m.ID, Name: m.Name, Description: m.Description, PriceTier: m.PriceTier,
			SpeedTier: m.SpeedTier, Group: m.Group, Lifecycle: m.Lifecycle, RetiresAt: m.RetiresAt, ImageInput: m.ImageInput})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *api) test(w http.ResponseWriter, r *http.Request) {
	in, _, err := connBody(r)
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	res, err := a.svc.TestConnection(r.Context(), in)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		writeError(w, err)
		return
	}
	type checkJSON struct {
		Name string `json:"name"`
		OK   bool   `json:"ok"`
		Code string `json:"code,omitempty"`
	}
	out := struct {
		OK        bool        `json:"ok"`
		Checks    []checkJSON `json:"checks"`
		Model     *refJSON    `json:"model,omitempty"`
		LatencyMs int64       `json:"latencyMs"`
	}{OK: res.OK, Checks: []checkJSON{}, LatencyMs: res.LatencyMs}
	for _, c := range res.Checks {
		out.Checks = append(out.Checks, checkJSON{Name: c.Name, OK: c.OK, Code: c.Code})
	}
	if res.Model != nil {
		out.Model = &refJSON{ID: res.Model.ID, Name: res.Model.Name}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
