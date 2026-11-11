// Package bdd runs the Gherkin features under bdd/features through `go test`.
//
// Each feature keeps its step definitions in steps_<feature>_test.go and
// registers them from init() with RegisterSteps; this file (owned by T0) never
// needs to change when a feature is added. A fresh World, and therefore a
// fresh in-process Feeder, is built for every scenario.
package bdd

import (
	"context"
	"fmt"
	"os"
	"sort"
	"sync"
	"testing"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// World is the per-scenario state shared by all step definitions.
type World struct {
	TB      testkit.TB                 // scenario-scoped; Fatalf panics, which godog reports as a step failure
	Env     *testkit.Env               // nil until Ensure
	Client  *testkit.Client            // the "current" client; anonymous after Ensure
	Clients map[string]*testkit.Client // by email, for multi-user scenarios
	Last    *testkit.Response          // last response
	Vars    map[string]any             // scratch space for a feature's steps
	Setup   []func(*config.Config)     // config tweaks applied when the app starts

	cleanups []func()
}

// Ensure starts the app on first use and returns it.
func (w *World) Ensure() *testkit.Env {
	if w.Env == nil {
		var opts []testkit.Option
		for _, f := range w.Setup {
			opts = append(opts, testkit.WithConfig(f))
		}
		w.Env = testkit.Start(w.TB, opts...)
		w.Client = w.Env.Anonymous()
	}
	return w.Env
}

// StepRegistrar adds one feature's step definitions to a scenario.
type StepRegistrar func(sc *godog.ScenarioContext, w *World)

var (
	registryMu sync.Mutex
	registry   = map[string]StepRegistrar{}
)

// RegisterSteps is called from init() in steps_<feature>_test.go. It panics on
// a duplicate name so two features can never silently shadow each other.
func RegisterSteps(name string, f StepRegistrar) {
	registryMu.Lock()
	defer registryMu.Unlock()
	if _, dup := registry[name]; dup {
		panic(fmt.Sprintf("bdd: step set %q registered twice", name))
	}
	registry[name] = f
}

// scenarioTB adapts a scenario to testkit.TB (godog.TestingT cannot).
type scenarioTB struct {
	outer *testing.T
	w     *World
}

func (s *scenarioTB) Helper()                   {}
func (s *scenarioTB) TempDir() string           { return s.outer.TempDir() }
func (s *scenarioTB) Cleanup(f func())          { s.w.cleanups = append(s.w.cleanups, f) }
func (s *scenarioTB) Fatalf(f string, a ...any) { panic(fmt.Sprintf(f, a...)) }

func initScenario(t *testing.T, sc *godog.ScenarioContext) {
	w := &World{Clients: map[string]*testkit.Client{}, Vars: map[string]any{}}
	w.TB = &scenarioTB{outer: t, w: w}

	registryMu.Lock()
	names := make([]string, 0, len(registry))
	for n := range registry {
		names = append(names, n)
	}
	sort.Strings(names)
	regs := make([]StepRegistrar, 0, len(names))
	for _, n := range names {
		regs = append(regs, registry[n])
	}
	registryMu.Unlock()
	for _, r := range regs {
		r(sc, w)
	}

	sc.After(func(ctx context.Context, _ *godog.Scenario, err error) (context.Context, error) {
		for i := len(w.cleanups) - 1; i >= 0; i-- {
			w.cleanups[i]()
		}
		return ctx, nil
	})
}

func TestFeatures(t *testing.T) {
	// Scenarios tagged @wip are parked (not run) unless GODOG_TAGS says otherwise.
	tags := os.Getenv("GODOG_TAGS")
	if tags == "" {
		tags = "~@wip"
	}
	suite := godog.TestSuite{
		ScenarioInitializer: func(sc *godog.ScenarioContext) { initScenario(t, sc) },
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"features"},
			Tags:     tags,
			TestingT: t,
			Strict:   true,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("non-zero status returned, failed to run feature tests")
	}
}
