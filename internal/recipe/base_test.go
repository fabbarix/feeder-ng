package recipe

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-B (docs/dev/design/base-recipes.md §3.1, §3.2, §3.3, §10, §16): the pure rules of Base recipes. Red until
// the developer fills recipe.Input.Validate, YieldBase, YieldInBase and DecideBaseRecipeName.

func baseInput() Input {
	return Input{Name: "Béchamel", Yield: 1, BaseRecipe: boolp(true), YieldUnit: "l",
		Lines: []Line{{IngredientID: milk, Quantity: 1, Unit: "l"}}}
}

func wantValidation(t *testing.T, err error, field, code string) {
	t.Helper()
	var ve *ValidationError
	if !errors.As(err, &ve) || ve.Field != field || ve.Code != code {
		t.Fatalf("err = %v, want a ValidationError on %s with code %s", err, field, code)
	}
}

func TestYieldBaseMapsYieldUnitsToBaseUnits(t *testing.T) {
	for unit, want := range map[string]units.Base{
		"g": units.Gram, "kg": units.Gram, " KG ": units.Gram,
		"ml": units.Millilitre, "l": units.Millilitre, "dl": units.Millilitre, "cl": units.Millilitre,
		"tsp": units.Millilitre, "tbsp": units.Millilitre, "cup": units.Millilitre,
		"piece": units.Piece, "portion": units.Piece,
	} {
		got, ok := YieldBase(unit)
		if !ok || got != want {
			t.Errorf("YieldBase(%q) = %q, %v; want %q", unit, got, ok, want)
		}
	}
	for _, unit := range []string{"", "batch", "clove", "oz", "pinch"} {
		if _, ok := YieldBase(unit); ok {
			t.Errorf("YieldBase(%q) must be refused", unit)
		}
	}
}

func TestYieldInBaseIsWhatTheBatchConversionHolds(t *testing.T) {
	for _, tc := range []struct {
		q    float64
		unit string
		want float64
	}{{1, "l", 1000}, {2, "kg", 2000}, {300, "g", 300}, {4, "portion", 4}, {5, "dl", 500}} {
		got, ok := YieldInBase(tc.q, tc.unit)
		if !ok || got != tc.want {
			t.Errorf("YieldInBase(%v, %q) = %v, %v; want %v", tc.q, tc.unit, got, ok, tc.want)
		}
	}
	if _, ok := YieldInBase(1, "batch"); ok {
		t.Error("an unknown Yield unit has no Base Units")
	}
}

func TestAValidBaseRecipeIsAcceptedAndKeepsItsKind(t *testing.T) {
	got, err := baseInput().Validate(lookup)
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if !got.IsBase() || got.YieldUnit != "l" || got.Yield != 1 {
		t.Errorf("cleaned = base %v unit %q yield %v, want a Base recipe of 1 l", got.IsBase(), got.YieldUnit, got.Yield)
	}
	if len(got.CourseIDs) != 0 {
		t.Errorf("CourseIDs = %v, want none: a Base recipe has no Courses", got.CourseIDs)
	}
}

func TestABaseRecipeYieldUnitIsNormalisedAndAllowsABigYield(t *testing.T) {
	in := baseInput()
	in.YieldUnit, in.Yield = " ML ", 50000
	got, err := in.Validate(lookup)
	if err != nil || got.YieldUnit != "ml" {
		t.Fatalf("Validate = %q, %v; want yield unit ml (normalised) and 50000 accepted (up to %v)", got.YieldUnit, err, MaxBaseYield)
	}
	in.Yield = MaxBaseYield + 1
	_, err = in.Validate(lookup)
	wantValidation(t, err, "yield", CodeYieldInvalid)
}

func TestABaseRecipeNeedsAKnownYieldUnit(t *testing.T) {
	for _, unit := range []string{"", "batch", "clove", "furlong"} {
		in := baseInput()
		in.YieldUnit = unit
		_, err := in.Validate(lookup)
		wantValidation(t, err, "yieldUnit", CodeYieldUnitInvalid)
	}
}

func TestAPlannableRecipeHasNoYieldUnit(t *testing.T) {
	in := valid()
	in.YieldUnit = "portion"
	_, err := in.Validate(lookup)
	wantValidation(t, err, "yieldUnit", CodeYieldUnitInvalid)
	if _, err := valid().Validate(lookup); err != nil {
		t.Errorf("a plannable Recipe without a yield unit is valid: %v", err)
	}
	in = valid()
	in.Yield = MaxYield + 1
	_, err = in.Validate(lookup)
	wantValidation(t, err, "yield", CodeYieldInvalid)
}

func TestABaseRecipeMayHaveNoLines(t *testing.T) {
	in := baseInput()
	in.Lines = nil
	if _, err := in.Validate(lookup); err != nil {
		t.Errorf("an empty Base recipe (§4.6) is valid: %v", err)
	}
	plain := valid()
	plain.Lines = nil
	_, err := plain.Validate(lookup)
	wantValidation(t, err, "lines", CodeLinesRequired)
}

func TestABaseRecipeCannotBeAReadyMeal(t *testing.T) {
	in := baseInput()
	in.ReadyMeal = true
	_, err := in.Validate(lookup)
	wantValidation(t, err, "readyMeal", CodeBaseRecipeReadyMeal)
}

func TestFieldsABaseRecipeDoesNotHaveAreRefusedByName(t *testing.T) {
	yes := true
	for _, tc := range []struct {
		field string
		set   func(*Input)
	}{
		{"courses", func(in *Input) { in.CourseIDs = []int64{1} }},
		{"wholeMeal", func(in *Input) { in.WholeMeal = &yes }},
		{"cooldownDays", func(in *Input) { in.CooldownDays = intp(3) }},
		{"leftoverUseByDays", func(in *Input) { in.LeftoverUseByDays = intp(2) }},
		{"frozenUseByDays", func(in *Input) { in.FrozenUseByDays = intp(60) }},
		{"reheatMinutes", func(in *Input) { in.ReheatMinutes = intp(5) }},
	} {
		in := baseInput()
		tc.set(&in)
		_, err := in.Validate(lookup)
		wantValidation(t, err, tc.field, CodeBaseRecipeField)
	}
}

func TestABaseRecipeAcceptsWhatItsEditorSendsBack(t *testing.T) {
	// GET returns courseIds [] and wholeMeal false for a Base recipe; the editor PUTs them back unchanged.
	no := false
	in := baseInput()
	in.CourseIDs, in.WholeMeal = []int64{}, &no
	if _, err := in.Validate(lookup); err != nil {
		t.Errorf("courseIds [] and wholeMeal false are the empty values, not fields that were set: %v", err)
	}
}

func TestABaseRecipeKeepsItsTags(t *testing.T) {
	in := baseInput()
	in.Tags = []string{"Sauce"}
	got, err := in.Validate(lookup)
	if err != nil || len(got.Tags) != 1 || got.Tags[0] != "Sauce" {
		t.Errorf("Tags = %v, %v; want [Sauce]: Tags help find a Base recipe on the Recipes list", got.Tags, err)
	}
}

func TestNeededAtStepMustPointAtOneOfTheRecipesOwnSteps(t *testing.T) {
	for _, tc := range []struct {
		name string
		step *int
		ok   bool
	}{{"first Step", intp(0), true}, {"absent", nil, true}, {"past the last Step", intp(1), false}, {"negative", intp(-1), false}} {
		t.Run(tc.name, func(t *testing.T) {
			in := valid() // one Step
			in.Lines[0].NeededAtStep = tc.step
			_, err := in.Validate(lookup)
			if tc.ok && err != nil {
				t.Fatalf("Validate: %v", err)
			}
			if !tc.ok {
				wantValidation(t, err, "lines[0].neededAtStep", CodeNeededAtStepInvalid)
			}
		})
	}
}

func TestADuplicateBaseRecipeLineKeepsItsNeededAtStepThroughValidate(t *testing.T) {
	in := valid()
	in.Lines[1].NeededAtStep = intp(0)
	got, err := in.Validate(lookup)
	if err != nil || got.Lines[1].NeededAtStep == nil || *got.Lines[1].NeededAtStep != 0 {
		t.Errorf("Validate dropped neededAtStep: %+v, %v", got.Lines[1], err)
	}
}

func TestDecideBaseRecipeName(t *testing.T) {
	plain := NameHolder{IngredientID: 7, Name: "béchamel", Kind: HolderPlain}
	base := NameHolder{IngredientID: 8, Name: "Béchamel", Kind: HolderBaseRecipe}
	ready := NameHolder{IngredientID: 9, Name: "BÉCHAMEL", Kind: HolderReadyMeal}
	tests := []struct {
		name    string
		recipe  string
		holders []NameHolder
		action  NameAction
		code    string
		holder  int64
	}{
		{"nobody holds it: its own Ingredient", "Béchamel", nil, NameOwn, "", 0},
		{"other names do not matter", "Béchamel", []NameHolder{{IngredientID: 1, Name: "milk", Kind: HolderPlain}}, NameOwn, "", 0},
		{"a plain Ingredient: ask (units.NormalizeName: case and spacing, not accents)", "BÉCHAMEL", []NameHolder{plain}, NameAsk, "", 7},
		{"another Base recipe: refused", "Béchamel", []NameHolder{base}, NameRefuse, CodeBaseRecipeNameTaken, 0},
		{"a Ready Meal's Ingredient: refused", "béchamel", []NameHolder{ready}, NameRefuse, CodeReadyMealNameTaken, 0},
		{"a Base recipe wins over a plain Ingredient beside it", "Béchamel", []NameHolder{plain, base}, NameRefuse, CodeBaseRecipeNameTaken, 0},
		{"a Ready Meal wins over a plain Ingredient", "Béchamel", []NameHolder{plain, ready}, NameRefuse, CodeReadyMealNameTaken, 0},
		{"a Base recipe wins over a Ready Meal", "Béchamel", []NameHolder{ready, base}, NameRefuse, CodeBaseRecipeNameTaken, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := DecideBaseRecipeName(tc.recipe, tc.holders)
			if got.Action != tc.action || got.Code != tc.code || got.TakeOver.IngredientID != tc.holder {
				t.Errorf("DecideBaseRecipeName = %+v, want action %s code %q holder %d", got, tc.action, tc.code, tc.holder)
			}
		})
	}
}

func TestErrorsMatchTheirSentinels(t *testing.T) {
	if !errors.Is(&InUseError{}, ErrBaseRecipeInUse) || !errors.Is(&CycleError{}, ErrBaseRecipeCycle) ||
		!errors.Is(&TakeOverError{}, ErrTakeOver) || !errors.Is(&NameTakenError{}, ErrIngredientNameTaken) {
		t.Error("a Base recipe error must match its sentinel with errors.Is")
	}
}

func TestDecideBaseRecipeNameComparesLikeTheIngredientKeyAndNotLikeTheFuzzyMatch(t *testing.T) {
	// The name key is units.NormalizeName (case and spacing); accents and plurals are the picker's fuzzy matching,
	// not an identity: "Bechamel" does not hold "Béchamel".
	holders := []NameHolder{{IngredientID: 7, Name: "bechamel", Kind: HolderPlain}, {IngredientID: 8, Name: "béchamels", Kind: HolderBaseRecipe}}
	if got := DecideBaseRecipeName("Béchamel", holders); got.Action != NameOwn {
		t.Errorf("DecideBaseRecipeName = %+v, want NameOwn", got)
	}
	if got := DecideBaseRecipeName("  Béchamel   sauce ", []NameHolder{{IngredientID: 7, Name: "béchamel sauce", Kind: HolderPlain}}); got.Action != NameAsk {
		t.Errorf("collapsed spacing = %+v, want NameAsk", got)
	}
}
