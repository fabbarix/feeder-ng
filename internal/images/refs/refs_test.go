package refs_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/images/refs"
)

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

func exec(t *testing.T, d *sql.DB, q string, args ...any) {
	t.Helper()
	if _, err := d.Exec(q, args...); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
}

func TestReferencedIDsCollectsEveryColumnAndSkipsEmpty(t *testing.T) {
	d := openDB(t)
	exec(t, d, `CREATE TABLE a (id INTEGER PRIMARY KEY, image TEXT NOT NULL DEFAULT '')`)
	exec(t, d, `CREATE TABLE b (id INTEGER PRIMARY KEY, photo TEXT)`)
	exec(t, d, `INSERT INTO a (image) VALUES ('aaaa'), (''), ('cccc')`)
	exec(t, d, `INSERT INTO b (photo) VALUES ('bbbb'), (NULL), ('cccc')`)
	got, err := refs.New(d, refs.Column{Table: "a", Column: "image"}, refs.Column{Table: "b", Column: "photo"}).ReferencedIDs(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || !got["aaaa"] || !got["bbbb"] || !got["cccc"] || got[""] {
		t.Errorf("ids = %v, want aaaa bbbb cccc", got)
	}
}

// A missing table or column is a failure, never "nothing referenced": the sweep would delete every photo.
func TestReferencedIDsFailsClosed(t *testing.T) {
	d := openDB(t)
	exec(t, d, `CREATE TABLE a (id INTEGER PRIMARY KEY, image TEXT NOT NULL DEFAULT '')`)
	for _, c := range []refs.Column{{"nope", "image"}, {"a", "nope"}} {
		if _, err := refs.New(d, refs.Column{Table: "a", Column: "image"}, c).ReferencedIDs(context.Background()); err == nil {
			t.Errorf("%+v: want an error", c)
		}
	}
}

func TestReferencedIDsRefusesUnsafeIdentifiers(t *testing.T) {
	d := openDB(t)
	exec(t, d, `CREATE TABLE a (id INTEGER PRIMARY KEY, image TEXT)`)
	for _, c := range []refs.Column{{"a; DROP TABLE a", "image"}, {"a", "image FROM a--"}, {"", "image"}, {"a", ""}, {"A", "image"}, {"a b", "image"}} {
		if _, err := refs.New(d, c).ReferencedIDs(context.Background()); err == nil {
			t.Errorf("%+v: want an error", c)
		}
	}
	var n int
	if err := d.QueryRow(`SELECT count(*) FROM a`).Scan(&n); err != nil {
		t.Errorf("table a must still exist: %v", err)
	}
}

// Default must name columns that exist in the real schema, and must include the Recipe and Step photos.
func TestDefaultColumnsExistInTheRealSchema(t *testing.T) {
	d := openDB(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	have := map[refs.Column]bool{}
	for _, c := range refs.Default {
		have[c] = true
	}
	for _, want := range []refs.Column{{"recipes", "image"}, {"recipe_steps", "image"}} {
		if !have[want] {
			t.Errorf("refs.Default lacks %+v", want)
		}
	}
	if _, err := refs.New(d).ReferencedIDs(context.Background()); err != nil {
		t.Errorf("Default columns against the migrated schema: %v", err)
	}
	exec(t, d, `INSERT INTO recipes (name, yield, image, created_at, updated_at) VALUES ('Soup', 2, 'deadbeefdeadbeefdeadbeefdeadbeef', 'x', 'x')`)
	got, err := refs.New(d).ReferencedIDs(context.Background())
	if err != nil || !got["deadbeefdeadbeefdeadbeefdeadbeef"] {
		t.Errorf("ids = %v, err = %v; a Recipe photo must be referenced", got, err)
	}
}

// IM2: an Ingredient picture and a Member photo are image ids too. If either column is missing from Default, the nightly sweep
// deletes the picture 24 hours after it was saved.
func TestDefaultKeepsIngredientPicturesAndMemberPhotos(t *testing.T) {
	d := openDB(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	have := map[refs.Column]bool{}
	for _, c := range refs.Default {
		have[c] = true
	}
	for _, want := range []refs.Column{{"ingredients", "image"}, {"members", "photo"}} {
		if !have[want] {
			t.Errorf("refs.Default lacks %+v", want)
		}
	}
	const pic, face = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	exec(t, d, `INSERT INTO ingredients (name, name_key, base_unit, image, created_at, updated_at) VALUES ('Flour', 'flour', 'g', ?, 'x', 'x')`, pic)
	exec(t, d, `INSERT INTO members (name, colour, photo, portion_factor, created_at) VALUES ('Sam', '#3366cc', ?, 1, 'x')`, face)
	got, err := refs.New(d).ReferencedIDs(context.Background())
	if err != nil || !got[pic] || !got[face] {
		t.Errorf("ids = %v, err = %v; an Ingredient picture and a Member photo must be referenced", got, err)
	}
}
