package service

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// Picker groups.
const (
	groupRecommended = "Recommended"
	groupOther       = "Other models"
	groupOlder       = "Older models"
)

// catalogueEntry is the curated overlay of the model picker (design §2.2); update it with each model launch.
type catalogueEntry struct {
	ID, Name, Description, PriceTier, SpeedTier, Group string
}

var catalogue = []catalogueEntry{
	{"claude-haiku-5-5", "Claude Haiku 5.5", "Fastest and cheapest. Default. May need more fixing in Import Review.", "$", "Fastest", groupRecommended},
	{"claude-sonnet-5-5", "Claude Sonnet 5.5", "Better with messy pages and handwriting.", "$$", "Quick", groupRecommended},
	{"claude-opus-5-5", "Claude Opus 5.5", "Most careful with estimates and hard handwriting.", "$$$", "Steady", groupRecommended},
	{"claude-fable-5-1", "Claude Fable 5.1", "Most capable; far more than recipes need.", "$$$$", "Slow", groupOther},
	{"claude-opus-5", "Claude Opus 5", "Previous generation.", "$$$", "Steady", groupOlder},
	{"claude-sonnet-5", "Claude Sonnet 5", "Previous generation.", "$$", "Quick", groupOlder},
	{"claude-opus-4-8", "Claude Opus 4.8", "Previous generation.", "$$$", "Steady", groupOlder},
	{"claude-haiku-4-5", "Claude Haiku 4.5", "Previous generation.", "$", "Fastest", groupOlder},
}

func catalogueRank(id string) int {
	for i, e := range catalogue {
		if e.ID == id {
			return i
		}
	}
	return len(catalogue)
}

func catalogueFor(id string) (catalogueEntry, bool) {
	for _, e := range catalogue {
		if e.ID == id {
			return e, true
		}
	}
	return catalogueEntry{}, false
}

var groupOrder = map[string]int{groupRecommended: 0, groupOther: 1, groupOlder: 2}

// MergeModels keeps the models that support structured outputs, joins each with the catalogue for its
// description and tiers, and orders them: Recommended (cheapest first, so the default leads), Other models,
// Older models; models the catalogue does not know come last of "Other models" by id. Pure.
func MergeModels(live []ModelInfo) []ModelChoice {
	var out []ModelChoice
	for _, m := range live {
		if !m.StructuredOutputs || m.Lifecycle == "retired" {
			continue
		}
		img := m.ImageInput
		c := ModelChoice{ID: m.ID, Name: m.DisplayName, Lifecycle: m.Lifecycle, RetiresAt: m.RetiresAt, ImageInput: &img,
			Description: "Price not known.", Group: groupOther}
		if c.Name == "" {
			c.Name = m.ID
		}
		if c.Lifecycle == "" {
			c.Lifecycle = "active"
		}
		if e, ok := catalogueFor(m.ID); ok {
			c.Description, c.PriceTier, c.SpeedTier, c.Group = e.Description, e.PriceTier, e.SpeedTier, e.Group
		}
		out = append(out, c)
	}
	sortChoices(out)
	return out
}

func sortChoices(cs []ModelChoice) {
	sort.SliceStable(cs, func(i, j int) bool {
		a, b := cs[i], cs[j]
		if groupOrder[a.Group] != groupOrder[b.Group] {
			return groupOrder[a.Group] < groupOrder[b.Group]
		}
		if ra, rb := catalogueRank(a.ID), catalogueRank(b.ID); ra != rb {
			return ra < rb
		}
		return a.ID < b.ID
	})
}

// CatalogueModels is the fallback list when the API cannot be asked.
func CatalogueModels() []ModelChoice {
	out := make([]ModelChoice, 0, len(catalogue))
	for _, e := range catalogue {
		out = append(out, ModelChoice{ID: e.ID, Name: e.Name, Description: e.Description, PriceTier: e.PriceTier,
			SpeedTier: e.SpeedTier, Group: e.Group, Lifecycle: "active"})
	}
	sortChoices(out)
	return out
}

// modelName is the display name of a model id: the API's, else the catalogue's, else the id.
func modelName(id, display string) string {
	if display != "" {
		return display
	}
	if e, ok := catalogueFor(id); ok {
		return e.Name
	}
	return id
}

func (s *Service) client(baseURL string, key recipeassistant.Secret) Claude {
	return s.d.Claude(Conn{BaseURL: baseURL, Key: key})
}

// modelInfo looks one model up through the cache; get builds the client only when the cache cannot answer.
func (s *Service) modelInfo(ctx context.Context, get func() Claude, base, model string) (ModelInfo, modelStatus) {
	now := s.d.Clock.Now()
	if e, ok := s.cache.getModel(base, model, now); ok {
		return e.info, e.status
	}
	info, err := get().Model(ctx, model)
	switch {
	case err == nil && info.Lifecycle == "retired":
		s.cache.setModel(base, model, modelEntry{info: info, status: modelUnavailable, expires: now.Add(modelsTTL)})
		return info, modelUnavailable
	case err == nil:
		s.cache.putModel(base, model, info, now)
		return info, modelFound
	case recipeassistant.CodeOf(err) == recipeassistant.CodeModelUnavailable:
		s.cache.setModel(base, model, modelEntry{status: modelUnavailable, expires: now.Add(modelsTTL)})
		return ModelInfo{}, modelUnavailable
	}
	if ctx.Err() == nil {
		s.cache.setModel(base, model, modelEntry{status: modelUnknown, expires: now.Add(lookupFailedTTL)})
	}
	return ModelInfo{}, modelUnknown
}

// ConnInput is the body of the models and test routes.
type ConnInput struct{ BaseURL, APIKey, Model string }

// ModelChoice is one entry of the picker.
type ModelChoice struct {
	ID, Name, Description, PriceTier, SpeedTier, Group, Lifecycle, RetiresAt string
	ImageInput                                                               *bool
}

// ModelList is the answer of the models route.
type ModelList struct {
	Models []ModelChoice
	Source string // "api" or "catalogue"
	Notice string
}

// catalogueNotice explains a fallback to the catalogue.
const catalogueNotice = "The list of models could not be read from the API, so the usual models are shown. You can still type a model ID."

// resolve picks the base URL and the key for a models or test request with recipeassistant.KeyFor, before any
// client exists.
func (s *Service) resolve(ctx context.Context, in ConnInput) (base string, key recipeassistant.Secret, model string, err error) {
	row, err := s.d.Store.Load(ctx)
	if err != nil {
		return "", "", "", err
	}
	saved, _ := s.savedKey(row)
	key, err = recipeassistant.KeyFor(row.Settings, saved, in.BaseURL, in.APIKey)
	if err != nil {
		return "", "", "", err
	}
	base = row.Settings.BaseURL
	if strings.TrimSpace(in.BaseURL) != "" {
		if base, err = recipeassistant.ValidateBaseURL(in.BaseURL); err != nil {
			return "", "", "", err
		}
	}
	model = row.Settings.Model
	if strings.TrimSpace(in.Model) != "" {
		model = strings.TrimSpace(in.Model)
		if err := recipeassistant.ValidateModelID(model); err != nil {
			return "", "", "", err
		}
	}
	return base, key, model, nil
}

// Models lists models with the key chosen by recipeassistant.KeyFor (before any request).
func (s *Service) Models(ctx context.Context, in ConnInput, refresh bool) (ModelList, error) {
	base, key, _, err := s.resolve(ctx, in)
	if err != nil {
		return ModelList{}, err
	}
	now := s.d.Clock.Now()
	live, ok := []ModelInfo(nil), false
	if !refresh {
		live, ok = s.cache.getList(base, key, now)
	}
	if !ok {
		lctx, cancel := context.WithTimeout(ctx, checkTimeout)
		defer cancel()
		live, err = s.client(base, key).Models(lctx)
		if err != nil {
			if ctx.Err() != nil {
				return ModelList{}, ctx.Err()
			}
			if recipeassistant.CodeOf(err) == recipeassistant.CodeBadKey {
				return ModelList{}, &recipeassistant.Error{Code: CodeAPIKeyRefused}
			}
			return ModelList{Models: CatalogueModels(), Source: "catalogue", Notice: catalogueNotice}, nil
		}
		s.cache.putList(base, key, live, now)
	}
	return ModelList{Models: MergeModels(live), Source: "api"}, nil
}

// Check is one line of the connection test.
type Check struct {
	Name string // key, model, output
	OK   bool
	Code string
}

// TestResult is the answer of the test route.
type TestResult struct {
	OK        bool
	Checks    []Check
	Model     *ModelRef
	LatencyMs int64
}

const testSchema = `{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"],"additionalProperties":false}`

// TestConnection runs Models.Get(model) then a tiny structured Messages call, after KeyFor.
func (s *Service) TestConnection(ctx context.Context, in ConnInput) (TestResult, error) {
	base, key, model, err := s.resolve(ctx, in)
	if err != nil {
		return TestResult{}, err
	}
	started := time.Now()
	cl := s.client(base, key)
	res := TestResult{}
	finish := func() (TestResult, error) {
		res.LatencyMs = time.Since(started).Milliseconds()
		res.OK = len(res.Checks) == 3
		for _, c := range res.Checks {
			res.OK = res.OK && c.OK
		}
		return res, nil
	}
	lctx, cancel := context.WithTimeout(ctx, checkTimeout)
	defer cancel()

	info, err := cl.Model(lctx, model)
	if ctx.Err() != nil {
		return TestResult{}, ctx.Err()
	}
	switch code := recipeassistant.CodeOf(err); {
	case err == nil:
		res.Checks = append(res.Checks, Check{Name: "key", OK: true})
		if info.Lifecycle == "retired" {
			res.Checks = append(res.Checks, Check{Name: "model", Code: recipeassistant.CodeModelUnavailable})
			return finish()
		}
		if !info.StructuredOutputs {
			res.Checks = append(res.Checks, Check{Name: "model", Code: CodeCannotRead})
			return finish()
		}
		res.Checks = append(res.Checks, Check{Name: "model", OK: true})
		res.Model = &ModelRef{ID: info.ID, Name: modelName(info.ID, info.DisplayName)}
	case code == recipeassistant.CodeModelUnavailable:
		res.Checks = append(res.Checks, Check{Name: "key", OK: true}, Check{Name: "model", Code: code})
		return finish()
	case code == recipeassistant.CodeBadKey || code == recipeassistant.CodeForbidden || code == recipeassistant.CodeUnreachable || code == recipeassistant.CodeBusy || code == recipeassistant.CodeRateLimited:
		res.Checks = append(res.Checks, Check{Name: "key", Code: code})
		return finish()
	default:
		// A gateway without the Models API: the key and model are judged by the message call below.
		res.Checks = append(res.Checks, Check{Name: "key", OK: true}, Check{Name: "model", OK: true})
		res.Model = &ModelRef{ID: model, Name: modelName(model, "")}
	}

	req := Request{
		Model:     model,
		System:    "Answer with a JSON object that has ok set to true.",
		Turns:     []Turn{{Role: "user", Text: "Is the connection working?"}},
		Schema:    json.RawMessage(testSchema),
		MaxTokens: 1024,
	}
	if info.Effort {
		req.Effort = "low"
	}
	resp, err := cl.Message(lctx, req)
	if ctx.Err() != nil {
		return TestResult{}, ctx.Err()
	}
	out := Check{Name: "output", OK: err == nil && json.Valid([]byte(resp.Text))}
	if !out.OK {
		out.Code = recipeassistant.CodeOf(err)
		if out.Code == "" {
			out.Code = recipeassistant.CodeInvalidOutput
		}
	}
	res.Checks = append(res.Checks, out)
	return finish()
}
