package schedule

import (
	"errors"
	"math"
	"reflect"
	"testing"
)

// specExample is the worked example of docs/spec/recipe-file.md ("Steps and
// timing"): index 0 is the Advance Step (marinate), 1 oven, 2 veg, 3 roast
// tray, 4 rice, 5 serve.
func specExample() []Step {
	return []Step{
		{Kind: Advance, LeadTimeMinutes: 240},
		{Kind: Active, DurationMinutes: 2},
		{Kind: Active, DurationMinutes: 8},
		{Kind: Passive, DurationMinutes: 25, After: []int{1, 2}},
		{Kind: Passive, DurationMinutes: 15},
		{Kind: Active, DurationMinutes: 5, After: []int{3, 4}},
	}
}

func TestComputeSpecExample(t *testing.T) {
	got, err := Compute(specExample())
	if err != nil {
		t.Fatalf("Compute: %v", err)
	}
	wantSteps := []Timed{
		{Index: 1, Start: 0, End: 2},   // oven
		{Index: 2, Start: 2, End: 10},  // veg
		{Index: 3, Start: 10, End: 35}, // tray waits for 1 and 2
		{Index: 4, Start: 10, End: 25}, // rice starts as soon as the tray goes in
		{Index: 5, Start: 35, End: 40}, // serve waits for 3 and 4
	}
	if !reflect.DeepEqual(got.Steps, wantSteps) {
		t.Errorf("Steps = %+v, want %+v", got.Steps, wantSteps)
	}
	wantAdvance := []AdvanceStep{{Index: 0, LeadTimeMinutes: 240}}
	if !reflect.DeepEqual(got.Advance, wantAdvance) {
		t.Errorf("Advance = %+v, want %+v", got.Advance, wantAdvance)
	}
	if got.TotalMinutes != 40 {
		t.Errorf("TotalMinutes = %d, want 40 (critical path, not the 55 min sum)", got.TotalMinutes)
	}
}

func TestComputeTotals(t *testing.T) {
	tests := []struct {
		name      string
		steps     []Step
		wantTotal int
		wantTimed []Timed
	}{
		{
			name:      "no steps",
			steps:     nil,
			wantTotal: 0,
			wantTimed: nil,
		},
		{
			name:      "ready meal: a single passive step",
			steps:     []Step{{Kind: Passive, DurationMinutes: 40}},
			wantTotal: 40,
			wantTimed: []Timed{{0, 0, 40}},
		},
		{
			name:      "active steps run one after another",
			steps:     []Step{{Kind: Active, DurationMinutes: 5}, {Kind: Active, DurationMinutes: 10}, {Kind: Active, DurationMinutes: 5}},
			wantTotal: 20,
			wantTimed: []Timed{{0, 0, 5}, {1, 5, 15}, {2, 15, 20}},
		},
		{
			name:      "cook is free as soon as a passive step starts",
			steps:     []Step{{Kind: Passive, DurationMinutes: 30}, {Kind: Active, DurationMinutes: 10}},
			wantTotal: 30,
			wantTimed: []Timed{{0, 0, 30}, {1, 0, 10}},
		},
		{
			name:      "two passive steps start together",
			steps:     []Step{{Kind: Passive, DurationMinutes: 20}, {Kind: Passive, DurationMinutes: 45}},
			wantTotal: 45,
			wantTimed: []Timed{{0, 0, 20}, {1, 0, 45}},
		},
		{
			name:      "after waits for a passive step to finish",
			steps:     []Step{{Kind: Passive, DurationMinutes: 30}, {Kind: Active, DurationMinutes: 5, After: []int{0}}},
			wantTotal: 35,
			wantTimed: []Timed{{0, 0, 30}, {1, 30, 35}},
		},
		{
			name: "after on a step that already finished does not delay",
			steps: []Step{
				{Kind: Active, DurationMinutes: 5},
				{Kind: Active, DurationMinutes: 5, After: []int{0}},
			},
			wantTotal: 10,
			wantTimed: []Timed{{0, 0, 5}, {1, 5, 10}},
		},
		{
			name:      "advance steps are outside the timeline",
			steps:     []Step{{Kind: Active, DurationMinutes: 5}, {Kind: Advance, LeadTimeMinutes: 60}, {Kind: Active, DurationMinutes: 5}},
			wantTotal: 10,
			wantTimed: []Timed{{0, 0, 5}, {2, 5, 10}},
		},
		{
			name:      "advance step first does not shift the timeline",
			steps:     []Step{{Kind: Advance, LeadTimeMinutes: 1440}, {Kind: Passive, DurationMinutes: 40}},
			wantTotal: 40,
			wantTimed: []Timed{{1, 0, 40}},
		},
		{
			name:      "active step without a duration is instantaneous",
			steps:     []Step{{Kind: Active}, {Kind: Active, DurationMinutes: 4}},
			wantTotal: 4,
			wantTimed: []Timed{{0, 0, 0}, {1, 0, 4}},
		},
		{
			name: "total is the latest end even when the last step ends earlier",
			steps: []Step{
				{Kind: Passive, DurationMinutes: 60},
				{Kind: Active, DurationMinutes: 5},
			},
			wantTotal: 60,
			wantTimed: []Timed{{0, 0, 60}, {1, 0, 5}},
		},
		{
			name: "duplicate after indexes are harmless",
			steps: []Step{
				{Kind: Passive, DurationMinutes: 10},
				{Kind: Active, DurationMinutes: 1, After: []int{0, 0}},
			},
			wantTotal: 11,
			wantTimed: []Timed{{0, 0, 10}, {1, 10, 11}},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Compute(tc.steps)
			if err != nil {
				t.Fatalf("Compute: %v", err)
			}
			if got.TotalMinutes != tc.wantTotal {
				t.Errorf("TotalMinutes = %d, want %d", got.TotalMinutes, tc.wantTotal)
			}
			if len(got.Steps) != len(tc.wantTimed) || (len(tc.wantTimed) > 0 && !reflect.DeepEqual(got.Steps, tc.wantTimed)) {
				t.Errorf("Steps = %+v, want %+v", got.Steps, tc.wantTimed)
			}
		})
	}
}

func TestComputeAdvanceListedSeparately(t *testing.T) {
	steps := []Step{
		{Kind: Advance, LeadTimeMinutes: 1440},
		{Kind: Active, DurationMinutes: 5},
		{Kind: Advance, LeadTimeMinutes: 240},
	}
	got, err := Compute(steps)
	if err != nil {
		t.Fatal(err)
	}
	want := []AdvanceStep{{Index: 0, LeadTimeMinutes: 1440}, {Index: 2, LeadTimeMinutes: 240}}
	if !reflect.DeepEqual(got.Advance, want) {
		t.Errorf("Advance = %+v, want %+v", got.Advance, want)
	}
	if len(got.Steps) != 1 || got.Steps[0].Index != 1 {
		t.Errorf("Steps = %+v, want only step 1", got.Steps)
	}
}

func TestComputeDoesNotModifyInput(t *testing.T) {
	steps := specExample()
	before := specExample()
	if _, err := Compute(steps); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(steps, before) {
		t.Error("Compute modified its input")
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name  string
		steps []Step
		want  []ValidationError // Step + Code compared; Message must be non-empty
	}{
		{"spec example is valid", specExample(), nil},
		{"empty is valid", nil, nil},
		{
			"passive needs a duration",
			[]Step{{Kind: Passive}},
			[]ValidationError{{Step: 0, Code: CodePassiveNeedsDuration}},
		},
		{
			"passive with negative duration",
			[]Step{{Kind: Passive, DurationMinutes: -5}},
			[]ValidationError{{Step: 0, Code: CodeNegativeMinutes}},
		},
		{
			"advance needs a lead time",
			[]Step{{Kind: Advance}},
			[]ValidationError{{Step: 0, Code: CodeAdvanceNeedsLead}},
		},
		{
			"active with negative duration",
			[]Step{{Kind: Active, DurationMinutes: -1}},
			[]ValidationError{{Step: 0, Code: CodeNegativeMinutes}},
		},
		{
			"unknown kind",
			[]Step{{Kind: "boil", DurationMinutes: 5}},
			[]ValidationError{{Step: 0, Code: CodeUnknownKind}},
		},
		{
			"after must reference earlier steps: itself",
			[]Step{{Kind: Active, DurationMinutes: 1, After: []int{0}}},
			[]ValidationError{{Step: 0, Code: CodeAfterNotEarlier}},
		},
		{
			"after must reference earlier steps: later",
			[]Step{{Kind: Active, DurationMinutes: 1, After: []int{1}}, {Kind: Active, DurationMinutes: 1}},
			[]ValidationError{{Step: 0, Code: CodeAfterNotEarlier}},
		},
		{
			"after out of range",
			[]Step{{Kind: Active, DurationMinutes: 1}, {Kind: Active, DurationMinutes: 1, After: []int{7}}},
			[]ValidationError{{Step: 1, Code: CodeAfterNotEarlier}},
		},
		{
			"after negative",
			[]Step{{Kind: Active, DurationMinutes: 1}, {Kind: Active, DurationMinutes: 1, After: []int{-1}}},
			[]ValidationError{{Step: 1, Code: CodeAfterNotEarlier}},
		},
		{
			"after cannot reference an advance step",
			[]Step{{Kind: Advance, LeadTimeMinutes: 60}, {Kind: Active, DurationMinutes: 1, After: []int{0}}},
			[]ValidationError{{Step: 1, Code: CodeAfterAdvance}},
		},
		{
			"all problems are reported, ordered by step",
			[]Step{
				{Kind: Passive},
				{Kind: Advance},
				{Kind: Active, DurationMinutes: 1, After: []int{5}},
			},
			[]ValidationError{
				{Step: 0, Code: CodePassiveNeedsDuration},
				{Step: 1, Code: CodeAdvanceNeedsLead},
				{Step: 2, Code: CodeAfterNotEarlier},
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Validate(tc.steps)
			if len(got) != len(tc.want) {
				t.Fatalf("Validate = %+v, want %d error(s)", got, len(tc.want))
			}
			for i := range got {
				if got[i].Step != tc.want[i].Step || got[i].Code != tc.want[i].Code {
					t.Errorf("error %d = {Step:%d Code:%q}, want {Step:%d Code:%q}", i, got[i].Step, got[i].Code, tc.want[i].Step, tc.want[i].Code)
				}
				if got[i].Message == "" || got[i].Error() == "" {
					t.Errorf("error %d has an empty message", i)
				}
			}
		})
	}
}

func TestComputeInvalidReturnsValidationErrors(t *testing.T) {
	got, err := Compute([]Step{{Kind: Passive}})
	if err == nil {
		t.Fatal("expected an error")
	}
	var ve ValidationErrors
	if !errors.As(err, &ve) || len(ve) != 1 || ve[0].Code != CodePassiveNeedsDuration {
		t.Fatalf("err = %#v, want ValidationErrors with %s", err, CodePassiveNeedsDuration)
	}
	if got.TotalMinutes != 0 || got.Steps != nil || got.Advance != nil {
		t.Errorf("Schedule on error = %+v, want zero value", got)
	}
}

func TestScaleUses(t *testing.T) {
	uses := []Use{
		{Ingredient: "chicken thighs", Quantity: 800, Unit: "g"},
		{Ingredient: "garam masala", Quantity: 2, Unit: "tbsp"},
		{Ingredient: "lemon", Quantity: 1, Unit: "piece"},
	}
	tests := []struct {
		name    string
		batches float64
		want    []float64
	}{
		{"one batch is unchanged", 1, []float64{800, 2, 1}},
		{"two batches double", 2, []float64{1600, 4, 2}},
		{"half a batch", 0.5, []float64{400, 1, 0.5}},
		{"one and a half batches", 1.5, []float64{1200, 3, 1.5}},
		{"a third of a batch", 1.0 / 3.0, []float64{800.0 / 3.0, 2.0 / 3.0, 1.0 / 3.0}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ScaleUses(uses, tc.batches)
			if err != nil {
				t.Fatal(err)
			}
			if len(got) != len(uses) {
				t.Fatalf("len = %d, want %d", len(got), len(uses))
			}
			for i := range got {
				if math.Abs(got[i].Quantity-tc.want[i]) > 1e-9 {
					t.Errorf("use %d quantity = %v, want %v", i, got[i].Quantity, tc.want[i])
				}
				if got[i].Ingredient != uses[i].Ingredient || got[i].Unit != uses[i].Unit {
					t.Errorf("use %d identity changed: %+v", i, got[i])
				}
			}
		})
	}
	if uses[0].Quantity != 800 {
		t.Error("ScaleUses modified its input")
	}
}

func TestScaleUsesEdges(t *testing.T) {
	if got, err := ScaleUses(nil, 2); err != nil || len(got) != 0 {
		t.Errorf("ScaleUses(nil) = %v, %v; want empty, nil", got, err)
	}
	for _, b := range []float64{0, -1, math.NaN(), math.Inf(1)} {
		if _, err := ScaleUses([]Use{{Ingredient: "x", Quantity: 1, Unit: "g"}}, b); !errors.Is(err, ErrInvalidBatches) {
			t.Errorf("ScaleUses(batches=%v) err = %v, want ErrInvalidBatches", b, err)
		}
	}
}
