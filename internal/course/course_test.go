package course_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/course"
	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// The Course rules as pure tests (crs-plan §2.3, team A; spec §3.1).

func TestNameKeyTrimsCollapsesAndLowerCasesButKeepsAccents(t *testing.T) {
	tests := []struct{ in, want string }{
		{"Side", "side"},
		{"  Side  ", "side"},
		{"side", "side"},
		{"Main   Course", "main course"},
		{"Main\tCourse\n", "main course"},
		{"Entrée", "entrée"},
		{"SOUP", "soup"},
		{"", ""},
		{"   ", ""},
	}
	for _, tc := range tests {
		if got := course.NameKey(tc.in); got != tc.want {
			t.Errorf("NameKey(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestNameKeyClashes(t *testing.T) {
	if course.NameKey("Side ") != course.NameKey("side") {
		t.Error(`"Side " and "side" must clash`)
	}
	if course.NameKey("Entrée") == course.NameKey("Entree") {
		t.Error(`"Entrée" and "Entree" must not clash (accents count)`)
	}
	if course.NameKey("Hot  dish") != course.NameKey("hot dish") {
		t.Error("inner whitespace is collapsed")
	}
}

// The seeded literals of migration 1400 are what NameKey gives; and it is the same rule as recipe.TagKey.
func TestNameKeyIsTheRuleOfRecipeTagKey(t *testing.T) {
	for _, s := range []string{"Main", "Side", "Starter", "Dessert", " Mixed   CASE ", "Entrée", "Ünï  cødé"} {
		if got, want := course.NameKey(s), recipe.TagKey(s); got != want {
			t.Errorf("NameKey(%q) = %q, recipe.TagKey = %q", s, got, want)
		}
	}
	for name, key := range map[string]string{"Main": "main", "Side": "side", "Starter": "starter", "Dessert": "dessert"} {
		if got := course.NameKey(name); got != key {
			t.Errorf("NameKey(%q) = %q, the migration seeds %q", name, got, key)
		}
	}
}

func TestCleanName(t *testing.T) {
	if got, err := course.CleanName("  Hot   dish "); err != nil || got != "Hot dish" {
		t.Errorf("CleanName = %q, %v; want %q (trimmed, collapsed, case kept)", got, err, "Hot dish")
	}
	if got, err := course.CleanName(strings.Repeat("é", 40)); err != nil || len([]rune(got)) != 40 {
		t.Errorf("40 characters (not bytes) are fine: %q, %v", got, err)
	}
	for _, bad := range []string{"", "   ", "\t\n", strings.Repeat("a", 41), strings.Repeat("é", 41)} {
		if _, err := course.CleanName(bad); !errors.Is(err, course.ErrNameInvalid) {
			t.Errorf("CleanName(%q) err = %v, want ErrNameInvalid", bad, err)
		}
	}
}

func TestCheckOrderMustBeAPermutation(t *testing.T) {
	listed := []int64{1, 2, 3, 4}
	for name, ids := range map[string][]int64{
		"same":     {1, 2, 3, 4},
		"reversed": {4, 3, 2, 1},
		"shuffled": {2, 4, 1, 3},
	} {
		if err := course.CheckOrder(listed, ids); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	for name, ids := range map[string][]int64{
		"missing one": {1, 2, 3},
		"extra":       {1, 2, 3, 4, 5},
		"repeated":    {1, 2, 2, 3},
		"unknown":     {1, 2, 3, 9},
		"empty":       {},
		"nil":         nil,
	} {
		if err := course.CheckOrder(listed, ids); !errors.Is(err, course.ErrOrder) {
			t.Errorf("%s: err = %v, want ErrOrder", name, err)
		}
	}
}

func list() []course.Course {
	return []course.Course{
		{ID: 1, Name: "Main", Position: 0, Main: true},
		{ID: 2, Name: "Side", Position: 1},
		{ID: 3, Name: "Starter", Position: 2},
		{ID: 4, Name: "Dessert", Position: 3, Archived: true},
	}
}

func TestMoveMainMovesExactlyOneFlag(t *testing.T) {
	in := list()
	out, err := course.MoveMain(in, 3)
	if err != nil {
		t.Fatal(err)
	}
	mains := 0
	for i, c := range out {
		if c.Main {
			mains++
		}
		if c.Main != (c.ID == 3) {
			t.Errorf("Course %d Main = %v after MoveMain(3)", c.ID, c.Main)
		}
		want := in[i]
		want.Main = c.ID == 3
		if c != want {
			t.Errorf("Course %d changed more than its flag: %+v vs %+v", c.ID, c, want)
		}
	}
	if mains != 1 {
		t.Errorf("%d main Courses, want exactly one", mains)
	}
	if !in[0].Main || in[2].Main {
		t.Error("MoveMain modified its input")
	}
	// Making the main Course main again changes nothing.
	same, err := course.MoveMain(in, 1)
	if err != nil || !reflect.DeepEqual(same, in) {
		t.Errorf("MoveMain(main) = %+v, %v; want the list unchanged", same, err)
	}
}

func TestMoveMainRefusesUnknownAndArchivedCourses(t *testing.T) {
	if _, err := course.MoveMain(list(), 99); !errors.Is(err, course.ErrNotFound) {
		t.Errorf("unknown: %v, want ErrNotFound", err)
	}
	if _, err := course.MoveMain(list(), 4); !errors.Is(err, course.ErrArchived) {
		t.Errorf("archived: %v, want ErrArchived", err)
	}
}

func TestMainAndLastCourseCannotGo(t *testing.T) {
	l := list()
	active := l[:3]
	if err := course.CanRemove(l[0], active); !errors.Is(err, course.ErrMain) {
		t.Errorf("main: %v, want ErrMain", err)
	}
	if err := course.CanRemove(l[1], active); err != nil {
		t.Errorf("Side: %v, want nil", err)
	}
	// ErrMain is checked first, even when it is also the last one.
	if err := course.CanRemove(l[0], l[:1]); !errors.Is(err, course.ErrMain) {
		t.Errorf("main and last: %v, want ErrMain", err)
	}
	// A non-main Course that is the only active one cannot go either.
	if err := course.CanRemove(l[1], l[1:2]); !errors.Is(err, course.ErrLast) {
		t.Errorf("last: %v, want ErrLast", err)
	}
}

func TestPlannedDecidesDeleteOrArchive(t *testing.T) {
	if got := course.RemovalFor(false); got != course.RemoveDelete {
		t.Errorf("never planned: %q, want delete", got)
	}
	if got := course.RemovalFor(true); got != course.RemoveArchive {
		t.Errorf("planned: %q, want archive", got)
	}
}

func TestCheckReplacement(t *testing.T) {
	active := []int64{1, 2, 3}
	tests := []struct {
		name        string
		removed, rp int64
		needed      bool
		ok          bool
	}{
		{"a valid replacement", 2, 1, true, true},
		{"needed and missing", 2, 0, true, false},
		{"not needed and none given", 2, 0, false, true},
		{"not needed but given and valid", 2, 3, false, true},
		{"the Course itself", 2, 2, true, false},
		{"the Course itself, not needed", 2, 2, false, false},
		{"archived or unknown", 2, 9, true, false},
		{"archived or unknown, not needed", 2, 9, false, false},
	}
	for _, tc := range tests {
		err := course.CheckReplacement(tc.removed, tc.rp, active, tc.needed)
		if tc.ok && err != nil {
			t.Errorf("%s: %v", tc.name, err)
		}
		if !tc.ok && !errors.Is(err, course.ErrReplacement) {
			t.Errorf("%s: err = %v, want ErrReplacement", tc.name, err)
		}
	}
}

// The replacement goes only to Recipes and Meal Slots left without a Course.
func TestReassignGivesTheReplacementOnlyToOwnersLeftWithNoCourse(t *testing.T) {
	owners := map[int64][]int64{
		10: {2},       // only Side: gets the replacement
		11: {1, 2},    // Main and Side: just loses Side
		12: {2, 3, 1}, // order of what is left is kept
		13: {1},       // does not have Side: untouched, absent
		14: {2, 1},    // already has the replacement: just loses Side
	}
	got := course.Reassign(owners, 2, 1)
	want := map[int64][]int64{10: {1}, 11: {1}, 12: {3, 1}, 14: {1}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Reassign = %v, want %v", got, want)
	}
	if !reflect.DeepEqual(owners[10], []int64{2}) || len(owners) != 5 {
		t.Error("Reassign modified its input")
	}
	if got := course.Reassign(nil, 2, 1); len(got) != 0 {
		t.Errorf("no owners: %v", got)
	}
	// Without a replacement nothing is added: an owner left with none would be an error the store prevents first.
	if got := course.Reassign(map[int64][]int64{1: {2, 3}}, 2, 0); !reflect.DeepEqual(got, map[int64][]int64{1: {3}}) {
		t.Errorf("no replacement: %v", got)
	}
}
