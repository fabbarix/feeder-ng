package service

import (
	"context"
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

// DefaultOverall is the cap for one whole read: fetch, model calls, repair and images (design §1.3). The model call
// streams, so a long answer is no longer cut at one attempt's 120 s; 300 s leaves room for it and one repair.
const DefaultOverall = 300 * time.Second

// CourseSource lists the Household's active Courses for the Agent Prompt, in household order (crs-e1). The prompt
// is built from it for every read, so a renamed or added Course reaches the model at once.
type CourseSource interface {
	PromptCourses(ctx context.Context) ([]recipefile.PromptCourse, error)
}

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
	Courses  CourseSource // nil: no Courses are listed in the prompt
}

// Service is safe for concurrent use.
type Service struct {
	d       Deps
	limiter *recipeassistant.Limiter

	mu    sync.Mutex
	jobs  map[int64][]*job // by User, oldest first
	cache caches

	// afterPerform is a test-only seam: nil in production, set only from export_test.go. run calls it between
	// perform returning and the sample of j.cancelled, so a test can cancel at exactly that instant.
	afterPerform func()

	tmpl      string // the Agent Prompt template; the prompt is built per read (crs-e1)
	schema    []byte
	promptErr error
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
	s.tmpl, s.schema, s.promptErr = buildPrompt()
	return s
}

func buildPrompt() (tmpl string, schema []byte, err error) {
	tmpl, err = recipefile.ExtractTemplate(spec.RecipeFileMD)
	if err != nil {
		return "", nil, err
	}
	schema, err = recipeassistant.OutputSchema(spec.Schema)
	if err != nil {
		return "", nil, err
	}
	return tmpl, schema, nil
}

// systemPrompt is the system prompt of one read: the Agent Prompt with the Household's Courses as they are now
// (crs-e1). A Course source that fails refuses the read.
func (s *Service) systemPrompt(ctx context.Context) (string, error) {
	var courses []recipefile.PromptCourse
	if s.d.Courses != nil {
		list, err := s.d.Courses.PromptCourses(ctx)
		if err != nil {
			return "", err
		}
		courses = list
	}
	return recipeassistant.SystemPrompt(recipefile.AgentPrompt(s.tmpl, string(spec.Schema), string(spec.Example), courses)), nil
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
