package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/tag"
)

// BothRecipes (TG-API): the "(4 already have both)" of the merge confirm.

func TestBothRecipesCountsRecipesWithBothTags(t *testing.T) {
	f := newFx(t)
	fish, sea, pasta := f.tag("fish", "tomato"), f.tag("Seafood", "apricot"), f.tag("Pasta", "mustard")
	f.recipe("Salmon", 0, fish, sea)
	f.recipe("Cod", 0, fish)
	f.recipe("Prawns", 0, sea)
	f.recipe("Old trout", 1, fish, sea) // archived Recipes count, as everywhere
	f.recipe("Pesto fish", 0, pasta, fish, sea)
	f.recipe("Plain pasta", 0, pasta)
	cases := []struct {
		name     string
		id, into int64
		want     int
	}{
		{"fish and Seafood", fish, sea, 3},
		{"symmetric", sea, fish, 3},
		{"fish and Pasta", fish, pasta, 1},
		{"Seafood and Pasta", sea, pasta, 1},
	}
	for _, c := range cases {
		got, err := f.st.BothRecipes(ctx, c.id, c.into)
		if err != nil || got != c.want {
			t.Errorf("%s: BothRecipes = %d, %v; want %d", c.name, got, err, c.want)
		}
	}
	none := f.tag("Unused", "olive")
	if got, err := f.st.BothRecipes(ctx, fish, none); err != nil || got != 0 {
		t.Errorf("a Tag with no Recipe: BothRecipes = %d, %v; want 0", got, err)
	}
}

func TestBothRecipesRefusals(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	if _, err := f.st.BothRecipes(ctx, 9999, fish); !errors.Is(err, tag.ErrNotFound) {
		t.Errorf("unknown id = %v, want ErrNotFound", err)
	}
	if _, err := f.st.BothRecipes(ctx, fish, fish); !errors.Is(err, tag.ErrMergeSelf) {
		t.Errorf("into itself = %v, want ErrMergeSelf", err)
	}
	if _, err := f.st.BothRecipes(ctx, fish, 9999); !errors.Is(err, tag.ErrMergeTarget) {
		t.Errorf("unknown into = %v, want ErrMergeTarget", err)
	}
	if _, err := f.st.BothRecipes(ctx, 9999, 9998); !errors.Is(err, tag.ErrNotFound) {
		t.Errorf("both unknown = %v, want ErrNotFound (id is checked first)", err)
	}
}
