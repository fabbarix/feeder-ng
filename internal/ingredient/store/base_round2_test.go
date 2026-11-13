package store_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// BR-B round 2 (nit): Search returns at most `limit` suggestions in total, plain and Base recipe Ingredients together.

func TestSearchReturnsAtMostLimitSuggestionsInTotal(t *testing.T) {
	f, port := baseFixture(t)
	_ = port
	for i := 0; i < 4; i++ {
		f.create(t, ingredient.Input{Name: fmt.Sprintf("béchamel plain %d", i), Base: units.Millilitre})
	}
	for i := 0; i < 4; i++ {
		f.createBase(t, int64(10+i), fmt.Sprintf("béchamel base %d", i), units.Millilitre)
	}
	for _, limit := range []int{1, 3, 5} {
		res, err := f.store.Search(ctx, "béchamel", limit)
		if err != nil {
			t.Fatal(err)
		}
		if len(res.Suggestions) > limit {
			t.Errorf("limit %d: %d suggestions, want at most %d in total", limit, len(res.Suggestions), limit)
		}
	}
	res, _ := f.store.Search(ctx, "béchamel", 5)
	if len(res.Suggestions) == 0 {
		t.Error("suggestions expected")
	}
}
