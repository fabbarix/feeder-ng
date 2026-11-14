package anthropickey_test

// b8-rxgo (docs/dev/design/b8-rxgo.md, docs/dev/live-tests.md): the one rule for the key of the opt-in live tests.
//
//	func Lookup(getenv func(string) string) (key, source string)
//
// getenv is os.Getenv in a live test (the package never reads the environment itself, scripts/test/env_drift_test.sh);
// these tests pass a fixed map. key is the first non-empty (after trimming spaces and a line break) of
// FEEDER_ANTHROPIC_KEY, FEEDER_LIVE_ANTHROPIC_KEY (the old name of the recipe import's live test, kept as an alias) and ANTHROPIC_KEY (the name `.env.local` uses);
// source is the NAME of the variable it came from, never a value. With none set both are "".
//
//	func SkipReason() string   // "set FEEDER_ANTHROPIC_KEY (or ANTHROPIC_KEY) to run this live test": names only

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/anthropickey"
)

const secret = "sk-test-not-a-real-key-0001"

// env is a getenv over a fixed set of variables: anything not in it is unset.
type env map[string]string

func (e env) get(name string) string { return e[name] }

func TestFeederAnthropicKeyIsRead(t *testing.T) {
	if k, src := anthropickey.Lookup(env{"FEEDER_ANTHROPIC_KEY": secret}.get); k != secret || src != "FEEDER_ANTHROPIC_KEY" {
		t.Errorf("Lookup = %q from %q", k, src)
	}
}

func TestAnthropicKeyOfTheEnvLocalFileIsTheFallback(t *testing.T) {
	if k, src := anthropickey.Lookup(env{"ANTHROPIC_KEY": secret}.get); k != secret || src != "ANTHROPIC_KEY" {
		t.Errorf("Lookup = %q from %q", k, src)
	}
}

func TestTheOldLiveNameStillWorks(t *testing.T) {
	if k, src := anthropickey.Lookup(env{"FEEDER_LIVE_ANTHROPIC_KEY": secret}.get); k != secret || src != "FEEDER_LIVE_ANTHROPIC_KEY" {
		t.Errorf("Lookup = %q from %q", k, src)
	}
}

func TestTheFeederNameWinsOverTheOthers(t *testing.T) {
	e := env{"ANTHROPIC_KEY": "other-1", "FEEDER_LIVE_ANTHROPIC_KEY": "other-2", "FEEDER_ANTHROPIC_KEY": secret}
	if k, src := anthropickey.Lookup(e.get); k != secret || src != "FEEDER_ANTHROPIC_KEY" {
		t.Errorf("Lookup = %q from %q", k, src)
	}
}

func TestAnEmptyOrBlankNameFallsThrough(t *testing.T) {
	e := env{"FEEDER_ANTHROPIC_KEY": "  \n", "ANTHROPIC_KEY": " " + secret + "\n"}
	if k, src := anthropickey.Lookup(e.get); k != secret || src != "ANTHROPIC_KEY" {
		t.Errorf("Lookup = %q from %q, want the trimmed fallback", k, src)
	}
}

func TestNoNameSetMeansNoKey(t *testing.T) {
	if k, src := anthropickey.Lookup(env{}.get); k != "" || src != "" {
		t.Errorf("Lookup = %q from %q, want none", k, src)
	}
}

func TestTheSkipReasonNamesTheVariablesAndNeverAValue(t *testing.T) {
	r := anthropickey.SkipReason()
	if !strings.Contains(r, "FEEDER_ANTHROPIC_KEY") || !strings.Contains(r, "ANTHROPIC_KEY") || strings.Contains(r, secret) {
		t.Errorf("SkipReason = %q", r)
	}
}
