// Package anthropickey is the one rule for the key of the opt-in live Anthropic tests (docs/dev/live-tests.md,
// docs/dev/design/b8-rxgo.md). No test reads the key variables itself. The key is never printed: the source and the
// skip reason carry variable names only.
package anthropickey

import (
	"os"
	"strings"
)

// names are the variables a key may come from, in order of precedence.
var names = []string{"FEEDER_ANTHROPIC_KEY", "FEEDER_LIVE_ANTHROPIC_KEY", "ANTHROPIC_KEY"}

// Lookup returns the first non-empty value, trimmed, of the names, and the name it came from. With none set, both are "".
func Lookup() (key, source string) {
	for _, n := range names {
		if v := strings.TrimSpace(os.Getenv(n)); v != "" {
			return v, n
		}
	}
	return "", ""
}

// SkipReason is the message a live test skips with when Lookup finds no key. It names the variables, never a value.
func SkipReason() string {
	return "set FEEDER_ANTHROPIC_KEY (or ANTHROPIC_KEY) to run this live test"
}
