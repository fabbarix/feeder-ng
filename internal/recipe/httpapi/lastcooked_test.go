package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// Beta.5 F7 (reconcile §7.3): the list and detail carry lastCookedOn, read from the plan store through the LastCooked
// port; GET /api/recipes?sort=name|last_cooked_asc|last_cooked_desc orders the list. Here the port is a stub.

type lcFixture struct {
	a   *api
	ids map[string]int64
}

// newLC seeds the Recipes (name -> id) and an api whose port answers `cooked` (name -> date).
func newLC(t *testing.T, names []string, cooked map[string]string, archived ...string) *lcFixture {
	t.Helper()
	ctx := context.Background()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	f := &lcFixture{ids: map[string]int64{}}
	for _, n := range names {
		res, err := d.Exec(`INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, 4, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`, n)
		if err != nil {
			t.Fatal(err)
		}
		id, _ := res.LastInsertId()
		f.ids[n] = id
		if _, err := d.Exec(`INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, (SELECT id FROM courses WHERE is_main = 1))`, id); err != nil {
			t.Fatal(err)
		}
	}
	for _, n := range archived {
		if _, err := d.Exec(`UPDATE recipes SET archived = 1 WHERE id = ?`, f.ids[n]); err != nil {
			t.Fatal(err)
		}
	}
	byID := map[int64]string{}
	for n, date := range cooked {
		byID[f.ids[n]] = date
	}
	f.a = &api{
		store:      store.New(d, clk, ingredientSource{ingstore.New(d, clk)}),
		lastCooked: func(context.Context) (map[int64]string, error) { return byID, nil },
	}
	return f
}

type lcSummary struct {
	Name         string  `json:"name"`
	LastCookedOn *string `json:"lastCookedOn"`
}

func (f *lcFixture) list(t *testing.T, query string) (int, []lcSummary, []byte) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/recipes"+query, nil)
	rec := httptest.NewRecorder()
	f.a.list(rec, req)
	var out []lcSummary
	if rec.Code == http.StatusOK {
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatalf("list body: %v: %s", err, rec.Body)
		}
	}
	return rec.Code, out, rec.Body.Bytes()
}

func lcNames(l []lcSummary) []string {
	out := make([]string, len(l))
	for i, s := range l {
		out[i] = s.Name
	}
	return out
}

func eq(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

var lcNamesAll = []string{"Apple pie", "Borscht", "Chilli", "Dal", "Eggs", "Fajitas"}

// Chilli 2026-11-08, Apple pie 2026-10-01, Dal 2026-10-01 (a tie with Apple pie); Borscht, Eggs and Fajitas never cooked.
var lcCooked = map[string]string{"Chilli": "2026-11-08", "Apple pie": "2026-10-01", "Dal": "2026-10-01"}

func TestListCarriesLastCookedOnAndNullForARecipeNeverCooked(t *testing.T) {
	f := newLC(t, lcNamesAll, lcCooked)
	status, list, body := f.list(t, "")
	if status != 200 {
		t.Fatalf("status %d: %s", status, body)
	}
	got := map[string]string{}
	for _, s := range list {
		if s.LastCookedOn == nil {
			got[s.Name] = "null"
		} else {
			got[s.Name] = *s.LastCookedOn
		}
	}
	want := map[string]string{"Apple pie": "2026-10-01", "Borscht": "null", "Chilli": "2026-11-08", "Dal": "2026-10-01", "Eggs": "null", "Fajitas": "null"}
	for n, w := range want {
		if got[n] != w {
			t.Errorf("%s lastCookedOn = %q, want %q (body %s)", n, got[n], w, body)
		}
	}
}

func TestListWritesNullNotAMissingKeyForARecipeNeverCooked(t *testing.T) {
	f := newLC(t, []string{"Borscht"}, nil)
	_, _, body := f.list(t, "")
	var raw []map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		t.Fatal(err)
	}
	if v, ok := raw[0]["lastCookedOn"]; !ok || string(v) != "null" {
		t.Errorf("lastCookedOn = %q (present %v), want the key with null", v, ok)
	}
}

func TestListWithoutASortIsByName(t *testing.T) {
	f := newLC(t, lcNamesAll, lcCooked)
	for _, q := range []string{"", "?sort=name"} {
		_, list, _ := f.list(t, q)
		if want := lcNamesAll; !eq(lcNames(list), want) {
			t.Errorf("%q: order %v, want %v", q, lcNames(list), want)
		}
	}
}

func TestSortLongestAgoFirstStartsWithRecipesNotCookedYetThenOldestTiesByName(t *testing.T) {
	f := newLC(t, lcNamesAll, lcCooked)
	_, list, body := f.list(t, "?sort=last_cooked_asc")
	want := []string{"Borscht", "Eggs", "Fajitas", "Apple pie", "Dal", "Chilli"}
	if !eq(lcNames(list), want) {
		t.Errorf("order %v, want %v (never cooked first, then oldest, ties by name): %s", lcNames(list), want, body)
	}
}

func TestSortMostRecentFirstEndsWithRecipesNotCookedYetTiesByName(t *testing.T) {
	f := newLC(t, lcNamesAll, lcCooked)
	_, list, body := f.list(t, "?sort=last_cooked_desc")
	want := []string{"Chilli", "Apple pie", "Dal", "Borscht", "Eggs", "Fajitas"}
	if !eq(lcNames(list), want) {
		t.Errorf("order %v, want %v (most recent first, never cooked last, ties by name): %s", lcNames(list), want, body)
	}
}

func TestSortKeepsTheFilters(t *testing.T) {
	f := newLC(t, lcNamesAll, lcCooked, "Chilli")
	_, list, _ := f.list(t, "?sort=last_cooked_desc")
	if want := []string{"Apple pie", "Dal", "Borscht", "Eggs", "Fajitas"}; !eq(lcNames(list), want) {
		t.Errorf("archived hidden: order %v, want %v", lcNames(list), want)
	}
	_, list, _ = f.list(t, "?sort=last_cooked_desc&archived=all")
	if want := []string{"Chilli", "Apple pie", "Dal", "Borscht", "Eggs", "Fajitas"}; !eq(lcNames(list), want) {
		t.Errorf("archived listed keeps its date: order %v, want %v", lcNames(list), want)
	}
	_, list, _ = f.list(t, "?sort=last_cooked_asc&q=a")
	if want := []string{"Fajitas", "Apple pie", "Dal"}; !eq(lcNames(list), want) {
		t.Errorf("q=a: order %v, want %v", lcNames(list), want)
	}
}

func TestAnUnknownSortIsRefused(t *testing.T) {
	f := newLC(t, lcNamesAll, lcCooked)
	status, _, body := f.list(t, "?sort=newest")
	var e struct {
		Error struct{ Code, Field, Reason string }
	}
	_ = json.Unmarshal(body, &e)
	if status != http.StatusUnprocessableEntity || e.Error.Code != "validation_failed" || e.Error.Field != "sort" || e.Error.Reason != "sort_invalid" {
		t.Errorf("got %d %s, want 422 validation_failed field=sort reason=sort_invalid", status, body)
	}
}

func TestWithoutAPortNoRecipeWasCookedAndSortStillWorks(t *testing.T) {
	f := newLC(t, lcNamesAll, lcCooked)
	f.a.lastCooked = nil
	status, list, body := f.list(t, "?sort=last_cooked_desc")
	if status != 200 || !eq(lcNames(list), lcNamesAll) {
		t.Fatalf("got %d %v, want 200 and every Recipe by name: %s", status, lcNames(list), body)
	}
	for _, s := range list {
		if s.LastCookedOn != nil {
			t.Errorf("%s lastCookedOn = %q, want null", s.Name, *s.LastCookedOn)
		}
	}
}

func TestAFailingPortFailsTheListWith500(t *testing.T) {
	f := newLC(t, lcNamesAll, lcCooked)
	f.a.lastCooked = func(context.Context) (map[int64]string, error) { return nil, errors.New("boom") }
	if status, _, body := f.list(t, ""); status != http.StatusInternalServerError {
		t.Errorf("status %d, want 500: %s", status, body)
	}
}

func TestDetailCarriesLastCookedOn(t *testing.T) {
	f := newLC(t, lcNamesAll, lcCooked)
	get := func(name string) *string {
		req := httptest.NewRequest(http.MethodGet, "/api/recipes/x", nil)
		req.SetPathValue("id", strconv.FormatInt(f.ids[name], 10))
		rec := httptest.NewRecorder()
		f.a.get(rec, req)
		var out lcSummary
		if rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &out) != nil {
			t.Fatalf("GET %s: %d %s", name, rec.Code, rec.Body)
		}
		return out.LastCookedOn
	}
	if got := get("Chilli"); got == nil || *got != "2026-11-08" {
		t.Errorf("Chilli lastCookedOn = %v, want 2026-11-08", got)
	}
	if got := get("Borscht"); got != nil {
		t.Errorf("Borscht lastCookedOn = %q, want null", *got)
	}
}
