package store_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var ctx = context.Background()

func intp(n int) *int { return &n }

// fakeRefs is a ReferenceMover over a test-only table, standing in for recipe lines etc.
type fakeRefs struct {
	name    string
	failOn  bool
	guarded map[string]bool // units that UnitInUse reports
}

func (f *fakeRefs) Name() string { return f.name }
func (f *fakeRefs) Count(ctx context.Context, q store.Querier, id int64) (int, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT count(*) FROM fake_refs WHERE ingredient_id=?`, id).Scan(&n)
	return n, err
}
func (f *fakeRefs) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	if f.failOn {
		return errors.New("boom")
	}
	_, err := tx.ExecContext(ctx, `UPDATE fake_refs SET ingredient_id=? WHERE ingredient_id=?`, to, from)
	return err
}
func (f *fakeRefs) UnitInUse(ctx context.Context, q store.Querier, id int64, unit string) (bool, error) {
	return f.guarded[unit], nil
}

type fixture struct {
	db    *sql.DB
	store *store.Store
	clk   *clock.Fake
	refs  *fakeRefs
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
	if _, err := d.Exec(`CREATE TABLE fake_refs (id INTEGER PRIMARY KEY, ingredient_id INTEGER NOT NULL REFERENCES ingredients(id))`); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	refs := &fakeRefs{name: "fake refs", guarded: map[string]bool{}}
	movers := store.NewMovers()
	movers.Register(refs)
	return &fixture{db: d, store: store.New(d, clk, store.WithMovers(movers)), clk: clk, refs: refs}
}

func (f *fixture) ref(t *testing.T, id int64, n int) {
	t.Helper()
	for i := 0; i < n; i++ {
		if _, err := f.db.Exec(`INSERT INTO fake_refs(ingredient_id) VALUES (?)`, id); err != nil {
			t.Fatal(err)
		}
	}
}

func (f *fixture) refCount(t *testing.T, id int64) int {
	t.Helper()
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM fake_refs WHERE ingredient_id=?`, id).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func (f *fixture) create(t *testing.T, in ingredient.Input) ingredient.Ingredient {
	t.Helper()
	i, err := f.store.Create(ctx, in)
	if err != nil {
		t.Fatalf("Create(%q): %v", in.Name, err)
	}
	return i
}

func TestCreateAndGet(t *testing.T) {
	f := newFixture(t)
	got := f.create(t, ingredient.Input{Name: " Garlic ", Base: units.Gram, ShelfLifeDays: intp(30),
		Conversions: []units.Conversion{{Unit: "Clove", ToBase: 5}}})
	if got.ID == 0 || got.Name != "Garlic" || got.Base != units.Gram || *got.ShelfLifeDays != 30 {
		t.Fatalf("created = %+v", got)
	}
	back, err := f.store.Get(ctx, got.ID)
	if err != nil || !reflect.DeepEqual(back, got) {
		t.Errorf("Get = %+v, %v; want %+v", back, err, got)
	}
	if !reflect.DeepEqual(back.Conversions, []units.Conversion{{Unit: "clove", ToBase: 5}}) {
		t.Errorf("Conversions = %+v", back.Conversions)
	}
	if _, err := f.store.Get(ctx, 9999); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get missing = %v, want ErrNotFound", err)
	}
	var created string
	if err := f.db.QueryRow(`SELECT created_at FROM ingredients WHERE id=?`, got.ID).Scan(&created); err != nil || created != "2026-11-09T12:00:00Z" {
		t.Errorf("created_at = %q, %v", created, err)
	}
}

func TestCreateRejectsInvalidAndDuplicateNames(t *testing.T) {
	f := newFixture(t)
	if _, err := f.store.Create(ctx, ingredient.Input{Name: "", Base: units.Gram}); !errors.Is(err, ingredient.ErrInvalid) {
		t.Errorf("empty name: %v, want ErrInvalid", err)
	}
	f.create(t, ingredient.Input{Name: "Red Onion", Base: units.Piece})
	for _, name := range []string{"red onion", "  RED   ONION "} {
		if _, err := f.store.Create(ctx, ingredient.Input{Name: name, Base: units.Gram}); !errors.Is(err, store.ErrNameTaken) {
			t.Errorf("Create(%q) = %v, want ErrNameTaken", name, err)
		}
	}
}

func TestByNameAndListOrder(t *testing.T) {
	f := newFixture(t)
	f.create(t, ingredient.Input{Name: "Zucchini", Base: units.Piece})
	f.create(t, ingredient.Input{Name: "apple", Base: units.Piece})
	f.create(t, ingredient.Input{Name: "Milk", Base: units.Millilitre})
	list, err := f.store.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, i := range list {
		names = append(names, i.Name)
	}
	if want := []string{"apple", "Milk", "Zucchini"}; !reflect.DeepEqual(names, want) {
		t.Errorf("List order = %v, want %v", names, want)
	}
	if got, err := f.store.ByName(ctx, " MILK"); err != nil || got.Name != "Milk" {
		t.Errorf("ByName = %+v, %v", got, err)
	}
	if _, err := f.store.ByName(ctx, "nothing"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("ByName missing = %v", err)
	}
}

func TestSearchResolvesFullIngredients(t *testing.T) {
	f := newFixture(t)
	f.create(t, ingredient.Input{Name: "tomato", Base: units.Piece})
	f.create(t, ingredient.Input{Name: "passata", Base: units.Millilitre, Conversions: []units.Conversion{{Unit: "jar", ToBase: 700}}})
	r, err := f.store.Search(ctx, "Passata", 5)
	if err != nil || r.Exact == nil || r.Exact.Name != "passata" || len(r.Exact.Conversions) != 1 {
		t.Fatalf("exact = %+v, %v", r.Exact, err)
	}
	r, err = f.store.Search(ctx, "tomatos", 5)
	if err != nil || r.Exact != nil || len(r.Suggestions) == 0 || r.Suggestions[0].Ingredient.Name != "tomato" || r.Suggestions[0].Score < ingredient.MinScore {
		t.Errorf("suggestions = %+v, %v", r.Suggestions, err)
	}
}

func TestRenameKeepsReferences(t *testing.T) {
	f := newFixture(t)
	i := f.create(t, ingredient.Input{Name: "scallion", Base: units.Gram})
	f.ref(t, i.ID, 2)
	name := "Spring Onion"
	got, err := f.store.Update(ctx, i.ID, store.Patch{Name: &name})
	if err != nil || got.ID != i.ID || got.Name != "Spring Onion" {
		t.Fatalf("rename = %+v, %v", got, err)
	}
	if n := f.refCount(t, i.ID); n != 2 {
		t.Errorf("references after rename = %d, want 2", n)
	}
	if _, err := f.store.ByName(ctx, "scallion"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("old name still resolves: %v", err)
	}
	if g, err := f.store.ByName(ctx, "spring onion"); err != nil || g.ID != i.ID {
		t.Errorf("new name lookup: %+v, %v", g, err)
	}
}

func TestRenameToDifferentSpellingOfOwnNameIsFine(t *testing.T) {
	f := newFixture(t)
	i := f.create(t, ingredient.Input{Name: "onion", Base: units.Piece})
	name := "Onion"
	if got, err := f.store.Update(ctx, i.ID, store.Patch{Name: &name}); err != nil || got.Name != "Onion" {
		t.Errorf("recase = %+v, %v", got, err)
	}
}

func TestRenameCollisionIsNameTaken(t *testing.T) {
	f := newFixture(t)
	f.create(t, ingredient.Input{Name: "onion", Base: units.Piece})
	b := f.create(t, ingredient.Input{Name: "shallot", Base: units.Piece})
	name := "Onion "
	if _, err := f.store.Update(ctx, b.ID, store.Patch{Name: &name}); !errors.Is(err, store.ErrNameTaken) {
		t.Errorf("err = %v, want ErrNameTaken", err)
	}
	missing := "x"
	if _, err := f.store.Update(ctx, 9999, store.Patch{Name: &missing}); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("update missing = %v", err)
	}
}

func TestShelfLifePatch(t *testing.T) {
	f := newFixture(t)
	i := f.create(t, ingredient.Input{Name: "milk", Base: units.Millilitre, ShelfLifeDays: intp(7)})
	got, _ := f.store.Update(ctx, i.ID, store.Patch{ShelfLife: &store.ShelfLifePatch{Days: intp(10)}})
	if *got.ShelfLifeDays != 10 {
		t.Errorf("set: %v", got.ShelfLifeDays)
	}
	got, _ = f.store.Update(ctx, i.ID, store.Patch{})
	if got.ShelfLifeDays == nil || *got.ShelfLifeDays != 10 {
		t.Errorf("empty patch must leave shelf life: %v", got.ShelfLifeDays)
	}
	got, err := f.store.Update(ctx, i.ID, store.Patch{ShelfLife: &store.ShelfLifePatch{}})
	if err != nil || got.ShelfLifeDays != nil {
		t.Errorf("clear: %v, %v", got.ShelfLifeDays, err)
	}
	if _, err := f.store.Update(ctx, i.ID, store.Patch{ShelfLife: &store.ShelfLifePatch{Days: intp(0)}}); !errors.Is(err, ingredient.ErrInvalid) {
		t.Errorf("zero days: %v", err)
	}
}

func TestBaseUnitChange(t *testing.T) {
	f := newFixture(t)
	i := f.create(t, ingredient.Input{Name: "egg", Base: units.Gram})
	piece := units.Piece
	got, err := f.store.Update(ctx, i.ID, store.Patch{Base: &piece})
	if err != nil || got.Base != units.Piece {
		t.Fatalf("unreferenced change: %+v, %v", got, err)
	}
	f.ref(t, i.ID, 1)
	g := units.Gram
	if _, err := f.store.Update(ctx, i.ID, store.Patch{Base: &g}); !errors.Is(err, store.ErrInUse) {
		t.Errorf("referenced change: %v, want ErrInUse", err)
	}
	same := units.Piece
	if _, err := f.store.Update(ctx, i.ID, store.Patch{Base: &same}); err != nil {
		t.Errorf("setting the same Base Unit while referenced is a no-op: %v", err)
	}
}

func TestBaseUnitChangeCannotCollideWithConversion(t *testing.T) {
	f := newFixture(t)
	i := f.create(t, ingredient.Input{Name: "x", Base: units.Gram, Conversions: []units.Conversion{{Unit: "ml", ToBase: 1}}})
	ml := units.Millilitre
	if _, err := f.store.Update(ctx, i.ID, store.Patch{Base: &ml}); !errors.Is(err, ingredient.ErrInvalid) {
		t.Errorf("err = %v, want ErrInvalid", err)
	}
}

func TestSetAndRemoveConversion(t *testing.T) {
	f := newFixture(t)
	i := f.create(t, ingredient.Input{Name: "garlic", Base: units.Gram})
	got, err := f.store.SetConversion(ctx, i.ID, units.Conversion{Unit: " Clove", ToBase: 5})
	if err != nil || !reflect.DeepEqual(got.Conversions, []units.Conversion{{Unit: "clove", ToBase: 5}}) {
		t.Fatalf("set: %+v, %v", got, err)
	}
	got, _ = f.store.SetConversion(ctx, i.ID, units.Conversion{Unit: "clove", ToBase: 6})
	if !reflect.DeepEqual(got.Conversions, []units.Conversion{{Unit: "clove", ToBase: 6}}) {
		t.Errorf("replace: %+v", got.Conversions)
	}
	if _, err := f.store.SetConversion(ctx, i.ID, units.Conversion{Unit: "g", ToBase: 2}); !errors.Is(err, ingredient.ErrInvalid) {
		t.Errorf("base unit conversion: %v", err)
	}
	got, err = f.store.RemoveConversion(ctx, i.ID, "CLOVE")
	if err != nil || len(got.Conversions) != 0 {
		t.Errorf("remove: %+v, %v", got, err)
	}
	if _, err := f.store.RemoveConversion(ctx, i.ID, "clove"); err != nil {
		t.Errorf("removing an absent conversion is idempotent: %v", err)
	}
}

func TestRemoveConversionVetoedByUnitGuard(t *testing.T) {
	f := newFixture(t)
	i := f.create(t, ingredient.Input{Name: "garlic", Base: units.Gram, Conversions: []units.Conversion{{Unit: "clove", ToBase: 5}}})
	f.refs.guarded["clove"] = true
	if _, err := f.store.RemoveConversion(ctx, i.ID, "clove"); !errors.Is(err, store.ErrInUse) {
		t.Fatalf("err = %v, want ErrInUse", err)
	}
	if got, _ := f.store.Get(ctx, i.ID); len(got.Conversions) != 1 {
		t.Error("the conversion must survive a veto")
	}
}

func TestDelete(t *testing.T) {
	f := newFixture(t)
	i := f.create(t, ingredient.Input{Name: "garlic", Base: units.Gram, Conversions: []units.Conversion{{Unit: "clove", ToBase: 5}}})
	f.ref(t, i.ID, 1)
	if err := f.store.Delete(ctx, i.ID); !errors.Is(err, store.ErrInUse) {
		t.Fatalf("referenced delete = %v, want ErrInUse", err)
	}
	f.db.Exec(`DELETE FROM fake_refs`)
	if err := f.store.Delete(ctx, i.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := f.store.Get(ctx, i.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("after delete: %v", err)
	}
	var n int
	f.db.QueryRow(`SELECT count(*) FROM ingredient_conversions`).Scan(&n)
	if n != 0 {
		t.Errorf("conversions left behind: %d", n)
	}
	if err := f.store.Delete(ctx, i.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("second delete = %v, want ErrNotFound", err)
	}
}

func TestReferencesReportsCountsPerMover(t *testing.T) {
	f := newFixture(t)
	i := f.create(t, ingredient.Input{Name: "garlic", Base: units.Gram})
	if r, _ := f.store.References(ctx, i.ID); len(r) != 0 {
		t.Errorf("no references: %v", r)
	}
	f.ref(t, i.ID, 3)
	if r, err := f.store.References(ctx, i.ID); err != nil || !reflect.DeepEqual(r, map[string]int{"fake refs": 3}) {
		t.Errorf("References = %v, %v", r, err)
	}
}

func TestMergeMovesReferencesAndCombines(t *testing.T) {
	f := newFixture(t)
	src := f.create(t, ingredient.Input{Name: "spring onion", Base: units.Gram, Conversions: []units.Conversion{{Unit: "bunch", ToBase: 80}}})
	dst := f.create(t, ingredient.Input{Name: "scallion", Base: units.Gram, ShelfLifeDays: intp(7), Conversions: []units.Conversion{{Unit: "stalk", ToBase: 15}}})
	f.ref(t, src.ID, 2)
	f.ref(t, dst.ID, 1)

	got, err := f.store.Merge(ctx, src.ID, dst.ID, ingredient.Resolution{})
	if err != nil {
		t.Fatalf("Merge: %v", err)
	}
	if got.ID != dst.ID || got.Name != "scallion" || *got.ShelfLifeDays != 7 {
		t.Errorf("merged = %+v", got)
	}
	want := []units.Conversion{{Unit: "bunch", ToBase: 80}, {Unit: "stalk", ToBase: 15}}
	if !reflect.DeepEqual(got.Conversions, want) {
		t.Errorf("Conversions = %+v, want %+v", got.Conversions, want)
	}
	if n := f.refCount(t, dst.ID); n != 3 {
		t.Errorf("target references = %d, want 3", n)
	}
	if _, err := f.store.Get(ctx, src.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("source must be gone: %v", err)
	}
}

func TestMergeConflictsMustBeResolvedAndNothingChangesUntilThen(t *testing.T) {
	f := newFixture(t)
	src := f.create(t, ingredient.Input{Name: "a", Base: units.Millilitre, ShelfLifeDays: intp(5), Conversions: []units.Conversion{{Unit: "jar", ToBase: 700}}})
	dst := f.create(t, ingredient.Input{Name: "b", Base: units.Millilitre, ShelfLifeDays: intp(9), Conversions: []units.Conversion{{Unit: "jar", ToBase: 680}}})
	f.ref(t, src.ID, 1)

	_, err := f.store.Merge(ctx, src.ID, dst.ID, ingredient.Resolution{})
	var ue *ingredient.UnresolvedError
	if !errors.As(err, &ue) || len(ue.Conflicts) != 2 {
		t.Fatalf("err = %v, want UnresolvedError with 2 conflicts", err)
	}
	if _, err := f.store.Get(ctx, src.ID); err != nil {
		t.Errorf("source must survive an unresolved merge: %v", err)
	}
	if n := f.refCount(t, src.ID); n != 1 {
		t.Errorf("source references = %d, want 1", n)
	}

	got, err := f.store.Merge(ctx, src.ID, dst.ID, ingredient.Resolution{
		Conversions: map[string]float64{"jar": 690}, ShelfLifeSet: true, ShelfLifeDays: intp(5)})
	if err != nil {
		t.Fatalf("resolved merge: %v", err)
	}
	if !reflect.DeepEqual(got.Conversions, []units.Conversion{{Unit: "jar", ToBase: 690}}) || *got.ShelfLifeDays != 5 {
		t.Errorf("merged = %+v", got)
	}
}

func TestMergeBaseMismatchAndSelf(t *testing.T) {
	f := newFixture(t)
	a := f.create(t, ingredient.Input{Name: "a", Base: units.Gram})
	b := f.create(t, ingredient.Input{Name: "b", Base: units.Millilitre})
	if _, err := f.store.Merge(ctx, a.ID, b.ID, ingredient.Resolution{}); !errors.Is(err, ingredient.ErrBaseMismatch) {
		t.Errorf("mismatch = %v", err)
	}
	if _, err := f.store.Merge(ctx, a.ID, a.ID, ingredient.Resolution{}); !errors.Is(err, store.ErrMergeSelf) {
		t.Errorf("self = %v", err)
	}
	if _, err := f.store.Merge(ctx, a.ID, 9999, ingredient.Resolution{}); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("missing target = %v", err)
	}
}

func TestMergeRollsBackWhenAMoverFails(t *testing.T) {
	f := newFixture(t)
	src := f.create(t, ingredient.Input{Name: "a", Base: units.Gram, Conversions: []units.Conversion{{Unit: "bunch", ToBase: 80}}})
	dst := f.create(t, ingredient.Input{Name: "b", Base: units.Gram})
	f.ref(t, src.ID, 2)
	f.refs.failOn = true
	if _, err := f.store.Merge(ctx, src.ID, dst.ID, ingredient.Resolution{}); err == nil {
		t.Fatal("want error")
	}
	if _, err := f.store.Get(ctx, src.ID); err != nil {
		t.Errorf("source must remain: %v", err)
	}
	if got, _ := f.store.Get(ctx, dst.ID); len(got.Conversions) != 0 {
		t.Errorf("target conversions must be rolled back: %+v", got.Conversions)
	}
	if n := f.refCount(t, src.ID); n != 2 {
		t.Errorf("source references = %d, want 2", n)
	}
}

func TestMergePreview(t *testing.T) {
	f := newFixture(t)
	src := f.create(t, ingredient.Input{Name: "a", Base: units.Gram, Conversions: []units.Conversion{{Unit: "cup", ToBase: 100}}})
	dst := f.create(t, ingredient.Input{Name: "b", Base: units.Gram, Conversions: []units.Conversion{{Unit: "cup", ToBase: 120}}})
	f.ref(t, src.ID, 4)
	p, err := f.store.MergePreview(ctx, src.ID, dst.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Plan.Conflicts) != 1 || p.Plan.Conflicts[0].Unit != "cup" {
		t.Errorf("conflicts = %+v", p.Plan.Conflicts)
	}
	if p.SourceReferences["fake refs"] != 4 || len(p.TargetReferences) != 0 || p.Source.ID != src.ID || p.Target.ID != dst.ID {
		t.Errorf("preview = %+v", p)
	}
	if _, err := f.store.Get(ctx, src.ID); err != nil {
		t.Error("a preview must not change anything")
	}
}

func TestMoversRegistry(t *testing.T) {
	m := store.NewMovers()
	m.Register(&fakeRefs{name: "zebra"})
	m.Register(&fakeRefs{name: "alpha"})
	var names []string
	for _, x := range m.All() {
		names = append(names, x.Name())
	}
	if !reflect.DeepEqual(names, []string{"alpha", "zebra"}) {
		t.Errorf("All = %v, want sorted", names)
	}
	for name, fn := range map[string]func(){
		"duplicate": func() { m.Register(&fakeRefs{name: "alpha"}) },
		"empty":     func() { m.Register(&fakeRefs{name: ""}) },
	} {
		func() {
			defer func() {
				if recover() == nil {
					t.Errorf("%s name should panic", name)
				}
			}()
			fn()
		}()
	}
}
