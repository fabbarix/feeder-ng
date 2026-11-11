// Package claude is the Anthropic adapter behind service.Claude. It sends non-beta Messages calls and Models
// calls to an Anthropic-compatible base URL with x-api-key, using the official Go SDK
// (github.com/anthropics/anthropic-sdk-go, ADR 0006), and maps every failure to *recipeassistant.Error.
// It is the only package that knows the SDK. The adapter owns retrying (the SDK's own retries are off) so that a
// retry-after beyond the read's deadline stops at once, and every call goes through an HTTP client that refuses
// redirects so the key cannot leave the saved origin.
package claude

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

const (
	defaultRetries = 2
	// callTimeout bounds one HTTP attempt; the read's own deadline (180 s) is the real cap.
	callTimeout = 120 * time.Second
	baseBackoff = 500 * time.Millisecond
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
	// RequestTimeout bounds one HTTP attempt; zero means 120 s.
	RequestTimeout time.Duration
}

// Client implements service.Claude.
type Client struct {
	opts Options
	sdk  anthropic.Client
	log  *slog.Logger
	max  int
}

// New returns a client. The environment is never consulted (no ANTHROPIC_* variables, profiles or headers):
// the Admin's saved base URL and key are the only credentials.
func New(o Options) *Client {
	hc := o.HTTPClient
	if hc == nil {
		hc = NewHTTPClient()
	}
	log := o.Logger
	if log == nil {
		log = slog.Default()
	}
	timeout := o.RequestTimeout
	if timeout <= 0 {
		timeout = callTimeout
	}
	n := defaultRetries
	if o.MaxRetries != nil {
		n = *o.MaxRetries
	}
	sdk := anthropic.NewClient(
		option.WithoutEnvironmentDefaults(),
		option.WithBaseURL(o.BaseURL),
		option.WithAPIKey(o.APIKey.Reveal()),
		option.WithHTTPClient(hc),
		option.WithMaxRetries(0), // retrying is ours, see retry
		option.WithRequestTimeout(timeout),
	)
	return &Client{opts: o, sdk: sdk, log: log, max: n}
}

// Factory returns a service.ClaudeFactory over the default HTTP client.
func Factory(logger *slog.Logger) service.ClaudeFactory {
	return func(c service.Conn) service.Claude {
		return New(Options{BaseURL: c.BaseURL, APIKey: c.Key, Logger: logger})
	}
}

// NewHTTPClient is the client every call uses: TLS 1.2+, the environment's proxy, and every redirect refused
// (the key travels in x-api-key, which Go does not strip on a cross-host redirect).
func NewHTTPClient() *http.Client {
	tr := &http.Transport{
		Proxy:                 proxyForHTTPS,
		DialContext:           (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: callTimeout,
		MaxIdleConns:          4,
		IdleConnTimeout:       30 * time.Second,
	}
	return &http.Client{
		Transport: tr,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("claude: redirects are refused, the API key must not leave the saved origin")
		},
	}
}

// proxyForHTTPS uses the environment's proxy for https addresses only (a CONNECT tunnel keeps the key and the
// recipe private); a plain http base URL is dialled directly, never through a proxy that could read it.
func proxyForHTTPS(req *http.Request) (*url.URL, error) {
	if req.URL.Scheme != "https" {
		return nil, nil
	}
	return http.ProxyFromEnvironment(req)
}

// Message sends one Messages call (design §1.2) and checks stop_reason before reading content.
func (c *Client) Message(ctx context.Context, r service.Request) (service.Response, error) {
	params, err := messageParams(r)
	if err != nil {
		return service.Response{}, &recipeassistant.Error{Code: recipeassistant.CodeRequestRejected}
	}
	var (
		msg  *anthropic.Message
		hdr  *http.Response
		resp service.Response
	)
	start := time.Now()
	err = c.retry(ctx, func() error {
		var e error
		hdr = nil
		msg, e = c.sdk.Messages.New(ctx, params, option.WithResponseInto(&hdr))
		return e
	})
	if err != nil {
		out := c.classify(ctx, err)
		c.logCall("messages", r.Model, hdr, err, out, start)
		return resp, out
	}
	resp = service.Response{StopReason: string(msg.StopReason), RequestID: requestID(hdr, msg.ID), Usage: service.Usage{
		InputTokens: int(msg.Usage.InputTokens), OutputTokens: int(msg.Usage.OutputTokens),
		CacheReadTokens: int(msg.Usage.CacheReadInputTokens), CacheCreationTokens: int(msg.Usage.CacheCreationInputTokens),
	}}
	var text []string
	for _, b := range msg.Content {
		if t, ok := b.AsAny().(anthropic.TextBlock); ok {
			text = append(text, t.Text)
		}
	}
	resp.Text = strings.Join(text, "")
	// stop_reason first: a refusal or a truncated answer is an error whatever the content holds.
	if e := recipeassistant.ClassifyStopReason(resp.StopReason, r.Model); e != nil {
		c.logCall("messages", r.Model, hdr, nil, e, start, resp.Usage)
		return resp, e
	}
	c.logCall("messages", r.Model, hdr, nil, nil, start, resp.Usage)
	return resp, nil
}

func messageParams(r service.Request) (anthropic.MessageNewParams, error) {
	p := anthropic.MessageNewParams{
		Model:     anthropic.Model(r.Model),
		MaxTokens: int64(r.MaxTokens),
		System: []anthropic.TextBlockParam{{
			Text:         r.System,
			CacheControl: anthropic.NewCacheControlEphemeralParam(),
		}},
	}
	for _, t := range r.Turns {
		var blocks []anthropic.ContentBlockParamUnion
		for _, im := range t.Images {
			blocks = append(blocks, anthropic.NewImageBlockBase64(im.MediaType, base64.StdEncoding.EncodeToString(im.Data)))
		}
		blocks = append(blocks, anthropic.NewTextBlock(t.Text))
		if t.Role == "assistant" {
			p.Messages = append(p.Messages, anthropic.NewAssistantMessage(blocks...))
		} else {
			p.Messages = append(p.Messages, anthropic.NewUserMessage(blocks...))
		}
	}
	if len(r.Schema) > 0 {
		var schema map[string]any
		if err := json.Unmarshal(r.Schema, &schema); err != nil {
			return p, err
		}
		p.OutputConfig.Format = anthropic.JSONOutputFormatParam{Schema: schema}
	}
	if r.Effort != "" {
		p.OutputConfig.Effort = anthropic.OutputConfigEffort(r.Effort)
	}
	return p, nil
}

// Models lists all models (every page).
func (c *Client) Models(ctx context.Context) ([]service.ModelInfo, error) {
	var out []service.ModelInfo
	start := time.Now()
	err := c.retry(ctx, func() error {
		out = out[:0]
		it := c.sdk.Models.ListAutoPaging(ctx, anthropic.ModelListParams{})
		for it.Next() {
			out = append(out, flatten(it.Current()))
		}
		return it.Err()
	})
	if err != nil {
		e := c.classify(ctx, err)
		c.logCall("models", "", nil, err, e, start)
		return nil, e
	}
	c.logCall("models", "", nil, nil, nil, start)
	return out, nil
}

// Model gets one model; a 404 is recipeassistant.CodeModelUnavailable.
func (c *Client) Model(ctx context.Context, id string) (service.ModelInfo, error) {
	var m *anthropic.ModelInfo
	start := time.Now()
	err := c.retry(ctx, func() error {
		var e error
		m, e = c.sdk.Models.Get(ctx, id, anthropic.ModelGetParams{})
		return e
	})
	if err != nil {
		e := c.classify(ctx, err)
		c.logCall("model", id, nil, err, e, start)
		return service.ModelInfo{}, e
	}
	c.logCall("model", id, nil, nil, nil, start)
	return flatten(*m), nil
}

func flatten(m anthropic.ModelInfo) service.ModelInfo {
	info := service.ModelInfo{
		ID: m.ID, DisplayName: m.DisplayName,
		StructuredOutputs: m.Capabilities.StructuredOutputs.Supported,
		ImageInput:        m.Capabilities.ImageInput.Supported,
		Effort:            m.Capabilities.Effort.Supported,
		Lifecycle:         "active",
	}
	// lifecycle and retires_at are not typed in SDK v1.66.0; read them from the raw body when a gateway sends them.
	var extra struct {
		Lifecycle string  `json:"lifecycle"`
		RetiresAt *string `json:"retires_at"`
	}
	if json.Unmarshal([]byte(m.RawJSON()), &extra) == nil {
		if extra.Lifecycle != "" {
			info.Lifecycle = extra.Lifecycle
		}
		if extra.RetiresAt != nil {
			info.RetiresAt = *extra.RetiresAt
		}
	}
	return info
}

// ---- errors and retries ---------------------------------------------------------------------------------------

// failure extracts what ClassifyAPIFailure needs from an SDK error.
func failure(err error) (recipeassistant.APIFailure, bool) {
	var ae *anthropic.Error
	if !errors.As(err, &ae) {
		return recipeassistant.APIFailure{Transport: true}, false
	}
	f := recipeassistant.APIFailure{Status: ae.StatusCode, Type: string(ae.Type())}
	var env struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal([]byte(ae.RawJSON()), &env) == nil {
		f.Message = env.Error.Message
	}
	if ae.Response != nil {
		f.RetryAfterSeconds = parseRetryAfter(ae.Response.Header.Get("retry-after"))
		if ms := parseRetryAfterMs(ae.Response.Header.Get("retry-after-ms")); ms > 0 {
			f.RetryAfterSeconds = int(math.Ceil(ms.Seconds()))
		}
	}
	return f, true
}

// parseRetryAfterMs reads the retry-after-ms header (milliseconds, possibly fractional); 0 when absent or invalid.
func parseRetryAfterMs(v string) time.Duration {
	n, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
	if err != nil || n <= 0 || math.IsInf(n, 0) || math.IsNaN(n) {
		return 0
	}
	return time.Duration(n * float64(time.Millisecond))
}

// retryAfterOf is the exact wait the API asked for in retry-after-ms, or 0.
func retryAfterOf(err error) time.Duration {
	var ae *anthropic.Error
	if errors.As(err, &ae) && ae.Response != nil {
		return parseRetryAfterMs(ae.Response.Header.Get("retry-after-ms"))
	}
	return 0
}

func parseRetryAfter(v string) int {
	v = strings.TrimSpace(v)
	if v == "" {
		return 0
	}
	if n, err := strconv.ParseFloat(v, 64); err == nil && n > 0 {
		return int(math.Ceil(n))
	}
	if t, err := http.ParseTime(v); err == nil {
		if d := time.Until(t); d > 0 {
			return int(math.Ceil(d.Seconds()))
		}
	}
	return 0
}

// classify turns any call error into the error the port promises: the context's own error when the caller
// cancelled, *recipeassistant.Error otherwise (a deadline is assistant_unreachable).
func (c *Client) classify(ctx context.Context, err error) error {
	if errors.Is(ctx.Err(), context.Canceled) {
		return context.Canceled
	}
	var re *recipeassistant.Error
	if errors.As(err, &re) {
		return re
	}
	f, _ := failure(err)
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
		f = recipeassistant.APIFailure{Transport: true}
	}
	return recipeassistant.ClassifyAPIFailure(f)
}

func retryable(f recipeassistant.APIFailure, isAPI bool) bool {
	if !isAPI {
		return true // connection errors
	}
	switch {
	case f.Status == 408, f.Status == 409, f.Status == 429, f.Status >= 500:
		return true
	}
	return false
}

// retry runs call, retrying retryable failures up to c.max times. A retry-after that does not fit in the time
// left before ctx's deadline stops the loop at once (the caller then reports assistant_rate_limited with the
// header's seconds).
func (c *Client) retry(ctx context.Context, call func() error) error {
	var err error
	for attempt := 0; ; attempt++ {
		if err = call(); err == nil {
			return nil
		}
		if ctx.Err() != nil || attempt >= c.max {
			return err
		}
		// A per-attempt timeout (the read's own ctx is still alive) is not retried: the model may be working on
		// the answer and a second attempt would bill it again.
		if errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		f, isAPI := failure(err)
		if !retryable(f, isAPI) {
			return err
		}
		wait := baseBackoff << attempt
		if ra := retryAfterOf(err); ra > 0 {
			wait = ra
		} else if f.RetryAfterSeconds > 0 {
			wait = time.Duration(f.RetryAfterSeconds) * time.Second
		}
		remaining := time.Duration(math.MaxInt64)
		if dl, ok := ctx.Deadline(); ok {
			remaining = time.Until(dl)
		}
		if !recipeassistant.RetryWithinBudget(wait, remaining) {
			return err
		}
		t := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			t.Stop()
			return err
		case <-t.C:
		}
	}
}

func requestID(h *http.Response, fallback string) string {
	if h != nil {
		if v := h.Header.Get("request-id"); v != "" {
			return v
		}
	}
	return fallback
}

// logCall writes one line per call: never the key, the system prompt, the conversation, the output or the API's
// error message (it can echo the key).
func (c *Client) logCall(kind, model string, h *http.Response, err error, out error, start time.Time, usage ...service.Usage) {
	attrs := []any{"kind", kind, "model", model, "ms", time.Since(start).Milliseconds()}
	var ae *anthropic.Error
	if errors.As(err, &ae) {
		attrs = append(attrs, "status", ae.StatusCode, "request_id", ae.RequestID)
	} else if h != nil {
		attrs = append(attrs, "status", h.StatusCode, "request_id", h.Header.Get("request-id"))
	}
	if code := recipeassistant.CodeOf(out); code != "" {
		attrs = append(attrs, "outcome", code)
	} else if out != nil {
		attrs = append(attrs, "outcome", "cancelled")
	} else {
		attrs = append(attrs, "outcome", "ok")
	}
	if len(usage) > 0 {
		u := usage[0]
		attrs = append(attrs, "input_tokens", u.InputTokens, "output_tokens", u.OutputTokens,
			"cache_read_tokens", u.CacheReadTokens, "cache_creation_tokens", u.CacheCreationTokens)
	}
	c.log.Info("anthropic call", attrs...)
}

var _ service.Claude = (*Client)(nil)
