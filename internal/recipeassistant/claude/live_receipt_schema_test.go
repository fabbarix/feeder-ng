package claude_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/claude"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

// TestLiveReceiptSchemaCompiles sends the exact receipt.OutputSchema() with a one-line message and max_tokens 16 to the
// default model and fails on a refused schema (a 400 "compiled grammar is too large" shows up before any token is
// generated). Opt-in and billed (a few tokens): it runs only with FEEDER_LIVE_SCHEMA_CHECK=1 and FEEDER_ANTHROPIC_KEY
// set, never in CI. It passes only on success or CodeOutputTooLong (a 16-token answer is cut off, which proves the
// schema compiled). The key is only handed to the adapter, which never logs it; this test prints neither it nor the
// request.
func TestLiveReceiptSchemaCompiles(t *testing.T) {
	if os.Getenv("FEEDER_LIVE_SCHEMA_CHECK") != "1" {
		t.Skip("FEEDER_LIVE_SCHEMA_CHECK=1 is not set")
	}
	key := os.Getenv("FEEDER_ANTHROPIC_KEY")
	if key == "" {
		t.Skip("FEEDER_ANTHROPIC_KEY is not set")
	}
	zero := 0
	c := claude.New(claude.Options{BaseURL: recipeassistant.DefaultBaseURL, APIKey: recipeassistant.Secret(key), MaxRetries: &zero})
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	_, err := c.Message(ctx, service.Request{
		Model:     recipeassistant.DefaultModel,
		System:    receipt.SystemPrompt(),
		Turns:     []service.Turn{{Role: "user", Text: "MUTTI PASSATA 700G 1,29"}},
		Schema:    receipt.OutputSchema(),
		MaxTokens: 16,
	})
	if err != nil && recipeassistant.CodeOf(err) != recipeassistant.CodeOutputTooLong {
		t.Fatalf("the receipt output schema check failed (%s): %v", recipeassistant.CodeOf(err), err)
	}
}
