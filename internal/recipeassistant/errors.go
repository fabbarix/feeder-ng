// Package recipeassistant is the pure core of the Recipe Assistant: the
// domain rules (limits, base URL, model ID, settings updates, rate limits),
// error codes and their mapping from API failures, the prompt wrapper for
// untrusted sources, the output schema projection and the post-processing of
// the model's answer. No net/http, no database/sql, no Anthropic SDK types:
// adapters translate to the plain types defined here.
// See docs/dev/design/ra-ab-core.md and docs/dev/design/ai-recipe-import.md.
package recipeassistant

import (
	"errors"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// Error codes. The first group are read errors (design §1.4), the second the
// validation errors of settings and sources (§1.5, §1.7, §2.4, §4.1, §4.3).
const (
	CodeBadKey           = "assistant_bad_key"
	CodeForbidden        = "assistant_forbidden"
	CodeBilling          = "assistant_billing"
	CodeModelUnavailable = "assistant_model_unavailable"
	CodeRequestRejected  = "assistant_request_rejected"
	CodeRateLimited      = "assistant_rate_limited"
	CodeBusy             = "assistant_busy"
	CodeUnreachable      = "assistant_unreachable"
	CodeDeclined         = "assistant_declined"
	CodeOutputTooLong    = "assistant_output_too_long"
	CodeInvalidOutput    = "assistant_invalid_output"
	CodeSourceTooLong    = "source_too_long"
	CodeNoRecipeFound    = "no_recipe_found"
	CodeTooManyRecipes   = "too_many_recipes"

	CodeTextEmpty             = "text_empty"
	CodeTextTooLong           = "text_too_long"
	CodeReadInProgress        = "read_in_progress"
	CodeTooManyReads          = "too_many_reads"
	CodeSecretKeyMissing      = "secret_key_missing"
	CodeKeyRequiredNewBaseURL = "key_required_for_new_base_url"
	CodeAPIKeyRequired        = "api_key_required"
	CodeAPIKeyInvalid         = "api_key_invalid"
	CodeBaseURLInvalid        = "base_url_invalid"
	CodeBaseURLHasVersion     = "base_url_has_version"
	CodeModelInvalid          = "model_invalid"
)

// Error is a domain error: a stable Code plus optional detail. It is the only
// error type this package returns for expected failures.
type Error struct {
	Code              string
	Message           string
	RetryAfterSeconds int                    // CodeRateLimited, CodeTooManyReads
	Model             string                 // CodeDeclined
	Paths             []recipefile.PathError // CodeInvalidOutput
}

func (e *Error) Error() string { return e.Code }

// CodeOf returns the Code of the first *Error in err's chain, "" otherwise.
func CodeOf(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.Code
	}
	return ""
}

// APIFailure is what an adapter extracts from a failed Messages call, free of
// SDK types. Transport is true for timeouts, connection and TLS errors (then
// Status is 0). Type is the API error type ("rate_limit_error", ...), Message
// its message, RetryAfterSeconds the retry-after header (0 when absent).
type APIFailure struct {
	Status            int
	Type              string
	Message           string
	RetryAfterSeconds int
	Transport         bool
}

// ClassifyAPIFailure maps an API failure to a read error (design §1.4 table).
func ClassifyAPIFailure(f APIFailure) *Error {
	if f.Transport {
		return &Error{Code: CodeUnreachable}
	}
	status := f.Status
	if status == 0 {
		switch f.Type {
		case "authentication_error":
			status = 401
		case "billing_error":
			status = 402
		case "permission_error":
			status = 403
		case "not_found_error":
			status = 404
		case "request_too_large":
			status = 413
		case "rate_limit_error":
			status = 429
		case "overloaded_error", "api_error":
			status = 529
		case "invalid_request_error":
			status = 400
		default:
			return &Error{Code: CodeUnreachable}
		}
	}
	switch {
	case status == 401:
		return &Error{Code: CodeBadKey}
	case status == 402:
		return &Error{Code: CodeBilling}
	case status == 403:
		return &Error{Code: CodeForbidden}
	case status == 404:
		// A missing model names the model; any other 404 is a wrong base URL.
		if strings.Contains(strings.ToLower(f.Message), "model") {
			return &Error{Code: CodeModelUnavailable}
		}
		return &Error{Code: CodeRequestRejected}
	case status == 413:
		return &Error{Code: CodeSourceTooLong}
	case status == 429:
		return &Error{Code: CodeRateLimited, RetryAfterSeconds: f.RetryAfterSeconds}
	case status >= 500:
		return &Error{Code: CodeBusy}
	}
	return &Error{Code: CodeRequestRejected}
}

// ClassifyStopReason maps a response's stop_reason: "refusal" is CodeDeclined
// (with model), "max_tokens" and "model_context_window_exceeded" are CodeOutputTooLong, normal reasons are nil.
func ClassifyStopReason(stopReason, model string) *Error {
	switch stopReason {
	case "refusal":
		return &Error{Code: CodeDeclined, Model: model}
	case "max_tokens", "model_context_window_exceeded":
		return &Error{Code: CodeOutputTooLong}
	}
	return nil
}

// RetryWithinBudget reports whether waiting retryAfter fits in the time left
// of the read's deadline; if not, the read stops with CodeRateLimited.
func RetryWithinBudget(retryAfter, remaining time.Duration) bool {
	if retryAfter <= 0 {
		return true
	}
	return remaining > 0 && retryAfter <= remaining
}
