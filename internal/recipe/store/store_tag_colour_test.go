package store_test

import (
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// A Tag created by saving a Recipe gets the next colour (ADR 0010 point 8; tg-plan §3.1, TG-A):
// writeContent creates Tags through tagstore.EnsureTx, the one place a Tag is created on use.

func (f *fixture) tagColours(t *testing.T) map[string]string {
	t.Helper()
	r, err := f.db.Query(`SELECT key, colour FROM tags`)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()
	out := map[string]string{}
	for r.Next() {
		var k, c string
		if err := r.Scan(&k, &c); err != nil {
			t.Fatal(err)
		}
		out[k] = c
	}
	return out
}

func TestANewTagOnARecipeGetsTheNextColour(t *testing.T) {
	f := newFixture(t)
	f.exec(t, `INSERT INTO tags(key,name,colour) VALUES ('fish','Fish','tomato'),('pasta','Pasta','apricot')`)
	in := f.simple(t, "Soup", func(in *recipe.Input) { in.Tags = []string{"Soup", "quick"} })
	f.mustCreate(t, in)
	want := map[string]string{"fish": "tomato", "pasta": "apricot", "soup": "mustard", "quick": "olive"}
	if got := f.tagColours(t); !reflect.DeepEqual(got, want) {
		t.Errorf("colours = %v, want %v (each new Tag takes the colour fewest Tags have)", got, want)
	}
}

func TestAnExistingTagIsLinkedByKeyAndKeepsItsNameAndColour(t *testing.T) {
	f := newFixture(t)
	f.exec(t, `INSERT INTO tags(key,name,colour) VALUES ('fish','Fish','plum')`)
	r := f.mustCreate(t, f.simple(t, "Cod", func(in *recipe.Input) { in.Tags = []string{"FISH"} }))
	got, err := f.s.Get(ctx, r.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.Tags, []string{"Fish"}) {
		t.Errorf("Tags = %q, want the existing spelling", got.Tags)
	}
	if c := f.tagColours(t); len(c) != 1 || c["fish"] != "plum" {
		t.Errorf("colours = %v; the existing Tag must be reused unchanged", c)
	}
}

func TestUpdatingARecipeWithANewTagAlsoTakesTheNextColour(t *testing.T) {
	f := newFixture(t)
	r := f.mustCreate(t, f.simple(t, "Cod", func(in *recipe.Input) { in.Tags = []string{"fish"} }))
	in := f.simple(t, "Cod", func(in *recipe.Input) { in.Tags = []string{"fish", "oven"} })
	if _, err := f.s.Update(ctx, r.ID, in); err != nil {
		t.Fatal(err)
	}
	if got, want := f.tagColours(t), map[string]string{"fish": "tomato", "oven": "apricot"}; !reflect.DeepEqual(got, want) {
		t.Errorf("colours = %v, want %v", got, want)
	}
}

func TestRecipesTagsDoNotRecolourUnusedTags(t *testing.T) {
	// An unused Tag still counts when picking the next colour: Tags stay when unused (ADR 0010 point 1).
	f := newFixture(t)
	f.exec(t, `INSERT INTO tags(key,name,colour) VALUES ('old','Old','tomato')`)
	f.mustCreate(t, f.simple(t, "Cod", func(in *recipe.Input) { in.Tags = []string{"fish"} }))
	if got := f.tagColours(t); got["fish"] != "apricot" || got["old"] != "tomato" {
		t.Errorf("colours = %v", got)
	}
}
