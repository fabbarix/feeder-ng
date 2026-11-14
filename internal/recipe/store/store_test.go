package store_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"reflect"
	"strconv"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/recipe/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// These tests need the migrations of T1 (members, 0100) and T2 (ingredients,
// 0200); they run once main contains both teams.

var ctx = context.Background()

func intp(n int) *int { return &n }

// ingredients is an IngredientSource over the ingredients tables, read with plain SQL.
type ingredients struct{ db *sql.DB }

func (s ingredients) Units(ctx context.Context, id int64) (units.Ingredient, bool, error) {
	var ing units.Ingredient
	var base string
	err := s.db.QueryRowContext(ctx, `SELECT name, base_unit FROM ingredients WHERE id=?`, id).Scan(&ing.Name, &base)
	if errors.Is(err, sql.ErrNoRows) {
		return ing, false, nil
	}
	if err != nil {
		return ing, false, err
	}
	ing.Base = units.Base(base)
	rows, err := s.db.QueryContext(ctx, `SELECT unit, to_base FROM ingredient_conversions WHERE ingredient_id=?`, id)
	if err != nil {
		return ing, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var c units.Conversion
		if err := rows.Scan(&c.Unit, &c.ToBase); err != nil {
			return ing, false, err
		}
		ing.Conversions = append(ing.Conversions, c)
	}
	return ing, true, rows.Err()
}

type fixture struct {
	db  *sql.DB
	s   *store.Store
	clk *clock.Fake
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
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	return &fixture{db: d, s: store.New(d, clk, ingredients{d}), clk: clk}
}

func (f *fixture) exec(t *testing.T, q string, args ...any) int64 {
	t.Helper()
	res, err := f.db.Exec(q, args...)
	if err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	id, _ := res.LastInsertId()
	return id
}

func (f *fixture) ingredient(t *testing.T, name string, base units.Base, conv ...units.Conversion) int64 {
	t.Helper()
	id := f.exec(t, `INSERT INTO ingredients(name, name_key, base_unit, created_at, updated_at) VALUES (?,?,?,?,?)`,
		name, units.NormalizeName(name), string(base), "2026-11-09T12:00:00Z", "2026-11-09T12:00:00Z")
	for _, c := range conv {
		f.exec(t, `INSERT INTO ingredient_conversions(ingredient_id, unit, to_base) VALUES (?,?,?)`, id, c.Unit, c.ToBase)
	}
	return id
}

func (f *fixture) member(t *testing.T, name string, userID int64) int64 {
	t.Helper()
	var uid any
	if userID != 0 {
		uid = userID
	}
	return f.exec(t, `INSERT INTO members(name, colour, avatar, portion_factor, user_id, created_at) VALUES (?,?,?,?,?,?)`,
		name, "#336699", "", 1.0, uid, "2026-11-09T12:00:00Z")
}

func (f *fixture) user(t *testing.T, email string) int64 {
	t.Helper()
	return f.exec(t, `INSERT INTO users(email, display_name, is_admin, created_at) VALUES (?,?,0,?)`, email, email, "2026-11-09T12:00:00Z")
}

func (f *fixture) count(t *testing.T, table string) int {
	t.Helper()
	var n int
	if err := f.db.QueryRow(`SELECT count(*) FROM ` + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

type ids struct{ flour, garlic, milk int64 }

func (f *fixture) basics(t *testing.T) ids {
	return ids{
		flour:  f.ingredient(t, "flour", units.Gram, units.Conversion{Unit: "cup", ToBase: 120}),
		garlic: f.ingredient(t, "garlic", units.Gram, units.Conversion{Unit: "clove", ToBase: 5}),
		milk:   f.ingredient(t, "milk", units.Millilitre),
	}
}

func specSteps(flour int64) []recipe.Step {
	return []recipe.Step{
		{Text: "Marinate", Kind: schedule.Advance, LeadTimeMinutes: 240},
		{Text: "Heat the oven", Kind: schedule.Active, DurationMinutes: 2},
		{Text: "Cut the veg", Kind: schedule.Active, DurationMinutes: 8, Uses: []recipe.Use{{IngredientID: flour, Quantity: 1, Unit: "cup"}}},
		{Text: "Roast", Kind: schedule.Passive, DurationMinutes: 25, After: []int{1, 2}},
		{Text: "Rice", Kind: schedule.Passive, DurationMinutes: 15},
		{Text: "Serve", Kind: schedule.Active, DurationMinutes: 5, After: []int{3, 4}},
	}
}

func pancakes(i ids) recipe.Input {
	return recipe.Input{
		Name: "Pancakes", Description: "Thin ones", Yield: 4, Tags: []string{"Breakfast", "sweet"},
		CooldownDays: intp(10), LeftoverUseByDays: intp(0),
		Source: recipe.Source{URL: "https://example.test/p", Attribution: "Gran"},
		Lines: []recipe.Line{
			{IngredientID: i.flour, Quantity: 2, Unit: "cup", Note: "sifted"},
			{IngredientID: i.milk, Quantity: 3, Unit: "DL", Optional: true},
			{IngredientID: i.flour, Quantity: 10, Unit: "g"},
		},
		Steps: specSteps(i.flour),
	}
}

func TestCreateGetRoundTrip(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	created, err := f.s.Create(ctx, pancakes(i))
	if err != nil {
		t.Fatal(err)
	}
	got, err := f.s.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, created) {
		t.Errorf("Get differs from Create result:\n got %+v\nwant %+v", got, created)
	}
	if got.Name != "Pancakes" || got.Yield != 4 || got.ReadyMeal || got.Archived {
		t.Errorf("fields: %+v", got)
	}
	if got.CooldownDays == nil || *got.CooldownDays != 10 || got.LeftoverUseByDays == nil || *got.LeftoverUseByDays != 0 {
		t.Errorf("overrides: %v %v (0 must survive as 0, not as null)", got.CooldownDays, got.LeftoverUseByDays)
	}
	if want := []string{"Breakfast", "sweet"}; !reflect.DeepEqual(got.Tags, want) {
		t.Errorf("Tags = %q", got.Tags)
	}
	if len(got.Lines) != 3 || got.Lines[0].Ingredient != "flour" || got.Lines[0].Note != "sifted" ||
		got.Lines[1].Unit != "dl" || !got.Lines[1].Optional || got.Lines[2].Unit != "g" || got.Lines[2].IngredientID != i.flour {
		t.Errorf("Lines (order kept, names filled, units normalised, same Ingredient twice): %+v", got.Lines)
	}
	if len(got.Steps) != 6 || !reflect.DeepEqual(got.Steps[3].After, []int{1, 2}) || len(got.Steps[2].Uses) != 1 || got.Steps[2].Uses[0].Unit != "cup" {
		t.Errorf("Steps: %+v", got.Steps)
	}
	if got.Timing.TotalMinutes != 40 || got.Timing.AdvanceMinutes != 240 || len(got.Timing.Advance) != 1 {
		t.Errorf("Timing = %+v, want total 40, advance 240", got.Timing)
	}
	if !got.CreatedAt.Equal(f.clk.Now()) || !got.UpdatedAt.Equal(f.clk.Now()) {
		t.Errorf("timestamps %v %v", got.CreatedAt, got.UpdatedAt)
	}
}

func TestCreateRejectsAndWritesNothing(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)

	bad := pancakes(i)
	bad.Yield = 0
	var ve *recipe.ValidationError
	if _, err := f.s.Create(ctx, bad); !errors.As(err, &ve) || ve.Field != "yield" {
		t.Errorf("err = %v, want validation error on yield", err)
	}

	unk := pancakes(i)
	unk.Lines[1] = recipe.Line{IngredientID: i.garlic, Quantity: 1, Unit: "head"}
	var ue *recipe.UnknownUnitError
	if _, err := f.s.Create(ctx, unk); !errors.As(err, &ue) || ue.Field != "lines[1].unit" || ue.Ingredient != "garlic" {
		t.Errorf("err = %v, want UnknownUnitError for garlic at lines[1].unit", err)
	}

	missing := pancakes(i)
	missing.Lines[0].IngredientID = 9999
	if _, err := f.s.Create(ctx, missing); !errors.As(err, &ve) || ve.Code != recipe.CodeUnknownIngr {
		t.Errorf("err = %v, want unknown_ingredient", err)
	}
	for _, table := range []string{"recipes", "recipe_lines", "recipe_steps", "tags"} {
		if n := f.count(t, table); n != 0 {
			t.Errorf("%s has %d rows after rejected Creates, want 0 (no partial writes, no stray Tags)", table, n)
		}
	}
}

func TestUnitBecomesValidOnceConversionExists(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	in := pancakes(i)
	in.Lines[1] = recipe.Line{IngredientID: i.garlic, Quantity: 1, Unit: "head"}
	if _, err := f.s.Create(ctx, in); !errors.Is(err, recipe.ErrUnknownUnit) {
		t.Fatalf("err = %v", err)
	}
	f.exec(t, `INSERT INTO ingredient_conversions(ingredient_id, unit, to_base) VALUES (?, 'head', 40)`, i.garlic)
	if _, err := f.s.Create(ctx, in); err != nil {
		t.Errorf("after adding the Unit Conversion: %v", err)
	}
}

func TestTagsAreCreatedOnUseAndMatchedByKey(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	a := pancakes(i)
	a.Tags = []string{"Fish", "quick"}
	b := pancakes(i)
	b.Name = "Fish pie"
	b.Tags = []string{"FISH", "  oven  bake "}
	if _, err := f.s.Create(ctx, a); err != nil {
		t.Fatal(err)
	}
	rb, err := f.s.Create(ctx, b)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"Fish", "oven bake"}; !reflect.DeepEqual(rb.Tags, want) {
		t.Errorf("second Recipe Tags = %q, want %q (existing Tag spelling wins)", rb.Tags, want)
	}
	// Removing the last use of a Tag leaves the Recipe without it (the Tag itself stays: tag store).
	b.Tags = nil
	if _, err := f.s.Update(ctx, rb.ID, b); err != nil {
		t.Fatal(err)
	}
	// ADR 0010 point 1: the Tag row stays, with no Recipe left on it.
	if _, ok := f.tagColours(t)["oven bake"]; !ok {
		t.Error(`the "oven bake" Tag row was removed with its last Recipe`)
	}
	var uses int
	if err := f.db.QueryRow(`SELECT COUNT(*) FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE t.key = 'oven bake'`).Scan(&uses); err != nil {
		t.Fatal(err)
	}
	if uses != 0 {
		t.Errorf(`"oven bake" still on %d Recipes, want 0`, uses)
	}
}

func TestUpdateReplacesEverythingAndKeepsIdentity(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	created, _ := f.s.Create(ctx, pancakes(i))
	if _, err := f.s.SetArchived(ctx, created.ID, true); err != nil {
		t.Fatal(err)
	}
	f.clk.Advance(time.Hour)
	in := recipe.Input{
		Name: "Garlic bread", Yield: 2, Tags: []string{"side"},
		Lines: []recipe.Line{{IngredientID: i.garlic, Quantity: 3, Unit: "clove"}},
		Steps: []recipe.Step{{Text: "Bake", Kind: schedule.Passive, DurationMinutes: 12}},
	}
	got, err := f.s.Update(ctx, created.ID, in)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != created.ID || !got.Archived || !got.CreatedAt.Equal(created.CreatedAt) || !got.UpdatedAt.After(created.UpdatedAt) {
		t.Errorf("identity/archived/timestamps: %+v", got)
	}
	if got.CooldownDays != nil || got.LeftoverUseByDays != nil || got.Description != "" || got.Source.URL != "" {
		t.Errorf("fields not cleared by PUT semantics: %+v", got)
	}
	if len(got.Lines) != 1 || len(got.Steps) != 1 || got.Timing.TotalMinutes != 12 || got.Timing.AdvanceMinutes != 0 {
		t.Errorf("lines/steps/timing not replaced: %+v", got)
	}
	if f.count(t, "recipe_lines") != 1 || f.count(t, "recipe_steps") != 1 || f.count(t, "recipe_step_uses") != 0 {
		t.Error("old lines/steps/uses left behind")
	}
	if _, err := f.s.Update(ctx, 999, in); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Update(missing) = %v", err)
	}
	// A failed Update leaves the Recipe untouched.
	in.Yield = -1
	if _, err := f.s.Update(ctx, created.ID, in); !errors.Is(err, recipe.ErrInvalid) {
		t.Fatalf("err = %v", err)
	}
	again, _ := f.s.Get(ctx, created.ID)
	if again.Name != "Garlic bread" {
		t.Errorf("rejected Update changed the Recipe: %+v", again)
	}
}

func TestListFilterAndOrder(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	mk := func(name string, tags ...string) int64 {
		in := pancakes(i)
		in.Name, in.Tags = name, tags
		r, err := f.s.Create(ctx, in)
		if err != nil {
			t.Fatal(err)
		}
		return r.ID
	}
	mk("banana bread", "baking")
	pie := mk("Apple pie", "baking", "sweet")
	mk("Chilli", "spicy")
	if _, err := f.s.SetArchived(ctx, pie, true); err != nil {
		t.Fatal(err)
	}
	names := func(fl store.ListFilter) []string {
		list, err := f.s.List(ctx, fl)
		if err != nil {
			t.Fatal(err)
		}
		var out []string
		for _, s := range list {
			out = append(out, s.Name)
		}
		return out
	}
	for _, tc := range []struct {
		name string
		f    store.ListFilter
		want []string
	}{
		{"default = active only, by name ignoring case", store.ListFilter{}, []string{"banana bread", "Chilli"}},
		{"archived only", store.ListFilter{Archived: "yes"}, []string{"Apple pie"}},
		{"all", store.ListFilter{Archived: "all"}, []string{"Apple pie", "banana bread", "Chilli"}},
		{"tag by key", store.ListFilter{Archived: "all", Tags: []string{"BAKING"}}, []string{"Apple pie", "banana bread"}},
		{"query substring", store.ListFilter{Query: "CHIL"}, []string{"Chilli"}},
		{"nothing matches", store.ListFilter{Tags: []string{"nope"}}, nil},
	} {
		if got := names(tc.f); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: %q, want %q", tc.name, got, tc.want)
		}
	}
	list, _ := f.s.List(ctx, store.ListFilter{Archived: "all", Query: "apple"})
	if len(list) != 1 || !list[0].Archived || list[0].TotalMinutes != 40 || list[0].AdvanceMinutes != 240 || !reflect.DeepEqual(list[0].Tags, []string{"baking", "sweet"}) {
		t.Errorf("Summary = %+v", list)
	}
}

func TestArchiveIsIdempotentAndKeepsPreferences(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	r, _ := f.s.Create(ctx, pancakes(i))
	sam := f.member(t, "Sam", 0)
	if err := f.s.SetRecipeState(ctx, sam, r.ID, recipe.StateFavourite); err != nil {
		t.Fatal(err)
	}
	for n := 0; n < 2; n++ {
		got, err := f.s.SetArchived(ctx, r.ID, true)
		if err != nil || !got.Archived {
			t.Fatalf("archive #%d: %+v %v", n, got, err)
		}
	}
	prefs, _ := f.s.Preferences(ctx, sam)
	if prefs.Recipes[r.ID] != recipe.StateFavourite {
		t.Error("archiving must keep Member preferences")
	}
	got, err := f.s.SetArchived(ctx, r.ID, false)
	if err != nil || got.Archived {
		t.Errorf("unarchive: %+v %v", got, err)
	}
	if _, err := f.s.SetArchived(ctx, 999, true); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("SetArchived(missing) = %v", err)
	}
}

type planned map[int64]bool

func (p planned) WasPlanned(_ context.Context, _ store.Querier, id int64) (bool, error) {
	return p[id], nil
}

func TestDeleteOnlyIfNeverPlanned(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	r1, _ := f.s.Create(ctx, pancakes(i))
	in := pancakes(i)
	in.Name = "Waffles"
	r2, _ := f.s.Create(ctx, in)
	sam := f.member(t, "Sam", 0)
	_ = f.s.SetRecipeState(ctx, sam, r1.ID, recipe.StateDislike)

	// No checker registered: never planned.
	if err := f.s.Delete(ctx, r1.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	for _, table := range []string{"recipe_lines", "recipe_steps", "recipe_step_uses", "recipe_tags", "member_recipe_preferences"} {
		var n int
		if err := f.db.QueryRow(`SELECT count(*) FROM ` + table + ` WHERE recipe_id=` + itoa(r1.ID)).Scan(&n); err != nil || n != 0 {
			t.Errorf("%s still has %d rows for the deleted Recipe (%v)", table, n, err)
		}
	}
	if _, err := f.s.Get(ctx, r1.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get after Delete = %v", err)
	}
	if err := f.s.Delete(ctx, r1.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("second Delete = %v", err)
	}

	store.RegisterPlannedChecker("store test", planned{r2.ID: true})
	t.Cleanup(func() { store.DefaultPlannedCheckers.Unregister("store test") })
	if err := f.s.Delete(ctx, r2.ID); !errors.Is(err, store.ErrAlreadyPlanned) {
		t.Errorf("Delete of a planned Recipe = %v, want ErrAlreadyPlanned", err)
	}
	if _, err := f.s.Get(ctx, r2.ID); err != nil {
		t.Errorf("the planned Recipe must still exist: %v", err)
	}
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }

func TestRecipeStateIsExclusive(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	r, _ := f.s.Create(ctx, pancakes(i))
	sam, kim := f.member(t, "Sam", 0), f.member(t, "Kim", 0)

	set := func(m int64, st recipe.State) {
		t.Helper()
		if err := f.s.SetRecipeState(ctx, m, r.ID, st); err != nil {
			t.Fatal(err)
		}
	}
	state := func(m int64) recipe.State {
		p, err := f.s.Preferences(ctx, m)
		if err != nil {
			t.Fatal(err)
		}
		return p.Recipes[r.ID]
	}
	set(sam, recipe.StateFavourite)
	set(kim, recipe.StateExclusion)
	if state(sam) != recipe.StateFavourite || state(kim) != recipe.StateExclusion {
		t.Error("states are per Member")
	}
	set(sam, recipe.StateDislike) // replaces the Favourite
	if state(sam) != recipe.StateDislike || f.count(t, "member_recipe_preferences") != 2 {
		t.Errorf("a Member has one state per Recipe; rows = %d", f.count(t, "member_recipe_preferences"))
	}
	set(sam, recipe.StateNone)
	if _, there := mustPrefs(t, f, sam).Recipes[r.ID]; there {
		t.Error("none must clear the row")
	}
	if err := f.s.SetRecipeState(ctx, sam, 999, recipe.StateFavourite); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown Recipe = %v", err)
	}
	if err := f.s.SetRecipeState(ctx, 999, r.ID, recipe.StateFavourite); !errors.Is(err, store.ErrUnknownMember) {
		t.Errorf("unknown Member = %v", err)
	}
	if _, err := f.s.Preferences(ctx, 999); !errors.Is(err, store.ErrUnknownMember) {
		t.Errorf("Preferences(unknown Member) = %v", err)
	}
}

func mustPrefs(t *testing.T, f *fixture, m int64) store.Preferences {
	t.Helper()
	p, err := f.s.Preferences(ctx, m)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestIngredientExclusion(t *testing.T) {
	f := newFixture(t)
	i := f.basics(t)
	sam := f.member(t, "Sam", 0)
	for n := 0; n < 2; n++ { // idempotent
		if err := f.s.SetIngredientExclusion(ctx, sam, i.milk, true); err != nil {
			t.Fatal(err)
		}
	}
	_ = f.s.SetIngredientExclusion(ctx, sam, i.flour, true)
	if got := mustPrefs(t, f, sam).ExcludedIngredients; !reflect.DeepEqual(got, []int64{i.flour, i.milk}) {
		t.Errorf("ExcludedIngredients = %v", got)
	}
	if err := f.s.SetIngredientExclusion(ctx, sam, i.milk, false); err != nil {
		t.Fatal(err)
	}
	if got := mustPrefs(t, f, sam).ExcludedIngredients; !reflect.DeepEqual(got, []int64{i.flour}) {
		t.Errorf("after removal = %v", got)
	}
	if err := f.s.SetIngredientExclusion(ctx, sam, 9999, true); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown Ingredient = %v", err)
	}
	if err := f.s.SetIngredientExclusion(ctx, 9999, i.milk, true); !errors.Is(err, store.ErrUnknownMember) {
		t.Errorf("unknown Member = %v", err)
	}
}

func TestMemberForUser(t *testing.T) {
	f := newFixture(t)
	u1, u2 := f.user(t, "a@example.test"), f.user(t, "b@example.test")
	sam := f.member(t, "Sam", u1)
	got, err := f.s.MemberForUser(ctx, u1)
	if err != nil || got != sam {
		t.Errorf("MemberForUser(linked) = %d, %v; want %d", got, err, sam)
	}
	if _, err := f.s.MemberForUser(ctx, u2); !errors.Is(err, store.ErrNoMember) {
		t.Errorf("MemberForUser(unlinked) = %v, want ErrNoMember", err)
	}
}

// fakeReady is a ReadyMealIngredients with no Ingredients whose creation fails with err.
type fakeReady struct{ err error }

func (f fakeReady) Candidates(context.Context) ([]recipe.ReadyMealCandidate, error) { return nil, nil }
func (f fakeReady) CreatePieceTx(context.Context, *sql.Tx, string) (int64, error) {
	return 0, f.err
}

// R14b: the placeholder id of a to-be-created Ready Meal Ingredient is only ever valid on the line.
func TestStepUseOfPendingIngredientIsUnknown(t *testing.T) {
	f := newFixture(t)
	s := store.New(f.db, f.clk, ingredients{f.db}).WithReadyMeal(fakeReady{})
	_, err := s.Create(ctx, recipe.Input{Name: "Lasagne pack", Yield: 2, ReadyMeal: true,
		Steps: []recipe.Step{{Text: "Heat", Kind: schedule.Active, DurationMinutes: 5, Uses: []recipe.Use{{IngredientID: -1, Quantity: 1, Unit: "piece"}}}}})
	var ve *recipe.ValidationError
	if !errors.As(err, &ve) || ve.Code != recipe.CodeUnknownIngr || ve.Field != "steps[0].uses[0].ingredientId" {
		t.Fatalf("Create = %v, want unknown_ingredient on steps[0].uses[0].ingredientId", err)
	}
}

// R14b: a name taken between the lookup and the insert is a conflict, not a 500.
func TestReadyMealNameTakenDuringCreate(t *testing.T) {
	f := newFixture(t)
	s := store.New(f.db, f.clk, ingredients{f.db}).WithReadyMeal(fakeReady{err: store.ErrReadyMealNameTaken})
	_, err := s.Create(ctx, recipe.Input{Name: "Lasagne pack", Yield: 2, ReadyMeal: true})
	if !errors.Is(err, store.ErrReadyMealNameTaken) {
		t.Fatalf("Create = %v, want ErrReadyMealNameTaken", err)
	}
}
