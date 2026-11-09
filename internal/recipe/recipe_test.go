package recipe

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Ingredient ids used by the tests.
const (
	flour  = 1 // g, 1 cup = 120 g
	garlic = 2 // g, 1 clove = 5 g
	milk   = 3 // ml
	egg    = 4 // piece
)

func lookup(id int64) (units.Ingredient, bool) {
	switch id {
	case flour:
		return units.Ingredient{Name: "flour", Base: units.Gram, Conversions: []units.Conversion{{Unit: "cup", ToBase: 120}}}, true
	case garlic:
		return units.Ingredient{Name: "garlic", Base: units.Gram, Conversions: []units.Conversion{{Unit: "clove", ToBase: 5}}}, true
	case milk:
		return units.Ingredient{Name: "milk", Base: units.Millilitre}, true
	case egg:
		return units.Ingredient{Name: "egg", Base: units.Piece}, true
	}
	return units.Ingredient{}, false
}

func valid() Input {
	return Input{
		Name:  "Pancakes",
		Yield: 4,
		Tags:  []string{"Breakfast"},
		Lines: []Line{
			{IngredientID: flour, Quantity: 250, Unit: "g"},
			{IngredientID: milk, Quantity: 3, Unit: "dl"},
			{IngredientID: egg, Quantity: 2, Unit: "piece"},
		},
		Steps: []Step{{Text: "Whisk", Kind: schedule.Active, DurationMinutes: 5}},
	}
}

func intp(n int) *int { return &n }

func TestValidateAcceptsAndCleans(t *testing.T) {
	in := valid()
	in.Name = "  Sunday   Pancakes "
	in.Tags = []string{" Breakfast ", "sweet  treat", "BREAKFAST"}
	in.Lines[0].Unit = " G "
	in.Lines[1].Unit = "DL"
	in.Source = Source{URL: "  https://example.test/p  ", Attribution: "Gran"}
	got, err := in.Validate(lookup)
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if got.Name != "Sunday Pancakes" {
		t.Errorf("Name = %q", got.Name)
	}
	if want := []string{"Breakfast", "sweet treat"}; !reflect.DeepEqual(got.Tags, want) {
		t.Errorf("Tags = %q, want %q (trimmed, collapsed, de-duplicated by key, first spelling wins)", got.Tags, want)
	}
	if got.Lines[0].Unit != "g" || got.Lines[1].Unit != "dl" {
		t.Errorf("units not normalised: %q %q", got.Lines[0].Unit, got.Lines[1].Unit)
	}
	if got.Source.URL != "https://example.test/p" {
		t.Errorf("Source.URL = %q", got.Source.URL)
	}
}

func TestValidateFieldErrors(t *testing.T) {
	tests := []struct {
		name      string
		mutate    func(*Input)
		wantField string
		wantCode  string
	}{
		{"blank name", func(i *Input) { i.Name = "  " }, "name", CodeNameRequired},
		{"name too long", func(i *Input) { i.Name = strings.Repeat("x", MaxNameRunes+1) }, "name", CodeNameTooLong},
		{"name of 100 multibyte runes is fine", func(i *Input) { i.Name = strings.Repeat("é", MaxNameRunes) }, "", ""},
		{"description too long", func(i *Input) { i.Description = strings.Repeat("x", MaxDescriptionRunes+1) }, "description", CodeDescTooLong},
		{"zero yield", func(i *Input) { i.Yield = 0 }, "yield", CodeYieldInvalid},
		{"negative yield", func(i *Input) { i.Yield = -1 }, "yield", CodeYieldInvalid},
		{"yield above 100", func(i *Input) { i.Yield = 100.5 }, "yield", CodeYieldInvalid},
		{"fractional yield is fine", func(i *Input) { i.Yield = 2.5 }, "", ""},
		{"blank tag", func(i *Input) { i.Tags = []string{"ok", " "} }, "tags[1]", CodeTagInvalid},
		{"tag too long", func(i *Input) { i.Tags = []string{strings.Repeat("t", MaxTagRunes+1)} }, "tags[0]", CodeTagInvalid},
		{"too many tags", func(i *Input) {
			i.Tags = nil
			for n := 0; n <= MaxTags; n++ {
				i.Tags = append(i.Tags, strings.Repeat("a", n+1))
			}
		}, "tags", CodeTooManyTags},
		{"negative cool-down", func(i *Input) { i.CooldownDays = intp(-1) }, "cooldownDays", CodeCooldownInvalid},
		{"cool-down 0 is fine", func(i *Input) { i.CooldownDays = intp(0) }, "", ""},
		{"cool-down above 365", func(i *Input) { i.CooldownDays = intp(366) }, "cooldownDays", CodeCooldownInvalid},
		{"use-by 0 means same day", func(i *Input) { i.LeftoverUseByDays = intp(0) }, "", ""},
		{"negative use-by", func(i *Input) { i.LeftoverUseByDays = intp(-1) }, "leftoverUseByDays", CodeUseByInvalid},
		{"use-by above 30", func(i *Input) { i.LeftoverUseByDays = intp(31) }, "leftoverUseByDays", CodeUseByInvalid},
		{"source url must be http(s)", func(i *Input) { i.Source.URL = "javascript:alert(1)" }, "source.url", CodeSourceInvalid},
		{"source url not a url", func(i *Input) { i.Source.URL = "not a url" }, "source.url", CodeSourceInvalid},
		{"attribution too long", func(i *Input) { i.Source.Attribution = strings.Repeat("a", MaxAttributionRunes+1) }, "source.attribution", CodeSourceInvalid},
		{"no lines", func(i *Input) { i.Lines = nil }, "lines", CodeLinesRequired},
		{"unknown ingredient", func(i *Input) { i.Lines[1].IngredientID = 99 }, "lines[1].ingredientId", CodeUnknownIngr},
		{"zero quantity", func(i *Input) { i.Lines[0].Quantity = 0 }, "lines[0].quantity", CodeQuantityInvalid},
		{"negative quantity", func(i *Input) { i.Lines[0].Quantity = -5 }, "lines[0].quantity", CodeQuantityInvalid},
		{"missing unit", func(i *Input) { i.Lines[2].Unit = " " }, "lines[2].unit", CodeUnitRequired},
		{"note too long", func(i *Input) { i.Lines[0].Note = strings.Repeat("n", MaxNoteRunes+1) }, "lines[0].note", CodeNoteTooLong},
		{"step without text", func(i *Input) { i.Steps[0].Text = " " }, "steps[0].text", CodeStepTextMissing},
		{"step text too long", func(i *Input) { i.Steps[0].Text = strings.Repeat("x", MaxStepTextRunes+1) }, "steps[0].text", CodeStepTextLong},
		{"duration above a week", func(i *Input) { i.Steps[0].DurationMinutes = MaxMinutes + 1 }, "steps[0].durationMinutes", CodeMinutesInvalid},
		{"step uses unknown ingredient", func(i *Input) {
			i.Steps[0].Uses = []Use{{IngredientID: 99, Quantity: 1, Unit: "g"}}
		}, "steps[0].uses[0].ingredientId", CodeUnknownIngr},
		{"step uses zero quantity", func(i *Input) {
			i.Steps[0].Uses = []Use{{IngredientID: flour, Quantity: 0, Unit: "g"}}
		}, "steps[0].uses[0].quantity", CodeQuantityInvalid},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := valid()
			tc.mutate(&in)
			_, err := in.Validate(lookup)
			if tc.wantCode == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			var ve *ValidationError
			if !errors.As(err, &ve) {
				t.Fatalf("err = %v (%T), want *ValidationError", err, err)
			}
			if !errors.Is(err, ErrInvalid) {
				t.Error("errors.Is(err, ErrInvalid) = false")
			}
			if ve.Field != tc.wantField || ve.Code != tc.wantCode {
				t.Errorf("got field %q code %q, want field %q code %q (%s)", ve.Field, ve.Code, tc.wantField, tc.wantCode, ve.Message)
			}
			if ve.Message == "" {
				t.Error("empty message")
			}
		})
	}
}

func TestValidateReadyMeal(t *testing.T) {
	pack := Line{IngredientID: egg, Quantity: 1, Unit: "piece"}
	ok := Input{Name: "Lasagne pack", Yield: 2, ReadyMeal: true, Lines: []Line{pack}}
	if _, err := ok.Validate(lookup); err != nil {
		t.Fatalf("Ready Meal with one line and no Steps: %v", err)
	}
	two := ok
	two.Lines = []Line{pack, {IngredientID: milk, Quantity: 1, Unit: "dl"}}
	_, err := two.Validate(lookup)
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Code != CodeReadyMealLines || ve.Field != "lines" {
		t.Errorf("two lines: err = %v, want ready_meal_lines on lines", err)
	}
	none := ok
	none.Lines = nil
	_, err = none.Validate(lookup)
	if !errors.As(err, &ve) || ve.Code != CodeLinesRequired {
		t.Errorf("no lines: err = %v, want lines_required", err)
	}
	// Two lines are fine when it is not a Ready Meal.
	two.ReadyMeal = false
	if _, err := two.Validate(lookup); err != nil {
		t.Errorf("non-Ready Meal with two lines: %v", err)
	}
}

func TestValidateStepTiming(t *testing.T) {
	tests := []struct {
		name     string
		steps    []Step
		wantStep string
		wantCode string
	}{
		{"passive needs a duration", []Step{{Text: "a", Kind: schedule.Active}, {Text: "b", Kind: schedule.Passive}}, "steps[1]", schedule.CodePassiveNeedsDuration},
		{"advance needs a lead time", []Step{{Text: "a", Kind: schedule.Advance}}, "steps[0]", schedule.CodeAdvanceNeedsLead},
		{"after must be earlier", []Step{{Text: "a", Kind: schedule.Active, After: []int{0}}}, "steps[0]", schedule.CodeAfterNotEarlier},
		{"after may not point at an Advance Step", []Step{
			{Text: "a", Kind: schedule.Advance, LeadTimeMinutes: 60},
			{Text: "b", Kind: schedule.Active, After: []int{0}},
		}, "steps[1]", schedule.CodeAfterAdvance},
		{"unknown kind", []Step{{Text: "a", Kind: "sleep"}}, "steps[0]", schedule.CodeUnknownKind},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := valid()
			in.Steps = tc.steps
			_, err := in.Validate(lookup)
			var ve *ValidationError
			if !errors.As(err, &ve) {
				t.Fatalf("err = %v, want *ValidationError", err)
			}
			if ve.Field != tc.wantStep || ve.Code != tc.wantCode {
				t.Errorf("got %q/%q, want %q/%q", ve.Field, ve.Code, tc.wantStep, tc.wantCode)
			}
		})
	}
}

func TestValidateUnits(t *testing.T) {
	tests := []struct {
		name string
		ing  int64
		unit string
		ok   bool
	}{
		{"base unit", flour, "g", true},
		{"global kg for a g Ingredient", flour, "kg", true},
		{"Ingredient conversion cup", flour, "cup", true},
		{"conversion matches case-insensitively", garlic, "Clove", true},
		{"global tbsp for a ml Ingredient", milk, "tbsp", true},
		{"spoon measure for a g Ingredient needs a conversion", flour, "tbsp", false},
		{"kg for a piece Ingredient", egg, "kg", false},
		{"unlisted unit", garlic, "handful", false},
		{"oz is display only, not a recipe unit", flour, "oz", false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			in := valid()
			in.Lines = []Line{{IngredientID: egg, Quantity: 1, Unit: "piece"}, {IngredientID: tc.ing, Quantity: 2, Unit: tc.unit}}
			_, err := in.Validate(lookup)
			if tc.ok {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			var ue *UnknownUnitError
			if !errors.As(err, &ue) {
				t.Fatalf("err = %v (%T), want *UnknownUnitError", err, err)
			}
			if !errors.Is(err, ErrUnknownUnit) || errors.Is(err, ErrInvalid) {
				t.Error("must match ErrUnknownUnit only")
			}
			ing, _ := lookup(tc.ing)
			if ue.Field != "lines[1].unit" || ue.IngredientID != tc.ing || ue.Ingredient != ing.Name ||
				ue.Unit != units.NormalizeUnit(tc.unit) || ue.Base != ing.Base {
				t.Errorf("UnknownUnitError = %+v", ue)
			}
		})
	}
}

func TestValidateUnknownUnitInStepUses(t *testing.T) {
	in := valid()
	in.Steps[0].Uses = []Use{{IngredientID: flour, Quantity: 1, Unit: "g"}, {IngredientID: garlic, Quantity: 2, Unit: "head"}}
	_, err := in.Validate(lookup)
	var ue *UnknownUnitError
	if !errors.As(err, &ue) || ue.Field != "steps[0].uses[1].unit" || ue.Unit != "head" {
		t.Errorf("err = %v, want UnknownUnitError at steps[0].uses[1].unit", err)
	}
}

func TestFieldErrorBeatsUnknownUnit(t *testing.T) {
	in := valid()
	in.Lines[0].Unit = "handful" // unknown unit on line 0 ...
	in.Lines[2].Quantity = 0     // ... but a field error on line 2 is reported first
	_, err := in.Validate(lookup)
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Field != "lines[2].quantity" {
		t.Errorf("err = %v, want the field error first", err)
	}
}

func TestFirstUnknownUnitIsReportedInLineOrder(t *testing.T) {
	in := valid()
	in.Lines = []Line{
		{IngredientID: flour, Quantity: 1, Unit: "scoop"},
		{IngredientID: garlic, Quantity: 1, Unit: "head"},
	}
	_, err := in.Validate(lookup)
	var ue *UnknownUnitError
	if !errors.As(err, &ue) || ue.Field != "lines[0].unit" {
		t.Errorf("err = %v, want lines[0].unit", err)
	}
}

func TestTagKey(t *testing.T) {
	for in, want := range map[string]string{
		"Fish":            "fish",
		"  Pasta   Bake ": "pasta bake",
		"ÉCLAIR":          "éclair",
		"":                "",
	} {
		if got := TagKey(in); got != want {
			t.Errorf("TagKey(%q) = %q, want %q", in, got, want)
		}
	}
}

// The worked example of docs/spec/recipe-file.md: total 40 minutes (critical
// path, not the 55 minute sum) and a separate 4 h Advance Step.
func TestTimingOfSpecExample(t *testing.T) {
	steps := []Step{
		{Text: "marinate", Kind: schedule.Advance, LeadTimeMinutes: 240},
		{Text: "oven", Kind: schedule.Active, DurationMinutes: 2},
		{Text: "veg", Kind: schedule.Active, DurationMinutes: 8},
		{Text: "tray", Kind: schedule.Passive, DurationMinutes: 25, After: []int{1, 2}},
		{Text: "rice", Kind: schedule.Passive, DurationMinutes: 15},
		{Text: "serve", Kind: schedule.Active, DurationMinutes: 5, After: []int{3, 4}},
	}
	got, err := TimingOf(steps)
	if err != nil {
		t.Fatal(err)
	}
	if got.TotalMinutes != 40 {
		t.Errorf("TotalMinutes = %d, want 40", got.TotalMinutes)
	}
	if want := []AdvanceItem{{Step: 0, LeadTimeMinutes: 240}}; !reflect.DeepEqual(got.Advance, want) {
		t.Errorf("Advance = %+v, want %+v", got.Advance, want)
	}
	if got.AdvanceMinutes != 240 {
		t.Errorf("AdvanceMinutes = %d, want 240", got.AdvanceMinutes)
	}
	if len(got.Timeline) != 5 {
		t.Errorf("Timeline has %d entries, want 5", len(got.Timeline))
	}
}

func TestTimingOfEdgeCases(t *testing.T) {
	got, err := TimingOf(nil)
	if err != nil || got.TotalMinutes != 0 || got.AdvanceMinutes != 0 || len(got.Advance) != 0 {
		t.Errorf("no Steps: %+v, %v", got, err)
	}
	two := []Step{
		{Kind: schedule.Advance, LeadTimeMinutes: 30},
		{Kind: schedule.Advance, LeadTimeMinutes: 1440},
	}
	got, err = TimingOf(two)
	if err != nil || got.AdvanceMinutes != 1440 || got.TotalMinutes != 0 || len(got.Advance) != 2 {
		t.Errorf("only Advance Steps: %+v, %v (AdvanceMinutes is the longest lead time)", got, err)
	}
	if _, err := TimingOf([]Step{{Kind: schedule.Passive}}); err == nil {
		t.Error("invalid Steps must return an error")
	}
}

func TestParseState(t *testing.T) {
	for in, want := range map[string]State{
		"": StateNone, "none": StateNone, "Favourite": StateFavourite, " dislike ": StateDislike, "EXCLUSION": StateExclusion,
	} {
		got, ok := ParseState(in)
		if !ok || got != want {
			t.Errorf("ParseState(%q) = %q, %v; want %q", in, got, ok, want)
		}
	}
	for _, bad := range []string{"star", "like", "allergy", "never"} {
		if _, ok := ParseState(bad); ok {
			t.Errorf("ParseState(%q) accepted", bad)
		}
	}
}
