package baserecipe_test

import (
	"errors"
	"reflect"
	"testing"

	br "github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
)

// BR-B round 3 (docs/dev/design/base-recipes.md section 4.1): Expand skips an unconvertible line silently; the batch
// read needs to say which lines it skipped and in which Recipe or Base recipe they sit. ExpandReport is Expand plus
// that list; Expand keeps returning the same Needs.

// skippedCat is nestedCat with two bad lines inside Roux (line 2: an Ingredient that does not exist; line 3: a unit
// that does not convert for flour) and one bad line in Lasagne itself (line 2: a unit that does not convert).
func skippedCat() *fakeCat {
	c := nestedCat()
	roux := c.recipes[rRoux]
	roux.Lines = append(roux.Lines, line(999, 10, "g"), line(iFlour, 3, "furlong"))
	c.recipes[rRoux] = roux
	l := c.recipes[rLasagne]
	l.Lines = append(l.Lines, line(iMilk, 1, "furlong"))
	c.recipes[rLasagne] = l
	return c
}

func TestExpandReportListsEverySkippedLineWithTheRecipeItSitsIn(t *testing.T) {
	res, err := br.ExpandReport(skippedCat(), rLasagne)
	if err != nil {
		t.Fatalf("ExpandReport: %v", err)
	}
	want := []br.Skipped{
		{RecipeID: rRoux, RecipeName: "Roux", Line: 2, IngredientID: 999, Unit: "g", Reason: br.SkipUnknownIngredient},
		{RecipeID: rRoux, RecipeName: "Roux", Line: 3, IngredientID: iFlour, Unit: "furlong", Reason: br.SkipUnconvertibleUnit},
		{RecipeID: rLasagne, RecipeName: "Lasagne", Line: 2, IngredientID: iMilk, Unit: "furlong", Reason: br.SkipUnconvertibleUnit},
	}
	if !reflect.DeepEqual(res.Skipped, want) {
		t.Errorf("Skipped = %+v\nwant     %+v\n(line is the 0-based line index in the Recipe that owns it; nested Base recipes first, in walk order)", res.Skipped, want)
	}
}

func TestExpandReportNeedsAreExactlyThoseOfExpand(t *testing.T) {
	c := skippedCat()
	res, err := br.ExpandReport(c, rLasagne)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(res.Needs, mustExpand(t, c, rLasagne)) {
		t.Errorf("ExpandReport.Needs differs from Expand")
	}
}

func TestExpandReportOfAGoodRecipeSkipsNothing(t *testing.T) {
	res, err := br.ExpandReport(nestedCat(), rLasagne)
	if err != nil || len(res.Skipped) != 0 || len(res.Needs) != 2 {
		t.Errorf("ExpandReport = %+v, %v; want two Needs and nothing skipped", res, err)
	}
}

func TestExpandReportKeepsTheTypedCycleAndNotFoundErrors(t *testing.T) {
	c := nestedCat()
	roux := c.recipes[rRoux]
	roux.Lines = append(roux.Lines, line(iBechamelI, 10, "ml"))
	c.recipes[rRoux] = roux
	_, err := br.ExpandReport(c, rLasagne)
	var ce *br.CycleError
	if !errors.Is(err, br.ErrCycle) || !errors.As(err, &ce) || len(ce.Path) < 3 {
		t.Errorf("cycle = %v, want a *CycleError matching ErrCycle with its path", err)
	}
	if _, err := br.ExpandReport(c, 12345); !errors.Is(err, br.ErrNotFound) {
		t.Errorf("unknown Recipe = %v, want ErrNotFound", err)
	}
}
