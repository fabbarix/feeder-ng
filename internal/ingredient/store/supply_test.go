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

// Supplies in the Ingredient store (ADR 0017, docs/dev/design/household-items.md §3, §4.8, §5, §8): the kind and the
// Restock level round-trip, ?kind= filtering, the kind-change guard (409 kind_in_use with reasons), the merge guard and
// the Shelf Life and Lot go-off clearing. Red until the store has them.
//
// The kind-change guard reads the references through the registered movers, by the names the recipe store gives them
// ("recipe lines", "ingredient exclusions", store.BaseRecipeRefName) or through the Base recipe port; a Ready Meal's
// Ingredient is one of its Recipe's lines, so it is the "recipe lines" reason.

// namedRef is a ReferenceMover over its own test table, named like the real mover it stands in for.
type namedRef struct{ name, table string }

func (n namedRef) Name() string { return n.name }
func (n namedRef) Count(ctx context.Context, q store.Querier, id int64) (int, error) {
	var c int
	err := q.QueryRowContext(ctx, `SELECT count(*) FROM `+n.table+` WHERE ingredient_id=?`, id).Scan(&c)
	return c, err
}
func (n namedRef) Move(ctx context.Context, tx *sql.Tx, from, to int64) error {
	_, err := tx.ExecContext(ctx, `UPDATE `+n.table+` SET ingredient_id=? WHERE ingredient_id=?`, to, from)
	return err
}

type supplyFixture struct {
	*fixture
	base *fakeBase
}

func newSupplyFixture(t *testing.T) *supplyFixture {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	movers := store.NewMovers()
	for _, m := range []namedRef{
		{"fake refs", "fake_refs"},
		{"recipe lines", "fake_lines"},
		{"ingredient exclusions", "fake_exclusions"},
		{store.BaseRecipeRefName, "fake_bases"},
	} {
		if _, err := d.Exec(`CREATE TABLE ` + m.table + ` (id INTEGER PRIMARY KEY, ingredient_id INTEGER NOT NULL REFERENCES ingredients(id))`); err != nil {
			t.Fatal(err)
		}
		movers.Register(m)
	}
	clk := clock.NewFake(time.Date(2026, 11, 13, 12, 0, 0, 0, time.UTC))
	port := &fakeBase{of: map[int64]*store.BaseRecipeRef{}}
	return &supplyFixture{
		fixture: &fixture{db: d, store: store.New(d, clk, store.WithMovers(movers), store.WithBaseRecipes(port)), clk: clk, refs: &fakeRefs{name: "fake refs"}},
		base:    port,
	}
}

func (f *supplyFixture) supply(t *testing.T, name string, base units.Base, level *float64) ingredient.Ingredient {
	t.Helper()
	return f.create(t, ingredient.Input{Name: name, Base: base, Kind: ingredient.KindSupply, RestockLevel: level})
}

func (f *supplyFixture) insertRef(t *testing.T, table string, id int64) {
	t.Helper()
	if _, err := f.db.Exec(`INSERT INTO `+table+`(ingredient_id) VALUES (?)`, id); err != nil {
		t.Fatal(err)
	}
}

func kindPatch(k ingredient.Kind) store.Patch { return store.Patch{Kind: &k} }

func levelPatch(l *float64) store.Patch {
	return store.Patch{RestockLevel: &store.RestockLevelPatch{Level: l}}
}

func reasonsOf(t *testing.T, err error) []string {
	t.Helper()
	var ke *store.KindInUseError
	if !errors.Is(err, store.ErrKindInUse) || !errors.As(err, &ke) {
		t.Fatalf("err = %v, want a *store.KindInUseError matching ErrKindInUse", err)
	}
	return ke.Reasons
}

func TestASupplyRoundTrips(t *testing.T) {
	f := newSupplyFixture(t)
	got := f.supply(t, "Toilet paper", units.Piece, fp(9))
	if got.Kind != ingredient.KindSupply || got.RestockLevel == nil || *got.RestockLevel != 9 || got.ShelfLifeDays != nil {
		t.Fatalf("created = %+v", got)
	}
	back, err := f.store.Get(ctx, got.ID)
	if err != nil || !reflect.DeepEqual(back, got) {
		t.Errorf("Get = %+v, %v; want %+v", back, err, got)
	}
	var kind string
	var level sql.NullFloat64
	if err := f.db.QueryRow(`SELECT kind, restock_level FROM ingredients WHERE id = ?`, got.ID).Scan(&kind, &level); err != nil || kind != "supply" || level.Float64 != 9 {
		t.Errorf("row = %q %v, %v; want supply 9", kind, level, err)
	}
}

func TestFoodIsTheDefaultKindAndHasNoRestockLevel(t *testing.T) {
	f := newSupplyFixture(t)
	got := f.create(t, ingredient.Input{Name: "milk", Base: units.Millilitre})
	if got.Kind != ingredient.KindFood || got.RestockLevel != nil {
		t.Errorf("created = %+v, want kind food and no Restock level", got)
	}
}

func TestCreateRefusesWhatAnIngredientMayNotHave(t *testing.T) {
	f := newSupplyFixture(t)
	_, err := f.store.Create(ctx, ingredient.Input{Name: "rice", Base: units.Gram, RestockLevel: fp(500)})
	var ve *ingredient.ValidationError
	if !errors.As(err, &ve) || ve.Reason != ingredient.ReasonRestockOnFood {
		t.Errorf("food with a Restock level: %v, want reason %s", err, ingredient.ReasonRestockOnFood)
	}
	_, err = f.store.Create(ctx, ingredient.Input{Name: "soap", Base: units.Piece, Kind: ingredient.KindSupply, ShelfLifeDays: intp(30)})
	if !errors.As(err, &ve) || ve.Reason != ingredient.ReasonSupplyShelfLife {
		t.Errorf("Supply with a Shelf Life: %v, want reason %s", err, ingredient.ReasonSupplyShelfLife)
	}
	if list, _ := f.store.List(ctx); len(list) != 0 {
		t.Errorf("a refused create left %d rows", len(list))
	}
}

func TestNamesAreUniqueAcrossKinds(t *testing.T) {
	f := newSupplyFixture(t)
	f.create(t, ingredient.Input{Name: "Vinegar", Base: units.Millilitre})
	if _, err := f.store.Create(ctx, ingredient.Input{Name: " vinegar ", Base: units.Millilitre, Kind: ingredient.KindSupply}); !errors.Is(err, store.ErrNameTaken) {
		t.Errorf("a Supply named like a food Ingredient: %v, want ErrNameTaken", err)
	}
	f.supply(t, "Dish soap", units.Millilitre, nil)
	if _, err := f.store.Create(ctx, ingredient.Input{Name: "DISH SOAP", Base: units.Millilitre}); !errors.Is(err, store.ErrNameTaken) {
		t.Errorf("a food Ingredient named like a Supply: %v, want ErrNameTaken", err)
	}
}

func TestListByKind(t *testing.T) {
	f := newSupplyFixture(t)
	f.create(t, ingredient.Input{Name: "milk", Base: units.Millilitre})
	f.supply(t, "bin bags", units.Piece, nil)
	f.create(t, ingredient.Input{Name: "apple", Base: units.Piece})
	f.supply(t, "AA batteries", units.Piece, fp(4))
	names := func(kind ingredient.Kind) []string {
		list, err := f.store.ListByKind(ctx, kind)
		if err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, i := range list {
			out = append(out, i.Name)
		}
		return out
	}
	if got, want := names(ingredient.KindFood), []string{"apple", "milk"}; !reflect.DeepEqual(got, want) {
		t.Errorf("food = %v, want %v", got, want)
	}
	if got, want := names(ingredient.KindSupply), []string{"AA batteries", "bin bags"}; !reflect.DeepEqual(got, want) {
		t.Errorf("supply = %v, want %v", got, want)
	}
	if got, want := names(""), []string{"AA batteries", "apple", "bin bags", "milk"}; !reflect.DeepEqual(got, want) {
		t.Errorf("both = %v, want %v (an empty kind is every kind)", got, want)
	}
	// List is unchanged: every Ingredient, with its kind.
	all, _ := f.store.List(ctx)
	if len(all) != 4 || all[0].Kind != ingredient.KindSupply || all[1].Kind != ingredient.KindFood {
		t.Errorf("List = %+v, want all four with their kinds", all)
	}
}

func TestSearchKindFiltersExactAndSuggestions(t *testing.T) {
	f := newSupplyFixture(t)
	f.create(t, ingredient.Input{Name: "tomato", Base: units.Piece})
	f.supply(t, "tomato cleaner", units.Millilitre, nil)
	r, err := f.store.SearchKind(ctx, "tomato cleaner", 5, ingredient.KindFood)
	if err != nil || r.Exact != nil {
		t.Fatalf("food search for a Supply's name: exact = %+v, %v; want none", r.Exact, err)
	}
	for _, s := range r.Suggestions {
		if s.Ingredient.Kind != ingredient.KindFood {
			t.Errorf("food search suggested %+v", s.Ingredient)
		}
	}
	r, err = f.store.SearchKind(ctx, "Tomato Cleaner", 5, ingredient.KindSupply)
	if err != nil || r.Exact == nil || r.Exact.Name != "tomato cleaner" {
		t.Errorf("supply search: exact = %+v, %v", r.Exact, err)
	}
	r, err = f.store.SearchKind(ctx, "tomato cleaner", 5, "")
	if err != nil || r.Exact == nil {
		t.Errorf("an empty kind searches both: exact = %+v, %v", r.Exact, err)
	}
	// Search keeps searching both kinds (New Ingredient's "Did you mean").
	if r, err := f.store.Search(ctx, "tomato cleaner", 5); err != nil || r.Exact == nil {
		t.Errorf("Search = %+v, %v; want the Supply found", r.Exact, err)
	}
}

func TestRestockLevelPatch(t *testing.T) {
	f := newSupplyFixture(t)
	s := f.supply(t, "toilet paper", units.Piece, nil)
	got, err := f.store.Update(ctx, s.ID, levelPatch(fp(12)))
	if err != nil || got.RestockLevel == nil || *got.RestockLevel != 12 {
		t.Fatalf("set = %+v, %v", got, err)
	}
	// Absent = unchanged.
	name := "Toilet paper"
	got, err = f.store.Update(ctx, s.ID, store.Patch{Name: &name})
	if err != nil || got.RestockLevel == nil || *got.RestockLevel != 12 {
		t.Errorf("rename = %+v, %v; want the level kept", got, err)
	}
	// &nil = clear.
	got, err = f.store.Update(ctx, s.ID, levelPatch(nil))
	if err != nil || got.RestockLevel != nil {
		t.Errorf("clear = %+v, %v", got, err)
	}
	// Not positive.
	for _, bad := range []float64{0, -3} {
		if _, err := f.store.Update(ctx, s.ID, levelPatch(fp(bad))); !errors.Is(err, ingredient.ErrInvalid) {
			t.Errorf("level %v = %v, want ErrInvalid", bad, err)
		}
	}
}

func TestRestockLevelOnFoodIsRefusedAndShelfLifeOnASupplyIsRefused(t *testing.T) {
	f := newSupplyFixture(t)
	food := f.create(t, ingredient.Input{Name: "rice", Base: units.Gram})
	_, err := f.store.Update(ctx, food.ID, levelPatch(fp(500)))
	var ve *ingredient.ValidationError
	if !errors.As(err, &ve) || ve.Reason != ingredient.ReasonRestockOnFood {
		t.Errorf("Restock level on food: %v, want reason %s", err, ingredient.ReasonRestockOnFood)
	}
	s := f.supply(t, "soap", units.Piece, nil)
	for name, p := range map[string]store.Patch{
		"shelf life":        {ShelfLife: &store.ShelfLifePatch{Days: intp(30)}},
		"frozen shelf life": {FrozenShelfLife: &store.ShelfLifePatch{Days: intp(30)}},
	} {
		if _, err := f.store.Update(ctx, s.ID, p); !errors.As(err, &ve) || ve.Reason != ingredient.ReasonSupplyShelfLife {
			t.Errorf("%s on a Supply: %v, want reason %s", name, err, ingredient.ReasonSupplyShelfLife)
		}
	}
	// Clearing a Shelf Life that a Supply does not have is harmless.
	if _, err := f.store.Update(ctx, s.ID, store.Patch{ShelfLife: &store.ShelfLifePatch{Days: nil}}); err != nil {
		t.Errorf("clearing the Shelf Life of a Supply: %v", err)
	}
	// Changing kind and setting the other side's field in one patch is judged on the result.
	sup := ingredient.KindSupply
	if _, err := f.store.Update(ctx, food.ID, store.Patch{Kind: &sup, ShelfLife: &store.ShelfLifePatch{Days: intp(9)}}); !errors.As(err, &ve) || ve.Reason != ingredient.ReasonSupplyShelfLife {
		t.Errorf("to supply with a Shelf Life in the same patch: %v, want reason %s", err, ingredient.ReasonSupplyShelfLife)
	}
	foodKind := ingredient.KindFood
	if _, err := f.store.Update(ctx, s.ID, store.Patch{Kind: &foodKind, RestockLevel: &store.RestockLevelPatch{Level: fp(4)}}); !errors.As(err, &ve) || ve.Reason != ingredient.ReasonRestockOnFood {
		t.Errorf("to food with a Restock level in the same patch: %v, want reason %s", err, ingredient.ReasonRestockOnFood)
	}
	if got, _ := f.store.Get(ctx, s.ID); got.Kind != ingredient.KindSupply {
		t.Errorf("a refused patch changed the kind to %q", got.Kind)
	}
}

func TestKindChangeToSupplyClearsShelfLifeAndLotGoOffs(t *testing.T) {
	f := newSupplyFixture(t)
	i := f.create(t, ingredient.Input{Name: "Toilet paper", Base: units.Piece, ShelfLifeDays: intp(365), FrozenShelfLifeDays: intp(400)})
	other := f.create(t, ingredient.Input{Name: "milk", Base: units.Millilitre, ShelfLifeDays: intp(5)})
	for _, id := range []int64{i.ID, i.ID, other.ID} {
		if _, err := f.db.Exec(`INSERT INTO stock_lots(ingredient_id,quantity,purchased,goes_off,source,created_at) VALUES (?,9,'2026-11-01','2026-11-06','manual','2026-11-01T10:00:00Z')`, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.db.Exec(`INSERT INTO stock_waste(ingredient_id,quantity,wasted_on,reason,created_at) VALUES (?,1,'2026-10-01','spoiled','2026-10-01T10:00:00Z')`, i.ID); err != nil {
		t.Fatal(err)
	}
	got, err := f.store.Update(ctx, i.ID, kindPatch(ingredient.KindSupply))
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if got.Kind != ingredient.KindSupply || got.ShelfLifeDays != nil || got.FrozenShelfLifeDays != nil {
		t.Errorf("after = %+v, want a Supply without Shelf Life or Frozen Shelf Life", got)
	}
	var withGoOff int
	f.db.QueryRow(`SELECT count(*) FROM stock_lots WHERE ingredient_id = ? AND goes_off IS NOT NULL`, i.ID).Scan(&withGoOff)
	if withGoOff != 0 {
		t.Errorf("%d Lots of the Supply still have a go-off date, want none", withGoOff)
	}
	f.db.QueryRow(`SELECT count(*) FROM stock_lots WHERE ingredient_id = ? AND goes_off IS NOT NULL`, other.ID).Scan(&withGoOff)
	if withGoOff != 1 {
		t.Errorf("another Ingredient's Lot lost its go-off date")
	}
	var waste int
	f.db.QueryRow(`SELECT count(*) FROM stock_waste WHERE ingredient_id = ?`, i.ID).Scan(&waste)
	if waste != 1 {
		t.Errorf("waste history = %d rows, want it kept", waste)
	}
}

func TestKindChangeToSupplyIsRefusedWhileFoodOnlyThingsUseIt(t *testing.T) {
	cases := []struct {
		name  string
		setup func(*testing.T, *supplyFixture, int64)
		want  []string
	}{
		{"on a Recipe line (a Ready Meal's Ingredient is one)", func(t *testing.T, f *supplyFixture, id int64) { f.insertRef(t, "fake_lines", id) }, []string{store.KindReasonRecipeLines}},
		{"excluded by a Member", func(t *testing.T, f *supplyFixture, id int64) { f.insertRef(t, "fake_exclusions", id) }, []string{store.KindReasonExclusions}},
		{"a Base recipe's Ingredient", func(t *testing.T, f *supplyFixture, id int64) {
			f.insertRef(t, "fake_bases", id)
			f.base.of[id] = &store.BaseRecipeRef{ID: 3, Name: "Béchamel"}
		}, []string{store.KindReasonBaseRecipe}},
		{"all three", func(t *testing.T, f *supplyFixture, id int64) {
			f.insertRef(t, "fake_lines", id)
			f.insertRef(t, "fake_exclusions", id)
			f.insertRef(t, "fake_bases", id)
			f.base.of[id] = &store.BaseRecipeRef{ID: 3, Name: "Béchamel"}
		}, []string{store.KindReasonRecipeLines, store.KindReasonExclusions, store.KindReasonBaseRecipe}},
	}
	if store.KindReasonRecipeLines != "recipe_lines" || store.KindReasonExclusions != "exclusions" || store.KindReasonBaseRecipe != "base_recipe" {
		t.Fatalf("reason codes = %q, %q, %q; want recipe_lines, exclusions, base_recipe", store.KindReasonRecipeLines, store.KindReasonExclusions, store.KindReasonBaseRecipe)
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := newSupplyFixture(t)
			i := f.create(t, ingredient.Input{Name: "vinegar", Base: units.Millilitre, ShelfLifeDays: intp(700)})
			c.setup(t, f, i.ID)
			_, err := f.store.Update(ctx, i.ID, kindPatch(ingredient.KindSupply))
			if got := reasonsOf(t, err); !reflect.DeepEqual(got, c.want) {
				t.Errorf("reasons = %v, want %v (in this order)", got, c.want)
			}
			if after, _ := f.store.Get(ctx, i.ID); after.Kind != ingredient.KindFood || after.ShelfLifeDays == nil {
				t.Errorf("a refused change altered the Ingredient: %+v", after)
			}
		})
	}
}

func TestKindChangeIsNotRefusedByStockProductsOrTheShoppingList(t *testing.T) {
	f := newSupplyFixture(t)
	i := f.create(t, ingredient.Input{Name: "dish soap", Base: units.Millilitre})
	f.ref(t, i.ID, 3) // some other feature's references (products, stock lots, shopping list...)
	got, err := f.store.Update(ctx, i.ID, kindPatch(ingredient.KindSupply))
	if err != nil || got.Kind != ingredient.KindSupply {
		t.Fatalf("Update = %+v, %v; want it allowed", got, err)
	}
	if n := f.refCount(t, i.ID); n != 3 {
		t.Errorf("references = %d, want 3 kept", n)
	}
}

func TestKindChangeToFoodIsAlwaysAllowedAndClearsTheRestockLevel(t *testing.T) {
	f := newSupplyFixture(t)
	s := f.supply(t, "vinegar", units.Millilitre, fp(500))
	f.ref(t, s.ID, 2)
	got, err := f.store.Update(ctx, s.ID, kindPatch(ingredient.KindFood))
	if err != nil || got.Kind != ingredient.KindFood || got.RestockLevel != nil {
		t.Fatalf("to food = %+v, %v; want food with the Restock level cleared", got, err)
	}
	var level sql.NullFloat64
	f.db.QueryRow(`SELECT restock_level FROM ingredients WHERE id = ?`, s.ID).Scan(&level)
	if level.Valid {
		t.Error("restock_level is still stored after the change to food")
	}
}

func TestSettingTheKindItAlreadyHasIsANoOp(t *testing.T) {
	f := newSupplyFixture(t)
	i := f.create(t, ingredient.Input{Name: "vinegar", Base: units.Millilitre, ShelfLifeDays: intp(700)})
	f.insertRef(t, "fake_lines", i.ID) // would refuse a change to supply
	got, err := f.store.Update(ctx, i.ID, kindPatch(ingredient.KindFood))
	if err != nil || got.ShelfLifeDays == nil {
		t.Errorf("food to food = %+v, %v; want unchanged and no error", got, err)
	}
	s := f.supply(t, "soap", units.Piece, fp(3))
	got, err = f.store.Update(ctx, s.ID, kindPatch(ingredient.KindSupply))
	if err != nil || got.RestockLevel == nil || *got.RestockLevel != 3 {
		t.Errorf("supply to supply = %+v, %v; want the level kept", got, err)
	}
}

func TestMergePreviewBlocksAcrossKinds(t *testing.T) {
	f := newSupplyFixture(t)
	food := f.create(t, ingredient.Input{Name: "vinegar", Base: units.Millilitre})
	supply := f.supply(t, "descaler", units.Millilitre, nil)
	for name, ids := range map[string][2]int64{"supply into food": {supply.ID, food.ID}, "food into supply": {food.ID, supply.ID}} {
		p, err := f.store.MergePreview(ctx, ids[0], ids[1])
		if err != nil || !p.Plan.KindMismatch {
			t.Errorf("%s: preview = %+v, %v; want KindMismatch", name, p.Plan, err)
		}
	}
}

func TestMergeAcrossKindsIsRefusedAndChangesNothing(t *testing.T) {
	f := newSupplyFixture(t)
	food := f.create(t, ingredient.Input{Name: "vinegar", Base: units.Millilitre})
	supply := f.supply(t, "descaler", units.Millilitre, nil)
	f.ref(t, supply.ID, 2)
	if _, err := f.store.Merge(ctx, supply.ID, food.ID, ingredient.Resolution{}); !errors.Is(err, ingredient.ErrKindDiffers) {
		t.Fatalf("Merge = %v, want ingredient.ErrKindDiffers", err)
	}
	if _, err := f.store.Get(ctx, supply.ID); err != nil {
		t.Errorf("the source is gone after a refused merge: %v", err)
	}
	if f.refCount(t, supply.ID) != 2 || f.refCount(t, food.ID) != 0 {
		t.Error("a refused merge moved references")
	}
}

func TestTwoSuppliesMergeAndKeepTheTargetsRestockLevel(t *testing.T) {
	f := newSupplyFixture(t)
	src := f.supply(t, "loo roll", units.Piece, fp(4))
	dst := f.supply(t, "toilet paper", units.Piece, fp(9))
	f.ref(t, src.ID, 2)
	got, err := f.store.Merge(ctx, src.ID, dst.ID, ingredient.Resolution{})
	if err != nil || got.ID != dst.ID || got.Kind != ingredient.KindSupply || got.RestockLevel == nil || *got.RestockLevel != 9 {
		t.Fatalf("Merge = %+v, %v; want the target, still a Supply with its own level", got, err)
	}
	if f.refCount(t, dst.ID) != 2 {
		t.Error("references did not move")
	}
	if _, err := f.store.Get(ctx, src.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("the source still exists: %v", err)
	}
}
