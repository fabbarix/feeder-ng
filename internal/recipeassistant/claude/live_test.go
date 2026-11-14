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
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/testkit/anthropickey"
)

// liveText is a pasted recipe of the size that timed out non-streamed on 2026-11-11 (beta.2).
const liveText = `Lasagne alla bolognese (serves 6)

For the ragù: 2 tbsp olive oil, 1 onion, 1 carrot, 1 celery stalk (all finely chopped), 300 g minced beef,
200 g minced pork, 150 ml red wine, 700 g passata, salt, pepper.
For the béchamel: 60 g butter, 60 g flour, 800 ml whole milk, nutmeg, salt.
To finish: 400 g fresh egg lasagne sheets, 120 g grated Parmigiano Reggiano, 20 g butter.

1. Soften the onion, carrot and celery in the oil over low heat for 10 minutes.
2. Add both minces and brown them for 8 minutes, breaking them up.
3. Pour in the wine and let it evaporate, about 3 minutes.
4. Add the passata, season, cover and simmer gently for 2 hours, stirring now and then.
5. For the béchamel, melt the butter, whisk in the flour, cook 2 minutes, then add the milk little by little and
   stir until thick, about 10 minutes. Season with nutmeg and salt.
6. Heat the oven to 180 °C.
7. Layer in a buttered dish: ragù, sheets, béchamel, Parmigiano; repeat for 5 layers, ending with béchamel and cheese.
8. Dot with butter and bake for 35 minutes until golden. Rest 10 minutes before cutting.`

// TestLiveReadStreamsARecipe sends one real read (the service's prompt, schema, model, effort and max_tokens) to the
// Anthropic API and checks the answer is a valid Recipe File. It runs only with a live key set (anthropickey.Lookup,
// docs/dev/live-tests.md; FEEDER_LIVE_ANTHROPIC_BASE_URL and FEEDER_LIVE_ANTHROPIC_MODEL are optional); it is billed.
func TestLiveReadStreamsARecipe(t *testing.T) {
	key, _ := anthropickey.Lookup(os.Getenv)
	if key == "" {
		t.Skip(anthropickey.SkipReason())
	}
	base := os.Getenv("FEEDER_LIVE_ANTHROPIC_BASE_URL")
	if base == "" {
		base = "https://api.anthropic.com"
	}
	model := os.Getenv("FEEDER_LIVE_ANTHROPIC_MODEL")
	if model == "" {
		model = "claude-haiku-5-5"
	}
	tmpl, err := recipefile.ExtractTemplate(spec.RecipeFileMD)
	if err != nil {
		t.Fatal(err)
	}
	schema, err := recipeassistant.OutputSchema(spec.Schema)
	if err != nil {
		t.Fatal(err)
	}
	system := recipeassistant.SystemPrompt(recipefile.AgentPrompt(tmpl, string(spec.Schema), string(spec.Example), nil))
	source := liveText
	if t := os.Getenv("FEEDER_LIVE_TEXT"); t != "" {
		source = t // a smaller recipe, to tell the schema's cost from the answer's
	}
	text, err := recipeassistant.BuildSourceText(recipeassistant.Source{Kind: recipeassistant.KindText, Text: source})
	if err != nil {
		t.Fatal(err)
	}
	c := claude.New(claude.Options{BaseURL: base, APIKey: recipeassistant.Secret(key)})
	ctx, cancel := context.WithTimeout(context.Background(), service.DefaultOverall)
	defer cancel()
	start := time.Now()
	resp, err := c.Message(ctx, service.Request{Model: model, System: system, Schema: schema, MaxTokens: 16000, Effort: "medium",
		Turns: []service.Turn{{Role: "user", Text: text}}})
	took := time.Since(start)
	if err != nil {
		t.Fatalf("read failed after %v: %v", took, err)
	}
	t.Logf("read took %v: request %s, %d input / %d output tokens, stop %s", took, resp.RequestID, resp.Usage.InputTokens, resp.Usage.OutputTokens, resp.StopReason)
	fin, err := recipeassistant.Finish([]byte(resp.Text), recipeassistant.FinishInput{Kind: recipeassistant.KindText})
	if err != nil {
		t.Fatalf("the answer is not a valid Recipe File: %v", err)
	}
	if len(fin.File.Recipes) != 1 {
		t.Fatalf("recipes = %d, want 1", len(fin.File.Recipes))
	}
}
