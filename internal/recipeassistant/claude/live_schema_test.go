package claude_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/claude"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
	"github.com/fabbarix/feeder-ng/internal/testkit/anthropickey"
)

// TestLiveOutputSchemaCompiles sends the exact recipeassistant.OutputSchema with a one-line message and max_tokens 16
// to the default model, and fails on a 400: the schema compiler's "compiled grammar is too large" (1.0.0-beta.6)
// shows up there, before any token is generated. Opt-in and billed (a few tokens): it runs only with
// FEEDER_LIVE_SCHEMA_CHECK=1 and FEEDER_ANTHROPIC_KEY set, never in CI. The key is only handed to the adapter,
// which never logs it; this test prints neither it nor the request.
func TestLiveOutputSchemaCompiles(t *testing.T) {
	if os.Getenv("FEEDER_LIVE_SCHEMA_CHECK") != "1" {
		t.Skip("FEEDER_LIVE_SCHEMA_CHECK=1 is not set")
	}
	key, _ := anthropickey.Lookup(os.Getenv)
	if key == "" {
		t.Skip(anthropickey.SkipReason())
	}
	schema, err := recipeassistant.OutputSchema(spec.Schema)
	if err != nil {
		t.Fatal(err)
	}
	zero := 0
	c := claude.New(claude.Options{BaseURL: recipeassistant.DefaultBaseURL, APIKey: recipeassistant.Secret(key), MaxRetries: &zero})
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	_, err = c.Message(ctx, service.Request{
		Model:     recipeassistant.DefaultModel,
		System:    "You turn recipes into Recipe Files.",
		Turns:     []service.Turn{{Role: "user", Text: "Toast: 2 slices of bread, toast them."}},
		Schema:    schema,
		MaxTokens: 16,
	})
	// A 16-token answer is cut off, which the adapter reports as output-too-long: that proves the schema compiled.
	// Anything else fails: a refused schema (400), a bad key (401), a network error or a timeout.
	if err != nil && recipeassistant.CodeOf(err) != recipeassistant.CodeOutputTooLong {
		t.Fatalf("the output schema check failed (%s): %v", recipeassistant.CodeOf(err), err)
	}
}
