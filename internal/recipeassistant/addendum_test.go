package recipeassistant_test

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// ExtractAddendum cuts the addendum out of recipe-file.md like
// recipefile.ExtractTemplate does (design §4.4).

const goodSection = "## Recipe Assistant\n\nIntro line.\n\n````text\nLine one.\nLine two with <source> and ```` inside? no.\n````\n\nAfter.\n"

func TestExtractAddendumTakesTheFencedBlockWithoutFencesOrTrailingNewline(t *testing.T) {
	md := "# Title\n\n## Agent Prompt\n\n```text\nTEMPLATE\n```\n\n" + goodSection
	got, err := ra.ExtractAddendum(md)
	if err != nil {
		t.Fatal(err)
	}
	if want := "Line one.\nLine two with <source> and ```` inside? no."; got != want {
		t.Fatalf("got %q, want %q", got, want)
	}
	if strings.HasSuffix(got, "\n") || strings.Contains(got, "````text") {
		t.Fatalf("fences or trailing newline leaked: %q", got)
	}
}

func TestExtractAddendumToleratesCRLFAndTrailingSpaces(t *testing.T) {
	md := strings.ReplaceAll("## Recipe Assistant  \n\n````text  \nA\nB\n````  \n", "\n", "\r\n")
	got, err := ra.ExtractAddendum(md)
	if err != nil || strings.ReplaceAll(got, "\r", "") != "A\nB" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestExtractAddendumFailsWhenTheSectionIsMissing(t *testing.T) {
	for name, md := range map[string]string{
		"empty file":      "",
		"no heading":      "# Title\n\n````text\nA\n````\n",
		"other heading":   "# Title\n\n## Something else\n\n````text\nA\n````\n",
		"similar heading": "## Recipe Assistants\n\n````text\nA\n````\n",
		"deeper heading":  "### Recipe Assistant\n\n````text\nA\n````\n",
		"heading in text": "Some text ## Recipe Assistant\n\n````text\nA\n````\n",
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ra.ExtractAddendum(md); !errors.Is(err, ra.ErrNoAddendum) {
				t.Fatalf("got %v, want ErrNoAddendum", err)
			}
		})
	}
}

func TestExtractAddendumFailsOnAnUnclosedFence(t *testing.T) {
	for name, md := range map[string]string{
		"never closed":      "## Recipe Assistant\n\n````text\nA\nB\n",
		"closed by shorter": "## Recipe Assistant\n\n````text\nA\n```\n",
		"no newline at end": "## Recipe Assistant\n\n````text\nA",
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ra.ExtractAddendum(md); !errors.Is(err, ra.ErrNoAddendum) {
				t.Fatalf("got %v, want ErrNoAddendum", err)
			}
		})
	}
}

func TestExtractAddendumIgnoresFencesUnderOtherHeadings(t *testing.T) {
	// The fence is under another "## " heading; the Recipe Assistant section has none.
	md := "## Recipe Assistant\n\nNo block here.\n\n## Next section\n\n````text\nNOT THE ADDENDUM\n````\n"
	if got, err := ra.ExtractAddendum(md); !errors.Is(err, ra.ErrNoAddendum) {
		t.Fatalf("got %q, %v; a fence under another heading must not count", got, err)
	}
	// A block before the heading does not count either.
	md = "## Agent Prompt\n\n````text\nNOT THE ADDENDUM\n````\n\n## Recipe Assistant\n\nNothing.\n"
	if got, err := ra.ExtractAddendum(md); !errors.Is(err, ra.ErrNoAddendum) {
		t.Fatalf("got %q, %v", got, err)
	}
	// With both, the one under the right heading wins.
	md = "## Agent Prompt\n\n````text\nNOT\n````\n\n## Recipe Assistant\n\n````text\nTHE ONE\n````\n\n## Later\n\n````text\nNOR THIS\n````\n"
	if got, err := ra.ExtractAddendum(md); err != nil || got != "THE ONE" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestExtractAddendumEmptyBlockIsAnError(t *testing.T) {
	for name, md := range map[string]string{
		"nothing between fences": "## Recipe Assistant\n\n````text\n````\n",
		"blank lines only":       "## Recipe Assistant\n\n````text\n\n   \n\t\n````\n",
	} {
		t.Run(name, func(t *testing.T) {
			if got, err := ra.ExtractAddendum(md); !errors.Is(err, ra.ErrNoAddendum) {
				t.Fatalf("got %q, %v; an empty addendum must be ErrNoAddendum", got, err)
			}
		})
	}
}

func TestAddendumIsExtractedFromTheRealSpec(t *testing.T) {
	got, err := ra.ExtractAddendum(spec.RecipeFileMD)
	if err != nil {
		t.Fatal(err)
	}
	if got != ra.Addendum || strings.TrimSpace(got) == "" {
		t.Fatalf("Addendum differs from the block in recipe-file.md:\n%q\n%q", got, ra.Addendum)
	}
	if !strings.HasPrefix(got, "You are the Recipe Assistant inside Feeder.") {
		t.Fatalf("unexpected start: %.80q", got)
	}
}

// The new section must not change what the Agent Prompt extraction returns:
// golden taken from main's recipe-file.md (before the section existed).
func TestExtractTemplateOutputIsByteIdenticalToBeforeTheAddendumSection(t *testing.T) {
	want, err := os.ReadFile("testdata/agent-prompt-template.golden.txt")
	if err != nil {
		t.Fatal(err)
	}
	got, err := recipefile.ExtractTemplate(spec.RecipeFileMD)
	if err != nil {
		t.Fatal(err)
	}
	if got != string(want) {
		sum := sha256.Sum256([]byte(got))
		t.Fatalf("ExtractTemplate output changed (%d bytes, sha256 %s; golden %d bytes)", len(got), hex.EncodeToString(sum[:]), len(want))
	}
	if strings.Contains(got, "Recipe Assistant inside Feeder") {
		t.Fatal("the addendum leaked into the Agent Prompt template")
	}
}
