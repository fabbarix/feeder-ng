// Package claude is the Anthropic adapter behind service.Claude. It sends non-beta Messages calls and Models
// calls to an Anthropic-compatible base URL with x-api-key, and maps every failure to *recipeassistant.Error.
// The design (ADR 0006, plan §1.8) uses the official Go SDK, github.com/anthropics/anthropic-sdk-go; the tests
// here assert the wire only (against internal/recipeassistant/fakeanthropic), so they hold for the SDK or for
// plain net/http. See docs/dev/design/ra-c-service.md §6 for the dependency situation.
package claude

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

// Options configure one client (one per read).
type Options struct {
	BaseURL string                 // normalised by recipeassistant.ValidateBaseURL; "/v1/..." is appended
	APIKey  recipeassistant.Secret // sent as x-api-key, never logged
	// HTTPClient defaults to NewHTTPClient().
	HTTPClient *http.Client
	// MaxRetries is how many times retryable failures (408, 409, 429, 5xx, 529, connection errors) are retried,
	// honouring retry-after; nil means 2.
	MaxRetries *int
	Logger     *slog.Logger // nil: slog.Default
}

// Client implements service.Claude.
type Client struct{ opts Options }

// New returns a client.
func New(o Options) *Client { return &Client{opts: o} }

// Factory returns a service.ClaudeFactory over the default HTTP client.
func Factory(logger *slog.Logger) service.ClaudeFactory {
	return func(c service.Conn) service.Claude {
		return New(Options{BaseURL: c.BaseURL, APIKey: c.Key, Logger: logger})
	}
}

// NewHTTPClient is the client every call uses: TLS 1.2+, the environment's proxy, and every redirect refused
// (the key travels in x-api-key, which Go does not strip on a cross-host redirect).
// TODO(ra-c developer): implement.
func NewHTTPClient() *http.Client { return &http.Client{} }

var errNotImplemented = errors.New("claude: not implemented")

// Message sends one Messages call (design §1.2) and checks stop_reason before reading content.
func (c *Client) Message(ctx context.Context, r service.Request) (service.Response, error) {
	return service.Response{}, errNotImplemented
}

// Models lists all models (every page).
func (c *Client) Models(ctx context.Context) ([]service.ModelInfo, error) {
	return nil, errNotImplemented
}

// Model gets one model; a 404 is recipeassistant.CodeModelUnavailable.
func (c *Client) Model(ctx context.Context, id string) (service.ModelInfo, error) {
	return service.ModelInfo{}, errNotImplemented
}

var _ service.Claude = (*Client)(nil)
