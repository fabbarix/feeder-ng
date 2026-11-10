package service

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/store"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
)

// ErrNotImplemented marks the red stubs.
var ErrNotImplemented = errors.New("service: not implemented")

// DefaultOverall is the cap for one whole read: fetch, model calls, repair and images (design §1.3).
const DefaultOverall = 180 * time.Second

// Deps are the ports. Zero Overall means DefaultOverall.
type Deps struct {
	Store    *store.Store
	Box      *secretbox.Box // nil when the server has no FEEDER_SECRET_KEY
	MasterID string         // secretbox.MasterKey.ID(); "" without a secret key
	Claude   ClaudeFactory
	Pages    Pages
	Images   recipefile.Fetcher // photo URLs and ResolveImages (the SSRF-guarded fetcher)
	Photos   Photos
	Clock    clock.Clock
	Logger   *slog.Logger
	Overall  time.Duration
}

// Service is safe for concurrent use.
type Service struct{ d Deps }

// New returns a Service.
func New(d Deps) *Service { return &Service{d: d} }

// Actor is who changes settings.
type Actor = store.Actor

// SettingsView is the Admin's view: never the key.
type SettingsView struct {
	SecretKeyConfigured bool
	Settings            recipeassistant.Settings
	DefaultBaseURL      string
	APIKeyReadable      bool
	ModelStatus         string // ok, deprecated, unavailable, unknown
	RetiresAt           string
	Changes             []store.Event
}

// Warning is a non-blocking note on a settings save ("not_verified", "no_photos").
type Warning struct{ Code string }

// SaveResult is the answer to a settings save.
type SaveResult struct {
	View     SettingsView
	Warnings []Warning
}

// FieldError names a settings field and the code that refused it (PUT 422 invalid_settings errors[]).
type FieldError struct{ Field, Code string }

// SettingsError is returned by SaveSettings for refused input.
type SettingsError struct{ Errors []FieldError }

func (e *SettingsError) Error() string { return "invalid_settings" }

// Settings returns the Admin's view (design §7 GET /settings).
func (s *Service) Settings(ctx context.Context) (SettingsView, error) {
	return SettingsView{}, ErrNotImplemented
}

// SaveSettings applies a PUT: recipeassistant.ApplyUpdate, KeyFor for the key used in the live check,
// Models.Get when enabled and a key is available (404 model_unavailable, 401 api_key_refused, a network
// failure or a gateway without /v1/models -> warning not_verified, a model without structured outputs
// model_cannot_read_recipes, without image input -> warning no_photos), then store.Save with sealed key.
// Errors: *SettingsError or *recipeassistant.Error.
func (s *Service) SaveSettings(ctx context.Context, actor Actor, in recipeassistant.Update) (SaveResult, error) {
	return SaveResult{}, ErrNotImplemented
}

// RemoveKey clears the key and turns the assistant off (recipeassistant.ApplyKeyRemoval).
func (s *Service) RemoveKey(ctx context.Context, actor Actor) (SettingsView, error) {
	return SettingsView{}, ErrNotImplemented
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

// Models lists models with the key chosen by recipeassistant.KeyFor (before any request).
func (s *Service) Models(ctx context.Context, in ConnInput, refresh bool) (ModelList, error) {
	return ModelList{}, ErrNotImplemented
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

// TestConnection runs Models.Get(model) then a tiny structured Messages call, after KeyFor.
func (s *Service) TestConnection(ctx context.Context, in ConnInput) (TestResult, error) {
	return TestResult{}, ErrNotImplemented
}

// LimitStatus is the caller's remaining reads (omitted for Admins).
type LimitStatus struct{ Remaining, ResetsInSeconds int }

// Status is GET /status.
type Status struct {
	Available bool
	Reason    string // no_secret_key, off, no_key, key_unreadable, model_unavailable
	Model     *ModelRef
	Photos    bool
	Limit     *LimitStatus
}

// Status reports availability for a signed-in User.
func (s *Service) Status(ctx context.Context, c recipeassistant.Caller) (Status, error) {
	return Status{}, ErrNotImplemented
}

// Check reports what StartRead would refuse for the caller's limits, holding and counting nothing. The
// handler calls it before reading the request body.
func (s *Service) Check(c recipeassistant.Caller) error { return ErrNotImplemented }

// StartRead validates the input, takes the Limiter slot and starts the job in the background. It returns at
// once with the job's first state. Refusals are *recipeassistant.Error: CodeAssistantOff, source validation
// (text_empty, text_too_long, url_invalid, photos_empty, too_many_photos, photos_not_supported_by_model) and
// the Limiter's read_in_progress / too_many_reads. Nothing is held or counted when it refuses.
func (s *Service) StartRead(c recipeassistant.Caller, in ReadInput, sink Sink) (JobView, error) {
	return JobView{}, ErrNotImplemented
}

// Job returns the job if it belongs to the User.
func (s *Service) Job(userID int64, id string) (JobView, bool) { return JobView{}, false }

// CancelJob cancels a running job of the User (or forgets a finished one). It reports whether the job exists.
func (s *Service) CancelJob(userID int64, id string) bool { return false }
