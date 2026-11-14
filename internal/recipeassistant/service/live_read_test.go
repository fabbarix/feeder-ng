package service_test

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/claude"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/store"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
	"github.com/fabbarix/feeder-ng/internal/testkit/anthropickey"
)

// fileSink keeps the Recipe File the service hands to Import Review.
type fileSink struct {
	mu   sync.Mutex
	file *recipefile.File
}

func (s *fileSink) OpenReview(_ context.Context, _ int64, f recipefile.File, _ recipefile.ImageSet, _ []recipefile.CandidatePhoto) (service.ReviewRef, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.file = &f
	return service.ReviewRef{ID: "live"}, nil
}
func (s *fileSink) CloseReview(int64, string) {}

const liveBaseText = "Lasagne: 500 ml béchamel (see the Béchamel recipe), 250 g pasta sheets, 400 g ragù. Layer and bake 40 minutes. " +
	"Béchamel: 50 g butter, 50 g flour, 500 ml milk. Melt butter, stir in flour, whisk in milk and simmer 10 minutes. Makes 500 ml."

// TestLiveReadWithABaseRecipe sends a short real recipe text through the whole Recipe Assistant read (the service with
// the real claude adapter, the default model and the service's own max_tokens, then Finish) and checks the Base recipe
// fields come out as the Recipe File expects them. Opt-in and billed: FEEDER_LIVE_SCHEMA_CHECK=1 and
// FEEDER_ANTHROPIC_KEY; never in CI. The key is sealed into a temporary store and never printed.
func TestLiveReadWithABaseRecipe(t *testing.T) {
	if os.Getenv("FEEDER_LIVE_SCHEMA_CHECK") != "1" {
		t.Skip("FEEDER_LIVE_SCHEMA_CHECK=1 is not set")
	}
	key, _ := anthropickey.Lookup(os.Getenv)
	if key == "" {
		t.Skip(anthropickey.SkipReason())
	}
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(t0)
	st := store.New(d, clk)
	mk, err := secretbox.ParseMasterKey(masterB64)
	if err != nil {
		t.Fatal(err)
	}
	box, _ := secretbox.New(mk)
	sealed, err := box.Seal([]byte(key))
	if err != nil {
		t.Fatal(err)
	}
	if err := st.Save(context.Background(), store.SaveInput{
		Settings: recipeassistant.Settings{Enabled: true, BaseURL: recipeassistant.DefaultBaseURL, Model: recipeassistant.DefaultModel, HasKey: true, KeyLast4: "0000"},
		Key:      &store.SealedKey{Ciphertext: sealed, MasterID: mk.ID(), Last4: "0000"}, Actor: store.Actor{UserID: 1, Email: "admin@example.test"},
	}); err != nil {
		t.Fatal(err)
	}
	sink := &fileSink{}
	svc := service.New(service.Deps{
		Store: st, Box: box, MasterID: mk.ID(), Images: noImages{}, Clock: clk,
		Claude: claude.Factory(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))),
	})
	caller := recipeassistant.Caller{UserID: 10, HouseholdID: 1}
	jv, err := svc.StartRead(caller, service.ReadInput{Kind: recipeassistant.KindText, Text: liveBaseText}, sink)
	if err != nil {
		t.Fatalf("StartRead: %v", err)
	}
	var done service.JobView
	deadline := time.Now().Add(3 * time.Minute)
	for time.Now().Before(deadline) {
		if v, ok := svc.Job(caller.UserID, jv.ID); ok && (v.State == service.StateDone || v.State == service.StateFailed || v.State == service.StateCancelled) {
			done = v
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	if done.State != service.StateDone {
		t.Fatalf("the read ended in state %q, error %+v", done.State, done.Error)
	}
	sink.mu.Lock()
	file := sink.file
	sink.mu.Unlock()
	if file == nil {
		t.Fatal("the read opened no Import Review")
	}

	// Finish already ran inside the service; the file it produced must also pass the canonical schema again.
	raw, err := json.Marshal(file)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := recipefile.Parse(raw); err != nil {
		t.Fatalf("the file fails the canonical schema: %v", err)
	}

	var lasagne, bechamel *recipefile.Recipe
	for i := range file.Recipes {
		r := &file.Recipes[i]
		switch {
		case strings.EqualFold(r.Name, "Lasagne"):
			lasagne = r
		case strings.EqualFold(r.Name, "Béchamel"), strings.EqualFold(r.Name, "Bechamel"):
			bechamel = r
		}
	}
	if lasagne == nil || bechamel == nil {
		t.Fatalf("want a Lasagne and a Béchamel recipe, got %d recipes: %s", len(file.Recipes), raw)
	}
	if bechamel.BaseRecipe == nil || !*bechamel.BaseRecipe {
		t.Errorf("Béchamel must be a Base recipe: %v", bechamel.BaseRecipe)
	}
	ml := map[string]float64{"ml": 1, "l": 1000, "dl": 100, "cl": 10}[bechamel.YieldUnit]
	if ml == 0 || bechamel.Yield*ml != 500 {
		t.Errorf("Béchamel's Yield = %v %q, want 500 ml", bechamel.Yield, bechamel.YieldUnit)
	}
	if lasagne.BaseRecipe != nil && *lasagne.BaseRecipe {
		t.Error("Lasagne must not be a Base recipe")
	}
	var marked int
	for _, r := range file.Recipes {
		for _, l := range r.Ingredients {
			if l.Recipe == nil {
				continue
			}
			marked++
			if r.Name != lasagne.Name || !strings.EqualFold(l.Recipe.Name, "Béchamel") && !strings.EqualFold(l.Recipe.Name, "Bechamel") {
				t.Errorf("a plain line carries a recipe: %s / %s -> %+v", r.Name, l.Ingredient, l.Recipe)
			}
		}
	}
	if marked != 1 {
		t.Errorf("exactly the Lasagne béchamel line carries a recipe, got %d lines", marked)
	}
	// Step uses never carry recipe or neededAtStep: look at the JSON, whatever the Go struct has.
	var generic struct {
		Recipes []struct {
			Steps []struct {
				Uses []map[string]any `json:"uses"`
			} `json:"steps"`
		} `json:"recipes"`
	}
	if err := json.Unmarshal(raw, &generic); err != nil {
		t.Fatal(err)
	}
	for _, r := range generic.Recipes {
		for _, st := range r.Steps {
			for _, u := range st.Uses {
				if _, has := u["recipe"]; has {
					t.Errorf("a step use carries recipe: %v", u)
				}
				if _, has := u["neededAtStep"]; has {
					t.Errorf("a step use carries neededAtStep: %v", u)
				}
			}
		}
	}
}
