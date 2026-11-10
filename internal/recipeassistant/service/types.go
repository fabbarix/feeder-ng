// Package service orchestrates the Recipe Assistant over ports: the store, the secret box, the Anthropic
// adapter (internal/recipeassistant/claude), the page and photo fetchers and the clock. It holds the read
// jobs and the Limiter. HTTP handlers (recipefile/httpapi reads, recipeassistant/httpapi) stay thin and call it.
// It imports no net/http and no Anthropic SDK type. See docs/dev/design/ra-c-service.md.
package service

import (
	"context"
	"encoding/json"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/safehttp"
)

// Codes of errors that are not in package recipeassistant (source and settings validation, availability).
const (
	CodeAssistantOff     = "assistant_off" // 503: not usable (off, no secret key, key unreadable, model unavailable)
	CodeURLInvalid       = "url_invalid"
	CodePageUnavailable  = "page_unavailable"
	CodePhotosEmpty      = "photos_empty"
	CodeTooManyPhotos    = "too_many_photos"
	CodePhotoTooLarge    = "photo_too_large"
	CodePhotoUnsupported = "photo_unsupported"
	CodePhotoUnavailable = "photo_unavailable"
	CodePhotosNotSupport = "photos_not_supported_by_model"
	CodeModelUnavailable = "model_unavailable" // settings save: 404 from Models.Get
	CodeAPIKeyRefused    = "api_key_refused"   // settings save: 401 from Models.Get
	CodeCannotRead       = "model_cannot_read_recipes"
	MaxPhotos            = 4
)

// Read states (design §7). A page read starts in StateFetching, a photo read in StatePreparing, a text read in
// StateReading; every successful read then passes through reading, checking and images before done.
const (
	StateFetching  = "fetching"
	StatePreparing = "preparing"
	StateReading   = "reading"
	StateChecking  = "checking"
	StateImages    = "images"
	StateDone      = "done"
	StateFailed    = "failed"
	StateCancelled = "cancelled"
)

// Conn is how to reach one Anthropic-compatible API. The key is revealed only inside the adapter.
type Conn struct {
	BaseURL string
	Key     recipeassistant.Secret
}

// Image is one image block (always image/jpeg from PreparePhotos).
type Image struct {
	MediaType string
	Data      []byte
}

// Turn is one message of the conversation. Images come before Text in the wire block order.
type Turn struct {
	Role   string // "user" or "assistant"
	Images []Image
	Text   string
}

// Request is one Messages call, free of SDK types.
type Request struct {
	Model     string
	System    string // one text block with cache_control ephemeral
	Turns     []Turn
	Schema    json.RawMessage // output_config.format.schema, sent byte for byte
	MaxTokens int             // 16000 for reads, 1024 for the connection test
	Effort    string          // "" = not sent
}

// Usage is the token accounting of one response.
type Usage struct{ InputTokens, OutputTokens, CacheReadTokens, CacheCreationTokens int }

// Response is one answer. The adapter returns a non-nil error for API failures AND for stop reasons refusal and
// max_tokens (via recipeassistant.ClassifyStopReason); Response is filled in either case when there was one.
type Response struct {
	Text       string // all text blocks joined
	StopReason string
	RequestID  string
	Usage      Usage
}

// ModelInfo is one model from the Models API (capabilities flattened).
type ModelInfo struct {
	ID, DisplayName   string
	StructuredOutputs bool
	ImageInput        bool
	Effort            bool
	Lifecycle         string // active, deprecated, retired
	RetiresAt         string
}

// Claude is the adapter port. All failures are *recipeassistant.Error, except a cancelled context
// (the context's error is returned as is).
type Claude interface {
	Message(ctx context.Context, r Request) (Response, error)
	Models(ctx context.Context) ([]ModelInfo, error)
	Model(ctx context.Context, id string) (ModelInfo, error)
}

// ClaudeFactory builds an adapter for one call chain (one client per read, design §1.3).
type ClaudeFactory func(Conn) Claude

// Pages fetches a web page (safehttp.Client satisfies it).
type Pages interface {
	FetchPage(ctx context.Context, rawURL string) (safehttp.Page, error)
}

// PhotoInput is one photo of a request: a data URL or an https URL, never both.
type PhotoInput struct{ DataURL, URL string }

// PreparedPhoto is a photo ready for the model: JPEG, longest side at most 2,576 px, no metadata.
type PreparedPhoto struct {
	JPEG          []byte
	Width, Height int
}

// Photos prepares photos (recipeassistant.PreparePhotos over internal/imaging; WP-A's photo part). Errors are
// *recipeassistant.Error with the Code* photo codes above.
type Photos interface {
	Prepare(ctx context.Context, in []PhotoInput) ([]PreparedPhoto, error)
}

// PhotoRef describes one candidate photo of a Review (the bytes stay in the session).
type PhotoRef struct{ Index, Width, Height int }

// ReviewRef is an opened Import Review.
type ReviewRef struct {
	ID     string
	Plan   recipefile.Plan
	Photos []PhotoRef
}

// Sink opens the Import Review for a finished read (recipefile/httpapi implements it over Sessions and BuildPlan).
// photos are the candidate photos of a photo read (nil otherwise); they move to the session.
type Sink interface {
	OpenReview(ctx context.Context, userID int64, f recipefile.File, images recipefile.ImageSet, photos []recipefile.CandidatePhoto) (ReviewRef, error)
}

// ModelRef names the model that read.
type ModelRef struct{ ID, Name string }

// SourceInfo describes what was read.
type SourceInfo struct {
	Kind           recipeassistant.SourceKind
	Title, URL     string // page reads; URL is the final URL
	StructuredData bool   // JSON-LD was used as a hint
	PhotoCount     int
}

// JobView is a snapshot of a read job.
type JobView struct {
	ID       string
	State    string
	States   []string // every state visited, in order, ending with State
	Review   *ReviewRef
	Source   *SourceInfo
	Model    *ModelRef
	Error    *recipeassistant.Error
	Warnings []recipeassistant.Warning
}

// ReadInput is a validated-by-the-service request: exactly one of URL, Text, Photos by Kind.
type ReadInput struct {
	Kind   recipeassistant.SourceKind
	URL    string
	Text   string
	Photos []PhotoInput
}
