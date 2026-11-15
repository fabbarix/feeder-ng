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
