package store_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/tag"
	"github.com/fabbarix/feeder-ng/internal/tag/store"
)

// The Tag repository (ADR 0010, tg-plan §3.1 and §4.3; team TG-A). Rules are seeded by SQL, never
// through a Tag, so orphan keys (a rule naming a key no Tag has) can be tested.

var ctx = context.Background()

type fx struct {
	t          *testing.T
	db         *sql.DB
	st         *store.Store
	main, side int64
}

func newFx(t *testing.T) *fx {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	f := &fx{t: t, db: d, st: store.New(d)}
	f.main = f.queryID(`SELECT id FROM courses WHERE name_key = 'main'`)
	f.side = f.queryID(`SELECT id FROM courses WHERE name_key = 'side'`)
	return f
}

func (f *fx) queryID(q string, args ...any) int64 {
	f.t.Helper()
	var id int64
	if err := f.db.QueryRow(q, args...).Scan(&id); err != nil {
		f.t.Fatalf("%s: %v", q, err)
	}
	return id
}

func (f *fx) exec(q string, args ...any) int64 {
	f.t.Helper()
	res, err := f.db.Exec(q, args...)
	if err != nil {
		f.t.Fatalf("%s: %v", q, err)
	}
	id, _ := res.LastInsertId()
	return id
}

func (f *fx) count(q string, args ...any) int {
	f.t.Helper()
	var n int
	if err := f.db.QueryRow(q, args...).Scan(&n); err != nil {
		f.t.Fatalf("%s: %v", q, err)
	}
	return n
}

// tag inserts a Tag row (key from tag.NameKey) in a colour.
func (f *fx) tag(name, colour string) int64 {
	f.t.Helper()
	return f.exec(`INSERT INTO tags(key,name,colour) VALUES (?,?,?)`, tag.NameKey(name), name, colour)
}

func (f *fx) recipe(name string, archived int, tags ...int64) int64 {
	f.t.Helper()
	id := f.exec(`INSERT INTO recipes(name,yield,archived,created_at,updated_at) VALUES (?,4,?,'t','t')`, name, archived)
	f.exec(`INSERT INTO recipe_courses(recipe_id,course_id) VALUES (?,?)`, id, f.main)
	for pos, tg := range tags {
		f.exec(`INSERT INTO recipe_tags(recipe_id,tag_id,position) VALUES (?,?,?)`, id, tg, pos)
	}
	return id
}

func (f *fx) slot(weekday int, name, time string) int64 {
	f.t.Helper()
	id := f.exec(`INSERT INTO meal_slots(weekday,name,time) VALUES (?,?,?)`, weekday, name, time)
	f.exec(`INSERT INTO meal_slot_courses(meal_slot_id,course_id,position) VALUES (?,?,0),(?,?,1)`, id, f.main, id, f.side)
	return id
}

func (f *fx) slotRule(slot, course int64, key string) {
	f.t.Helper()
	f.exec(`INSERT INTO slot_rules(meal_slot_id,course_id,tag) VALUES (?,?,?)`, slot, course, key)
}

func (f *fx) variety(key string, perWeek, consecutive int) {
	f.t.Helper()
	f.exec(`INSERT INTO variety_rules(tag,max_per_week,not_consecutive_days) VALUES (?,?,?)`, key, perWeek, consecutive)
}

// slotRulesOn lists "slot/course" of the Slot Rules on a key, sorted.
func (f *fx) slotRulesOn(key string) []string {
	f.t.Helper()
	r, err := f.db.Query(`SELECT meal_slot_id || '/' || course_id FROM slot_rules WHERE tag = ? ORDER BY 1`, key)
	if err != nil {
		f.t.Fatal(err)
	}
	defer r.Close()
	var out []string
	for r.Next() {
		var s string
		if err := r.Scan(&s); err != nil {
			f.t.Fatal(err)
		}
		out = append(out, s)
	}
	return out
}

func (f *fx) varietyOn(key string) string {
	f.t.Helper()
	var s string
	err := f.db.QueryRow(`SELECT max_per_week || '/' || not_consecutive_days FROM variety_rules WHERE tag = ?`, key).Scan(&s)
	if errors.Is(err, sql.ErrNoRows) {
		return ""
	}
	if err != nil {
		f.t.Fatal(err)
	}
	return s
}

func (f *fx) tagsOf(recipe int64) []string {
	f.t.Helper()
	r, err := f.db.Query(`SELECT t.key || '@' || rt.position FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id = ? ORDER BY rt.position`, recipe)
	if err != nil {
		f.t.Fatal(err)
	}
	defer r.Close()
	var out []string
	for r.Next() {
		var s string
		if err := r.Scan(&s); err != nil {
			f.t.Fatal(err)
		}
		out = append(out, s)
	}
	return out
}

func sp(s string) *string { return &s }

func (f *fx) names(l []tag.Listing) []string {
	var out []string
	for _, x := range l {
		out = append(out, x.Name)
	}
	return out
}

// ---- List, Get, Exists ----

func TestListIsOrderedByNameWithCounts(t *testing.T) {
	f := newFx(t)
	roast := f.tag("roast", "olive")
	fish := f.tag("Fish", "tomato")
	pasta := f.tag("Pasta", "apricot")
	f.recipe("A", 0, fish, pasta)
	f.recipe("B", 1, fish) // archived Recipes count
	f.recipe("C", 0, pasta)
	dinner := f.slot(5, "Dinner", "19:00")
	f.slotRule(dinner, f.main, "fish")
	f.slotRule(dinner, f.side, "fish")
	f.variety("fish", 1, 0)
	_ = roast

	list, err := f.st.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := f.names(list); !reflect.DeepEqual(got, []string{"Fish", "Pasta", "roast"}) {
		t.Fatalf("List order = %v", got)
	}
	fl := list[0]
	if fl.ID != fish || fl.Key != "fish" || fl.Colour != "tomato" || fl.Recipes != 2 || fl.SlotRules != 2 || !fl.VarietyRule {
		t.Errorf("Fish = %+v", fl)
	}
	if p := list[1]; p.Recipes != 2 || p.SlotRules != 0 || p.VarietyRule {
		t.Errorf("Pasta = %+v", p)
	}
	if r := list[2]; r.Recipes != 0 || r.Colour != "olive" {
		t.Errorf("an unused Tag stays and is listed: %+v", r)
	}
}

func TestListOrdersCaseInsensitively(t *testing.T) {
	f := newFx(t)
	f.tag("beta", "tomato")
	f.tag("Alpha", "tomato")
	f.tag("alpine", "tomato")
	list, err := f.st.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := f.names(list); !reflect.DeepEqual(got, []string{"Alpha", "alpine", "beta"}) {
		t.Errorf("order = %v", got)
	}
}

func TestListIsEmptyNotNil(t *testing.T) {
	f := newFx(t)
	list, err := f.st.List(ctx)
	if err != nil || list == nil || len(list) != 0 {
		t.Errorf("List = %#v, %v; want an empty non-nil slice", list, err)
	}
}

func TestGetAndExists(t *testing.T) {
	f := newFx(t)
	id := f.tag("Fish Pie", "sage")
	got, err := f.st.Get(ctx, id)
	if err != nil || got != (tag.Tag{ID: id, Key: "fish pie", Name: "Fish Pie", Colour: "sage"}) {
		t.Errorf("Get = %+v, %v", got, err)
	}
	if _, err := f.st.Get(ctx, id+99); !errors.Is(err, tag.ErrNotFound) {
		t.Errorf("Get unknown err = %v", err)
	}
	for key, want := range map[string]bool{"fish pie": true, "Fish Pie": false, "fish": false, "": false} {
		if ok, err := f.st.Exists(ctx, key); err != nil || ok != want {
			t.Errorf("Exists(%q) = %v, %v; want %v (the caller passes a key)", key, ok, err, want)
		}
	}
}

// ---- Create ----

func TestCreateWithAColourKeepsNameCaseAndStoresKey(t *testing.T) {
	f := newFx(t)
	got, err := f.st.Create(ctx, "  Fish   Pie ", "plum")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID == 0 || got.Name != "Fish Pie" || got.Key != "fish pie" || got.Colour != "plum" {
		t.Errorf("Create = %+v", got)
	}
	if n := f.count(`SELECT count(*) FROM tags WHERE key = 'fish pie' AND name = 'Fish Pie' AND colour = 'plum'`); n != 1 {
		t.Errorf("stored rows = %d", n)
	}
}

func TestCreateWithoutAColourTakesTheNextOne(t *testing.T) {
	f := newFx(t)
	var got []string
	for i := 0; i < 12; i++ {
		tg, err := f.st.Create(ctx, fmt.Sprintf("tag %02d", i), "")
		if err != nil {
			t.Fatal(err)
		}
		got = append(got, tg.Colour)
	}
	want := append(append([]string{}, tag.Palette...), "tomato", "apricot")
	if !reflect.DeepEqual(got, want) {
		t.Errorf("colours = %v\nwant     %v", got, want)
	}
}

func TestCreateNextColourCountsExistingTagsAndSkipsUnknownIds(t *testing.T) {
	f := newFx(t)
	f.tag("a", "tomato")
	f.tag("b", "apricot")
	f.tag("c", "retired-colour")
	tg, err := f.st.Create(ctx, "d", "")
	if err != nil || tg.Colour != "mustard" {
		t.Errorf("Create = %+v, %v; want mustard", tg, err)
	}
}

func TestCreateRefusals(t *testing.T) {
	f := newFx(t)
	fish := f.tag("Fish", "tomato")
	if _, err := f.st.Create(ctx, "   ", ""); !errors.Is(err, tag.ErrNameInvalid) {
		t.Errorf("blank name err = %v", err)
	}
	if _, err := f.st.Create(ctx, strings.Repeat("a", 41), ""); !errors.Is(err, tag.ErrNameInvalid) {
		t.Errorf("long name err = %v", err)
	}
	if _, err := f.st.Create(ctx, "Soup", "fuchsia"); !errors.Is(err, tag.ErrColourUnknown) {
		t.Errorf("unknown colour err = %v", err)
	}
	_, err := f.st.Create(ctx, "  FISH ", "sage")
	var nt *tag.NameTakenError
	if !errors.As(err, &nt) || nt.Tag.ID != fish || nt.Tag.Name != "Fish" {
		t.Errorf("taken err = %v; want NameTakenError naming Fish", err)
	}
	if n := f.count(`SELECT count(*) FROM tags`); n != 1 {
		t.Errorf("tags after refusals = %d", n)
	}
}

// ---- Update: respell, recolour, rename ----

func TestRespellKeepsTheKeyAndTouchesNoRule(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	dinner := f.slot(5, "Dinner", "19:00")
	f.slotRule(dinner, f.main, "fish")
	f.variety("fish", 2, 1)
	res, err := f.st.Update(ctx, fish, sp("Fish"), nil)
	if err != nil {
		t.Fatal(err)
	}
	if res.RulesChanged || res.Tag.Name != "Fish" || res.Tag.Key != "fish" || res.Tag.ID != fish {
		t.Errorf("Result = %+v", res)
	}
	if !reflect.DeepEqual(f.slotRulesOn("fish"), []string{fmt.Sprint(dinner, "/", f.main)}) || f.varietyOn("fish") != "2/1" {
		t.Error("a respell changed the rules")
	}
}

func TestRecolourAlone(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	f.variety("fish", 1, 0)
	res, err := f.st.Update(ctx, fish, nil, sp("teal"))
	if err != nil || res.RulesChanged || res.Tag.Colour != "teal" || res.Tag.Name != "fish" {
		t.Fatalf("Update = %+v, %v", res, err)
	}
	if got, _ := f.st.Get(ctx, fish); got.Colour != "teal" || got.Key != "fish" {
		t.Errorf("stored = %+v", got)
	}
	if _, err := f.st.Update(ctx, fish, nil, sp("fuchsia")); !errors.Is(err, tag.ErrColourUnknown) {
		t.Errorf("unknown colour err = %v", err)
	}
	if got, _ := f.st.Get(ctx, fish); got.Colour != "teal" {
		t.Errorf("a refused colour changed it: %+v", got)
	}
}

func TestUpdateRefusals(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	if _, err := f.st.Update(ctx, fish+99, sp("x"), nil); !errors.Is(err, tag.ErrNotFound) {
		t.Errorf("unknown id err = %v", err)
	}
	if _, err := f.st.Update(ctx, fish, sp(" "), nil); !errors.Is(err, tag.ErrNameInvalid) {
		t.Errorf("blank name err = %v", err)
	}
	// An invalid name with a valid colour changes neither.
	if _, err := f.st.Update(ctx, fish, sp(""), sp("sage")); err == nil {
		t.Fatal("want an error")
	}
	if got, _ := f.st.Get(ctx, fish); got.Colour != "tomato" || got.Name != "fish" {
		t.Errorf("a refused update changed the Tag: %+v", got)
	}
}

func TestRenameRewritesExactlyTheRulesOnTheOldKey(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	f.tag("pasta", "apricot")
	fri, sat := f.slot(5, "Dinner", "19:00"), f.slot(6, "Dinner", "19:00")
	f.slotRule(fri, f.main, "fish")
	f.slotRule(sat, f.side, "fish")
	f.slotRule(fri, f.side, "pasta")
	f.variety("fish", 1, 1)
	f.variety("pasta", 3, 0)
	f.recipe("Cod", 0, fish)

	res, err := f.st.Update(ctx, fish, sp("Seafood"), nil)
	if err != nil {
		t.Fatal(err)
	}
	if !res.RulesChanged || res.Tag.Key != "seafood" || res.Tag.Name != "Seafood" || res.Tag.ID != fish || res.Tag.Colour != "tomato" {
		t.Errorf("Result = %+v", res)
	}
	if got := f.slotRulesOn("seafood"); !reflect.DeepEqual(got, []string{fmt.Sprint(fri, "/", f.main), fmt.Sprint(sat, "/", f.side)}) {
		t.Errorf("Slot Rules on seafood = %v", got)
	}
	if f.varietyOn("seafood") != "1/1" || f.varietyOn("fish") != "" || len(f.slotRulesOn("fish")) != 0 {
		t.Error("rules still name fish, or the Variety Rule did not follow")
	}
	if !reflect.DeepEqual(f.slotRulesOn("pasta"), []string{fmt.Sprint(fri, "/", f.side)}) || f.varietyOn("pasta") != "3/0" {
		t.Error("another Tag's rules changed")
	}
	if n := f.count(`SELECT count(*) FROM recipe_tags WHERE tag_id = ?`, fish); n != 1 {
		t.Errorf("Recipe links = %d", n)
	}
}

func TestRenameWithNoRulesReportsNoRulesChanged(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	f.variety("pasta", 1, 0) // somebody else's
	res, err := f.st.Update(ctx, fish, sp("Seafood"), nil)
	if err != nil || res.RulesChanged {
		t.Errorf("Result = %+v, %v; want RulesChanged false", res, err)
	}
}

func TestRenameOntoAnotherTagsKeyChangesNothingAndNamesIt(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	sea := f.tag("Seafood", "sage")
	dinner := f.slot(5, "Dinner", "19:00")
	f.slotRule(dinner, f.main, "fish")
	f.variety("fish", 1, 0)
	_, err := f.st.Update(ctx, fish, sp("  SEAFOOD "), sp("plum"))
	var nt *tag.NameTakenError
	if !errors.As(err, &nt) || nt.Tag.ID != sea || nt.Tag.Name != "Seafood" {
		t.Fatalf("err = %v; want NameTakenError naming Seafood", err)
	}
	if got, _ := f.st.Get(ctx, fish); got.Key != "fish" || got.Name != "fish" || got.Colour != "tomato" {
		t.Errorf("Fish changed: %+v", got)
	}
	if len(f.slotRulesOn("fish")) != 1 || f.varietyOn("fish") != "1/0" || len(f.slotRulesOn("seafood")) != 0 {
		t.Error("rules moved")
	}
}

func TestRenameOntoAnOrphanRuleKeyAppliesTheMergeOutcome(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	fri, sat := f.slot(5, "Dinner", "19:00"), f.slot(6, "Dinner", "19:00")
	// 'pizza' has rules but no Tag row (an orphan); fish carries a Variety Rule and the same Friday rule, plus Saturday.
	f.slotRule(fri, f.main, "pizza")
	f.variety("pizza", 4, 0)
	f.slotRule(fri, f.main, "fish")
	f.slotRule(sat, f.main, "fish")
	f.variety("fish", 1, 1)

	res, err := f.st.Update(ctx, fish, sp("Pizza"), nil)
	if err != nil {
		t.Fatalf("rename onto an orphan key: %v (a primary-key or UNIQUE error means a blind UPDATE)", err)
	}
	if !res.RulesChanged || res.Tag.Key != "pizza" {
		t.Errorf("Result = %+v", res)
	}
	if f.varietyOn("pizza") != "4/0" {
		t.Errorf("the existing Variety Rule must win, got %q", f.varietyOn("pizza"))
	}
	if f.varietyOn("fish") != "" {
		t.Error("fish's Variety Rule must be dropped")
	}
	want := []string{fmt.Sprint(fri, "/", f.main), fmt.Sprint(sat, "/", f.main)}
	if got := f.slotRulesOn("pizza"); !reflect.DeepEqual(got, want) {
		t.Errorf("Slot Rules on pizza = %v, want %v (Friday duplicate dropped, Saturday moved)", got, want)
	}
	if len(f.slotRulesOn("fish")) != 0 {
		t.Error("Slot Rules still name fish")
	}
}

func TestRenameOntoAnOrphanKeyWhereTheSourceHasNoVarietyRuleKeepsTheOrphans(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	f.variety("pizza", 2, 0)
	res, err := f.st.Update(ctx, fish, sp("pizza"), nil)
	if err != nil || res.RulesChanged || f.varietyOn("pizza") != "2/0" {
		t.Errorf("Result = %+v, %v, pizza = %q", res, err, f.varietyOn("pizza"))
	}
}

func TestRenameMovesAVarietyRuleOntoAnOrphanSlotKeyWithoutOne(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	dinner := f.slot(5, "Dinner", "19:00")
	f.slotRule(dinner, f.side, "pizza") // orphan Slot Rule only
	f.variety("fish", 1, 0)
	if _, err := f.st.Update(ctx, fish, sp("pizza"), nil); err != nil {
		t.Fatal(err)
	}
	if f.varietyOn("pizza") != "1/0" || f.varietyOn("fish") != "" {
		t.Error("the Variety Rule should move: the orphan key had none")
	}
	if got := f.slotRulesOn("pizza"); !reflect.DeepEqual(got, []string{fmt.Sprint(dinner, "/", f.side)}) {
		t.Errorf("orphan Slot Rule = %v", got)
	}
}

// ---- Merge ----

func TestMergeLinksRecipesOnceAndKeepsPositions(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	sea := f.tag("Seafood", "sage")
	other := f.tag("quick", "sky")
	both := f.recipe("Both", 0, other, fish, sea)  // fish@1, seafood@2, quick@0
	onlySrc := f.recipe("OnlySrc", 1, other, fish) // archived: fish@1
	onlyDst := f.recipe("OnlyDst", 0, sea)         // seafood@0
	res, err := f.st.Merge(ctx, fish, sea)
	if err != nil {
		t.Fatal(err)
	}
	if res.RulesChanged {
		t.Error("RulesChanged with no rules")
	}
	if got := f.tagsOf(both); !reflect.DeepEqual(got, []string{"quick@0", "seafood@2"}) {
		t.Errorf("Both = %v (one link, in the target's position)", got)
	}
	if got := f.tagsOf(onlySrc); !reflect.DeepEqual(got, []string{"quick@0", "seafood@1"}) {
		t.Errorf("OnlySrc = %v (the target takes the source's position)", got)
	}
	if got := f.tagsOf(onlyDst); !reflect.DeepEqual(got, []string{"seafood@0"}) {
		t.Errorf("OnlyDst = %v", got)
	}
	if n := f.count(`SELECT count(*) FROM tags WHERE id = ?`, fish); n != 0 {
		t.Error("the source Tag is still there")
	}
	if got, _ := f.st.Get(ctx, sea); got.Name != "Seafood" || got.Colour != "sage" || got.Key != "seafood" {
		t.Errorf("the target changed: %+v", got)
	}
}

func TestMergeAppliesTheMergeOutcomeToRules(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	sea := f.tag("Seafood", "sage")
	fri, sat := f.slot(5, "Dinner", "19:00"), f.slot(6, "Dinner", "19:00")
	f.slotRule(fri, f.main, "fish")    // duplicate of the target's: goes
	f.slotRule(sat, f.main, "fish")    // moves
	f.slotRule(fri, f.side, "fish")    // same slot, other Course: moves
	f.slotRule(fri, f.main, "seafood") // the target's own
	f.variety("fish", 1, 1)
	f.variety("seafood", 3, 0) // the target's wins
	res, err := f.st.Merge(ctx, fish, sea)
	if err != nil {
		t.Fatal(err)
	}
	if !res.RulesChanged {
		t.Error("RulesChanged = false")
	}
	want := []string{fmt.Sprint(fri, "/", f.main), fmt.Sprint(fri, "/", f.side), fmt.Sprint(sat, "/", f.main)}
	if got := f.slotRulesOn("seafood"); !reflect.DeepEqual(got, want) {
		t.Errorf("Slot Rules on seafood = %v, want %v", got, want)
	}
	if f.varietyOn("seafood") != "3/0" || f.varietyOn("fish") != "" || len(f.slotRulesOn("fish")) != 0 {
		t.Error("Variety Rule: the target's must win and nothing may name fish")
	}
}

func TestMergeMovesTheVarietyRuleWhenTheTargetHasNone(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	sea := f.tag("Seafood", "sage")
	f.variety("fish", 2, 1)
	res, err := f.st.Merge(ctx, fish, sea)
	if err != nil || !res.RulesChanged || f.varietyOn("seafood") != "2/1" || f.varietyOn("fish") != "" {
		t.Errorf("Result = %+v, %v, seafood = %q", res, err, f.varietyOn("seafood"))
	}
}

func TestMergeHandlesRulesOnAnOrphanTargetKey(t *testing.T) {
	// The target's key already carries rules; its Tag row exists too. Both Tags' rules meet by key.
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	sea := f.tag("seafood", "sage")
	fri := f.slot(5, "Dinner", "19:00")
	f.slotRule(fri, f.main, "fish")
	f.slotRule(fri, f.main, "seafood")
	f.variety("fish", 1, 0)
	f.variety("seafood", 5, 0)
	if _, err := f.st.Merge(ctx, fish, sea); err != nil {
		t.Fatalf("Merge: %v", err)
	}
	if n := len(f.slotRulesOn("seafood")); n != 1 || f.varietyOn("seafood") != "5/0" {
		t.Errorf("Slot Rules = %d, Variety = %q", n, f.varietyOn("seafood"))
	}
}

func TestMergeRefusals(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	if _, err := f.st.Merge(ctx, fish, fish); !errors.Is(err, tag.ErrMergeSelf) {
		t.Errorf("into itself err = %v", err)
	}
	if _, err := f.st.Merge(ctx, fish, fish+99); !errors.Is(err, tag.ErrMergeTarget) {
		t.Errorf("unknown target err = %v", err)
	}
	if _, err := f.st.Merge(ctx, fish+99, fish); !errors.Is(err, tag.ErrNotFound) {
		t.Errorf("unknown source err = %v", err)
	}
	if n := f.count(`SELECT count(*) FROM tags`); n != 1 {
		t.Errorf("tags = %d", n)
	}
}

// ---- Delete ----

func TestDeleteRemovesLinksRulesAndTheTagOnly(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	pasta := f.tag("pasta", "apricot")
	r1 := f.recipe("Cod", 0, fish, pasta)
	r2 := f.recipe("Eel", 1, fish)
	dinner := f.slot(5, "Dinner", "19:00")
	f.slotRule(dinner, f.main, "fish")
	f.slotRule(dinner, f.side, "pasta")
	f.variety("fish", 1, 0)
	f.variety("pasta", 2, 0)

	res, err := f.st.Delete(ctx, fish)
	if err != nil {
		t.Fatal(err)
	}
	if !res.RulesChanged {
		t.Error("RulesChanged = false")
	}
	if f.count(`SELECT count(*) FROM tags WHERE id = ?`, fish) != 0 || f.count(`SELECT count(*) FROM recipe_tags WHERE tag_id = ?`, fish) != 0 {
		t.Error("the Tag or its links remain")
	}
	if len(f.slotRulesOn("fish")) != 0 || f.varietyOn("fish") != "" {
		t.Error("rules still name fish")
	}
	if got := f.tagsOf(r1); !reflect.DeepEqual(got, []string{"pasta@1"}) {
		t.Errorf("Cod = %v", got)
	}
	if got := f.tagsOf(r2); len(got) != 0 {
		t.Errorf("Eel = %v", got)
	}
	if len(f.slotRulesOn("pasta")) != 1 || f.varietyOn("pasta") != "2/0" || f.count(`SELECT count(*) FROM tags WHERE id = ?`, pasta) != 1 {
		t.Error("another Tag was touched")
	}
	if n := f.count(`SELECT count(*) FROM recipes`); n != 2 {
		t.Errorf("Recipes = %d; Delete must not delete Recipes", n)
	}
}

func TestDeleteWithNoRulesReportsNoRulesChanged(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	f.recipe("Cod", 0, fish)
	f.variety("pasta", 1, 0)
	res, err := f.st.Delete(ctx, fish)
	if err != nil || res.RulesChanged {
		t.Errorf("Result = %+v, %v", res, err)
	}
	if _, err := f.st.Delete(ctx, fish); !errors.Is(err, tag.ErrNotFound) {
		t.Errorf("second Delete err = %v", err)
	}
}

func TestDeleteNeverRefusesBecauseRulesNameTheTag(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	dinner := f.slot(5, "Dinner", "19:00")
	f.slotRule(dinner, f.main, "fish")
	if _, err := f.st.Delete(ctx, fish); err != nil {
		t.Errorf("Delete with a Slot Rule: %v", err)
	}
}

// ---- All or nothing ----

// failOnVarietyRules makes every write to variety_rules fail.
func (f *fx) failOnVarietyRules() {
	f.t.Helper()
	for _, ev := range []string{"INSERT", "UPDATE", "DELETE"} {
		f.exec(fmt.Sprintf(`CREATE TRIGGER boom_%s BEFORE %s ON variety_rules BEGIN SELECT RAISE(ABORT, 'boom'); END`, strings.ToLower(ev), ev))
	}
}

// snapshot is every table the repository may write, as text.
func (f *fx) snapshot() string {
	f.t.Helper()
	var b strings.Builder
	for _, q := range []string{
		`SELECT id||'|'||key||'|'||name||'|'||colour FROM tags ORDER BY id`,
		`SELECT recipe_id||'|'||tag_id||'|'||position FROM recipe_tags ORDER BY 1`,
		`SELECT id||'|'||meal_slot_id||'|'||course_id||'|'||tag FROM slot_rules WHERE tag IS NOT NULL ORDER BY id`,
		`SELECT tag||'|'||max_per_week||'|'||not_consecutive_days FROM variety_rules ORDER BY tag`,
	} {
		r, err := f.db.Query(q)
		if err != nil {
			f.t.Fatal(err)
		}
		for r.Next() {
			var s string
			if err := r.Scan(&s); err != nil {
				f.t.Fatal(err)
			}
			b.WriteString(s + "\n")
		}
		r.Close()
		b.WriteString("--\n")
	}
	return b.String()
}

func TestAFailurePartWayLeavesNothingChanged(t *testing.T) {
	for _, op := range []struct {
		name string
		run  func(f *fx, fish, sea int64) error
	}{
		{"rename", func(f *fx, fish, _ int64) error {
			_, err := f.st.Update(ctx, fish, sp("Salmon"), sp("plum"))
			return err
		}},
		{"merge", func(f *fx, fish, sea int64) error { _, err := f.st.Merge(ctx, fish, sea); return err }},
		{"delete", func(f *fx, fish, _ int64) error { _, err := f.st.Delete(ctx, fish); return err }},
	} {
		t.Run(op.name, func(t *testing.T) {
			seed := func() (*fx, int64, int64) {
				f := newFx(t)
				fish := f.tag("fish", "tomato")
				sea := f.tag("Seafood", "sage")
				f.recipe("Cod", 0, fish)
				f.recipe("Bass", 0, fish, sea)
				dinner := f.slot(5, "Dinner", "19:00")
				f.slotRule(dinner, f.main, "fish")
				f.variety("fish", 1, 0)
				return f, fish, sea
			}
			// Control: without the trigger the operation works.
			if f, fish, sea := seed(); op.run(f, fish, sea) != nil {
				t.Fatal("the operation fails even without the injected error")
			}
			f, fish, sea := seed()
			f.failOnVarietyRules()
			before := f.snapshot()
			if err := op.run(f, fish, sea); err == nil {
				t.Fatal("want the injected error")
			}
			if after := f.snapshot(); after != before {
				t.Errorf("state changed after a failure:\nbefore:\n%s\nafter:\n%s", before, after)
			}
		})
	}
}

// ---- Impact ----

func TestImpactNamesEachSlotRuleWithItsMealSlotAndCourse(t *testing.T) {
	f := newFx(t)
	fish := f.tag("fish", "tomato")
	f.tag("pasta", "apricot")
	sat := f.slot(6, "Dinner", "19:00")
	fri := f.slot(5, "Dinner", "19:00")
	f.slotRule(sat, f.main, "fish")
	f.slotRule(fri, f.side, "fish")
	f.slotRule(fri, f.main, "fish")
	f.slotRule(fri, f.main, "pasta")
	f.variety("fish", 2, 1)
	f.recipe("Cod", 0, fish)
	f.recipe("Eel", 1, fish)

	imp, err := f.st.Impact(ctx, fish)
	if err != nil {
		t.Fatal(err)
	}
	if imp.ID != fish || imp.Name != "fish" || imp.Recipes != 2 {
		t.Errorf("Impact = %+v", imp)
	}
	var got []string
	for _, r := range imp.SlotRules {
		got = append(got, fmt.Sprintf("%d %s %s", r.Weekday, r.MealSlotName, r.CourseName))
		if r.ID == 0 || r.MealSlotID == 0 || r.CourseID == 0 {
			t.Errorf("ids missing: %+v", r)
		}
	}
	want := []string{"5 Dinner Main", "5 Dinner Side", "6 Dinner Main"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Slot Rules = %v, want %v (by weekday, then Course order)", got, want)
	}
	if imp.VarietyRule == nil || imp.VarietyRule.MaxPerWeek != 2 || !imp.VarietyRule.NotConsecutiveDays {
		t.Errorf("VarietyRule = %+v", imp.VarietyRule)
	}
	if _, err := f.st.Impact(ctx, fish+99); !errors.Is(err, tag.ErrNotFound) {
		t.Errorf("unknown id err = %v", err)
	}
	pasta := f.queryID(`SELECT id FROM tags WHERE key = 'pasta'`)
	if imp2, _ := f.st.Impact(ctx, pasta); imp2.VarietyRule != nil || len(imp2.SlotRules) != 1 || imp2.Recipes != 0 {
		t.Errorf("Pasta impact = %+v", imp2)
	}
}

// ---- EnsureTx ----

func TestEnsureTxReusesAnExistingTagForAnotherSpellingAndCreatesWithTheNextColour(t *testing.T) {
	f := newFx(t)
	fish := f.tag("Fish", "tomato")
	f.tag("Pasta", "apricot")

	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	id, err := store.EnsureTx(ctx, tx, "  FISH ")
	if err != nil || id != fish {
		t.Fatalf("EnsureTx(FISH) = %d, %v; want %d", id, err, fish)
	}
	again, err := store.EnsureTx(ctx, tx, "soup")
	if err != nil || again == 0 || again == fish {
		t.Fatalf("EnsureTx(soup) = %d, %v", again, err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	var name, colour string
	if err := f.db.QueryRow(`SELECT name, colour FROM tags WHERE id = ?`, again).Scan(&name, &colour); err != nil {
		t.Fatal(err)
	}
	if name != "soup" || colour != "mustard" {
		t.Errorf("new Tag = %q in %q; want soup in mustard (the first spelling kept, the next colour)", name, colour)
	}
	if got, _ := f.st.Get(ctx, fish); got.Name != "Fish" || got.Colour != "tomato" {
		t.Errorf("Fish changed: %+v", got)
	}
}

func TestEnsureTxGivesSeveralNewTagsInOneTransactionDifferentColours(t *testing.T) {
	f := newFx(t)
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	for _, n := range []string{"a", "b", "c"} {
		if _, err := store.EnsureTx(ctx, tx, n); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if n := f.count(`SELECT count(DISTINCT colour) FROM tags`); n != 3 {
		t.Errorf("distinct colours = %d, want 3", n)
	}
}
