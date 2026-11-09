package stock

import (
	"reflect"
	"testing"
)

func TestFormatQuantity(t *testing.T) {
	tests := []struct {
		q    float64
		base string
		want string
	}{
		{300, "g", "300 g"},
		{1.5, "ml", "1.5 ml"},
		{0.25, "g", "0.25 g"},
		{1000.004, "g", "1000 g"},
		{2.345, "g", "2.35 g"},
		{1, "piece", "1 piece"},
		{2, "piece", "2 pieces"},
		{0.5, "piece", "0.5 pieces"},
		{0, "g", "0 g"},
	}
	for _, tc := range tests {
		if got := FormatQuantity(tc.q, tc.base); got != tc.want {
			t.Errorf("FormatQuantity(%v, %s) = %q, want %q", tc.q, tc.base, got, tc.want)
		}
	}
}

func TestShortfallMessage(t *testing.T) {
	if got, want := ShortfallMessage("chicken thighs", "g", 300, 800),
		"Stock shows only 300 g chicken thighs, the recipe uses 800 g"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	if got, want := ShortfallMessage("chicken thighs", "g", 0, 800),
		"Stock shows no chicken thighs, the recipe uses 800 g"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
	if got, want := ShortfallMessage("eggs", "piece", 2, 6),
		"Stock shows only 2 pieces eggs, the recipe uses 6 pieces"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestUseSoon(t *testing.T) {
	today := Date("2026-11-09")
	lots := []Lot{
		lot(1, 100, "2026-11-01", "2026-11-12"), // in 3 days: included (boundary)
		lot(2, 100, "2026-11-01", "2026-11-13"), // in 4 days: no
		lot(3, 100, "2026-11-01", "2026-11-09"), // today: included
		lot(4, 100, "2026-11-01", "2026-11-08"), // spoiled: not "use soon"
		lot(5, 100, "2026-11-01", None),         // no go-off: no
		lot(6, 100, "2026-11-01", "2026-11-10"),
	}
	got := UseSoon(lots, today, UseSoonDays)
	var ids []int64
	for _, l := range got {
		ids = append(ids, l.ID)
	}
	if want := []int64{3, 6, 1}; !reflect.DeepEqual(ids, want) {
		t.Fatalf("UseSoon ids = %v, want %v", ids, want)
	}
	if got := UseSoon(lots, today, 0); len(got) != 1 || got[0].ID != 3 {
		t.Fatalf("days=0 should keep only today's lot, got %+v", got)
	}
	if UseSoonDays != 3 {
		t.Errorf("UseSoonDays = %d, want 3", UseSoonDays)
	}
}

func TestProjectGroupsPerIngredientInConsumptionOrder(t *testing.T) {
	lots := []Lot{
		{ID: 1, IngredientID: 7, Quantity: 100, Purchased: "2026-11-01", GoesOff: None},
		{ID: 2, IngredientID: 7, Quantity: 200, Purchased: "2026-11-05", GoesOff: "2026-11-20"},
		{ID: 3, IngredientID: 8, Quantity: 50, Purchased: "2026-11-02", GoesOff: "2026-11-10"},
		{ID: 4, IngredientID: 7, Quantity: 300, Purchased: "2026-11-03", GoesOff: "2026-11-12"},
	}
	orig := append([]Lot(nil), lots...)
	p := Project(lots)
	if !reflect.DeepEqual(lots, orig) {
		t.Fatal("Project modified its input")
	}
	var ids []int64
	for _, l := range p[7] {
		ids = append(ids, l.ID)
	}
	if want := []int64{4, 2, 1}; !reflect.DeepEqual(ids, want) {
		t.Fatalf("ingredient 7 order = %v, want %v", ids, want)
	}
	if len(p[8]) != 1 || len(p) != 2 {
		t.Fatalf("projection = %+v", p)
	}
}

func TestProjectedAvailableOnDate(t *testing.T) {
	p := Project([]Lot{
		{ID: 1, IngredientID: 7, Quantity: 100, GoesOff: "2026-11-10"},
		{ID: 2, IngredientID: 7, Quantity: 200, GoesOff: "2026-11-12"},
		{ID: 3, IngredientID: 7, Quantity: 400, GoesOff: None},
	})
	tests := []struct {
		on   Date
		want float64
	}{
		{"2026-11-09", 700},
		{"2026-11-10", 700}, // fine on the go-off date itself
		{"2026-11-11", 600},
		{"2026-11-13", 400},
	}
	for _, tc := range tests {
		if got := p.Available(7, tc.on); !near(got, tc.want) {
			t.Errorf("Available on %s = %v, want %v", tc.on, got, tc.want)
		}
	}
	if got := p.Available(99, "2026-11-09"); got != 0 {
		t.Errorf("unknown Ingredient = %v, want 0", got)
	}
}

func TestIsSpoiledAndIsUseSoonPredicates(t *testing.T) {
	today := Date("2026-11-09")
	tests := []struct {
		name    string
		goesOff Date
		spoiled bool
		useSoon bool
	}{
		{"went off yesterday", "2026-11-08", true, false},
		{"went off long ago", "2026-10-01", true, false},
		{"goes off today is still fine, use soon", "2026-11-09", false, true},
		{"tomorrow", "2026-11-10", false, true},
		{"last day of the window (today+3)", "2026-11-12", false, true},
		{"just outside the window (today+4)", "2026-11-13", false, false},
		{"far away", "2027-01-01", false, false},
		{"no go-off date", None, false, false},
	}
	for _, tc := range tests {
		l := lot(1, 100, "2026-11-01", tc.goesOff)
		if got := IsSpoiled(l, today); got != tc.spoiled {
			t.Errorf("%s: IsSpoiled = %v, want %v", tc.name, got, tc.spoiled)
		}
		if got := IsUseSoon(l, today); got != tc.useSoon {
			t.Errorf("%s: IsUseSoon = %v, want %v", tc.name, got, tc.useSoon)
		}
	}
}

func TestPredicatesAgreeWithSpoiledAndUseSoonLists(t *testing.T) {
	today := Date("2026-11-09")
	var lots []Lot
	for i := -3; i <= 6; i++ {
		lots = append(lots, lot(int64(i+10), 10, "2026-11-01", today.AddDays(i)))
	}
	lots = append(lots, lot(99, 10, "2026-11-01", None))
	spoiled, soon := map[int64]bool{}, map[int64]bool{}
	for _, l := range Spoiled(lots, today) {
		spoiled[l.ID] = true
	}
	for _, l := range UseSoon(lots, today, UseSoonDays) {
		soon[l.ID] = true
	}
	for _, l := range lots {
		if IsSpoiled(l, today) != spoiled[l.ID] || IsUseSoon(l, today) != soon[l.ID] {
			t.Errorf("lot %d (goes off %s): predicates disagree with Spoiled/UseSoon", l.ID, l.GoesOff)
		}
		if IsSpoiled(l, today) && IsUseSoon(l, today) {
			t.Errorf("lot %d is both spoiled and use soon", l.ID)
		}
	}
}
