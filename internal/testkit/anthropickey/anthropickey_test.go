package anthropickey_test

// b8-rxgo (docs/dev/design/b8-rxgo.md, docs/dev/live-tests.md): the one rule for the key of the opt-in live tests.
//
//	func Lookup() (key, source string)
//
// key is the first non-empty (after trimming spaces and a line break) of FEEDER_ANTHROPIC_KEY, FEEDER_LIVE_ANTHROPIC_KEY
// (the old name of the recipe import's live test, kept as an alias) and ANTHROPIC_KEY (the name `.env.local` uses);
// source is the NAME of the variable it came from, never a value. With none set both are "".
//
//	func SkipReason() string   // "set FEEDER_ANTHROPIC_KEY (or ANTHROPIC_KEY) to run this live test": names only

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/anthropickey"
)

const secret = "sk-test-not-a-real-key-0001"

func clear(t *testing.T) {
	t.Helper()
	for _, n := range []string{"FEEDER_ANTHROPIC_KEY", "FEEDER_LIVE_ANTHROPIC_KEY", "ANTHROPIC_KEY"} {
		t.Setenv(n, "")
	}
}

func TestFeederAnthropicKeyIsRead(t *testing.T) {
	clear(t)
	t.Setenv("FEEDER_ANTHROPIC_KEY", secret)
	if k, src := anthropickey.Lookup(); k != secret || src != "FEEDER_ANTHROPIC_KEY" {
		t.Errorf("Lookup = %q from %q", k, src)
	}
}

func TestAnthropicKeyOfTheEnvLocalFileIsTheFallback(t *testing.T) {
	clear(t)
	t.Setenv("ANTHROPIC_KEY", secret)
	if k, src := anthropickey.Lookup(); k != secret || src != "ANTHROPIC_KEY" {
		t.Errorf("Lookup = %q from %q", k, src)
	}
}

func TestTheOldLiveNameStillWorks(t *testing.T) {
	clear(t)
	t.Setenv("FEEDER_LIVE_ANTHROPIC_KEY", secret)
	if k, src := anthropickey.Lookup(); k != secret || src != "FEEDER_LIVE_ANTHROPIC_KEY" {
		t.Errorf("Lookup = %q from %q", k, src)
	}
}

func TestTheFeederNameWinsOverTheOthers(t *testing.T) {
	clear(t)
	t.Setenv("ANTHROPIC_KEY", "other-1")
	t.Setenv("FEEDER_LIVE_ANTHROPIC_KEY", "other-2")
	t.Setenv("FEEDER_ANTHROPIC_KEY", secret)
	if k, src := anthropickey.Lookup(); k != secret || src != "FEEDER_ANTHROPIC_KEY" {
		t.Errorf("Lookup = %q from %q", k, src)
	}
}

func TestAnEmptyOrBlankNameFallsThrough(t *testing.T) {
	clear(t)
	t.Setenv("FEEDER_ANTHROPIC_KEY", "  \n")
	t.Setenv("ANTHROPIC_KEY", " "+secret+"\n")
	if k, src := anthropickey.Lookup(); k != secret || src != "ANTHROPIC_KEY" {
		t.Errorf("Lookup = %q from %q, want the trimmed fallback", k, src)
	}
}

func TestNoNameSetMeansNoKey(t *testing.T) {
	clear(t)
	if k, src := anthropickey.Lookup(); k != "" || src != "" {
		t.Errorf("Lookup = %q from %q, want none", k, src)
	}
}

func TestTheSkipReasonNamesTheVariablesAndNeverAValue(t *testing.T) {
	clear(t)
	t.Setenv("FEEDER_LIVE_SCHEMA_CHECK", "1")
	t.Setenv("ANTHROPIC_KEY", secret)
	r := anthropickey.SkipReason()
	if !strings.Contains(r, "FEEDER_ANTHROPIC_KEY") || !strings.Contains(r, "ANTHROPIC_KEY") || strings.Contains(r, secret) {
		t.Errorf("SkipReason = %q", r)
	}
}
