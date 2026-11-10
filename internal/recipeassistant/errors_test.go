package recipeassistant_test

import (
	"errors"
	"fmt"
	"testing"
	"time"

	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

func TestClassifyAPIFailure(t *testing.T) {
	tests := []struct {
		name  string
		in    ra.APIFailure
		code  string
		retry int
	}{
		{"401", ra.APIFailure{Status: 401, Type: "authentication_error"}, ra.CodeBadKey, 0},
		{"401 without type", ra.APIFailure{Status: 401}, ra.CodeBadKey, 0},
		{"403", ra.APIFailure{Status: 403, Type: "permission_error"}, ra.CodeForbidden, 0},
		{"402", ra.APIFailure{Status: 402, Type: "billing_error"}, ra.CodeBilling, 0},
		{"404 model", ra.APIFailure{Status: 404, Type: "not_found_error", Message: "model: claude-old"}, ra.CodeModelUnavailable, 0},
		{"404 other (base URL with /v1)", ra.APIFailure{Status: 404, Type: "not_found_error", Message: "Not Found"}, ra.CodeRequestRejected, 0},
		{"404 empty message", ra.APIFailure{Status: 404}, ra.CodeRequestRejected, 0},
		{"413", ra.APIFailure{Status: 413, Type: "request_too_large"}, ra.CodeSourceTooLong, 0},
		{"429 with retry-after", ra.APIFailure{Status: 429, Type: "rate_limit_error", RetryAfterSeconds: 17}, ra.CodeRateLimited, 17},
		{"429 without retry-after", ra.APIFailure{Status: 429}, ra.CodeRateLimited, 0},
		{"529", ra.APIFailure{Status: 529, Type: "overloaded_error"}, ra.CodeBusy, 0},
		{"500", ra.APIFailure{Status: 500, Type: "api_error"}, ra.CodeBusy, 0},
		{"502", ra.APIFailure{Status: 502}, ra.CodeBusy, 0},
		{"503", ra.APIFailure{Status: 503}, ra.CodeBusy, 0},
		{"504", ra.APIFailure{Status: 504}, ra.CodeBusy, 0},
		{"400", ra.APIFailure{Status: 400, Type: "invalid_request_error", Message: "schema too complex"}, ra.CodeRequestRejected, 0},
		{"other 4xx", ra.APIFailure{Status: 422}, ra.CodeRequestRejected, 0},
		{"timeout / connection / TLS", ra.APIFailure{Transport: true}, ra.CodeUnreachable, 0},
		{"transport wins over a stray status", ra.APIFailure{Transport: true, Status: 500}, ra.CodeUnreachable, 0},
		{"type decides when status is missing", ra.APIFailure{Type: "rate_limit_error", RetryAfterSeconds: 3}, ra.CodeRateLimited, 3},
		{"type decides when status is missing (auth)", ra.APIFailure{Type: "authentication_error"}, ra.CodeBadKey, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ra.ClassifyAPIFailure(tc.in)
			if got == nil || got.Code != tc.code || got.RetryAfterSeconds != tc.retry {
				t.Fatalf("got %+v, want code %s retry %d", got, tc.code, tc.retry)
			}
		})
	}
}

func TestClassifyStopReason(t *testing.T) {
	got := ra.ClassifyStopReason("refusal", "claude-haiku-5-5")
	if got == nil || got.Code != ra.CodeDeclined || got.Model != "claude-haiku-5-5" {
		t.Fatalf("refusal: %+v", got)
	}
	if got := ra.ClassifyStopReason("max_tokens", "m"); got == nil || got.Code != ra.CodeOutputTooLong {
		t.Fatalf("max_tokens: %+v", got)
	}
	for _, ok := range []string{"end_turn", "stop_sequence"} {
		if got := ra.ClassifyStopReason(ok, "m"); got != nil {
			t.Errorf("%s must not be an error, got %+v", ok, got)
		}
	}
}

func TestRetryWithinBudget(t *testing.T) {
	if !ra.RetryWithinBudget(5*time.Second, 30*time.Second) {
		t.Error("5 s of a 30 s budget fits")
	}
	if !ra.RetryWithinBudget(30*time.Second, 30*time.Second) {
		t.Error("exactly the budget fits")
	}
	if ra.RetryWithinBudget(31*time.Second, 30*time.Second) {
		t.Error("more than the remaining budget must stop the read")
	}
	if ra.RetryWithinBudget(time.Second, 0) || ra.RetryWithinBudget(time.Second, -time.Second) {
		t.Error("nothing fits in an exhausted budget")
	}
	if !ra.RetryWithinBudget(0, time.Second) {
		t.Error("no wait always fits")
	}
}

func TestCodeOf(t *testing.T) {
	err := fmt.Errorf("wrapped: %w", &ra.Error{Code: ra.CodeBusy})
	if ra.CodeOf(err) != ra.CodeBusy {
		t.Fatal("CodeOf must see through wrapping")
	}
	if ra.CodeOf(errors.New("plain")) != "" || ra.CodeOf(nil) != "" {
		t.Fatal("CodeOf of a foreign error is empty")
	}
}

// Every code is a distinct, stable, lower_snake string: the API and the UI
// copy key off them.
func TestCodesAreDistinctStableStrings(t *testing.T) {
	want := map[string]string{
		ra.CodeBadKey: "assistant_bad_key", ra.CodeForbidden: "assistant_forbidden", ra.CodeBilling: "assistant_billing",
		ra.CodeModelUnavailable: "assistant_model_unavailable", ra.CodeRequestRejected: "assistant_request_rejected",
		ra.CodeRateLimited: "assistant_rate_limited", ra.CodeBusy: "assistant_busy", ra.CodeUnreachable: "assistant_unreachable",
		ra.CodeDeclined: "assistant_declined", ra.CodeOutputTooLong: "assistant_output_too_long",
		ra.CodeInvalidOutput: "assistant_invalid_output", ra.CodeSourceTooLong: "source_too_long",
		ra.CodeNoRecipeFound: "no_recipe_found", ra.CodeTooManyRecipes: "too_many_recipes",
		ra.CodeTextEmpty: "text_empty", ra.CodeTextTooLong: "text_too_long", ra.CodeReadInProgress: "read_in_progress",
		ra.CodeTooManyReads: "too_many_reads", ra.CodeSecretKeyMissing: "secret_key_missing",
		ra.CodeKeyRequiredNewBaseURL: "key_required_for_new_base_url", ra.CodeAPIKeyRequired: "api_key_required",
		ra.CodeAPIKeyInvalid: "api_key_invalid", ra.CodeBaseURLInvalid: "base_url_invalid",
		ra.CodeBaseURLHasVersion: "base_url_has_version", ra.CodeModelInvalid: "model_invalid",
	}
	for got, w := range want {
		if got != w {
			t.Errorf("code %q, want %q", got, w)
		}
	}
	if len(want) != 25 {
		t.Errorf("two codes share a value: %d distinct", len(want))
	}
}
