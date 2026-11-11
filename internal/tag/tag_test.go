package tag_test

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/course"
	"github.com/fabbarix/feeder-ng/internal/tag"
)

// The pure rules of Tags (ADR 0010, tg-plan §3.1 and §4.3; team TG-A).

func TestNameKey(t *testing.T) {
	for in, want := range map[string]string{
		"  Fish   Pie ": "fish pie",
		"FISH":          "fish",
		"fish":          "fish",
		"Purée":         "purée",
		"Puree":         "puree",
		"":              "",
		" \t ":          "",
	} {
		if got := tag.NameKey(in); got != want {
			t.Errorf("NameKey(%q) = %q, want %q", in, got, want)
		}
	}
	if tag.NameKey("Purée") == tag.NameKey("Puree") {
		t.Error("accents must not fold")
	}
}

func TestNameKeyIsTheCourseNameKeyRule(t *testing.T) {
	for _, in := range []string{"  Fish   Pie ", "Café", "A  B\tC", "x", ""} {
		if tag.NameKey(in) != course.NameKey(in) {
			t.Errorf("NameKey(%q) = %q, course.NameKey = %q", in, tag.NameKey(in), course.NameKey(in))
		}
	}
}

func TestCleanName(t *testing.T) {
	if got, err := tag.CleanName("  Fish   Pie "); err != nil || got != "Fish Pie" {
		t.Errorf("CleanName = %q, %v; want Fish Pie (case kept, spaces collapsed)", got, err)
	}
	for _, bad := range []string{"", "   ", strings.Repeat("a", 41), strings.Repeat("é", 41)} {
		if _, err := tag.CleanName(bad); !errors.Is(err, tag.ErrNameInvalid) {
			t.Errorf("CleanName(%d runes) err = %v, want ErrNameInvalid", len([]rune(bad)), err)
		}
	}
	for _, ok := range []string{"a", strings.Repeat("a", 40), strings.Repeat("é", 40)} {
		if _, err := tag.CleanName(ok); err != nil {
			t.Errorf("CleanName(%d runes) = %v, want ok", len([]rune(ok)), err)
		}
	}
}

func TestPaletteAndValidColour(t *testing.T) {
	want := []string{"tomato", "apricot", "mustard", "olive", "sage", "teal", "sky", "blue", "plum", "rose"}
	if !reflect.DeepEqual(tag.Palette, want) {
		t.Fatalf("Palette = %v", tag.Palette)
	}
	for _, id := range want {
		if !tag.ValidColour(id) {
			t.Errorf("ValidColour(%q) = false", id)
		}
	}
	for _, id := range []string{"", "Tomato", "#ff0000", "red", " sage"} {
		if tag.ValidColour(id) {
			t.Errorf("ValidColour(%q) = true", id)
		}
	}
}

func all(n int) map[string]int {
	m := map[string]int{}
	for _, id := range tag.Palette {
		m[id] = n
	}
	return m
}

func TestNextColour(t *testing.T) {
	with := func(m map[string]int, k string, v int) map[string]int { m[k] = v; return m }
	for _, c := range []struct {
		name   string
		counts map[string]int
		want   string
	}{
		{"nil map", nil, "tomato"},
		{"empty", map[string]int{}, "tomato"},
		{"tomato used once", map[string]int{"tomato": 1}, "apricot"},
		{"first three used", map[string]int{"tomato": 1, "apricot": 1, "mustard": 1}, "olive"},
		{"all ten at 1", all(1), "tomato"},
		{"all at 2, rose at 1", with(all(2), "rose", 1), "rose"},
		{"all at 2, olive and rose at 1: palette order", with(with(all(2), "rose", 1), "olive", 1), "olive"},
		{"least used beats order", with(all(3), "plum", 2), "plum"},
		{"a zero entry counts as unused", with(all(1), "teal", 0), "teal"},
		{"an unknown id is ignored", map[string]int{"fuchsia": 5}, "tomato"},
		{"an unknown id does not hide the palette", with(all(1), "fuchsia", 0), "tomato"},
	} {
		if got := tag.NextColour(c.counts); got != c.want {
			t.Errorf("%s: NextColour = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestNextColourFirstTenAreDistinctThenRepeat(t *testing.T) {
	counts := map[string]int{}
	seen := map[string]bool{}
	for i := 0; i < 10; i++ {
		c := tag.NextColour(counts)
		if seen[c] {
			t.Fatalf("tag %d got %q again before all ten were used", i+1, c)
		}
		seen[c] = true
		counts[c]++
	}
	if c := tag.NextColour(counts); c != "tomato" {
		t.Errorf("11th = %q, want tomato (colours repeat after 10)", c)
	}
	counts["tomato"]++
	if c := tag.NextColour(counts); c != "apricot" {
		t.Errorf("12th = %q, want apricot", c)
	}
}

var (
	fri = tag.Slot{MealSlotID: 1, CourseID: 10} // Friday Dinner, Main
	sat = tag.Slot{MealSlotID: 2, CourseID: 10} // Saturday Dinner, Main
	frS = tag.Slot{MealSlotID: 1, CourseID: 11} // Friday Dinner, Side
)

func TestMerge(t *testing.T) {
	for _, c := range []struct {
		name      string
		src, into tag.RuleSet
		want      tag.MergeOutcome
	}{
		{"no rules at all", tag.RuleSet{}, tag.RuleSet{}, tag.MergeOutcome{}},
		{"source rules move onto a target with none",
			tag.RuleSet{Slots: []tag.Slot{fri, sat}}, tag.RuleSet{},
			tag.MergeOutcome{MoveSlots: []tag.Slot{fri, sat}}},
		{"a duplicate on the same Meal Slot and Course goes",
			tag.RuleSet{Slots: []tag.Slot{fri, sat}}, tag.RuleSet{Slots: []tag.Slot{fri}},
			tag.MergeOutcome{MoveSlots: []tag.Slot{sat}, DropSlots: []tag.Slot{fri}}},
		{"same Meal Slot but another Course moves",
			tag.RuleSet{Slots: []tag.Slot{frS}}, tag.RuleSet{Slots: []tag.Slot{fri}},
			tag.MergeOutcome{MoveSlots: []tag.Slot{frS}}},
		{"every source rule a duplicate",
			tag.RuleSet{Slots: []tag.Slot{fri}}, tag.RuleSet{Slots: []tag.Slot{fri, sat}},
			tag.MergeOutcome{DropSlots: []tag.Slot{fri}}},
		{"the target has a Variety Rule: the source's goes",
			tag.RuleSet{Variety: true}, tag.RuleSet{Variety: true},
			tag.MergeOutcome{DropVariety: true}},
		{"the target has none: the source's moves",
			tag.RuleSet{Variety: true}, tag.RuleSet{},
			tag.MergeOutcome{MoveVariety: true}},
		{"only the target has one: nothing happens",
			tag.RuleSet{}, tag.RuleSet{Variety: true}, tag.MergeOutcome{}},
		{"slots and variety together",
			tag.RuleSet{Slots: []tag.Slot{fri, sat}, Variety: true}, tag.RuleSet{Slots: []tag.Slot{sat}, Variety: true},
			tag.MergeOutcome{MoveSlots: []tag.Slot{fri}, DropSlots: []tag.Slot{sat}, DropVariety: true}},
	} {
		got := tag.Merge(c.src, c.into)
		if !reflect.DeepEqual(norm(got), norm(c.want)) {
			t.Errorf("%s:\n got %+v\nwant %+v", c.name, got, c.want)
		}
	}
}

// norm treats nil and empty slices alike.
func norm(o tag.MergeOutcome) tag.MergeOutcome {
	if len(o.MoveSlots) == 0 {
		o.MoveSlots = nil
	}
	if len(o.DropSlots) == 0 {
		o.DropSlots = nil
	}
	return o
}

func TestMergeKeepsASourceSlotRepeatedOnceAndDoesNotModifyInputs(t *testing.T) {
	src := tag.RuleSet{Slots: []tag.Slot{fri, fri, sat}}
	into := tag.RuleSet{Slots: []tag.Slot{sat}}
	got := tag.Merge(src, into)
	if !reflect.DeepEqual(norm(got), norm(tag.MergeOutcome{MoveSlots: []tag.Slot{fri}, DropSlots: []tag.Slot{sat}})) {
		t.Errorf("outcome = %+v", got)
	}
	if !reflect.DeepEqual(src.Slots, []tag.Slot{fri, fri, sat}) || !reflect.DeepEqual(into.Slots, []tag.Slot{sat}) {
		t.Error("Merge modified its inputs")
	}
}

func TestNameTakenErrorNamesTheOtherTag(t *testing.T) {
	var err error = &tag.NameTakenError{Tag: tag.Tag{ID: 3, Key: "seafood", Name: "Seafood"}}
	var nt *tag.NameTakenError
	if !errors.As(err, &nt) || nt.Tag.Name != "Seafood" || !strings.Contains(err.Error(), "Seafood") {
		t.Errorf("err = %v", err)
	}
}
