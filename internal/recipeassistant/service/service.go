package service

import (
	"log/slog"
	"sync"
	"time"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/store"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
)

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
type Service struct {
	d       Deps
	limiter *recipeassistant.Limiter

	mu    sync.Mutex
	jobs  map[int64][]*job // by User, oldest first
	cache caches

	agentPrompt string
	schema      []byte
	promptErr   error
}

// New returns a Service.
func New(d Deps) *Service {
	s := &Service{d: d, jobs: map[int64][]*job{}, cache: newCaches()}
	if s.d.Clock == nil {
		s.d.Clock = clock.System{}
	}
	if s.d.Logger == nil {
		s.d.Logger = slog.Default()
	}
	s.limiter = recipeassistant.NewLimiter(s.d.Clock.Now)
	s.agentPrompt, s.schema, s.promptErr = buildPrompt()
	return s
}

func buildPrompt() (prompt string, schema []byte, err error) {
	tmpl, err := recipefile.ExtractTemplate(spec.RecipeFileMD)
	if err != nil {
		return "", nil, err
	}
	schema, err = recipeassistant.OutputSchema(spec.Schema)
	if err != nil {
		return "", nil, err
	}
	return recipeassistant.SystemPrompt(recipefile.AgentPrompt(tmpl, string(spec.Schema), string(spec.Example))), schema, nil
}

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
	Changed  bool // at least one change-history row was written
}

// FieldError names a settings field and the code that refused it (PUT 422 invalid_settings errors[]).
type FieldError struct{ Field, Code string }

// SettingsError is returned by SaveSettings for refused input.
type SettingsError struct{ Errors []FieldError }

func (e *SettingsError) Error() string { return "invalid_settings" }
