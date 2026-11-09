package store_test

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/recipefile/store"
)

var ctx = context.Background()

type fixture struct {
	db     *sql.DB
	s      *store.Store
	images string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(t.TempDir(), "images")
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	return &fixture{db: d, s: store.New(d, clk, imaging.NewStore(dir)), images: dir}
}

func (f *fixture) count(t *testing.T, table string) int {
	t.Helper()
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM ` + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func (f *fixture) imageFiles(t *testing.T) int {
	t.Helper()
	entries, err := os.ReadDir(f.images)
	if errors.Is(err, os.ErrNotExist) {
		return 0
	}
	if err != nil {
		t.Fatal(err)
	}
	return len(entries)
}

func exampleCommit(t *testing.T, ex recipefile.Existing, d recipefile.Decisions, imgs recipefile.ImageSet) recipefile.Commit {
	t.Helper()
	file, err := recipefile.Parse(spec.Example)
	if err != nil {
		t.Fatal(err)
	}
	c, err := recipefile.BuildCommit(file, ex, d, imgs)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestApplyWritesIngredientsConversionsRecipesTagsAndImagesTogether(t *testing.T) {
	f := newFixture(t)
	webp := webpOf(t, 8, 6)
	imgs := recipefile.ImageSet{Images: map[string]imaging.Result{"$.recipes[0].image": {WebP: webp, Width: 8, Height: 6}}}
	c := exampleCommit(t, recipefile.Existing{}, recipefile.Decisions{}, imgs)
	res, err := f.s.Apply(ctx, c)
	if err != nil {
		t.Fatal(err)
	}
	if res.IngredientsCreated != 9 || len(res.Recipes) != 2 || res.Recipes[0].Action != "created" || res.Recipes[0].ID == 0 {
		t.Fatalf("result = %+v", res)
	}
	if f.count(t, "ingredients") != 9 || f.count(t, "recipes") != 2 || f.count(t, "tags") != 5 {
		t.Fatalf("ingredients=%d recipes=%d tags=%d", f.count(t, "ingredients"), f.count(t, "recipes"), f.count(t, "tags"))
	}
	if f.count(t, "ingredient_conversions") != 5 { // yogurt 1, garam masala 2, spinach 1, rice 1
		t.Fatalf("conversions = %d", f.count(t, "ingredient_conversions"))
	}
	if f.imageFiles(t) != 1 {
		t.Fatalf("image files = %d, want 1", f.imageFiles(t))
	}
	var lines, steps int
	f.db.QueryRow(`SELECT count(*) FROM recipe_lines`).Scan(&lines)
	f.db.QueryRow(`SELECT count(*) FROM recipe_steps`).Scan(&steps)
	if lines != 9 || steps != 7 {
		t.Fatalf("lines=%d steps=%d, want 9 and 7", lines, steps)
	}
}

func TestApplyIsAllOrNothing(t *testing.T) {
	f := newFixture(t)
	webp := webpOf(t, 8, 6)
	imgs := recipefile.ImageSet{Images: map[string]imaging.Result{"$.recipes[0].image": {WebP: webp, Width: 8, Height: 6}}}
	c := exampleCommit(t, recipefile.Existing{}, recipefile.Decisions{}, imgs)
	// The second Recipe replaces a Recipe that no longer exists: the write set is stale.
	c.Recipes[1].Action = recipefile.ActionReplace
	c.Recipes[1].ReplaceID = 4242
	if _, err := f.s.Apply(ctx, c); !errors.Is(err, store.ErrStale) {
		t.Fatalf("got %v, want ErrStale", err)
	}
	for _, table := range []string{"ingredients", "ingredient_conversions", "recipes", "recipe_lines", "recipe_steps", "tags"} {
		if n := f.count(t, table); n != 0 {
			t.Errorf("%s has %d rows after a failed Apply", table, n)
		}
	}
	if f.imageFiles(t) != 0 {
		t.Fatalf("image files left behind: %d", f.imageFiles(t))
	}
}

func TestApplyReplaceKeepsTheRecipeIdAndAddsConversionsToExistingIngredients(t *testing.T) {
	f := newFixture(t)
	first, err := f.s.Apply(ctx, exampleCommit(t, recipefile.Existing{}, recipefile.Decisions{}, recipefile.ImageSet{}))
	if err != nil {
		t.Fatal(err)
	}
	f.db.Exec(`UPDATE recipes SET archived=1 WHERE id=?`, first.Recipes[0].ID)
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(ex.Ingredients) != 9 || len(ex.Recipes) != 2 {
		t.Fatalf("existing = %d ingredients, %d recipes", len(ex.Ingredients), len(ex.Recipes))
	}
	d := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{
		{Index: 0, Action: recipefile.ActionReplace}, {Index: 1, Action: recipefile.ActionSkip},
	}}
	res, err := f.s.Apply(ctx, exampleCommit(t, ex, d, recipefile.ImageSet{}))
	if err != nil {
		t.Fatal(err)
	}
	if res.IngredientsCreated != 0 || len(res.Recipes) != 1 || res.Recipes[0].ID != first.Recipes[0].ID || res.Recipes[0].Action != "replaced" {
		t.Fatalf("result = %+v", res)
	}
	var archived int
	f.db.QueryRow(`SELECT archived FROM recipes WHERE id=?`, first.Recipes[0].ID).Scan(&archived)
	if archived != 1 || f.count(t, "recipes") != 2 {
		t.Fatalf("archived=%d recipes=%d: replace keeps the id and the archive flag", archived, f.count(t, "recipes"))
	}
}

func TestExportableLoadsRecipesAndTheirIngredientDefinitions(t *testing.T) {
	f := newFixture(t)
	res, err := f.s.Apply(ctx, exampleCommit(t, recipefile.Existing{}, recipefile.Decisions{}, recipefile.ImageSet{}))
	if err != nil {
		t.Fatal(err)
	}
	in, err := f.s.Exportable(ctx, []int64{res.Recipes[1].ID})
	if err != nil {
		t.Fatal(err)
	}
	if len(in.Recipes) != 1 || in.Recipes[0].Name != "Lasagne (ready meal)" || len(in.Ingredients) != 1 {
		t.Fatalf("export input = %d recipes, %d ingredients", len(in.Recipes), len(in.Ingredients))
	}
	all, err := f.s.Exportable(ctx, nil)
	if err != nil || len(all.Recipes) != 2 || len(all.Ingredients) != 9 {
		t.Fatalf("all: %v %d %d", err, len(all.Recipes), len(all.Ingredients))
	}
	if _, err := f.s.Exportable(ctx, []int64{999}); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("got %v, want ErrNotFound", err)
	}
}

// webpOf is a w x h image in the stored form (via the real imaging pipeline).
func webpOf(t *testing.T, w, h int) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, w, h))); err != nil {
		t.Fatal(err)
	}
	r, err := imaging.Process(&b)
	if err != nil {
		t.Fatal(err)
	}
	return r.WebP
}

// firstApply imports the spec example into an empty database and returns what exists afterwards.
func (f *fixture) firstApply(t *testing.T) (store.Result, recipefile.Existing) {
	t.Helper()
	res, err := f.s.Apply(ctx, exampleCommit(t, recipefile.Existing{}, recipefile.Decisions{}, recipefile.ImageSet{}))
	if err != nil {
		t.Fatal(err)
	}
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return res, ex
}

func (f *fixture) sum(t *testing.T, query string) int64 {
	t.Helper()
	var n sql.NullInt64
	if err := f.db.QueryRow(query).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n.Int64
}

// withoutConversions is Existing as it looked at review time, before the
// Ingredients had their Unit Conversions: the Commit then adds the file's.
func withoutConversions(ex recipefile.Existing) recipefile.Existing {
	out := recipefile.Existing{Recipes: ex.Recipes}
	for _, ing := range ex.Ingredients {
		ing.Conversions = nil
		out.Ingredients = append(out.Ingredients, ing)
	}
	return out
}

func replaceBoth() recipefile.Decisions {
	return recipefile.Decisions{Recipes: []recipefile.RecipeDecision{
		{Index: 0, Action: recipefile.ActionReplace}, {Index: 1, Action: recipefile.ActionReplace},
	}}
}

// Decision (design note, "Existing conversion wins at write time"): a Unit
// Conversion that the Ingredient gained after the review is KEPT and the
// file's one is skipped. This is not an error: the import goes on, the
// Conversion is not counted in ConversionsAdded, and nothing is overwritten.
func TestApplyDoesNotOverwriteAConversionAddedAfterTheReview(t *testing.T) {
	f := newFixture(t)
	_, ex := f.firstApply(t)
	reviewed := withoutConversions(ex)
	c := exampleCommit(t, reviewed, replaceBoth(), recipefile.ImageSet{})
	if len(c.AddedConversions) != 5 {
		t.Fatalf("the review would add %d conversions, want 5 (precondition)", len(c.AddedConversions))
	}
	// Behind the review's back every conversion exists again, with another factor.
	if _, err := f.db.Exec(`UPDATE ingredient_conversions SET to_base = to_base + 1000`); err != nil {
		t.Fatal(err)
	}
	before := f.sum(t, `SELECT sum(to_base) FROM ingredient_conversions`)

	res, err := f.s.Apply(ctx, c)
	if err != nil {
		t.Fatalf("a Conversion that appeared since the review is skipped, not an error: %v", err)
	}
	if res.ConversionsAdded != 0 {
		t.Fatalf("ConversionsAdded = %d, want 0: the existing Conversions win", res.ConversionsAdded)
	}
	if after := f.sum(t, `SELECT sum(to_base) FROM ingredient_conversions`); after != before || f.count(t, "ingredient_conversions") != 5 {
		t.Fatalf("conversions changed: sum %d -> %d, rows %d", before, after, f.count(t, "ingredient_conversions"))
	}
	if len(res.Recipes) != 2 || res.Recipes[0].Action != "replaced" {
		t.Fatalf("the Recipes are still imported: %+v", res)
	}
}

func TestApplyStillAddsConversionsTheIngredientStillLacks(t *testing.T) {
	f := newFixture(t)
	_, ex := f.firstApply(t)
	c := exampleCommit(t, withoutConversions(ex), replaceBoth(), recipefile.ImageSet{})
	if _, err := f.db.Exec(`DELETE FROM ingredient_conversions`); err != nil {
		t.Fatal(err)
	}
	res, err := f.s.Apply(ctx, c)
	if err != nil {
		t.Fatal(err)
	}
	if res.ConversionsAdded != 5 || f.count(t, "ingredient_conversions") != 5 {
		t.Fatalf("added %d, rows %d, want 5 and 5", res.ConversionsAdded, f.count(t, "ingredient_conversions"))
	}
}

// Recipe names have no UNIQUE constraint, so Apply re-checks them inside its
// transaction (compared as units.NormalizeName, archived Recipes included).
func TestApplyRefusesACreatedRecipeWhoseNameWasTakenSinceTheReview(t *testing.T) {
	f := newFixture(t)
	_, ex := f.firstApply(t)
	reviewed := ex
	reviewed.Recipes = nil // at review time no Recipe had these names
	c := exampleCommit(t, reviewed, recipefile.Decisions{}, recipefile.ImageSet{})
	if len(c.Recipes) != 2 || c.Recipes[0].Action == recipefile.ActionReplace {
		t.Fatalf("precondition: both Recipes are created, got %+v", c.Recipes)
	}
	if _, err := f.s.Apply(ctx, c); !errors.Is(err, store.ErrStale) {
		t.Fatalf("got %v, want ErrStale", err)
	}
	if n := f.count(t, "recipes"); n != 2 {
		t.Fatalf("%d recipes after a refused Apply, want the 2 that existed", n)
	}
}

func TestApplyRefusesAKeepBothNameThatWasTakenSinceTheReview(t *testing.T) {
	f := newFixture(t)
	res, ex := f.firstApply(t)
	d := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{
		{Index: 0, Action: recipefile.ActionKeepBoth}, {Index: 1, Action: recipefile.ActionSkip},
	}}
	c := exampleCommit(t, ex, d, recipefile.ImageSet{})
	taken := c.Recipes[0].Input.Name
	if !strings.HasSuffix(taken, " (2)") {
		t.Fatalf("precondition: keep_both name = %q", taken)
	}
	// Someone renames the other Recipe to that name (different case and spacing) meanwhile.
	if _, err := f.db.Exec(`UPDATE recipes SET name = ? WHERE id = ?`, strings.ToUpper(taken), res.Recipes[1].ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.Apply(ctx, c); !errors.Is(err, store.ErrStale) {
		t.Fatalf("got %v, want ErrStale", err)
	}
	if n := f.count(t, "recipes"); n != 2 {
		t.Fatalf("%d recipes, want 2", n)
	}
}

func TestApplyReplaceDoesNotCountTheRecipeBeingReplacedAsANameClash(t *testing.T) {
	f := newFixture(t)
	_, ex := f.firstApply(t)
	res, err := f.s.Apply(ctx, exampleCommit(t, ex, replaceBoth(), recipefile.ImageSet{}))
	if err != nil || len(res.Recipes) != 2 || f.count(t, "recipes") != 2 {
		t.Fatalf("replace both: %v %+v recipes=%d", err, res, f.count(t, "recipes"))
	}
}

// A Recipe is validated again against the Ingredients as they are inside the
// transaction. If it no longer passes (a Unit Conversion it needs was removed
// since the review) the answer is ErrStale (409 import_stale), not a generic
// error, and nothing is written.
func TestApplyRefusesARecipeThatNoLongerValidates(t *testing.T) {
	f := newFixture(t)
	_, ex := f.firstApply(t)
	c := exampleCommit(t, ex, replaceBoth(), recipefile.ImageSet{})
	if _, err := f.db.Exec(`DELETE FROM ingredient_conversions`); err != nil {
		t.Fatal(err)
	}
	var names []string
	rows, _ := f.db.Query(`SELECT name FROM recipes ORDER BY id`)
	for rows.Next() {
		var n string
		rows.Scan(&n)
		names = append(names, n)
	}
	rows.Close()
	_, err := f.s.Apply(ctx, c)
	if !errors.Is(err, store.ErrStale) {
		t.Fatalf("got %v, want ErrStale", err)
	}
	var again []string
	rows, _ = f.db.Query(`SELECT name FROM recipes ORDER BY id`)
	for rows.Next() {
		var n string
		rows.Scan(&n)
		again = append(again, n)
	}
	rows.Close()
	if strings.Join(names, "|") != strings.Join(again, "|") || f.imageFiles(t) != 0 {
		t.Fatalf("recipes %v -> %v, image files %d: nothing may change", names, again, f.imageFiles(t))
	}
}
