package bdd

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The changed mode of scripts/check.sh runs the features of the areas a change can affect (scripts/lib/check-areas.mjs) by tag.
// So every feature carries exactly one @area-<name> tag on its Feature line, and <name> is a features/ folder (an area); a
// feature in a folder that is an area carries that folder's tag (bdd/features/beta5 holds features of several areas).
func TestEveryFeatureHasOneAreaTag(t *testing.T) {
	areaTag := regexp.MustCompile(`@area-([a-z0-9-]+)`)
	dirs, err := os.ReadDir("features")
	if err != nil {
		t.Fatal(err)
	}
	areas := map[string]bool{}
	for _, d := range dirs {
		if d.IsDir() && d.Name() != "beta5" {
			areas[d.Name()] = true
		}
	}
	files, _ := filepath.Glob("features/*/*.feature")
	if len(files) == 0 {
		t.Fatal("no feature files")
	}
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		head := strings.SplitN(string(b), "Feature:", 2)[0]
		tags := areaTag.FindAllStringSubmatch(head, -1)
		if len(tags) != 1 {
			t.Errorf("%s: %d @area- tags before Feature:, want exactly one", f, len(tags))
			continue
		}
		area := tags[0][1]
		if !areas[area] {
			t.Errorf("%s: @area-%s is not a features/ folder", f, area)
		}
		if folder := filepath.Base(filepath.Dir(f)); folder != "beta5" && folder != area {
			t.Errorf("%s: tagged @area-%s, but it lives in features/%s", f, area, folder)
		}
		if strings.Count(string(b), "@area-") != 1 {
			t.Errorf("%s: an @area- tag below the Feature line (scenario tags are not areas)", f)
		}
	}
}

// serialSteps are the steps that change process-wide state (authhttp.SetProvider, slog.SetDefault): a feature that uses one runs in
// the serial pass of TestFeatures, so it carries @serial.
var serialSteps = []string{
	"a running Feeder with Google sign-in",
	"a Feeder that asks new Google visitors for approval",
	"Feeder runs with the Recipe Assistant on through a fake provider",
}

func TestFeaturesThatChangeProcessStateAreSerial(t *testing.T) {
	files, _ := filepath.Glob("features/*/*.feature")
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		text := string(b)
		head := strings.SplitN(text, "Feature:", 2)[0]
		uses := false
		for _, s := range serialSteps {
			uses = uses || strings.Contains(text, s)
		}
		if uses && !strings.Contains(head, "@serial") {
			t.Errorf("%s uses a step that changes process-wide state: tag the feature @serial", f)
		}
	}
	if got := andTag("~@wip,@a && @b", "~@serial"); got != "~@wip && ~@serial,@a && @b && ~@serial" {
		t.Errorf("andTag = %q", got)
	}
}
