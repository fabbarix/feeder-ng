package household_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The slot-time guard (beta5-reconcile §0.1, ADR 0014 point 5): the effective time of a Meal Slot on a date is the
// date's own time when set, else the usual time, and it is read through household.EffectiveTime (or the runner
// Sources port's SlotDate, which calls it). Nothing outside package household reads meal_slots.time directly, except the
// two uses that sort by the usual time on purpose. Team B5-SD, test-first.

// readsUsualTime matches SQL that reads the usual time column of meal_slots.
var readsUsualTime = []*regexp.Regexp{
	regexp.MustCompile(`\bms\.time\b`),
	regexp.MustCompile(`\bmeal_slots\.time\b`),
	regexp.MustCompile(`(?is)\bSELECT\b[^;"` + "`" + `]*\btime\b[^;"` + "`" + `]*\bFROM\s+meal_slots\b`),
}

// orderingOnly are the two files that read the usual time on purpose, to order slots in a weekly list.
var orderingOnly = map[string]bool{
	"internal/tag/store/store.go":       true, // ORDER BY ms.weekday, ms.time, ...
	"internal/household/store/batch.go": true, // the slot list SELECT
}

func repoInternal(t *testing.T) string {
	t.Helper()
	wd, err := os.Getwd() // internal/household
	if err != nil {
		t.Fatal(err)
	}
	return filepath.Dir(wd)
}

func goFiles(t *testing.T, root string) map[string]string {
	t.Helper()
	out := map[string]string{}
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(p, ".go") || strings.HasSuffix(p, "_test.go") {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(filepath.Dir(root), p)
		out[filepath.ToSlash(rel)] = string(b)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func TestNothingReadsTheUsualSlotTimeInSQLExceptTheOrderingUses(t *testing.T) {
	for path, src := range goFiles(t, repoInternal(t)) {
		if orderingOnly[path] || strings.HasPrefix(path, "internal/household/") || strings.HasPrefix(path, "internal/db/") {
			continue
		}
		for _, re := range readsUsualTime {
			if re.MatchString(src) {
				t.Errorf("%s reads the usual Meal Slot time in SQL (%s): read the effective time through household.EffectiveTime / the date's row", path, re)
				break
			}
		}
	}
}

func TestTheOrderingUsesAreStillThere(t *testing.T) {
	// The exemption must not rot: if one of the two disappears, drop it from orderingOnly.
	files := goFiles(t, repoInternal(t))
	if !strings.Contains(files["internal/tag/store/store.go"], "ms.time") {
		t.Error("internal/tag/store/store.go no longer orders by ms.time: drop the exemption")
	}
	if !regexp.MustCompile(`(?is)SELECT[^;"` + "`" + `]*\btime\b[^;"` + "`" + `]*FROM\s+meal_slots`).MatchString(files["internal/household/store/batch.go"]) {
		t.Error("internal/household/store/batch.go no longer selects the usual time: drop the exemption")
	}
}

// readers are the code paths that turn a Meal Slot and a date into an instant. Each must go through the effective time.
var readers = []string{
	"internal/plan/runner/snapshot.go",
	"internal/plan/runner/actions.go",
	"internal/notify/facts/facts.go",
	"internal/cook/service/adapters.go",
	"internal/shopping/httpapi/wiring.go",
}

func TestEveryInstantReaderGoesThroughTheEffectiveTime(t *testing.T) {
	files := goFiles(t, repoInternal(t))
	for _, path := range readers {
		src, ok := files[path]
		if !ok {
			t.Errorf("%s is gone: update the readers list of the guard", path)
			continue
		}
		if !strings.Contains(src, "EffectiveTime") && !strings.Contains(src, "SlotDate(") {
			t.Errorf("%s turns a Meal Slot and a date into an instant without household.EffectiveTime or SlotDate()", path)
		}
	}
}
